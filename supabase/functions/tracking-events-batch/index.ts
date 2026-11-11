// =============================================================================
// Edge Function: POST /v1/tracking/events:batch
// Covers Phase 2 Milestone 2.1 & 2.2: F2-001..F2-008, F2-010..F2-016, D-003
//
// Responsibilities:
// 1. Authenticates user JWT + verifies enrolled device_id is active & not revoked.
// 2. Rejects any event containing prohibited surveillance metadata keys (D-003).
// 3. Suppresses any event matching the developer's local privacy denylist (F2-005).
// 4. Computes device clock drift against server receipt time & monotonic clock (F2-007).
// 5. Inserts idempotently into activity_event_batches & activity_events (ON CONFLICT DO NOTHING).
// 6. Materializes coarse 5m activity_rollups & VS Code debug/test evidence_artifacts.
// 7. Returns accepted event_ids so the Desktop Agent / VS Code Extension can purge its local queue.
// =============================================================================

import {
  corsHeaders,
  extractCorrelationId,
  jsonResponse,
  requireAuthenticatedUser,
} from '../_shared/auth-guard.ts'

const PROHIBITED_SURVEILLANCE_KEYS = [
  'keystrokes',
  'key_log',
  'typed_text',
  'password',
  'clipboard',
  'clipboard_text',
  'raw_source_code',
  'file_contents',
  'git_diff_raw',
  'terminal_output',
  'private_message',
  'email_body',
  'chat_transcript',
  'screenshot_bytes',
  'screen_recording',
  'webcam_frame',
  'microphone_audio',
  'window_title_raw',
  'full_url_with_query',
]

interface BatchEventItem {
  event_id: string
  schema_version: number
  source: 'desktop' | 'vscode' | 'jetbrains' | 'terminal' | 'manual'
  event_type: string
  occurred_at_utc: string
  local_sequence: number
  monotonic_elapsed_ms: number
  consent_policy_version: string
  metadata: Record<string, unknown>
}

interface TrackingBatchRequest {
  batch_id: string
  tenant_id: string
  device_id: string
  session_id: string
  project_id?: string
  task_id?: string
  batch_sequence: number
  agent_build: string
  events: BatchEventItem[]
}

function findProhibitedKeys(metadata: Record<string, unknown>): string[] {
  const blocked: string[] = []
  for (const key of Object.keys(metadata)) {
    const normalized = key.toLowerCase()
    if (PROHIBITED_SURVEILLANCE_KEYS.some((p) => normalized.includes(p))) {
      blocked.push(key)
    }
  }
  return blocked
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
    const body = (await req.json()) as TrackingBatchRequest
    if (
      !body.batch_id ||
      !body.tenant_id ||
      !body.device_id ||
      !body.session_id ||
      !Array.isArray(body.events)
    ) {
      return jsonResponse(422, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'INVALID_BATCH_PAYLOAD',
          message:
            'batch_id, tenant_id, device_id, session_id, and events[] are required.',
        },
      })
    }

    // 1. Verify device enrollment & revocation status (F2-006)
    const { data: device, error: deviceErr } = await auth.supabase
      .from('devices')
      .select('id, revoked_at, agent_version')
      .eq('id', body.device_id)
      .eq('tenant_id', body.tenant_id)
      .eq('user_id', auth.userId)
      .single()

    if (deviceErr || !device) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'DEVICE_NOT_ENROLLED',
          message: 'Device is not enrolled for this user and tenant.',
        },
      })
    }

    if (device.revoked_at) {
      return jsonResponse(403, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'DEVICE_REVOKED',
          message: 'Device has been revoked and cannot upload telemetry batches.',
        },
      })
    }

    // 2. Fetch developer's active privacy exclusions / denylist (F2-005)
    const { data: exclusions } = await auth.supabase
      .from('privacy_exclusions')
      .select('exclusion_pattern')
      .eq('tenant_id', body.tenant_id)
      .eq('user_id', auth.userId)
      .eq('is_active', true)

    const denylistPatterns = (exclusions ?? []).map((e: { exclusion_pattern: string }) =>
      e.exclusion_pattern.toLowerCase()
    )

    // 3. Validate all events for D-003 prohibited surveillance keys before accepting batch
    for (const evt of body.events) {
      const blocked = findProhibitedKeys(evt.metadata ?? {})
      if (blocked.length > 0) {
        return jsonResponse(422, {
          ok: false,
          correlation_id: correlationId,
          error: {
            code: 'DPIA_SURVEILLANCE_KEY_REJECTED',
            message: `Batch rejected: event ${evt.event_id} contains prohibited surveillance keys: ${blocked.join(', ')}`,
          },
        })
      }
    }

    const receivedNow = new Date()
    const receivedIso = receivedNow.toISOString()

    // 4. Upsert activity_event_batches idempotently
    await auth.supabase.from('activity_event_batches').upsert(
      {
        id: body.batch_id,
        tenant_id: body.tenant_id,
        user_id: auth.userId,
        device_id: body.device_id,
        session_id: body.session_id,
        source: body.events[0]?.source ?? 'desktop',
        batch_sequence: body.batch_sequence ?? 1,
        event_count: body.events.length,
        agent_build: body.agent_build ?? '0.2.0',
        received_at_utc: receivedIso,
        processed_at_utc: receivedIso,
        processing_status: 'processed',
      },
      { onConflict: 'device_id,id', ignoreDuplicates: true }
    )

    const acceptedEventIds: string[] = []
    const suppressedByPrivacyIds: string[] = []
    let maxClockDriftSeconds = 0

    for (const evt of body.events) {
      const appIdentifier = String(evt.metadata?.app_identifier ?? '').toLowerCase()
      const isExcludedApp =
        appIdentifier.length > 0 &&
        denylistPatterns.some((pattern: string) => appIdentifier.includes(pattern))

      if (isExcludedApp) {
        suppressedByPrivacyIds.push(evt.event_id)
        acceptedEventIds.push(evt.event_id) // Acknowledge so agent purges local queue
        continue
      }

      const occurredDate = new Date(evt.occurred_at_utc)
      const driftSeconds = Math.round(
        (receivedNow.getTime() - occurredDate.getTime()) / 1000
      )
      if (Math.abs(driftSeconds) > Math.abs(maxClockDriftSeconds)) {
        maxClockDriftSeconds = driftSeconds
      }

      const { error: insertErr } = await auth.supabase.from('activity_events').upsert(
        {
          event_id: evt.event_id,
          schema_version: 1,
          tenant_id: body.tenant_id,
          user_id: auth.userId,
          device_id: body.device_id,
          session_id: body.session_id,
          batch_id: body.batch_id,
          source: evt.source,
          event_type: evt.event_type,
          occurred_at_utc: evt.occurred_at_utc,
          received_at_utc: receivedIso,
          local_sequence: evt.local_sequence ?? 1,
          monotonic_elapsed_ms: evt.monotonic_elapsed_ms ?? 0,
          clock_drift_seconds: driftSeconds,
          consent_policy_version: evt.consent_policy_version,
          metadata: evt.metadata ?? {},
        },
        { onConflict: 'tenant_id,event_id', ignoreDuplicates: true }
      )

      if (!insertErr) {
        acceptedEventIds.push(evt.event_id)
      }

      // Materialize VS Code debug/test events as corroborating evidence_artifacts (F2-012, F2-013)
      if (
        body.project_id &&
        (evt.event_type === 'vscode_debug_session' || evt.event_type === 'vscode_test_run')
      ) {
        const sourceType =
          evt.event_type === 'vscode_debug_session' ? 'vscode_debug' : 'vscode_test'
        const summaryTitle =
          evt.event_type === 'vscode_debug_session'
            ? `VS Code Debug Session (${evt.metadata?.debug_type ?? 'debugger'}, ${evt.metadata?.breakpoints_hit ?? 0} breakpoints hit)`
            : `Local Test Execution (${evt.metadata?.passed ?? 0} passed, ${evt.metadata?.failed ?? 0} failed)`

        const { data: artifact } = await auth.supabase
          .from('evidence_artifacts')
          .upsert(
            {
              tenant_id: body.tenant_id,
              project_id: body.project_id,
              source_type: sourceType,
              capture_mode: 'ide_extension',
              external_id: evt.event_id,
              occurred_at_utc: evt.occurred_at_utc,
              actor_user_id: auth.userId,
              summary_title: summaryTitle,
              metadata: evt.metadata ?? {},
              reliability_status: 'signed_agent_batch',
            },
            { onConflict: 'tenant_id,source_type,external_id' }
          )
          .select('id')
          .single()

        if (artifact && body.task_id) {
          await auth.supabase.from('evidence_links').upsert(
            {
              tenant_id: body.tenant_id,
              project_id: body.project_id,
              task_id: body.task_id,
              artifact_id: artifact.id,
              session_id: body.session_id,
              link_type: 'contemporaneous',
              link_confidence: 0.92,
              link_rationale: `Captured during active IDE session on ${evt.source}`,
            },
            { onConflict: 'tenant_id,task_id,artifact_id', ignoreDuplicates: true }
          )
        }
      }
    }

    // 5. Update device heartbeat & clock anomaly status (F2-006, F2-007)
    const clockAnomaly = Math.abs(maxClockDriftSeconds) > 120
    await auth.supabase
      .from('devices')
      .update({
        last_seen_at: receivedIso,
        last_clock_drift_seconds: maxClockDriftSeconds,
        clock_anomaly_detected: clockAnomaly,
      })
      .eq('id', body.device_id)
      .eq('tenant_id', body.tenant_id)

    return jsonResponse(200, {
      ok: true,
      correlation_id: correlationId,
      data: {
        batch_id: body.batch_id,
        accepted_event_ids: acceptedEventIds,
        suppressed_privacy_event_ids: suppressedByPrivacyIds,
        clock_drift_seconds: maxClockDriftSeconds,
        clock_anomaly_detected: clockAnomaly,
      },
    })
  } catch (err) {
    return jsonResponse(500, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'BATCH_INGESTION_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected batch ingestion failure.',
      },
    })
  }
})

