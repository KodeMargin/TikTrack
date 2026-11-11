// =============================================================================
// Edge Function: GET /v1/reviews/inbox (Section 13.1 & F1-042)
// Returns tenant/project-scoped outstanding timesheets for assigned managers.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

// @ts-expect-error Deno global available in Supabase Edge Runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  const auth = await requireAuthenticatedUser(req, correlationId)
  if (auth instanceof Response) return auth

  try {
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenant_id')
    const projectId = url.searchParams.get('project_id')
    const statusFilter = url.searchParams.get('status')

    if (!tenantId) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id query parameter is required.' },
      })
    }

    let query = auth.supabase
      .from('timesheets')
      .select('id, user_id, project_id, period_start, period_end, status, submitted_at, timesheet_lines(*)')
      .eq('tenant_id', tenantId)
      .order('submitted_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)
    if (statusFilter) {
      query = query.eq('status', statusFilter)
    } else {
      query = query.in('status', ['submitted', 'needs_clarification', 'partially_approved', 'disputed'])
    }

    const { data, error } = await query
    if (error) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'INBOX_QUERY_FAILED', message: error.message },
      })
    }

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: data ?? [],
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

