import { useMemo, useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import {
  usePhase2Store,
  type LocalPrivacyExclusionItem,
} from '@/context/Phase2Store'
import { validateEventEnvelope } from '@/lib/schemas'

const EXCLUSION_TYPE_LABEL: Record<
  LocalPrivacyExclusionItem['exclusionType'],
  string
> = {
  app_identifier: 'App',
  domain_pattern: 'Website',
  workspace_path: 'Folder',
}

const QUICK_SUGGESTIONS: {
  pattern: string
  type: LocalPrivacyExclusionItem['exclusionType']
  reason: string
}[] = [
  { pattern: '1Password', type: 'app_identifier', reason: 'Password manager' },
  { pattern: 'WhatsApp', type: 'app_identifier', reason: 'Personal messaging' },
  { pattern: 'mail.google.com', type: 'domain_pattern', reason: 'Personal email' },
  { pattern: 'banking', type: 'domain_pattern', reason: 'Personal banking' },
]

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
  const [guardrailTestResult, setGuardrailTestResult] = useState<{
    blockedKeys: string[]
    violationCount: number
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const selectedBatch =
    privacyAuditBatches.find((b) => b.batchId === selectedBatchId) ??
    privacyAuditBatches[0] ??
    null

  const totals = useMemo(() => {
    let suppressed = 0
    let blockedKeys = 0
    let events = 0
    for (const b of privacyAuditBatches) {
      suppressed += b.suppressedByDenylistCount
      blockedKeys += b.blockedSurveillanceKeysCount
      events += b.eventCount
    }
    return { suppressed, blockedKeys, events }
  }, [privacyAuditBatches])

  const existingPatterns = useMemo(
    () => new Set(privacyExclusions.map((e) => e.pattern.toLowerCase())),
    [privacyExclusions]
  )

  function handleAddExclusion(e: React.FormEvent) {
    e.preventDefault()
    if (!pattern.trim()) return
    addPrivacyExclusion(pattern.trim(), exclusionType, reason.trim())
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
    setGuardrailTestResult({
      blockedKeys: sampleRejected.blockedPrivacyKeys,
      violationCount: sampleRejected.errors.length,
    })
  }

  function handleCopyPayload() {
    if (!selectedBatch || typeof navigator === 'undefined') return
    void navigator.clipboard
      ?.writeText(JSON.stringify(selectedBatch.rawPayloadJson, null, 2))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            Privacy Controls &amp; Data Log
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0">
          <button
            type="button"
            onClick={togglePrivacyPause}
            className={`px-3.5 py-2 rounded-xl font-semibold whitespace-nowrap transition active:scale-[0.98] cursor-pointer ${
              privacyPauseActive
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-xs'
                : 'bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] hover:ring-[#6d25da]/30 text-zinc-800 dark:text-zinc-200'
            }`}
          >
            {privacyPauseActive ? '▶ Resume Tracking' : '⏸ Pause Tracking'}
          </button>

          <button
            type="button"
            onClick={runLivePrivacyGuardrailCheck}
            className="px-3.5 py-2 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] active:scale-[0.98] font-semibold text-white whitespace-nowrap cursor-pointer transition shadow-xs"
          >
            🛡 Test Privacy Filter
          </button>
        </div>
      </div>

      {/* Live Privacy Test Result */}
      {guardrailTestResult && (
        <div className="dp-view-enter rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong>✓ Privacy Filter Passed:</strong> Blocked{' '}
            <strong>{guardrailTestResult.blockedKeys.length}</strong> sensitive field(s) (
            <span className="font-mono">{guardrailTestResult.blockedKeys.join(', ')}</span>) and caught{' '}
            <strong>{guardrailTestResult.violationCount}</strong> total rule violation(s) before anything left your device.
          </div>
          <button
            type="button"
            onClick={() => setGuardrailTestResult(null)}
            className="font-semibold underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* First-Sight 4-Card KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Data Collection
          </div>
          <div className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-white">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                privacyPauseActive ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span>{privacyPauseActive ? 'Paused' : 'Active'}</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Never-Track Rules
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {privacyExclusions.length}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Synced Batches
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {privacyAuditBatches.length}
          </div>
        </div>

        <div className="rounded-2xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/20 dark:ring-[#8b51e1]/30 p-4 space-y-1">
          <div className="text-xs font-semibold text-[#581eae] dark:text-[#c5a8f0]">
            Private Items Filtered
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {totals.suppressed + totals.blockedKeys}
          </div>
        </div>
      </div>

      {/* Main Split: Never-Track List (5 cols) + Sent Data Log (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Never-Track List */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Never-Track List
          </h3>

          <form onSubmit={handleAddExclusion} className="space-y-2.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Name or Pattern
                </label>
                <input
                  type="text"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="e.g. 1Password or bank.com"
                  className="w-full rounded-xl px-3 py-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Type
                </label>
                <select
                  value={exclusionType}
                  onChange={(e) =>
                    setExclusionType(
                      e.target.value as LocalPrivacyExclusionItem['exclusionType']
                    )
                  }
                  className="w-full rounded-xl px-2.5 py-2 text-xs"
                >
                  <option value="app_identifier">App Name</option>
                  <option value="domain_pattern">Website Domain</option>
                  <option value="workspace_path">Folder Path</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional, e.g. Personal banking)"
                className="flex-1 rounded-xl px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white cursor-pointer transition shrink-0 shadow-xs"
              >
                + Block
              </button>
            </div>
          </form>

          {/* One-click quick suggestions */}
          {QUICK_SUGGESTIONS.some((s) => !existingPatterns.has(s.pattern.toLowerCase())) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-zinc-400">Quick add:</span>
              {QUICK_SUGGESTIONS.filter(
                (s) => !existingPatterns.has(s.pattern.toLowerCase())
              ).map((s) => (
                <button
                  key={s.pattern}
                  type="button"
                  onClick={() => addPrivacyExclusion(s.pattern, s.type, s.reason)}
                  className="px-2 py-0.5 rounded-full bg-zinc-100 hover:bg-[#6d25da]/10 hover:text-[#581eae] dark:bg-white/[0.06] dark:hover:bg-[#6d25da]/25 text-zinc-600 dark:text-zinc-300 font-medium transition cursor-pointer"
                >
                  + {s.pattern}
                </button>
              ))}
            </div>
          )}

          {/* Active Exclusions List */}
          <div className="space-y-2 pt-1">
            {privacyExclusions.length === 0 ? (
              <p className="text-xs text-zinc-400 py-3 text-center">
                No exclusions added yet.
              </p>
            ) : (
              privacyExclusions.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white truncate">
                        {ex.pattern}
                      </span>
                      <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300 shrink-0">
                        {EXCLUSION_TYPE_LABEL[ex.exclusionType]}
                      </span>
                    </div>
                    {ex.reason && (
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                        {ex.reason}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePrivacyExclusion(ex.id)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 cursor-pointer shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right: What Data Was Sent (Audit Inspector) */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Sync History
            </h3>
            <span className="text-xs font-mono text-zinc-400">
              {privacyAuditBatches.length}{' '}
              {privacyAuditBatches.length === 1 ? 'batch' : 'batches'}
            </span>
          </div>

          {privacyAuditBatches.length === 0 ? (
            <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No telemetry batches synced yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {privacyAuditBatches.map((batch) => {
                  const active = batch.batchId === selectedBatch?.batchId
                  const totalFiltered =
                    batch.suppressedByDenylistCount + batch.blockedSurveillanceKeysCount
                  return (
                    <button
                      key={batch.batchId}
                      type="button"
                      onClick={() => setSelectedBatchId(batch.batchId)}
                      className={`text-left rounded-xl p-3.5 transition-all duration-150 cursor-pointer space-y-1 ${
                        active
                          ? 'bg-[#6d25da]/[0.07] dark:bg-[#6d25da]/20 ring-2 ring-[#6d25da] shadow-xs'
                          : 'bg-zinc-50/90 dark:bg-white/[0.03] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] hover:ring-[#6d25da]/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0] truncate">
                          {batch.source === 'vscode'
                            ? 'VS Code'
                            : batch.source === 'terminal'
                              ? 'Terminal'
                              : 'Desktop App'}{' '}
                          · {batch.batchId}
                        </span>
                        <span className="text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
                          Kept {batch.retentionExpiresInDays}d
                        </span>
                      </div>
                      <div className="text-xs text-zinc-700 dark:text-zinc-300">
                        {batch.deviceName} ·{' '}
                        <strong className="font-mono">{batch.eventCount}</strong> events
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {totalFiltered > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                            ✓ {totalFiltered} private item{totalFiltered === 1 ? '' : 's'} filtered out
                          </span>
                        ) : (
                          <span>Clean batch · 0 sensitive fields detected</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedBatch && (
                <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-900 dark:text-white">
                        Exact Uploaded Data
                      </span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
                        {selectedBatch.batchId}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyPayload}
                      className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                    >
                      {copied ? '✓ Copied JSON' : 'Copy JSON'}
                    </button>
                  </div>

                  <pre className="rounded-xl bg-zinc-50 dark:bg-zinc-950 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-3.5 text-[11px] font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto max-h-80">
                    {JSON.stringify(selectedBatch.rawPayloadJson, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
