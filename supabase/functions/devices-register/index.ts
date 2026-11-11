// =============================================================================
// Edge Function: POST /v1/devices/register (Section 13.1 & F1-020 / F2-006)
// Registers an enrolled developer device under active tenant membership.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface RegisterDeviceRequest {
  tenant_id: string
  device_name: string
  os_platform: 'macos' | 'windows' | 'linux' | 'web'
  agent_version: string
  device_fingerprint_hash: string
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
    const body = (await req.json()) as RegisterDeviceRequest
    if (
      !body.tenant_id ||
      !body.device_name ||
      !body.os_platform ||
      !body.agent_version ||
      !body.device_fingerprint_hash
    ) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tenant_id, device_name, os_platform, agent_version, and device_fingerprint_hash are required.',
        },
      })
    }

    const { data: device, error } = await auth.supabase
      .from('devices')
      .insert({
        tenant_id: body.tenant_id,
        user_id: auth.userId,
        device_name: body.device_name,
        os_platform: body.os_platform,
        agent_version: body.agent_version,
        device_fingerprint_hash: body.device_fingerprint_hash,
      })
      .select('id, tenant_id, user_id, device_name, os_platform, agent_version, created_at')
      .single()

    if (error) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'DEVICE_REGISTER_FAILED', message: error.message },
      })
    }

    return jsonResponse(201, {
      ok: true,
      correlation_id: correlationId,
      data: device,
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

