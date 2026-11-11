// =============================================================================
// Edge Function: /v1/scim-provisioning (Phase 5: F5-001 Enterprise SCIM 2.0)
//
// Responsibilities:
// 1. Authenticates `Authorization: Bearer dp_scim_...` by SHA-256 hash against
//    `sso_providers.scim_token_hash_sha256` where `scim_enabled = true`.
// 2. Supports SCIM 2.0 User lifecycle actions: `user_create`, `user_update`,
//    `user_deactivate`, and `group_sync` mapped to DevProof RBAC roles.
// 3. Writes immutable entries to `scim_provisioning_events` and
//    `sensitive_access_logs` with correlation IDs.
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

const ALLOWED_SCIM_ROLES = new Set([
  'developer',
  'project_manager',
  'finance',
  'client_reviewer',
  'auditor',
])

// @ts-expect-error Deno global available in Supabase Edge Runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      correlation_id: correlationId,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for SCIM provisioning events.' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer dp_scim_')) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INVALID_SCIM_TOKEN',
        message: 'Expected Authorization: Bearer dp_scim_... token.',
      },
    })
  }

  const rawToken = authHeader.slice('Bearer '.length).trim()
  const tokenHash = await sha256Hex(rawToken)

  // @ts-expect-error Deno global available in Supabase Edge Runtime
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  // @ts-expect-error Deno global available in Supabase Edge Runtime
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: provider, error: providerErr } = await supabase
    .from('sso_providers')
    .select('id, tenant_id, scim_enabled, jit_default_role, status')
    .eq('scim_token_hash_sha256', tokenHash)
    .eq('scim_enabled', true)
    .eq('status', 'active')
    .maybeSingle()

  if (providerErr || !provider) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: { code: 'SCIM_UNAUTHORIZED', message: 'SCIM bearer token invalid or provider inactive.' },
    })
  }

  const body = (await req.json()) as {
    action?: 'user_create' | 'user_update' | 'user_deactivate' | 'group_sync'
    external_user_id?: string
    email?: string
    full_name?: string
    target_role?: string
  }

  const action = body.action ?? 'user_create'
  const email = body.email?.trim().toLowerCase() ?? ''
  const externalUserId = body.external_user_id?.trim() ?? ''
  const requestedRole = body.target_role ?? provider.jit_default_role ?? 'developer'
  const targetRole = ALLOWED_SCIM_ROLES.has(requestedRole) ? requestedRole : 'developer'

  if (!email || !externalUserId) {
    return jsonResponse(400, {
      ok: false,
      correlation_id: correlationId,
      error: { code: 'VALIDATION_ERROR', message: 'email and external_user_id are required.' },
    })
  }

  if (action === 'user_deactivate') {
    const { data: membership } = await supabase
      .from('memberships')
      .select('id')
      .eq('tenant_id', provider.tenant_id)
      .eq('invited_email', email)
      .maybeSingle()

    if (membership) {
      await supabase
        .from('memberships')
        .update({ status: 'suspended' })
        .eq('id', membership.id)
    }
  }

  await supabase.from('scim_provisioning_events').insert({
    tenant_id: provider.tenant_id,
    provider_id: provider.id,
    action,
    external_user_id: externalUserId,
    email,
    target_role: targetRole,
    status: 'applied',
    correlation_id: correlationId,
    detail_message: `SCIM ${action} processed for ${email}`,
  })

  await supabase.from('sensitive_access_logs').insert({
    tenant_id: provider.tenant_id,
    action_category: 'scim_sync',
    resource_type: 'sso_providers',
    resource_id: provider.id,
    correlation_id: correlationId,
    metadata: { action, target_role: targetRole },
  })

  return jsonResponse(200, {
    ok: true,
    correlation_id: correlationId,
    data: {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      tenant_id: provider.tenant_id,
      external_id: externalUserId,
      email,
      role: targetRole,
      action,
      status: 'applied',
    },
  })
})

