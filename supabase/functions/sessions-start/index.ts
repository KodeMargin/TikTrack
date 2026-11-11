// =============================================================================
// Edge Function: POST /v1/sessions/start (Section 13.1 & F1-021, F1-029, F1-030)
// Verifies JWT, policy consent, and active session overlap, then persists
// work_sessions via RLS-enforced Supabase client.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface StartSessionRequest {
  tenant_id: string
  project_id: string
  task_id: string
  device_id?: string
  initial_work_mode?:
    | 'coding'
    | 'debugging'
    | 'thinking'
    | 'research'
    | 'testing'
    | 'review'
    | 'meeting'
    | 'design'
  policy_version_id: string
  session_notes?: string
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
    const body = (await req.json()) as StartSessionRequest
    if (!body.tenant_id || !body.project_id || !body.task_id || !body.policy_version_id) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'tenant_id, project_id, task_id, and policy_version_id are required before starting a session (F1-021, F1-030).',
        },
      })
    }

    // 1. Verify active policy consent (F1-030)
    const { data: consent } = await auth.supabase
      .from('policy_consents')
      .select('id')
      .eq('tenant_id', body.tenant_id)
      .eq('user_id', auth.userId)
      .eq('policy_version_id', body.policy_version_id)
      .maybeSingle()

    if (!consent) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'CONSENT_REQUIRED',
          message: 'Active tracking policy consent acknowledgment is required prior to recording (F1-030).',
        },
      })
    }

    // 2. Check for existing running session by same user (F1-029)
    const { data: running } = await auth.supabase
      .from('work_sessions')
      .select('id, started_at_utc')
      .eq('tenant_id', body.tenant_id)
      .eq('user_id', auth.userId)
      .eq('lifecycle_state', 'running')
      .maybeSingle()

    if (running) {
      return jsonResponse(409, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'CONCURRENT_SESSION_CONFLICT',
          message: `Session ${running.id} is already running. Pause or stop it to avoid double counting (F1-029).`,
        },
      })
    }

    // 3. Create work_session under RLS
    const { data: session, error } = await auth.supabase
      .from('work_sessions')
      .insert({
        tenant_id: body.tenant_id,
        user_id: auth.userId,
        device_id: body.device_id ?? null,
        project_id: body.project_id,
        task_id: body.task_id,
        provenance: body.device_id ? 'desktop_timer' : 'web_timer',
        lifecycle_state: 'running',
        current_work_mode: body.initial_work_mode ?? 'coding',
        policy_version_id: body.policy_version_id,
        session_notes: body.session_notes ?? '',
      })
      .select('*')
      .single()

    if (error) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'SESSION_CREATE_FAILED', message: error.message },
      })
    }

    return jsonResponse(201, {
      ok: true,
      correlation_id: correlationId,
      data: session,
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
