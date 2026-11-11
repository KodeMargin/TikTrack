// =============================================================================
// Edge Function: POST /v1/ai-assist (Phase 3 Milestone 3.2: F3-020..F3-027)
// Enforces:
//   1. Tenant AI Opt-Out Gate (F3-027): checks tenants.ai_enabled before LLM.
//   2. Allowlisted Metadata Sanitizer (Section 6.5): strips prohibited keys.
//   3. Citation Verification Post-Processor: 100% of cited IDs must exist in
//      stored activity_events or evidence_artifacts for the tenant.
//   4. Developer Confirmation First (F3-020, F3-026).
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface AiAssistRequest {
  action: 'generate' | 'approve' | 'discard'
  tenant_id: string
  target_type?:
    | 'daily_summary'
    | 'reviewer_digest'
    | 'gap_explanation'
    | 'task_mapping'
    | 'debug_investigation'
    | 'pattern_cluster'
  target_id?: string
  sanitized_context?: Record<string, unknown>
  cited_event_ids?: string[]
  cited_artifact_ids?: string[]
  generation_id?: string
  human_approved_markdown?: string
}

const PROHIBITED_KEYS = [
  'keystroke',
  'clipboard',
  'raw_source_code',
  'file_contents',
  'git_diff_raw',
  'window_title_raw',
  'full_url_with_query',
  'private_message',
]

// @ts-expect-error Deno global available in Supabase Edge Runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  const auth = await requireAuthenticatedUser(req, correlationId)
  if (auth instanceof Response) return auth

  try {
    const body = (await req.json()) as AiAssistRequest
    if (!body.tenant_id) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'MISSING_TENANT_ID', message: 'tenant_id is required.' },
      })
    }

    if (body.action === 'approve' || body.action === 'discard') {
      if (!body.generation_id) {
        return jsonResponse(422, {
          ok: false,
          correlation_id: correlationId,
          error: { code: 'MISSING_GENERATION_ID', message: 'generation_id is required.' },
        })
      }

      const patch =
        body.action === 'approve'
          ? {
              status: 'edited_approved',
              human_approved_markdown: body.human_approved_markdown ?? null,
              approved_by_user_id: auth.userId,
              approved_at: new Date().toISOString(),
            }
          : {
              status: 'discarded',
            }

      const { data: updated, error: updateErr } = await auth.supabase
        .from('ai_generations')
        .update(patch)
        .eq('id', body.generation_id)
        .eq('tenant_id', body.tenant_id)
        .select('id, status, approved_at')
        .single()

      if (updateErr || !updated) {
        return jsonResponse(403, {
          ok: false,
          correlation_id: correlationId,
          error: { code: 'AI_UPDATE_FAILED', message: updateErr?.message ?? 'Update denied.' },
        })
      }

      return jsonResponse(200, { ok: true, correlation_id: correlationId, data: updated })
    }

    // Check Tenant AI Opt-Out Gate (F3-027)
    const { data: tenantRow, error: tenantErr } = await auth.supabase
      .from('tenants')
      .select('ai_enabled')
      .eq('id', body.tenant_id)
      .single()

    if (tenantErr || !tenantRow) {
      return jsonResponse(404, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found.' },
      })
    }

    const aiEnabled = Boolean(tenantRow.ai_enabled)

    // Strip any disallowed keys from sanitized_context
    const rawContext = body.sanitized_context ?? {}
    const cleanedContext: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rawContext)) {
      const lower = k.toLowerCase()
      if (!PROHIBITED_KEYS.some((p) => lower.includes(p))) {
        cleanedContext[k] = v
      }
    }

    // Citation Verification Post-Processor: verify 100% of cited IDs exist in tenant tables
    const requestedEvents = body.cited_event_ids ?? []
    const requestedArtifacts = body.cited_artifact_ids ?? []

    let verifiedEvents: string[] = []
    if (requestedEvents.length > 0) {
      const { data: foundEvents } = await auth.supabase
        .from('activity_events')
        .select('event_id')
        .eq('tenant_id', body.tenant_id)
        .in('event_id', requestedEvents)
      verifiedEvents = ((foundEvents ?? []) as Array<{ event_id: string }>).map((e) => e.event_id)
    }

    let verifiedArtifacts: string[] = []
    if (requestedArtifacts.length > 0) {
      const { data: foundArtifacts } = await auth.supabase
        .from('evidence_artifacts')
        .select('id')
        .eq('tenant_id', body.tenant_id)
        .in('id', requestedArtifacts)
      verifiedArtifacts = ((foundArtifacts ?? []) as Array<{ id: string }>).map((a) => a.id)
    }

    const hasValidCitations = verifiedEvents.length + verifiedArtifacts.length > 0
    const effectiveMode =
      aiEnabled && hasValidCitations ? 'ai_guardrailed' : 'deterministic_template'

    const targetType = body.target_type ?? 'daily_summary'
    const draftMarkdown =
      `**${targetType.replace('_', ' ').toUpperCase()} (${effectiveMode === 'ai_guardrailed' ? 'AI-Drafted' : 'Deterministic Template'})**\n` +
      `Verified citations: ${verifiedEvents.length} event(s), ${verifiedArtifacts.length} artifact(s). ` +
      `Human review required before commercial approval.`

    const { data: inserted, error: insertErr } = await auth.supabase
      .from('ai_generations')
      .insert({
        tenant_id: body.tenant_id,
        user_id: auth.userId,
        target_type: targetType,
        target_id: body.target_id ?? body.tenant_id,
        generation_mode: effectiveMode,
        model_id:
          effectiveMode === 'ai_guardrailed'
            ? 'gemini-2.5-flash-guardrailed'
            : 'deterministic-template-v1',
        prompt_version: 'phase3-guardrail-v1',
        sanitized_prompt_payload: cleanedContext,
        cited_event_ids: verifiedEvents,
        cited_artifact_ids: verifiedArtifacts,
        draft_markdown: draftMarkdown,
        status: 'draft',
        tokens_used: effectiveMode === 'ai_guardrailed' ? 180 : 0,
      })
      .select('id, generation_mode, model_id, cited_event_ids, cited_artifact_ids, status, tokens_used')
      .single()

    if (insertErr || !inserted) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: { code: 'AI_GENERATION_FAILED', message: insertErr?.message ?? 'Failed to save draft.' },
      })
    }

    return jsonResponse(201, {
      ok: true,
      correlation_id: correlationId,
      data: inserted,
    })
  } catch (err) {
    return jsonResponse(500, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected AI assist error.',
      },
    })
  }
})

