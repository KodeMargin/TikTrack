// =============================================================================
// Edge Function: POST /v1/disputes (Section 13.1 & F1-043)
// Opens a structured dispute on a timesheet line and posts an initial message.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface OpenDisputeRequest {
  tenant_id: string
  timesheet_id: string
  timesheet_line_id: string
  disputed_minutes: number
  reason: string
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
    const body = (await req.json()) as OpenDisputeRequest
    if (!body.tenant_id || !body.timesheet_id || !body.timesheet_line_id || !body.reason || body.reason.trim().length < 10) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tenant_id, timesheet_id, timesheet_line_id, and reason (>= 10 chars) are required.',
        },
      })
    }

    const { data: dispute, error } = await auth.supabase
      .from('disputes')
      .insert({
        tenant_id: body.tenant_id,
        timesheet_id: body.timesheet_id,
        timesheet_line_id: body.timesheet_line_id,
        opened_by_user_id: auth.userId,
        disputed_minutes: body.disputed_minutes ?? 0,
        reason: body.reason.trim(),
        status: 'open',
      })
      .select('id, status, created_at')
      .single()

    if (error || !dispute) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'DISPUTE_CREATE_FAILED', message: error?.message ?? 'Failed to open dispute.' },
      })
    }

    await auth.supabase.from('dispute_messages').insert({
      tenant_id: body.tenant_id,
      dispute_id: dispute.id,
      author_user_id: auth.userId,
      message_markdown: body.reason.trim(),
    })

    return jsonResponse(201, {
      ok: true,
      correlation_id: correlationId,
      data: dispute,
    })
  } catch (err) {
    return jsonResponse(500, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected server error',
      },
    })
  }
})

