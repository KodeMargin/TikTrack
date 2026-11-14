import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase3Store } from '@/context/Phase3Store'
import { RULE_CATALOG_METADATA } from '@/lib/phase3/rulesEngine'
import { formatMinuteOfDay } from '@/lib/time-engine'
import type {
  AiTargetType,
  PolicySimulationReport,
  VerificationRuleCode,
  VerificationRuleConfig,
} from '@/types/domain.types'

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

export function VerificationAndAiView() {
  const { activeUser, tasks } = usePhase1Store()
  const {
    aiEnabled,
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
  const [draftLabel, setDraftLabel] = useState('v2.0 Updated Deep-Work Policy')
  const [simReport, setSimReport] = useState<PolicySimulationReport | null>(null)

  const [selectedTaskId, setSelectedTaskId] = useState<string>(() => tasks[0]?.id ?? '')
  const [editedAiText, setEditedAiText] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  const isRestrictedRole =
    activeUser.role === 'finance' || activeUser.role === 'client_reviewer'

  if (isRestrictedRole) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-6 space-y-2">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          Access Restricted
        </h2>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 max-w-2xl">
          Finance and Client Reviewer roles can only view approved hours, rates, and finalized
          deliverables. Switch to Developer, Project Manager, or Tenant Owner.
        </p>
      </div>
    )
  }

  const isOwnerOrManager =
    activeUser.role === 'tenant_owner' || activeUser.role === 'project_manager'

  function handleRunSimulation() {
    const report = simulateDraftRuleSet(draftConfig, draftLabel)
    setSimReport(report)
    setBanner({
      ok: true,
      text: `Simulated "${draftLabel}" across ${report.totalEvaluatedSegments} interval(s): ${report.statusChangedCount} status change(s), 0 retroactive mutations, 0 automated pay deductions.`,
    })
  }

  function handlePublishRuleSet() {
    const res = publishRuleSet(draftLabel, draftConfig, simReport ?? undefined)
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) setSimReport(null)
  }

  function handleGenerateAi(targetType: AiTargetType) {
    const targetId = selectedTaskId || tasks[0]?.id || 'workspace'
    const res = generateAiDraft(targetType, targetId)
    setEditedAiText((prev) => ({
      ...prev,
      [res.generation.id]: res.generation.draftMarkdown,
    }))
    setBanner({ ok: res.ok, text: res.message })
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${banner.ok
              ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200'
              : 'border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200'
            }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header & Sub-navigation */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            Verification & AI Studio
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTab('rules')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${tab === 'rules'
                ? 'bg-[#702fe3] border-[#6d25da] text-white'
                : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              }`}
          >
            Rules & Policy Simulator
          </button>
          <button
            type="button"
            onClick={() => setTab('correlation')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${tab === 'correlation'
                ? 'bg-[#702fe3] border-[#6d25da] text-white'
                : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              }`}
          >
            Correlation & Variance ({correlationEdges.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('ai')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${tab === 'ai'
                ? 'bg-[#702fe3] border-[#6d25da] text-white'
                : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              }`}
          >
            AI Drafts ({aiGenerations.length})
          </button>
        </div>
      </div>

      {/* TAB 1: VERSIONED RULES ENGINE & POLICY SIMULATOR */}
      {tab === 'rules' && (
        <div className="space-y-6">
          {/* Explainable Pattern Alerts & Work Mode Suggestions */}
          {(unusualPatternAlerts.length > 0 || workModeSuggestions.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Pattern Notices
                </div>
                {unusualPatternAlerts.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    No pattern anomalies detected.
                  </p>
                ) : (
                  unusualPatternAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                          {alert.title}
                        </span>
                      </div>
                      <p className="text-zinc-700 dark:text-zinc-300">{alert.explanation}</p>
                      <p className="text-zinc-800 dark:text-zinc-200 text-[11px]">
                        ✓ Suggested action: {alert.suggestedReviewAction}
                      </p>
                      <p className="text-rose-700 dark:text-rose-300/90 text-[11px]">
                        ✗ Prohibited inference: {alert.prohibitedInference}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
                  Work-Mode Suggestions
                </div>
                {workModeSuggestions.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    All observed activity rollups match their declared work modes.
                  </p>
                ) : (
                  workModeSuggestions.slice(0, 4).map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-3 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-mono text-zinc-800 dark:text-zinc-200 font-semibold">
                          {s.workDate} {formatMinuteOfDay(s.startMinuteOfDay)}–{formatMinuteOfDay(s.endMinuteOfDay)} •{' '}
                          {s.currentWorkMode} → {s.suggestedWorkMode} ({Math.round(s.confidence * 100)}%)
                        </div>
                        <p className="text-zinc-700 dark:text-zinc-300">{s.rationale}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissWorkModeSuggestion(s.id)}
                        className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 cursor-pointer"
                      >
                        Acknowledge
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Policy Simulator & Versioned Rule Publisher */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
                  Rule Policy Simulator
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-zinc-500 dark:text-zinc-400 block">Version Label</span>
                  <input
                    type="text"
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-500 dark:text-zinc-400 block">
                    Idle Threshold (min)
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
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-500 dark:text-zinc-400 block">
                    Deep-Work Window (min)
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
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-500 dark:text-zinc-400 block">
                    Estimate Variance Notice (%)
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
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </label>
              </div>

              {/* Rule Toggles */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Rule Configuration
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {ALL_RULE_CODES.map((code) => {
                    const meta = RULE_CATALOG_METADATA[code]
                    const enabled = draftConfig.enabledRules[code]
                    return (
                      <label
                        key={code}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/90 p-2.5 flex items-start gap-2.5 text-xs cursor-pointer"
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
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5">
                          <div className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                            {meta.title}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{meta.triggerSummary}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleRunSimulation}
                  className="px-3.5 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer"
                >
                  Preview Simulation
                </button>
                {isOwnerOrManager && (
                  <button
                    type="button"
                    onClick={handlePublishRuleSet}
                    className="px-3.5 py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white cursor-pointer"
                  >
                    Publish New Rule Version
                  </button>
                )}
              </div>
            </div>

            {/* Simulation Output + Published Version History */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
                  Simulation Preview
                </div>
                {!simReport ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Run a simulation to preview changes.
                  </p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5">
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Intervals Evaluated</div>
                        <div className="text-base font-bold text-zinc-900 dark:text-white">
                          {simReport.totalEvaluatedSegments}
                        </div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5">
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Status Deltas</div>
                        <div className="text-base font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                          {simReport.statusChangedCount}
                        </div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-2.5">
                        <div className="text-[10px] text-zinc-800 dark:text-zinc-200">Retroactive Mutations</div>
                        <div className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                          {simReport.retroactiveHistoricalMutations}
                        </div>
                      </div>
                      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-2.5">
                        <div className="text-[10px] text-zinc-800 dark:text-zinc-200">Auto Pay Deductions</div>
                        <div className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                          ${simReport.automatedPayDeductions}
                        </div>
                      </div>
                    </div>
                    {simReport.deltas.map((d) => (
                      <div
                        key={d.segmentId}
                        className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 text-[11px] font-mono"
                      >
                        <div className="text-zinc-800 dark:text-zinc-200">{d.label}</div>
                        <div className="text-[#6d25da] dark:text-[#c5a8f0]">
                          {d.currentStatus} → {d.simulatedStatus}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Version History
                </div>
                {ruleSets.map((rs) => (
                  <div
                    key={rs.id}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-white">
                        v{rs.versionNumber} - {rs.versionLabel}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                        Idle: {rs.rulesConfig.idleClarificationThresholdMinutes}m • DeepWork:{' '}
                        {rs.rulesConfig.deepWorkNoInputWindowMinutes}m • By {rs.createdByName}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${rs.status === 'active'
                          ? 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                        }`}
                    >
                      {rs.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EVIDENCE CORRELATION GRAPH & HISTORICAL EFFORT VARIANCE */}
      {tab === 'correlation' && (
        <div className="space-y-6">
          {/* Effort Variance */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
                Effort Variance
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {taskVariances.map((tv) => (
                <div
                  key={tv.taskId}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/90 p-4 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">{tv.taskCode}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] ${tv.variancePercent > 125
                          ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700'
                          : 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800'
                        }`}
                    >
                      {tv.variancePercent}% of est.
                    </span>
                  </div>
                  <div className="font-semibold text-zinc-900 dark:text-white">{tv.taskTitle}</div>
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px] bg-white dark:bg-zinc-900 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Est</span>
                      <span>{tv.estimateMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[#6d25da] dark:text-[#a87ce9] block text-[10px]">Claimed</span>
                      <span>{tv.claimedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[#6d25da] dark:text-[#a87ce9] block text-[10px]">Approved</span>
                      <span>{tv.approvedMinutes}m</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tv.reasonCodes.map((code) => (
                      <span
                        key={code}
                        className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Deliverables linked: <strong className="text-zinc-800 dark:text-zinc-200">{tv.linkedDeliverableCount}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence Correlation Graph Edges */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
              Evidence Correlation Graph ({correlationEdges.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-2 pr-3">Source Node</th>
                    <th className="py-2 pr-3">Edge Relation</th>
                    <th className="py-2 pr-3">Target Node</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2">Traceability Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/70">
                  {correlationEdges.slice(0, 25).map((edge) => (
                    <tr key={edge.id} className="text-zinc-700 dark:text-zinc-300">
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        <span className="text-slate-500">[{edge.sourceNodeType}]</span>{' '}
                        {edge.sourceLabel}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="px-2 py-0.5 rounded bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50 font-mono text-[10px]">
                          {edge.edgeType}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        <span className="text-slate-500">[{edge.targetNodeType}]</span>{' '}
                        {edge.targetLabel}
                      </td>
                      <td className="py-2 pr-3 font-mono text-zinc-800 dark:text-zinc-200">
                        {Math.round(edge.confidence * 100)}%
                      </td>
                      <td className="py-2 text-zinc-500 dark:text-zinc-400">{edge.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: GUARDRAILED AI DRAFT STUDIO */}
      {tab === 'ai' && (
        <div className="space-y-6">
          {/* F3-027 Tenant AI Opt-Out Gate & Generator Controls */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
                  AI Draft Studio
                </div>
              </div>

              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => toggleTenantAi(e.target.checked)}
                />
                <span className="font-semibold text-zinc-900 dark:text-white">
                  AI Assistance:{' '}
                  <span className={aiEnabled ? 'text-zinc-800 dark:text-zinc-200' : 'text-amber-700 dark:text-amber-300'}>
                    {aiEnabled ? 'ON' : 'OFF'}
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <select
                value={selectedTaskId || tasks[0]?.id || ''}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleGenerateAi('daily_summary')}
                className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold cursor-pointer"
              >
                Daily Summary
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('reviewer_digest')}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white font-semibold cursor-pointer"
              >
                Reviewer Digest
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('gap_explanation')}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white font-semibold cursor-pointer"
              >
                Gap Explanation
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('task_mapping')}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white font-semibold cursor-pointer"
              >
                Task Mapping
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('debug_investigation')}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white font-semibold cursor-pointer"
              >
                Debug Draft
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('pattern_cluster')}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white font-semibold cursor-pointer"
              >
                Pattern Cluster
              </button>
            </div>
          </div>

          {/* Generated Drafts List */}
          <div className="space-y-4">
            {aiGenerations.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                No AI or template drafts generated yet. Pick a task above and generate a draft.
              </div>
            ) : (
              aiGenerations.map((gen) => {
                const textValue =
                  editedAiText[gen.id] ?? gen.humanApprovedMarkdown ?? gen.draftMarkdown
                return (
                  <div
                    key={gen.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50 font-mono uppercase text-[10px] font-bold">
                          {gen.generationMode === 'ai_guardrailed'
                            ? 'AI-Drafted'
                            : 'Template'}
                        </span>
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          {gen.targetType.replace('_', ' ').toUpperCase()} • {gen.targetLabel}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          model: {gen.modelId} • tokens: {gen.tokensUsed}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase border ${gen.status === 'edited_approved'
                            ? 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800'
                            : gen.status === 'discarded'
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                              : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700'
                          }`}
                      >
                        {gen.status}
                      </span>
                    </div>

                    <div className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
                      Cited Stored Event IDs: {gen.citedEventIds.length} • Cited Artifact IDs:{' '}
                      {gen.citedArtifactIds.length}
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
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3 text-zinc-800 dark:text-zinc-200 font-mono text-xs"
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-zinc-800 dark:text-zinc-200 font-mono text-xs">
                        {gen.humanApprovedMarkdown ?? gen.draftMarkdown}
                      </pre>
                    )}

                    <details className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      <summary className="cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200">
                        Inspect Prompt Payload
                      </summary>
                      <pre className="mt-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5 overflow-x-auto text-[10px] text-zinc-800 dark:text-zinc-200">
                        {JSON.stringify(gen.sanitizedPromptPayload, null, 2)}
                      </pre>
                    </details>

                    {gen.status === 'draft' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            approveAiGeneration(gen.id, textValue)
                            setBanner({
                              ok: true,
                              text: 'Draft approved.',
                            })
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                        >
                          Approve & Attach Draft
                        </button>
                        <button
                          type="button"
                          onClick={() => discardAiGeneration(gen.id)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                        >
                          Discard
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

