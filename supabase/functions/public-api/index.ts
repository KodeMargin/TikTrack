// =============================================================================
// Edge Function: /v1/public-api (Phase 4: F4-006 Public API & Scoped API Keys)
//
// Responsibilities:
// 1. Authenticates `Authorization: Bearer dp_live_...` by hashing with SHA-256
//    and matching `api_keys.key_hash_sha256` (revoked_at IS NULL, not expired).
// 2. Enforces fine-grained scopes (`projects:read`, `tasks:read`, `timesheets:read`,
//    `invoices:read`).
// 3. Returns strictly commercial/project/timesheet data — never raw workstation
//    telemetry, keystrokes, or internal AI drafts.
// 4. Increments `usage_records.api_requests_count` and updates `api_keys.last_used_at`.
// =============================================================================

// @ts-expect-error Deno JSR import resolved by Supabase Edge Runtime
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, extractCorrelationId, jsonResponse } from '../_shared/auth-guard.ts'

async function sha256Hex(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// @ts-expect-error Deno global available in Supabase Edge Runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer dp_live_')) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Expected Authorization: Bearer dp_live_... scoped API key.',
      },
    })
  }

  const rawKey = authHeader.slice('Bearer '.length).trim()
  const keyHash = await sha256Hex(rawKey)

  // @ts-expect-error Deno global available in Supabase Edge Runtime
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  // @ts-expect-error Deno global available in Supabase Edge Runtime
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: apiKey, error: keyErr } = await supabase
    .from('api_keys')
    .select('id, tenant_id, scopes, rate_limit_per_min, expires_at, revoked_at')
    .eq('key_hash_sha256', keyHash)
    .maybeSingle()

  if (keyErr || !apiKey || apiKey.revoked_at) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: { code: 'REVOKED_OR_UNKNOWN_KEY', message: 'API key is invalid or revoked.' },
    })
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) <= new Date()) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: { code: 'EXPIRED_API_KEY', message: 'API key has expired.' },
    })
  }

  const url = new URL(req.url)
  const resource = url.searchParams.get('resource') ?? 'projects'
  const scopes = (apiKey.scopes ?? []) as string[]

  const requiredScope =
    resource === 'tasks'
      ? 'tasks:read'
      : resource === 'timesheets'
        ? 'timesheets:read'
        : resource === 'invoices'
          ? 'invoices:read'
          : 'projects:read'

  if (!scopes.includes(requiredScope)) {
    return jsonResponse(403, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INSUFFICIENT_SCOPE',
        message: `API key lacks required scope '${requiredScope}'.`,
      },
    })
  }

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)

  const today = new Date().toISOString().slice(0, 10)
  const { data: usageRow } = await supabase
    .from('usage_records')
    .select('id, api_requests_count')
    .eq('tenant_id', apiKey.tenant_id)
    .eq('metric_date', today)
    .maybeSingle()

  if (usageRow) {
    await supabase
      .from('usage_records')
      .update({ api_requests_count: Number(usageRow.api_requests_count) + 1 })
      .eq('id', usageRow.id)
  } else {
    await supabase.from('usage_records').insert({
      tenant_id: apiKey.tenant_id,
      metric_date: today,
      api_requests_count: 1,
    })
  }

  if (resource === 'tasks') {
    const { data } = await supabase
      .from('tasks')
      .select('id, project_id, code, title, status, priority, estimate_minutes, is_billable, due_date')
      .eq('tenant_id', apiKey.tenant_id)
      .order('created_at', { ascending: false })
      .limit(100)
    return jsonResponse(200, { ok: true, correlation_id: correlationId, data })
  }

  if (resource === 'timesheets') {
    const { data } = await supabase
      .from('timesheets')
      .select('id, project_id, period_start, period_end, status, submitted_at, approved_at')
      .eq('tenant_id', apiKey.tenant_id)
      .order('period_start', { ascending: false })
      .limit(100)
    return jsonResponse(200, { ok: true, correlation_id: correlationId, data })
  }

  if (resource === 'invoices') {
    const { data } = await supabase
      .from('invoice_drafts')
      .select('id, project_id, invoice_number, client_name, currency, total_amount, status, issued_at')
      .eq('tenant_id', apiKey.tenant_id)
      .order('created_at', { ascending: false })
      .limit(100)
    return jsonResponse(200, { ok: true, correlation_id: correlationId, data })
  }

  const { data } = await supabase
    .from('projects')
    .select('id, code, name, client_name, status, created_at')
    .eq('tenant_id', apiKey.tenant_id)
    .order('created_at', { ascending: false })
    .limit(100)

  return jsonResponse(200, { ok: true, correlation_id: correlationId, data })
})

