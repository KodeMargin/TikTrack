// =============================================================================
// Edge Function: POST /v1/sessions/{id}/explanations (Section 13.1 & F1-026/043)
// Allows the session owner to annotate or correct context on draft segments.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface SessionExplanationRequest {
  tenant_id: string
  session_id: string
  segment_id?: string
  explanation: string
  corrected_work_mode?: string
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
    const body = (await req.json()) as SessionExplanationRequest
    if (!body.tenant_id || !body.session_id || !body.explanation?.trim()) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tenant_id, session_id, and explanation are required.',
        },
      })
    }

    const { data: session, error: sessionError } = await auth.supabase
      .from('work_sessions')
      .update({ session_notes: body.explanation.trim() })
      .eq('id', body.session_id)
      .eq('tenant_id', body.tenant_id)
      .eq('user_id', auth.userId)
      .select('id')
      .single()

    if (sessionError || !session) {
      return jsonResponse(404, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: sessionError?.message ?? 'Session not found or access denied.',
        },
      })
    }

    if (body.segment_id) {
      const updatePatch: Record<string, unknown> = {
        developer_explanation: body.explanation.trim(),
        evidence_status: 'context_added',
      }
      if (body.corrected_work_mode) {
        updatePatch.work_mode = body.corrected_work_mode
      }

      await auth.supabase
        .from('time_segments')
        .update(updatePatch)
        .eq('id', body.segment_id)
        .eq('tenant_id', body.tenant_id)
        .eq('user_id', auth.userId)
    }

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        session_id: body.session_id,
        segment_id: body.segment_id ?? null,
        status: 'context_added',
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

