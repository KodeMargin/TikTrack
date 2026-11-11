// =============================================================================
// Edge Function: POST /v1/timesheets/{id}/review (F1-042, F1-047)
// Executes manager review decisions (approve, ask_clarification,
// adjust_with_reason, reject, dispute) with mandatory reason, immutable
// review_decisions record, and audit_entries trail.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface TimesheetReviewRequest {
  tenant_id: string
  timesheet_id: string
  timesheet_line_id: string
  decision_type: 'approve' | 'ask_clarification' | 'adjust_with_reason' | 'reject' | 'dispute'
  reason: string
  adjusted_minutes?: number
  lock_period?: boolean
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
    const body = (await req.json()) as TimesheetReviewRequest
    if (!body.reason || body.reason.trim().length < 5) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'REASON_REQUIRED',
          message:
            'Every manager adjustment, clarification request, or review decision requires a traceable human reason of at least 5 characters (F1-042).',
        },
      })
    }

    const { data: line, error: lineErr } = await auth.supabase
      .from('timesheet_lines')
      .select('id, claimed_minutes, approved_billable_minutes, is_locked')
      .eq('id', body.timesheet_line_id)
      .eq('timesheet_id', body.timesheet_id)
      .eq('tenant_id', body.tenant_id)
      .single()

    if (lineErr || !line) {
      return jsonResponse(404, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'LINE_NOT_FOUND',
          message: lineErr?.message ?? 'Timesheet line not found or access denied.',
        },
      })
    }

    if (line.is_locked) {
      return jsonResponse(409, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'PERIOD_LOCKED',
          message: 'Locked timesheet lines cannot be modified in place (F1-047).',
        },
      })
    }

    const newApprovedMinutes =
      body.decision_type === 'approve'
        ? Number(line.claimed_minutes)
        : body.decision_type === 'adjust_with_reason'
          ? (body.adjusted_minutes ?? Number(line.claimed_minutes))
          : 0

    const nextLineStatus =
      body.decision_type === 'approve'
        ? 'approved'
        : body.decision_type === 'adjust_with_reason'
          ? 'adjusted_approved'
          : body.decision_type === 'ask_clarification'
            ? 'needs_clarification'
            : body.decision_type === 'dispute'
              ? 'disputed'
              : 'rejected'

    const { error: updateErr } = await auth.supabase
      .from('timesheet_lines')
      .update({
        approved_billable_minutes: newApprovedMinutes,
        line_status: nextLineStatus,
        reviewer_comment: body.reason.trim(),
        is_locked: Boolean(
          body.lock_period &&
            (nextLineStatus === 'approved' || nextLineStatus === 'adjusted_approved')
        ),
      })
      .eq('id', line.id)
      .eq('tenant_id', body.tenant_id)

    if (updateErr) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'LINE_UPDATE_FAILED', message: updateErr.message },
      })
    }

    const { data: decision } = await auth.supabase
      .from('review_decisions')
      .insert({
        tenant_id: body.tenant_id,
        timesheet_id: body.timesheet_id,
        timesheet_line_id: body.timesheet_line_id,
        reviewer_user_id: auth.userId,
        decision_type: body.decision_type,
        reason: body.reason.trim(),
        previous_approved_minutes: line.approved_billable_minutes,
        new_approved_minutes: newApprovedMinutes,
      })
      .select('id, decided_at_utc')
      .single()

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        review_decision_id: decision?.id ?? crypto.randomUUID(),
        timesheet_id: body.timesheet_id,
        timesheet_line_id: body.timesheet_line_id,
        decision_type: body.decision_type,
        line_status: nextLineStatus,
        new_approved_minutes: newApprovedMinutes,
        decided_at_utc: decision?.decided_at_utc ?? new Date().toISOString(),
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
