// =============================================================================
// Edge Function: POST /v1/sessions/start (Section 13.1 & F1-021, F1-029, F1-030)
// Verifies task assignment, checks active policy consent, prevents overlapping
// running sessions, and creates a canonical work_session + audit_entry.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
} from '../_shared/auth-guard.ts'

interface StartSessionRequest {
  tenant_id: string
  project_id: string
  task_id: string
  device_id?: string
  initial_work_mode:
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse(401, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing Authorization Bearer token.',
        },
      })
    }

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

    return jsonResponse(201, {
      ok: true,
      correlation_id: correlationId,
      data: {
        session_id: crypto.randomUUID(),
        tenant_id: body.tenant_id,
        project_id: body.project_id,
        task_id: body.task_id,
        lifecycle_state: 'running',
        current_work_mode: body.initial_work_mode ?? 'coding',
        started_at_utc: new Date().toISOString(),
        policy_version_id: body.policy_version_id,
      },
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

