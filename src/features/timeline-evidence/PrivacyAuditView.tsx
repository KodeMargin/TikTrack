import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import {
  usePhase2Store,
  type LocalPrivacyExclusionItem,
} from '@/context/Phase2Store'
import { validateEventEnvelope } from '@/lib/schemas'

export function PrivacyAuditView() {
  const { activeTenant, activeUser } = usePhase1Store()
  const {
    privacyExclusions,
    privacyPauseActive,
    togglePrivacyPause,
    addPrivacyExclusion,
    removePrivacyExclusion,
    privacyAuditBatches,
  } = usePhase2Store()

  const [pattern, setPattern] = useState('')
  const [exclusionType, setExclusionType] =
    useState<LocalPrivacyExclusionItem['exclusionType']>('app_identifier')
  const [reason, setReason] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState<string>(
    () => privacyAuditBatches[0]?.batchId ?? ''
  )
  const [guardrailTestResult, setGuardrailTestResult] = useState<string | null>(null)

  const selectedBatch =
    privacyAuditBatches.find((b) => b.batchId === selectedBatchId) ??
    privacyAuditBatches[0] ??
    null

  function handleAddExclusion(e: React.FormEvent) {
    e.preventDefault()
    if (!pattern.trim()) return
    addPrivacyExclusion(pattern, exclusionType, reason)
    setPattern('')
    setReason('')
  }

  function runLivePrivacyGuardrailCheck() {
    const sampleRejected = validateEventEnvelope(
      {
        event_id: 'test-dpia-probe',
        schema_version: 1,
        tenant_id: activeTenant.id,
        user_id: activeUser.id,
        device_id: 'dev-m4-pro',
        session_id: 'sess-live',
        source: 'desktop',
        event_type: 'activity_rollup_1m',
        occurred_at_utc: new Date().toISOString(),
        local_sequence: 1,
        monotonic_elapsed_ms: 60000,
        consent_policy_version: activeTenant.policyVersion,
        metadata: {
          app_identifier: '1Password',
          keystrokes: 'should-be-blocked',
          raw_source_code: 'should-be-blocked',
        },
        integrity: { agent_build: '0.2.0', batch_id: 'probe' },
      },
      privacyExclusions.map((e) => e.pattern)
    )
    setGuardrailTestResult(
      `Blocked ${sampleRejected.blockedPrivacyKeys.length} surveillance keys (${sampleRejected.blockedPrivacyKeys.join(', ')}) + ${sampleRejected.errors.length} total policy violations caught before upload.`
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Privacy Controls & Audit Log
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePrivacyPause}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${privacyPauseActive
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700'
                }`}
            >
              {privacyPauseActive
                ? '⏸ Privacy Pause Active (Resume)'
                : 'Enable Privacy Pause'}
            </button>
            <button
              type="button"
              onClick={runLivePrivacyGuardrailCheck}
              className="px-3.5 py-2 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-bold text-white cursor-pointer"
            >
              Run Privacy Self-Test
            </button>
          </div>
        </div>

        {guardrailTestResult && (
          <div className="rounded-xl border border-emerald-500/40 bg-zinc-50 dark:bg-zinc-900/70 px-3.5 py-2 text-xs text-zinc-800 dark:text-zinc-200">
            ✓ {guardrailTestResult}
          </div>
        )}
      </div>

      {/* Main Split: Local Denylist (F2-005) + Transmitted Batch Inspector (F2-035) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Per-App & Domain Privacy Exclusions (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-5 space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Privacy Exclusions
          </h3>

          <form onSubmit={handleAddExclusion} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="App or domain pattern"
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
              />
              <select
                value={exclusionType}
                onChange={(e) =>
                  setExclusionType(
                    e.target.value as LocalPrivacyExclusionItem['exclusionType']
                  )
                }
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-900 dark:text-white"
              >
                <option value="app_identifier">App Identifier</option>
                <option value="domain_pattern">Browser Domain</option>
                <option value="workspace_path">Workspace Path</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-bold text-white cursor-pointer"
              >
                Add Rule
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {privacyExclusions.map((ex) => (
              <div
                key={ex.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 p-3 flex items-start justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {ex.pattern}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {ex.exclusionType}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{ex.reason}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePrivacyExclusion(ex.id)}
                  className="text-[11px] text-rose-700 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Exact Transmitted JSON Batch Inspector (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Telemetry Audit Log
            </h3>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              {privacyAuditBatches.length} batches
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {privacyAuditBatches.map((batch) => {
              const active = batch.batchId === selectedBatch?.batchId
              return (
                <button
                  key={batch.batchId}
                  type="button"
                  onClick={() => setSelectedBatchId(batch.batchId)}
                  className={`text-left rounded-xl p-3 border transition cursor-pointer ${active
                      ? 'border-[#6d25da] bg-[#f0e9fb] dark:bg-[#6d25da]/15'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                      {batch.source.toUpperCase()} • {batch.batchId}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-800 dark:text-zinc-200">
                      TTL: {batch.retentionExpiresInDays}d
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-700 dark:text-zinc-300 mt-1">
                    {batch.deviceName} • {batch.eventCount} events
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Suppressed: {batch.suppressedByDenylistCount} • Blocked keys:{' '}
                    {batch.blockedSurveillanceKeysCount}
                  </div>
                </button>
              )
            })}
          </div>

          {selectedBatch && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Payload ({selectedBatch.batchId})
                </span>
                <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
                  Policy {activeTenant.policyVersion}
                </span>
              </div>
              <pre className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3.5 text-[11px] font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto max-h-80">
                {JSON.stringify(selectedBatch.rawPayloadJson, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

