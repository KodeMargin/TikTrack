// =============================================================================
// Edge Function: POST /v1/disputes (Phase 3 Milestone 3.3: F3-030..F3-034)
// Supports:
//   - action: 'open'     -> Open clarification request / dispute with due date
//   - action: 'reply'    -> Developer appeal / reviewer note with attached artifacts
//   - action: 'escalate' -> Independent second review (distinct reviewer)
//   - action: 'resolve'  -> Resolve accepted/adjusted/upheld + post-lock credit note
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface DisputeActionRequest {
  action?: 'open' | 'reply' | 'escalate' | 'resolve'
  tenant_id: string
  dispute_id?: string
  timesheet_id?: string
  timesheet_line_id?: string
  disputed_minutes?: number
  reason?: string
  due_date?: string
  requested_evidence_type?: string
  assigned_reviewer_id?: string
  escalated_reviewer_id?: string
  message_markdown?: string
  attached_artifact_ids?: string[]
  resolution_status?: 'resolved_accepted' | 'resolved_adjusted' | 'resolved_upheld'
  adjusted_approved_minutes?: number
  resolution_summary?: string
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
    const body = (await req.json()) as DisputeActionRequest
    const action = body.action ?? 'open'

    if (!body.tenant_id) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id is required.' },
      })
    }

    if (action === 'open') {
      if (!body.timesheet_id || !body.timesheet_line_id || !body.reason || body.reason.trim().length < 10) {
        return jsonResponse(422, {
          ok: false,
          correlation_id: correlationId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'timesheet_id, timesheet_line_id, and reason (>= 10 chars) are required.',
          },
        })
      }

      const { data: dispute, error } = await auth.supabase
        .from('disputes')
        .insert({
          tenant_id: body.tenant_id,
          timesheet_id: body.timesheet_id,
          timesheet_line_id: body.timesheet_line_id,
          opened_by_user_id: auth.userId,
          assigned_reviewer_id: body.assigned_reviewer_id ?? null,
          due_date: body.due_date ?? null,
          requested_evidence_type: body.requested_evidence_type ?? null,
          disputed_minutes: body.disputed_minutes ?? 0,
          reason: body.reason.trim(),
          status: 'open',
        })
        .select('id, status, due_date, created_at')
        .single()

      if (error || !dispute) {
        return jsonResponse(403, {
          ok: false,
          correlation_id: correlationId,
          error: { code: 'DISPUTE_CREATE_FAILED', message: error?.message ?? 'Failed to open dispute.' },
        })
      }

      await auth.supabase.from('dispute_messages').insert({
        tenant_id: body.tenant_id,
        dispute_id: dispute.id,
        author_user_id: auth.userId,
        message_type: 'clarification_request',
        message_markdown: body.reason.trim(),
        attached_artifact_ids: body.attached_artifact_ids ?? [],
      })

      return jsonResponse(201, { ok: true, correlation_id: correlationId, data: dispute })
    }

    if (!body.dispute_id) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'MISSING_DISPUTE_ID', message: 'dispute_id is required for reply/escalate/resolve.' },
      })
    }

    if (action === 'reply') {
      if (!body.message_markdown || body.message_markdown.trim().length < 2) {
        return jsonResponse(422, {
          ok: false,
          correlation_id: correlationId,
          error: { code: 'EMPTY_MESSAGE', message: 'message_markdown is required.' },
        })
      }

      const { data: existing } = await auth.supabase
        .from('disputes')
        .select('id, opened_by_user_id')
        .eq('id', body.dispute_id)
        .eq('tenant_id', body.tenant_id)
        .single()

      if (!existing) {
        return jsonResponse(404, {
          ok: false,
          correlation_id: correlationId,
          error: { code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found.' },
        })
      }

      const nextStatus =
        existing.opened_by_user_id === auth.userId ? 'awaiting_manager' : 'awaiting_developer'

      await auth.supabase
        .from('disputes')
        .update({ status: nextStatus })
        .eq('id', body.dispute_id)
        .eq('tenant_id', body.tenant_id)

      await auth.supabase.from('dispute_messages').insert({
        tenant_id: body.tenant_id,
        dispute_id: body.dispute_id,
        author_user_id: auth.userId,
        message_type: existing.opened_by_user_id === auth.userId ? 'developer_appeal' : 'reviewer_note',
        message_markdown: body.message_markdown.trim(),
        attached_artifact_ids: body.attached_artifact_ids ?? [],
      })

      return jsonResponse(200, {
        ok: true,
        correlation_id: correlationId,
        data: { id: body.dispute_id, status: nextStatus },
      })
    }

    if (action === 'escalate') {
      if (!body.escalated_reviewer_id || !body.reason || body.reason.trim().length < 5) {
        return jsonResponse(422, {
          ok: false,
          correlation_id: correlationId,
          error: {
            code: 'ESCALATION_VALIDATION_ERROR',
            message: 'escalated_reviewer_id and escalation reason are required (F3-033).',
          },
        })
      }

      const { data: existing } = await auth.supabase
        .from('disputes')
        .select('id, assigned_reviewer_id, opened_by_user_id')
        .eq('id', body.dispute_id)
        .eq('tenant_id', body.tenant_id)
        .single()

      if (!existing) {
        return jsonResponse(404, {
          ok: false,
          correlation_id: correlationId,
          error: { code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found.' },
        })
      }

      if (
        body.escalated_reviewer_id === existing.assigned_reviewer_id ||
        body.escalated_reviewer_id === existing.opened_by_user_id
      ) {
        return jsonResponse(422, {
          ok: false,
          correlation_id: correlationId,
          error: {
            code: 'INDEPENDENT_REVIEWER_REQUIRED',
            message:
              'Independent second review (F3-033) requires a reviewer distinct from the original reviewer and appellant.',
          },
        })
      }

      const { error: escErr } = await auth.supabase
        .from('disputes')
        .update({
          status: 'escalated',
          escalated_reviewer_id: body.escalated_reviewer_id,
          escalation_reason: body.reason.trim(),
        })
        .eq('id', body.dispute_id)
        .eq('tenant_id', body.tenant_id)

      if (escErr) {
        return jsonResponse(403, {
          ok: false,
          correlation_id: correlationId,
          error: { code: 'ESCALATE_FAILED', message: escErr.message },
        })
      }

      await auth.supabase.from('dispute_messages').insert({
        tenant_id: body.tenant_id,
        dispute_id: body.dispute_id,
        author_user_id: auth.userId,
        message_type: 'escalation',
        message_markdown: `Escalated to independent second reviewer: ${body.reason.trim()}`,
      })

      return jsonResponse(200, {
        ok: true,
        correlation_id: correlationId,
        data: { id: body.dispute_id, status: 'escalated' },
      })
    }

    // action === 'resolve'
    if (!body.resolution_status || !body.resolution_summary || body.resolution_summary.trim().length < 5) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'RESOLUTION_VALIDATION_ERROR',
          message: 'resolution_status and resolution_summary (>= 5 chars) are required.',
        },
      })
    }

    const { data: resolved, error: resErr } = await auth.supabase
      .from('disputes')
      .update({
        status: body.resolution_status,
        resolution_summary: body.resolution_summary.trim(),
        resolution_note: body.resolution_summary.trim(),
        adjusted_approved_minutes: body.adjusted_approved_minutes ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', body.dispute_id)
      .eq('tenant_id', body.tenant_id)
      .select('id, timesheet_id, timesheet_line_id, status, resolved_at')
      .single()

    if (resErr || !resolved) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'RESOLVE_FAILED', message: resErr?.message ?? 'Failed to resolve dispute.' },
      })
    }

    await auth.supabase.from('dispute_messages').insert({
      tenant_id: body.tenant_id,
      dispute_id: body.dispute_id,
      author_user_id: auth.userId,
      message_type: 'resolution',
      message_markdown: body.resolution_summary.trim(),
      after_minutes: body.adjusted_approved_minutes ?? null,
    })

    await auth.supabase.from('audit_entries').insert({
      tenant_id: body.tenant_id,
      actor_user_id: auth.userId,
      action_type: 'DISPUTE_RESOLVED',
      target_entity: 'disputes',
      target_id: body.dispute_id,
      reason: body.resolution_summary.trim(),
      after_state: {
        status: body.resolution_status,
        adjusted_approved_minutes: body.adjusted_approved_minutes ?? null,
      },
      correlation_id: correlationId,
    })

    return jsonResponse(200, { ok: true, correlation_id: correlationId, data: resolved })
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
