import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase3Store } from '@/context/Phase3Store'
import { formatMinuteOfDay } from '@/lib/time-engine'
import type {
  AiTargetType,
  PolicySimulationReport,
  VerificationRuleCode,
  VerificationRuleConfig,
} from '@/types/domain.types'

function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const ALL_RULE_CODES: VerificationRuleCode[] = [
  'R-01',
  'R-02',
  'R-03',
  'R-04',
  'R-05',
  'R-06',
  'R-07',
  'R-08',
]

const FRIENDLY_RULES: Record<
  VerificationRuleCode,
  { title: string; summary: string }
> = {
  'R-01': {
    title: 'Quiet Gap Reminder',
    summary:
      'Asks for a brief note when standard coding/debugging has a long quiet period — never deducts pay.',
  },
  'R-02': {
    title: 'Overlap Cleanup',
    summary:
      'Combines overlapping sessions across tools or devices so time is never counted twice.',
  },
  'R-03': {
    title: 'Zero-Commit Debugging',
    summary:
      'Recognizes debugging and local test runs as real work even when no Git commits were pushed yet.',
  },
  'R-04': {
    title: 'Docs & Research Match',
    summary:
      'Matches documentation reading with Research mode without tracking reading speed or URLs.',
  },
  'R-05': {
    title: 'Later PR & Commit Link',
    summary:
      'Connects commits or pull requests merged later as helpful context for earlier task work.',
  },
  'R-06': {
    title: 'Over-Estimate Heads-Up',
    summary:
      'Alerts managers when a task exceeds its planned time estimate so budgets can be adjusted early.',
  },
  'R-07': {
    title: 'Manual Time Review',
    summary:
      'Highlights manual time entries with their audit reason for quick reviewer sign-off.',
  },
  'R-08': {
    title: 'Device Clock Sync Check',
    summary:
      'Flags computer clock mismatches as a technical sync issue — never treated as tampering.',
  },
}

const DRAFT_TYPE_LABELS: Record<AiTargetType, string> = {
  daily_summary: 'Daily Summary',
  reviewer_digest: 'Manager Review Brief',
  gap_explanation: 'Quiet-Gap Note',
  task_mapping: 'Task Match Summary',
  debug_investigation: 'Debugging Recap',
  pattern_cluster: 'Work Pattern Recap',
}

export function VerificationAndAiView() {
  const { activeUser, tasks, hasPermission } = usePhase1Store()
  const {
    aiEnabled,
    aiServerStatus,
    toggleTenantAi,
    ruleSets,
    activeRuleSet,
    simulateDraftRuleSet,
    publishRuleSet,
    workModeSuggestions,
    dismissWorkModeSuggestion,
    correlationEdges,
    taskVariances,
    unusualPatternAlerts,
    aiGenerations,
    generateAiDraft,
    approveAiGeneration,
    discardAiGeneration,
  } = usePhase3Store()

  const [tab, setTab] = useState<'rules' | 'correlation' | 'ai'>('rules')
  const [draftConfig, setDraftConfig] = useState<VerificationRuleConfig>(
    () => activeRuleSet.rulesConfig
  )
  const [draftLabel, setDraftLabel] = useState('Updated Fair-Review Policy')
  const [simReport, setSimReport] = useState<PolicySimulationReport | null>(null)

  const [selectedTaskId, setSelectedTaskId] = useState<string>(() => tasks[0]?.id ?? '')
  const [editedAiText, setEditedAiText] = useState<Record<string, string>>({})
  const [generatingType, setGeneratingType] = useState<AiTargetType | null>(null)
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  const isSuperOrOwner =
    activeUser.role === 'super_admin' || activeUser.role === 'tenant_owner'
  const canManageRules =
    isSuperOrOwner ||
    activeUser.role === 'project_manager' ||
    hasPermission('verification:manage_rules')
  const canApproveDrafts =
    isSuperOrOwner ||
    activeUser.role === 'project_manager' ||
    hasPermission('verification:approve_drafts')

  const isRestrictedRole =
    (activeUser.role === 'finance' || activeUser.role === 'client_reviewer') &&
    !hasPermission('verification:view')

  if (isRestrictedRole) {
    return (
      <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/25 p-6 space-y-2">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          Smart Checks &amp; AI is Hidden for This Role
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 max-w-2xl">
          Finance and Client Reviewer accounts focus on approved hours, invoices, and finalized deliverables.
        </p>
      </div>
    )
  }

  const enabledRulesCount = ALL_RULE_CODES.filter(
    (code) => activeRuleSet.rulesConfig.enabledRules[code]
  ).length
  const totalNotices = unusualPatternAlerts.length + workModeSuggestions.length

  function handleRunSimulation() {
    const report = simulateDraftRuleSet(draftConfig, draftLabel)
    setSimReport(report)
    setBanner({
      ok: true,
      text: `Preview complete across ${report.totalEvaluatedSegments} session(s): ${report.statusChangedCount} status update(s), 0 past invoices changed, and $0 automatic pay cuts.`,
    })
  }

  function handlePublishRuleSet() {
    const res = publishRuleSet(draftLabel, draftConfig, simReport ?? undefined)
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) setSimReport(null)
  }

  async function handleGenerateAi(targetType: AiTargetType) {
    if (generatingType) return
    const targetId = selectedTaskId || tasks[0]?.id || 'workspace'
    setGeneratingType(targetType)
    try {
      const res = await generateAiDraft(targetType, targetId)
      setEditedAiText((prev) => ({
        ...prev,
        [res.generation.id]: res.generation.draftMarkdown,
      }))
      setBanner({ ok: res.ok, text: res.message })
    } finally {
      setGeneratingType(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {banner && (
        <div
          className={`dp-view-enter rounded-xl px-4 py-3 text-xs font-medium flex items-center justify-between ring-1 ${
            banner.ok
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 ring-emerald-500/25'
              : 'bg-rose-500/10 text-rose-800 dark:text-rose-200 ring-rose-500/25'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="underline font-semibold ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Clean Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
          Smart Checks &amp; AI Assistant
        </h2>

        <div className="inline-flex flex-wrap rounded-xl bg-zinc-100 dark:bg-white/[0.05] p-1 text-xs gap-0.5">
          {[
            { id: 'rules' as const, label: 'Review Rules & Test' },
            {
              id: 'correlation' as const,
              label: `Estimates & Links (${taskVariances.length})`,
            },
            {
              id: 'ai' as const,
              label: `AI Summaries (${aiGenerations.length})`,
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                tab === item.id
                  ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* First-Sight 4-Card Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Active Review Rules
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {enabledRulesCount}{' '}
            <span className="text-xs font-normal text-zinc-400">
              / {ALL_RULE_CODES.length}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 truncate">
            Policy v{activeRuleSet.versionNumber} · {activeRuleSet.versionLabel}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Heads-Up Notices
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {totalNotices}
          </div>
          <div className="text-[11px] text-zinc-400">
            {unusualPatternAlerts.length} pattern · {workModeSuggestions.length} mode tips
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Work Proof Links
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {correlationEdges.length}
          </div>
          <div className="text-[11px] text-zinc-400">
            Sessions matched to tasks &amp; PRs
          </div>
        </div>

        <div className="rounded-2xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/20 dark:ring-[#8b51e1]/30 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#581eae] dark:text-[#c5a8f0]">
              AI Assistant
            </span>
            <span className="font-mono text-[10.5px] text-[#6d25da] dark:text-[#c5a8f0]">
              {aiEnabled && aiServerStatus.configured ? aiServerStatus.model : 'Template'}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {aiEnabled && aiServerStatus.configured
              ? 'Gemini Live'
              : aiEnabled
                ? 'Ready (Add Key)'
                : 'Templates'}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {aiGenerations.length} draft{aiGenerations.length === 1 ? '' : 's'} · human review required
          </div>
        </div>
      </div>

      {/* =================================================================
          TAB 1: REVIEW RULES & TEST
         ================================================================= */}
      {tab === 'rules' && (
        <div className="space-y-6">
          {/* Heads-Up Notices & Mode Tips */}
          {(unusualPatternAlerts.length > 0 || workModeSuggestions.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Heads-Up Notices
                </h3>

                {unusualPatternAlerts.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-2">
                    Everything looks normal — no heads-up notices right now.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {unusualPatternAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="rounded-xl bg-amber-500/[0.08] ring-1 ring-amber-500/25 p-3.5 space-y-1.5 text-xs"
                      >
                        <div className="font-bold text-amber-800 dark:text-amber-300">
                          {alert.title}
                        </div>
                        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          {alert.explanation}
                        </p>
                        <p className="text-emerald-700 dark:text-emerald-300 text-[11px] font-medium">
                          ✓ Next step: {alert.suggestedReviewAction}
                        </p>
                        <p className="text-rose-700 dark:text-rose-300 text-[11px]">
                          🛡 Fairness rule: {alert.prohibitedInference}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Suggested Work Modes
                </h3>

                {workModeSuggestions.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-2">
                    All activity matches the selected work modes.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {workModeSuggestions.slice(0, 4).map((s) => (
                      <div
                        key={s.id}
                        className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-3.5 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">
                            <span className="font-mono text-zinc-500 dark:text-zinc-400">
                              {s.workDate} · {formatMinuteOfDay(s.startMinuteOfDay)}–
                              {formatMinuteOfDay(s.endMinuteOfDay)}
                            </span>
                            <span className="capitalize text-[#6d25da] dark:text-[#c5a8f0]">
                              {s.currentWorkMode} → {s.suggestedWorkMode}
                            </span>
                            <span className="text-[10.5px] font-mono text-zinc-400">
                              ({Math.round(s.confidence * 100)}% match)
                            </span>
                          </div>
                          <p className="text-zinc-600 dark:text-zinc-300">{s.rationale}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissWorkModeSuggestion(s.id)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/[0.07] hover:bg-zinc-100 dark:hover:bg-white/[0.12] text-zinc-700 dark:text-zinc-200 font-semibold text-[11px] shrink-0 cursor-pointer transition"
                        >
                          Got it
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Rule Settings + Live Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-5">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Configure Review Rules
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                    Policy Name
                  </span>
                  <input
                    type="text"
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    className="w-full rounded-xl px-3 py-2"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                    Quiet-Gap Reminder (mins)
                  </span>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={draftConfig.idleClarificationThresholdMinutes}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        idleClarificationThresholdMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl px-3 py-2 font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                    Deep-Work Grace Window (mins)
                  </span>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    value={draftConfig.deepWorkNoInputWindowMinutes}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        deepWorkNoInputWindowMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl px-3 py-2 font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                    Over-Estimate Alert (%)
                  </span>
                  <input
                    type="number"
                    min={100}
                    max={300}
                    value={draftConfig.estimateVarianceAlertPercent}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        estimateVarianceAlertPercent: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl px-3 py-2 font-mono"
                  />
                </label>
              </div>

              {/* Plain-English Rule Toggles */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Individual Checks
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {ALL_RULE_CODES.map((code) => {
                    const info = FRIENDLY_RULES[code]
                    const enabled = draftConfig.enabledRules[code]
                    return (
                      <label
                        key={code}
                        className={`rounded-xl p-3 flex items-start gap-2.5 text-xs cursor-pointer transition ${
                          enabled
                            ? 'bg-[#6d25da]/[0.05] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/25'
                            : 'bg-zinc-50/90 dark:bg-white/[0.03] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] opacity-75'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              enabledRules: {
                                ...prev.enabledRules,
                                [code]: e.target.checked,
                              },
                            }))
                          }
                          className="mt-0.5 h-4 w-4 accent-[#6d25da]"
                        />
                        <div className="space-y-0.5">
                          <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                            <span>{info.title}</span>
                            <span className="font-mono text-[10px] text-[#6d25da] dark:text-[#c5a8f0]">
                              {code}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                            {info.summary}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleRunSimulation}
                  className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer transition"
                >
                  Preview Impact
                </button>
                {canManageRules && (
                  <button
                    type="button"
                    onClick={handlePublishRuleSet}
                    className="px-4 py-2 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white cursor-pointer transition shadow-xs"
                  >
                    Publish Policy Update
                  </button>
                )}
              </div>
            </section>

            {/* Right Column: Preview Results & Saved Versions */}
            <div className="lg:col-span-5 space-y-5">
              <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Impact Preview
                </h3>

                {!simReport ? (
                  <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-4 text-xs text-zinc-500 dark:text-zinc-400">
                    Click <strong>Preview Impact</strong> on the left to see how your settings affect current sessions. Past approved invoices are never altered.
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2.5 font-mono">
                      <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3">
                        <div className="text-[10.5px] text-zinc-500">Sessions Checked</div>
                        <div className="text-lg font-bold text-zinc-900 dark:text-white">
                          {simReport.totalEvaluatedSegments}
                        </div>
                      </div>
                      <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3">
                        <div className="text-[10.5px] text-zinc-500">Status Changes</div>
                        <div className="text-lg font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                          {simReport.statusChangedCount}
                        </div>
                      </div>
                      <div className="rounded-xl bg-emerald-500/[0.08] p-3">
                        <div className="text-[10.5px] text-emerald-700 dark:text-emerald-300">
                          Past Invoices Touched
                        </div>
                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                          {simReport.retroactiveHistoricalMutations}
                        </div>
                      </div>
                      <div className="rounded-xl bg-emerald-500/[0.08] p-3">
                        <div className="text-[10.5px] text-emerald-700 dark:text-emerald-300">
                          Auto Pay Cuts
                        </div>
                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                          ${simReport.automatedPayDeductions}
                        </div>
                      </div>
                    </div>

                    {simReport.deltas.length > 0 && (
                      <div className="space-y-1.5">
                        {simReport.deltas.map((d) => (
                          <div
                            key={d.segmentId}
                            className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] px-3 py-2 text-[11px]"
                          >
                            <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {d.label}
                            </div>
                            <div className="font-mono text-[#6d25da] dark:text-[#c5a8f0] capitalize">
                              {d.currentStatus.replace(/_/g, ' ')} →{' '}
                              {d.simulatedStatus.replace(/_/g, ' ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Saved Policy Versions
                </h3>
                <div className="space-y-2">
                  {ruleSets.map((rs) => (
                    <div
                      key={rs.id}
                      className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-3 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-zinc-900 dark:text-white truncate">
                          v{rs.versionNumber} · {rs.versionLabel}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                          Quiet gap: {rs.rulesConfig.idleClarificationThresholdMinutes}m · Deep work:{' '}
                          {rs.rulesConfig.deepWorkNoInputWindowMinutes}m · {rs.createdByName}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold capitalize shrink-0 ${
                          rs.status === 'active'
                            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                            : 'bg-zinc-200/70 dark:bg-white/[0.07] text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {rs.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================
          TAB 2: ESTIMATES & LINKS
         ================================================================= */}
      {tab === 'correlation' && (
        <div className="space-y-6">
          {/* Estimated vs Actual Time */}
          <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Estimated vs. Actual Task Time
            </h3>

            {taskVariances.length === 0 ? (
              <p className="text-xs text-zinc-400 py-3">
                No task time comparisons available yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {taskVariances.map((tv) => {
                  const isOver = tv.variancePercent > 125
                  const barPct = Math.min(100, Math.max(0, tv.variancePercent))
                  return (
                    <div
                      key={tv.taskId}
                      className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-4 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                          {tv.taskCode}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                            isOver
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {isOver ? `Over (${tv.variancePercent}%)` : `${tv.variancePercent}% of est.`}
                        </span>
                      </div>

                      <div className="font-bold text-zinc-900 dark:text-white leading-snug">
                        {tv.taskTitle}
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-zinc-200/80 dark:bg-white/[0.08] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isOver ? 'bg-amber-500' : 'bg-[#6d25da]'}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-white dark:bg-[#131319] p-2.5 rounded-lg text-center">
                        <div>
                          <span className="text-zinc-400 block text-[10px]">Planned</span>
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">
                            {formatDuration(tv.estimateMinutes)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 block text-[10px]">Logged</span>
                          <span className="font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                            {formatDuration(tv.claimedMinutes)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 block text-[10px]">Approved</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatDuration(tv.approvedMinutes)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span>
                          Proof items linked:{' '}
                          <strong className="text-zinc-900 dark:text-white">
                            {tv.linkedDeliverableCount}
                          </strong>
                        </span>
                        {tv.reasonCodes.length > 0 && (
                          <span className="font-mono text-[10px] text-zinc-400">
                            {tv.reasonCodes.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* How Work Proof Connects */}
          <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              How Work Proof Connects ({correlationEdges.length})
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-2.5 pr-3">Item</th>
                    <th className="py-2.5 pr-3">Connection</th>
                    <th className="py-2.5 pr-3">Linked To</th>
                    <th className="py-2.5 pr-3">Match</th>
                    <th className="py-2.5">Why It Matched</th>
                  </tr>
                </thead>
                <tbody>
                  {correlationEdges.slice(0, 25).map((edge) => (
                    <tr key={edge.id} className="text-zinc-700 dark:text-zinc-300">
                      <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">
                        {edge.sourceLabel}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="px-2 py-0.5 rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/25 text-[#581eae] dark:text-[#c5a8f0] text-[10.5px] font-semibold capitalize">
                          {edge.edgeType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">
                        {edge.targetLabel}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-zinc-900 dark:text-white">
                        {Math.round(edge.confidence * 100)}%
                      </td>
                      <td className="py-2.5 text-zinc-500 dark:text-zinc-400">
                        {edge.rationale}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* =================================================================
          TAB 3: AI SUMMARIES
         ================================================================= */}
      {tab === 'ai' && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Generate a Work Summary Draft
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    aiEnabled && aiServerStatus.configured
                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      aiEnabled && aiServerStatus.configured
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  {aiEnabled && aiServerStatus.configured
                    ? `Gemini (${aiServerStatus.model})`
                    : aiEnabled
                      ? 'Template Fallback'
                      : 'Templates Only'}
                </span>
              </div>

              <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  disabled={!canManageRules}
                  onChange={(e) => toggleTenantAi(e.target.checked)}
                  className="h-4 w-4 accent-[#6d25da]"
                />
                <span className="font-semibold text-zinc-900 dark:text-white">
                  AI Assistant:{' '}
                  <span
                    className={
                      aiEnabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {aiEnabled ? 'ON' : 'OFF (Templates Only)'}
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100 dark:border-white/[0.06] text-xs">
              <select
                value={selectedTaskId || tasks[0]?.id || ''}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="rounded-xl px-3 py-2 font-medium"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {t.title}
                  </option>
                ))}
              </select>

              {(
                [
                  'daily_summary',
                  'reviewer_digest',
                  'gap_explanation',
                  'task_mapping',
                  'debug_investigation',
                  'pattern_cluster',
                ] as AiTargetType[]
              ).map((type, idx) => {
                const isBusy = generatingType === type
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={generatingType !== null}
                    onClick={() => void handleGenerateAi(type)}
                    className={`px-3.5 py-2 rounded-xl font-semibold transition cursor-pointer disabled:opacity-55 ${
                      idx === 0
                        ? 'bg-[#702fe3] hover:bg-[#5f21cc] text-white shadow-xs'
                        : 'bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    {isBusy ? 'Generating...' : `+ ${DRAFT_TYPE_LABELS[type]}`}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Draft Cards */}
          <div className="space-y-4">
            {aiGenerations.length === 0 ? (
              <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.02] ring-1 ring-dashed ring-zinc-300 dark:ring-white/10 p-10 text-center space-y-1.5">
                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  No drafts generated yet
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Select a task above and click any summary button to create an editable draft.
                </p>
              </div>
            ) : (
              aiGenerations.map((gen) => {
                const textValue =
                  editedAiText[gen.id] ?? gen.humanApprovedMarkdown ?? gen.draftMarkdown
                const statusBadge =
                  gen.status === 'edited_approved'
                    ? {
                        label: 'Approved',
                        cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
                      }
                    : gen.status === 'discarded'
                      ? {
                          label: 'Discarded',
                          cls: 'bg-zinc-200/80 dark:bg-white/[0.08] text-zinc-500 dark:text-zinc-400',
                        }
                      : {
                          label: 'Needs Review',
                          cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                        }

                return (
                  <article
                    key={gen.id}
                    className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/25 text-[#581eae] dark:text-[#c5a8f0] text-[10.5px] font-semibold">
                          {gen.generationMode === 'ai_guardrailed'
                            ? 'AI Draft'
                            : 'Template Draft'}
                        </span>
                        <span className="text-sm font-bold text-zinc-900 dark:text-white">
                          {DRAFT_TYPE_LABELS[gen.targetType] ?? gen.targetType} ·{' '}
                          {gen.targetLabel}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge.cls}`}
                      >
                        {statusBadge.label}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Based on {gen.citedEventIds.length} work event(s) and{' '}
                      {gen.citedArtifactIds.length} proof item(s) ·{' '}
                      <span className="font-mono">{gen.modelId}</span>
                      {gen.tokensUsed > 0 ? ` (${gen.tokensUsed} tokens)` : ''}
                    </div>

                    {gen.status === 'draft' ? (
                      <textarea
                        rows={4}
                        value={textValue}
                        onChange={(e) =>
                          setEditedAiText((prev) => ({
                            ...prev,
                            [gen.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl p-3 text-xs leading-relaxed"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3.5 text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
                        {gen.humanApprovedMarkdown ?? gen.draftMarkdown}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <details className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        <summary className="cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 font-medium">
                          View source data used
                        </summary>
                        <pre className="mt-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 p-3 overflow-x-auto text-[10.5px] text-zinc-700 dark:text-zinc-300">
                          {JSON.stringify(gen.sanitizedPromptPayload, null, 2)}
                        </pre>
                      </details>

                      {gen.status === 'draft' && canApproveDrafts && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => discardAiGeneration(gen.id)}
                            className="px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-zinc-700 dark:text-zinc-300 font-semibold cursor-pointer transition"
                          >
                            Discard
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              approveAiGeneration(gen.id, textValue)
                              setBanner({
                                ok: true,
                                text: 'Summary approved and saved.',
                              })
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer transition shadow-xs"
                          >
                            ✓ Approve &amp; Save
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
