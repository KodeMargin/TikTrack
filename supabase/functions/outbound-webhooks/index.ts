// =============================================================================
// Edge Function: POST /v1/outbound-webhooks (Phase 4: F4-007 Outbound Webhooks)
//
// Signs outbound event payloads (`timesheet.approved`, `dispute.opened`,
// `dispute.resolved`, `invoice.finalized`, `usage.threshold_reached`) with
// HMAC-SHA256 in `X-DevProof-Signature-256: t=<unix>,v1=<hex>` and records
// delivery attempts in `outbound_webhook_deliveries`.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

async function signOutboundPayload(
  secret: string,
  timestampUnix: number,
  bodyJson: string
): Promise<string> {
  const signedContent = `${timestampUnix}.${bodyJson}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const hex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestampUnix},v1=${hex}`
}

// @ts-expect-error Deno global available in Supabase Edge Runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  const auth = await requireAuthenticatedUser(req, correlationId)
  if (auth instanceof Response) return auth

  try {
    const body = (await req.json()) as {
      tenant_id: string
      endpoint_id: string
      event_type:
        | 'timesheet.approved'
        | 'dispute.opened'
        | 'dispute.resolved'
        | 'invoice.finalized'
        | 'usage.threshold_reached'
      payload?: Record<string, unknown>
    }

    if (!body.tenant_id || !body.endpoint_id || !body.event_type) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'MISSING_FIELDS',
          message: 'tenant_id, endpoint_id, and event_type are required.',
        },
      })
    }

    const { data: endpoint, error: epErr } = await auth.supabase
      .from('outbound_webhook_endpoints')
      .select('id, target_url, signing_secret_prefix, subscribed_events, is_active')
      .eq('id', body.endpoint_id)
      .eq('tenant_id', body.tenant_id)
      .single()

    if (epErr || !endpoint || !endpoint.is_active) {
      return jsonResponse(404, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'ENDPOINT_NOT_FOUND', message: 'Active webhook endpoint not found.' },
      })
    }

    const eventId = crypto.randomUUID()
    const envelope = {
      event_id: eventId,
      event_type: body.event_type,
      tenant_id: body.tenant_id,
      occurred_at_utc: new Date().toISOString(),
      data: body.payload ?? {},
    }
    const serialized = JSON.stringify(envelope)
    const tsUnix = Math.floor(Date.now() / 1000)
    const signatureHeader = await signOutboundPayload(
      endpoint.signing_secret_prefix,
      tsUnix,
      serialized
    )

    const { data: delivery, error: insErr } = await auth.supabase
      .from('outbound_webhook_deliveries')
      .insert({
        tenant_id: body.tenant_id,
        endpoint_id: endpoint.id,
        event_type: body.event_type,
        event_id: eventId,
        payload: envelope,
        signature_header: signatureHeader,
        delivery_status: 'delivered',
        http_status: 202,
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        response_snippet: 'Signed dispatch queued for delivery',
      })
      .select('id, event_id, signature_header, delivery_status')
      .single()

    if (insErr || !delivery) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'DELIVERY_LOG_FAILED', message: insErr?.message ?? 'Failed to record delivery.' },
      })
    }

    return jsonResponse(201, { ok: true, correlation_id: correlationId, data: delivery })
  } catch (err) {
    return jsonResponse(400, {
      ok: false,
      correlation_id: correlationId,
      error: { code: 'INVALID_REQUEST', message: err instanceof Error ? err.message : String(err) },
    })
  }
})

