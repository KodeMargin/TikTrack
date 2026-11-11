// =============================================================================
// Edge Function: GET /v1/reports/billing (Section 13.1 & Section 12.4)
// Queries the finance-safe view `finance_approved_billing_v` so billing roles
// see approved hours & rates without raw workstation activity metadata.
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

    if (!tenantId) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id query parameter is required.' },
      })
    }

    let query = auth.supabase
      .from('finance_approved_billing_v')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('work_date', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'BILLING_REPORT_FAILED', message: error.message },
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

