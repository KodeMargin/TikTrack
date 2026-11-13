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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Privacy Controls & Audit Log
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
              Control which apps and domains stay private on your device and inspect the exact
              JSON batches sent from your desktop agent and IDE.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePrivacyPause}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${privacyPauseActive
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
            >
              {privacyPauseActive
                ? '⏸ Personal Privacy Pause ACTIVE (Click to Resume)'
                : 'Enable 1-Click Privacy Pause (F2-005)'}
            </button>
            <button
              type="button"
              onClick={runLivePrivacyGuardrailCheck}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white cursor-pointer"
            >
              Run D-003 Payload Self-Test
            </button>
          </div>
        </div>

        {guardrailTestResult && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2 text-xs text-emerald-200">
            ✓ {guardrailTestResult}
          </div>
        )}
      </div>

      {/* Main Split: Local Denylist (F2-005) + Transmitted Batch Inspector (F2-035) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Per-App & Domain Privacy Exclusions (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white">
              Local Privacy Denylist (F2-005)
            </h3>
            <p className="text-xs text-slate-400">
              Matching apps, domains, or workspaces are dropped on-device before entering the
              encrypted queue.
            </p>
          </div>

          <form onSubmit={handleAddExclusion} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="e.g., WhatsApp or *.bank.com"
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              />
              <select
                value={exclusionType}
                onChange={(e) =>
                  setExclusionType(
                    e.target.value as LocalPrivacyExclusionItem['exclusionType']
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
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
                placeholder="Optional reason (stored locally)"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white cursor-pointer"
              >
                Add Rule
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {privacyExclusions.map((ex) => (
              <div
                key={ex.id}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex items-start justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-emerald-300">
                      {ex.pattern}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {ex.exclusionType}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{ex.reason}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePrivacyExclusion(ex.id)}
                  className="text-[11px] text-rose-300 hover:text-rose-200 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Exact Transmitted JSON Batch Inspector (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">
                Transmitted Telemetry Batch Log (F2-035)
              </h3>
              <p className="text-xs text-slate-400">
                Every payload sent by your devices-verify zero keystrokes, zero screenshots, and
                zero source code.
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {privacyAuditBatches.length} Batches Retained
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
                      ? 'border-indigo-500 bg-indigo-950/40'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-indigo-300">
                      {batch.source.toUpperCase()} • {batch.batchId}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-300">
                      TTL: {batch.retentionExpiresInDays}d
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    {batch.deviceName} • {batch.eventCount} events
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Suppressed locally: {batch.suppressedByDenylistCount} • Blocked D-003 keys:{' '}
                    {batch.blockedSurveillanceKeysCount}
                  </div>
                </button>
              )
            })}
          </div>

          {selectedBatch && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Exact JSON Transmitted ({selectedBatch.batchId})
                </span>
                <span className="font-mono text-[11px] text-emerald-300">
                  Policy {activeTenant.policyVersion} • Zero Raw Source / Zero Keystrokes
                </span>
              </div>
              <pre className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-[11px] font-mono text-cyan-200 overflow-x-auto max-h-80">
                {JSON.stringify(selectedBatch.rawPayloadJson, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

