// =============================================================================
// Edge Function: POST /v1/sessions/{id}/transition (F1-022, F1-023, F1-024)
// Handles pause, resume, stop, switch_work_mode, start_break, end_break, and
// materializes canonical non-overlapping time_segments on stop.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface SessionTransitionRequest {
  session_id: string
  tenant_id: string
  action: 'pause' | 'resume' | 'stop' | 'switch_work_mode' | 'start_break' | 'end_break'
  work_mode?: string
  break_type?: 'paid' | 'unpaid' | 'personal'
  monotonic_duration_ms: number
  note?: string
  outcome_summary?: string
}

// @ts-expect-error Deno global available in Supabase Edge Runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  const idempotencyKey = req.headers.get('idempotency-key') ?? correlationId
  const auth = await requireAuthenticatedUser(req, correlationId)
  if (auth instanceof Response) return auth

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

    const nowIso = new Date().toISOString()

    const updateFields: Record<string, unknown> = {
      lifecycle_state: nextLifecycleState,
      monotonic_duration_ms: body.monotonic_duration_ms ?? 0,
    }
    if (body.work_mode) updateFields.current_work_mode = body.work_mode
    if (body.note !== undefined) updateFields.session_notes = body.note
    if (body.outcome_summary !== undefined) updateFields.outcome_summary = body.outcome_summary
    if (body.action === 'stop') updateFields.ended_at_utc = nowIso

    const { data: updatedSession, error } = await auth.supabase
      .from('work_sessions')
      .update(updateFields)
      .eq('id', body.session_id)
      .eq('tenant_id', body.tenant_id)
      .eq('user_id', auth.userId)
      .select('*')
      .single()

    if (error || !updatedSession) {
      return jsonResponse(404, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'SESSION_UPDATE_FAILED',
          message: error?.message ?? 'Session not found or not owned by user.',
        },
      })
    }

    if (body.action === 'start_break') {
      await auth.supabase.from('breaks').insert({
        tenant_id: body.tenant_id,
        user_id: auth.userId,
        session_id: body.session_id,
        break_type: body.break_type ?? 'unpaid',
        started_at_utc: nowIso,
      })
    }

    if (body.action === 'switch_work_mode' && body.work_mode) {
      await auth.supabase.from('work_mode_events').insert({
        tenant_id: body.tenant_id,
        user_id: auth.userId,
        session_id: body.session_id,
        work_mode: body.work_mode,
        started_at_utc: nowIso,
        declared_note: body.note ?? null,
      })
    }

    if (body.action === 'stop') {
      const startedAt = new Date(updatedSession.started_at_utc)
      const endedAt = new Date(nowIso)
      const durationMinutes = Math.max(
        1,
        Math.round(((endedAt.getTime() - startedAt.getTime()) / 60000) * 100) / 100
      )
      const isDeepWork = ['thinking', 'design', 'research', 'meeting'].includes(
        updatedSession.current_work_mode
      )

      await auth.supabase.from('time_segments').insert({
        tenant_id: body.tenant_id,
        user_id: auth.userId,
        project_id: updatedSession.project_id,
        task_id: updatedSession.task_id,
        session_id: updatedSession.id,
        work_date: startedAt.toISOString().slice(0, 10),
        segment_range: `[${startedAt.toISOString()},${endedAt.toISOString()})`,
        work_mode: updatedSession.current_work_mode,
        provenance: updatedSession.provenance,
        evidence_status: isDeepWork || updatedSession.session_notes ? 'context_added' : 'declared',
        elapsed_minutes: durationMinutes,
        claimed_minutes: durationMinutes,
        observed_minutes: isDeepWork ? 0 : durationMinutes,
        supported_minutes: durationMinutes,
        developer_explanation: updatedSession.session_notes,
      })
    }

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        idempotency_key: idempotencyKey,
        session: updatedSession,
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
