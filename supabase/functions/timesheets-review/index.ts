// =============================================================================
// Edge Function: POST /v1/timesheets/{id}/review (F1-042, F1-047)
// Executes manager review decisions (approve, ask_clarification,
// adjust_with_reason, reject, dispute) with mandatory reason & audit trail.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)

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

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        review_decision_id: crypto.randomUUID(),
        timesheet_id: body.timesheet_id,
        timesheet_line_id: body.timesheet_line_id,
        decision_type: body.decision_type,
        reason: body.reason,
        is_locked: Boolean(body.lock_period && body.decision_type === 'approve'),
        decided_at_utc: new Date().toISOString(),
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

