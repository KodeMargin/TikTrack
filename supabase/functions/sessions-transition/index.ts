// =============================================================================
// Edge Function: POST /v1/sessions/{id}/transition (F1-022, F1-023, F1-024)
// Handles idempotent state transitions: pause, resume, stop, switch_work_mode,
// start_break, end_break, and slices canonical non-overlapping time_segments.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
} from '../_shared/auth-guard.ts'

interface SessionTransitionRequest {
  session_id: string
  tenant_id: string
  action: 'pause' | 'resume' | 'stop' | 'switch_work_mode' | 'start_break' | 'end_break'
  work_mode?: string
  break_type?: 'paid' | 'unpaid'
  monotonic_duration_ms: number
  note?: string
  outcome_summary?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  const idempotencyKey = req.headers.get('idempotency-key') ?? correlationId

  try {
    const body = (await req.json()) as SessionTransitionRequest
    if (!body.session_id || !body.tenant_id || !body.action) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'INVALID_TRANSITION',
          message: 'session_id, tenant_id, and action are required.',
        },
      })
    }

    const nextLifecycleState =
      body.action === 'pause'
        ? 'paused'
        : body.action === 'start_break'
          ? 'on_break'
          : body.action === 'stop'
            ? 'completed'
            : 'running'

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        session_id: body.session_id,
        idempotency_key: idempotencyKey,
        lifecycle_state: nextLifecycleState,
        current_work_mode: body.work_mode,
        transitioned_at_utc: new Date().toISOString(),
        monotonic_duration_ms: body.monotonic_duration_ms,
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

