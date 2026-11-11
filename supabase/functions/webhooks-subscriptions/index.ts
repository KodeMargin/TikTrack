// =============================================================================
// Edge Function: POST /v1/webhooks/subscriptions
// Covers Phase 4: F4-001 (Self-Service Subscription Lifecycle & Entitlement Sync)
// and F4-003 (Strict Separation of SaaS Subscription Invoices vs Work Invoices)
//
// Responsibilities:
// 1. Reads raw body BEFORE JSON.parse and verifies Stripe-Signature or
//    Paddle-Signature using Web Crypto HMAC-SHA256.
// 2. Deduplicates webhook deliveries via `webhook_receipts` (provider, delivery_id).
// 3. Updates `subscription_accounts`, syncs `tenants.plan_tier`, records a
//    platform `saas_subscription_invoices` row (never touching `invoice_drafts`),
//    and writes an immutable `audit_entries` record.
// =============================================================================

// @ts-expect-error Deno JSR import resolved by Supabase Edge Runtime
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, extractCorrelationId, jsonResponse } from '../_shared/auth-guard.ts'

async function computeSha256Hex(rawBody: string): Promise<string> {
  const bytes = new TextEncoder().encode(rawBody)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim()
  if (clean.length % 2 !== 0) return new Uint8Array(0)
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

function extractStripeV1Signature(header: string | null): { timestamp: string; signature: string } | null {
  if (!header) return null
  const parts = header.split(',').map((p) => p.trim())
  const t = parts.find((p) => p.startsWith('t='))?.slice(2)
  const v1 = parts.find((p) => p.startsWith('v1='))?.slice(3)
  if (!t || !v1) return null
  return { timestamp: t, signature: v1 }
}

async function verifyBillingWebhookSignature(
  provider: 'stripe' | 'paddle',
  rawBody: string,
  req: Request,
  secret: string
): Promise<boolean> {
  if (provider === 'stripe') {
    const parsed = extractStripeV1Signature(req.headers.get('stripe-signature'))
    if (!parsed) return false
    const signedPayload = `${parsed.timestamp}.${rawBody}`
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const sigBytes = hexToBytes(parsed.signature)
    if (sigBytes.length === 0) return false
    return crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes.buffer as ArrayBuffer,
      new TextEncoder().encode(signedPayload)
    )
  }

  // Paddle-Signature: ts=...;h1=...
  const paddleHeader = req.headers.get('paddle-signature')
  if (!paddleHeader) return false
  const parts = paddleHeader.split(';').map((p) => p.trim())
  const ts = parts.find((p) => p.startsWith('ts='))?.slice(3)
  const h1 = parts.find((p) => p.startsWith('h1='))?.slice(3)
  if (!ts || !h1) return false
  const signedPayload = `${ts}:${rawBody}`
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const sigBytes = hexToBytes(h1)
  if (sigBytes.length === 0) return false
  return crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    sigBytes.buffer as ArrayBuffer,
    new TextEncoder().encode(signedPayload)
  )
}

// @ts-expect-error Deno global available in Supabase Edge Runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  const provider: 'stripe' | 'paddle' = req.headers.get('paddle-signature') ? 'paddle' : 'stripe'
  const rawBody = await req.text()
  const payloadSha256 = await computeSha256Hex(rawBody)

  const secret =
    provider === 'stripe'
      ? // @ts-expect-error Deno global available in Supabase Edge Runtime
        (Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? 'whsec_devproof_local')
      : // @ts-expect-error Deno global available in Supabase Edge Runtime
        (Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? 'pdl_ntfset_devproof_local')

  const verified = await verifyBillingWebhookSignature(provider, rawBody, req, secret)
  if (!verified) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INVALID_BILLING_SIGNATURE',
        message: `${provider} webhook HMAC-SHA256 verification failed.`,
      },
    })
  }

  try {
    const payload = JSON.parse(rawBody) as {
      id?: string
      type?: string
      tenant_id?: string
      plan_tier?: 'starter' | 'team' | 'agency' | 'enterprise'
      status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'grace_period'
      billing_cycle?: 'monthly' | 'annual'
      seats_billed?: number
      amount_cents?: number
      currency?: string
      provider_customer_id?: string
      provider_subscription_id?: string
      provider_invoice_id?: string
    }

    const deliveryId = payload.id ?? `${provider}-evt-${payloadSha256.slice(0, 16)}`
    const eventType = payload.type ?? 'customer.subscription.updated'
    const tenantId = payload.tenant_id

    if (!tenantId) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'MISSING_TENANT_ID', message: 'tenant_id is required in billing webhook payload.' },
      })
    }

    // @ts-expect-error Deno global available in Supabase Edge Runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-expect-error Deno global available in Supabase Edge Runtime
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1. Deduplicate delivery
    const { data: existingReceipt } = await supabase
      .from('webhook_receipts')
      .select('id, delivery_attempt_count')
      .eq('provider', provider)
      .eq('delivery_id', deliveryId)
      .maybeSingle()

    if (existingReceipt) {
      await supabase
        .from('webhook_receipts')
        .update({ delivery_attempt_count: existingReceipt.delivery_attempt_count + 1 })
        .eq('id', existingReceipt.id)

      return jsonResponse(200, {
        ok: true,
        correlation_id: correlationId,
        data: { deduplicated: true, delivery_id: deliveryId },
      })
    }

    await supabase.from('webhook_receipts').insert({
      tenant_id: tenantId,
      provider,
      delivery_id: deliveryId,
      event_type: eventType,
      signature_verified: true,
      payload_sha256: payloadSha256,
      status: 'processed',
      processed_at_utc: new Date().toISOString(),
    })

    const nextPlanTier = payload.plan_tier ?? 'team'
    const nextStatus = payload.status ?? 'active'
    const nextCycle = payload.billing_cycle ?? 'monthly'

    // 2. Upsert subscription_accounts and sync tenants.plan_tier
    const { data: subRow, error: subErr } = await supabase
      .from('subscription_accounts')
      .upsert(
        {
          tenant_id: tenantId,
          plan_tier: nextPlanTier,
          billing_provider: provider,
          provider_customer_id: payload.provider_customer_id ?? `cus_${tenantId.slice(0, 8)}`,
          provider_subscription_id: payload.provider_subscription_id ?? `sub_${tenantId.slice(0, 8)}`,
          status: nextStatus,
          billing_cycle: nextCycle,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' }
      )
      .select('id')
      .single()

    if (subErr || !subRow) {
      return jsonResponse(500, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'SUBSCRIPTION_SYNC_FAILED', message: subErr?.message ?? 'Failed to upsert subscription.' },
      })
    }

    await supabase.from('tenants').update({ plan_tier: nextPlanTier }).eq('id', tenantId)

    // 3. Record SaaS subscription invoice (strictly separate from freelancer invoice_drafts)
    if (eventType.includes('invoice') || (payload.amount_cents ?? 0) > 0) {
      const amountCents = payload.amount_cents ?? 4900
      const invoiceNumber = `SAAS-${new Date().toISOString().slice(0, 7).replace('-', '')}-${deliveryId.slice(-4).toUpperCase()}`
      await supabase.from('saas_subscription_invoices').insert({
        tenant_id: tenantId,
        subscription_account_id: subRow.id,
        invoice_number: invoiceNumber,
        billing_period_label: new Date().toISOString().slice(0, 7),
        plan_tier: nextPlanTier,
        seats_billed: payload.seats_billed ?? 1,
        unit_price_cents: amountCents,
        subtotal_cents: amountCents,
        tax_cents: 0,
        total_cents: amountCents,
        currency: (payload.currency ?? 'USD').toUpperCase(),
        status: 'paid',
        provider_invoice_id: payload.provider_invoice_id ?? deliveryId,
        paid_at: new Date().toISOString(),
      })
    }

    await supabase.from('audit_entries').insert({
      tenant_id: tenantId,
      action_type: 'SAAS_SUBSCRIPTION_WEBHOOK_SYNCED',
      target_entity: `subscription_accounts:${subRow.id}`,
      reason: `Synced ${provider} ${eventType}: plan=${nextPlanTier}, status=${nextStatus}`,
      correlation_id: correlationId,
    })

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        subscription_account_id: subRow.id,
        plan_tier: nextPlanTier,
        status: nextStatus,
      },
    })
  } catch (err) {
    return jsonResponse(400, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INVALID_PAYLOAD',
        message: err instanceof Error ? err.message : String(err),
      },
    })
  }
})
