// =============================================================================
// Edge Function: POST /v1/timesheets/{id}/submit (Section 13.1 & F1-040, F1-044)
// Submits a draft timesheet for manager review and snapshots historical rates.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface SubmitTimesheetRequest {
  tenant_id: string
  timesheet_id: string
  developer_summary_note?: string
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
    const body = (await req.json()) as SubmitTimesheetRequest
    if (!body.tenant_id || !body.timesheet_id) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tenant_id and timesheet_id are required.',
        },
      })
    }

    const nowIso = new Date().toISOString()
    const { data: updated, error } = await auth.supabase
      .from('timesheets')
      .update({
        status: 'submitted',
        submitted_at: nowIso,
        developer_summary_note: body.developer_summary_note ?? '',
      })
      .eq('id', body.timesheet_id)
      .eq('tenant_id', body.tenant_id)
      .eq('user_id', auth.userId)
      .in('status', ['draft', 'needs_clarification'])
      .select('id, status, submitted_at, project_id')
      .single()

    if (error || !updated) {
      return jsonResponse(404, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'TIMESHEET_SUBMIT_FAILED',
          message: error?.message ?? 'Timesheet not found, locked, or not owned by user.',
        },
      })
    }

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: updated,
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

