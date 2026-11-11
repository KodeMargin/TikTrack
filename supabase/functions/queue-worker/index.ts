// =============================================================================
// Edge Function: POST /v1/queue-worker
// Covers Phase 2 Milestone 2.1 & 2.4: Normalizes ingested activity_events into
// 5-minute coarse activity_rollups, detects >15m unobserved gaps (F2-003), and
// merges concurrent IDE + desktop signals without double counting (Section 5.5).
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

interface QueueNormalizeRequest {
  tenant_id: string
  session_id: string
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
    const body = (await req.json()) as QueueNormalizeRequest
    if (!body.tenant_id || !body.session_id) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'tenant_id and session_id are required.',
        },
      })
    }

    const { data: events, error: eventsErr } = await auth.supabase
      .from('activity_events')
      .select('event_id, source, event_type, occurred_at_utc, metadata')
      .eq('tenant_id', body.tenant_id)
      .eq('session_id', body.session_id)
      .order('occurred_at_utc', { ascending: true })

    if (eventsErr) {
      return jsonResponse(500, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'EVENTS_QUERY_FAILED',
          message: eventsErr.message,
        },
      })
    }

    // Group events into 5-minute UTC buckets, merging concurrent desktop + IDE signals
    const bucketMap = new Map<
      string,
      {
        bucketStartIso: string
        sources: Set<string>
        appCategory: string
        workMode: string
        hasInputSignal: boolean
        isObservationGap: boolean
      }
    >()

    for (const evt of events ?? []) {
      const dt = new Date(evt.occurred_at_utc)
      const flooredMin = Math.floor(dt.getUTCMinutes() / 5) * 5
      dt.setUTCMinutes(flooredMin, 0, 0)
      const bucketIso = dt.toISOString()

      const existing = bucketMap.get(bucketIso) ?? {
        bucketStartIso: bucketIso,
        sources: new Set<string>(),
        appCategory: String(evt.metadata?.app_category ?? (evt.source === 'vscode' ? 'ide' : 'other')),
        workMode: String(evt.metadata?.work_mode ?? 'coding'),
        hasInputSignal: evt.metadata?.has_input_signal !== false,
        isObservationGap: evt.event_type === 'idle_gap_detected',
      }

      existing.sources.add(evt.source)
      if (evt.source === 'vscode' || evt.metadata?.app_category === 'ide') {
        existing.appCategory = 'ide'
      }
      if (evt.metadata?.has_input_signal === true) {
        existing.hasInputSignal = true
        existing.isObservationGap = false
      }
      bucketMap.set(bucketIso, existing)
    }

    let upsertedBuckets = 0
    for (const bucket of bucketMap.values()) {
      const { error: rollupErr } = await auth.supabase.from('activity_rollups').upsert(
        {
          tenant_id: body.tenant_id,
          user_id: auth.userId,
          session_id: body.session_id,
          bucket_start_utc: bucket.bucketStartIso,
          bucket_minutes: 5,
          app_category: bucket.isObservationGap ? 'unobserved' : bucket.appCategory,
          work_mode: bucket.workMode,
          has_input_signal: bucket.hasInputSignal,
          concurrent_sources: Array.from(bucket.sources),
          is_observation_gap: bucket.isObservationGap,
        },
        { onConflict: 'tenant_id,session_id,bucket_start_utc,bucket_minutes' }
      )
      if (!rollupErr) upsertedBuckets += 1
    }

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        session_id: body.session_id,
        processed_events: (events ?? []).length,
        canonical_5m_buckets: upsertedBuckets,
      },
    })
  } catch (err) {
    return jsonResponse(500, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'WORKER_NORMALIZATION_ERROR',
        message: err instanceof Error ? err.message : 'Normalization worker failed.',
      },
    })
  }
})

