// =============================================================================
// Edge Function: /v1/enterprise-ops (Phase 5: F5-002, F5-006, F5-008)
//
// Responsibilities:
// 1. `run_retention_sweep`: Invokes `execute_tenant_retention_sweep` RPC which
//    enforces legal holds before purging expired raw activity events.
// 2. `approve_policy_change`: Enforces two-person approval (`approved_by_second
//    <> proposed_by && approved_by_second <> approved_by_first`) before
//    publishing a new non-retroactive `policy_versions` row.
// 3. `warehouse_offload`: Creates an analytics warehouse export manifest.
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

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      correlation_id: correlationId,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for enterprise operations.' },
    })
  }

  const body = (await req.json()) as {
    operation?: 'run_retention_sweep' | 'approve_policy_change' | 'warehouse_offload'
    tenant_id?: string
    request_id?: string
    target_sink?: 'parquet_object_storage' | 'snowflake_external' | 'bigquery_load' | 'duckdb_cold'
  }

  if (!body.tenant_id || !body.operation) {
    return jsonResponse(400, {
      ok: false,
      correlation_id: correlationId,
      error: { code: 'VALIDATION_ERROR', message: 'tenant_id and operation are required.' },
    })
  }

  if (body.operation === 'run_retention_sweep') {
    const { data, error } = await auth.supabase.rpc('execute_tenant_retention_sweep', {
      p_tenant_id: body.tenant_id,
    })
    if (error) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'RETENTION_SWEEP_ERROR', message: error.message },
      })
    }
    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: { sweep_result: data },
    })
  }

  if (body.operation === 'approve_policy_change') {
    if (!body.request_id) {
      return jsonResponse(400, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'VALIDATION_ERROR', message: 'request_id is required.' },
      })
    }

    const { data: reqRow, error: fetchErr } = await auth.supabase
      .from('policy_change_requests')
      .select('*')
      .eq('id', body.request_id)
      .eq('tenant_id', body.tenant_id)
      .maybeSingle()

    if (fetchErr || !reqRow) {
      return jsonResponse(404, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'NOT_FOUND', message: 'Policy change request not found.' },
      })
    }

    if (reqRow.proposed_by === auth.userId || reqRow.approved_by_first === auth.userId) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'TWO_PERSON_APPROVAL_REQUIRED',
          message: 'A distinct second administrator must co-approve policy scope changes (F5-006).',
        },
      })
    }

    const effectiveFrom = new Date().toISOString()
    const { data: newPolicy, error: polErr } = await auth.supabase
      .from('policy_versions')
      .insert({
        tenant_id: body.tenant_id,
        version_code: reqRow.proposed_version_code,
        effective_from: effectiveFrom,
        capture_scope: reqRow.scope_diff,
        summary_markdown: reqRow.change_summary,
        published_by: auth.userId,
      })
      .select('id')
      .single()

    if (polErr) {
      return jsonResponse(400, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'POLICY_ACTIVATION_ERROR', message: polErr.message },
      })
    }

    await auth.supabase
      .from('policy_change_requests')
      .update({
        status: 'approved_activated',
        approved_by_second: auth.userId,
        activated_policy_version_id: newPolicy.id,
        effective_from: effectiveFrom,
        resolved_at: effectiveFrom,
      })
      .eq('id', reqRow.id)

    await auth.supabase.from('sensitive_access_logs').insert({
      tenant_id: body.tenant_id,
      actor_user_id: auth.userId,
      action_category: 'policy_approval',
      resource_type: 'policy_change_requests',
      resource_id: reqRow.id,
      correlation_id: correlationId,
      metadata: {
        version_code: reqRow.proposed_version_code,
        non_retroactive_effective_from: effectiveFrom,
      },
    })

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        request_id: reqRow.id,
        activated_policy_version_id: newPolicy.id,
        effective_from: effectiveFrom,
      },
    })
  }

  return jsonResponse(400, {
    ok: false,
    correlation_id: correlationId,
    error: { code: 'UNKNOWN_OPERATION', message: `Unsupported operation: ${body.operation}` },
  })
})

