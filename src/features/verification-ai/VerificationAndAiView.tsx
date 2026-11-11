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
      <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-amber-300 font-bold">
          Role Boundary Enforced (Section 12.4 & Phase 3 RLS)
        </div>
        <h2 className="text-lg font-bold text-white">
          Verification Rules, Correlation Graph & AI Drafts Restricted
        </h2>
        <p className="text-xs text-slate-300 max-w-2xl">
          Finance and Client Reviewer roles see only approved commercial hours, locked rates,
          and finalized deliverables—never segment rule evaluations, correlation graphs, or
          private developer AI drafts. Switch to Developer, Project Manager, or Tenant Owner.
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
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            banner.ok
              ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
              : 'border-rose-700 bg-rose-950/60 text-rose-200'
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-indigo-400 font-semibold">
            Phase 3 • Context-Aware Verification & Guardrailed AI
          </div>
          <h2 className="text-lg font-bold text-white mt-0.5">
            Rules Engine, Evidence Correlation & AI Draft Studio
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Active Rule Set: <strong className="text-slate-200">v{activeRuleSet.versionNumber} ({activeRuleSet.versionLabel})</strong> •
            AI Assistance: <strong className={aiEnabled ? 'text-emerald-300' : 'text-amber-300'}>{aiEnabled ? 'Enabled (Guardrailed)' : 'Disabled (Deterministic Templates)'}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTab('rules')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${
              tab === 'rules'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-950 border-slate-700 text-slate-300'
            }`}
          >
            Rules & Policy Simulator (F3-001..010)
          </button>
          <button
            type="button"
            onClick={() => setTab('correlation')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${
              tab === 'correlation'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-950 border-slate-700 text-slate-300'
            }`}
          >
            Correlation Graph & Variance ({correlationEdges.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('ai')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${
              tab === 'ai'
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-950 border-slate-700 text-slate-300'
            }`}
          >
            AI Draft Studio ({aiGenerations.length})
          </button>
        </div>
      </div>

      {/* TAB 1: VERSIONED RULES ENGINE & POLICY SIMULATOR */}
      {tab === 'rules' && (
        <div className="space-y-6">
          {/* Explainable Pattern Alerts & Work Mode Suggestions */}
          {(unusualPatternAlerts.length > 0 || workModeSuggestions.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  F3-010 • Explainable Pattern Notices (Non-Punitive)
                </div>
                {unusualPatternAlerts.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No pattern anomalies detected across current intervals.
                  </p>
                ) : (
                  unusualPatternAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-300">
                          {alert.ruleCode} • {alert.title}
                        </span>
                      </div>
                      <p className="text-slate-300">{alert.explanation}</p>
                      <p className="text-emerald-300/90 text-[11px]">
                        ✓ Suggested action: {alert.suggestedReviewAction}
                      </p>
                      <p className="text-rose-300/90 text-[11px]">
                        ✗ Prohibited inference: {alert.prohibitedInference}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                  F3-003 • Signal-Based Work-Mode Suggestions
                </div>
                {workModeSuggestions.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    All observed activity rollups match their declared work modes.
                  </p>
                ) : (
                  workModeSuggestions.slice(0, 4).map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-sky-800/50 bg-sky-950/20 p-3 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-mono text-sky-300 font-semibold">
                          {s.workDate} {formatMinuteOfDay(s.startMinuteOfDay)}–{formatMinuteOfDay(s.endMinuteOfDay)} •{' '}
                          {s.currentWorkMode} → {s.suggestedWorkMode} ({Math.round(s.confidence * 100)}%)
                        </div>
                        <p className="text-slate-300">{s.rationale}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissWorkModeSuggestion(s.id)}
                        className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 shrink-0 cursor-pointer"
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
            <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  F3-001 & F3-007 • Versioned Rule Policy Simulator
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Test threshold changes before activation. Rule changes apply strictly to future
                  sessions—never silently mutating historical locked periods.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-400 block">Draft Version Label</span>
                  <input
                    type="text"
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400 block">
                    R-01 Idle Clarification Threshold (min)
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
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400 block">
                    Deep-Work No-Input Window (min)
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
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400 block">
                    R-06 Estimate Variance Notice (%)
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
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white font-mono"
                  />
                </label>
              </div>

              {/* Rule Toggles R-01..R-08 */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  Rules R-01 through R-08 Configuration
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {ALL_RULE_CODES.map((code) => {
                    const meta = RULE_CATALOG_METADATA[code]
                    const enabled = draftConfig.enabledRules[code]
                    return (
                      <label
                        key={code}
                        className="rounded-lg border border-slate-800 bg-slate-950/90 p-2.5 flex items-start gap-2.5 text-xs cursor-pointer"
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
                          <div className="font-mono font-bold text-indigo-300">
                            {code}: {meta.title}
                          </div>
                          <div className="text-[11px] text-slate-400">{meta.triggerSummary}</div>
                          <div className="text-[10px] text-rose-300/90">
                            Guardrail: {meta.prohibitedInference}
                          </div>
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
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-white cursor-pointer"
                >
                  Preview Policy Simulation (F3-007)
                </button>
                {isOwnerOrManager && (
                  <button
                    type="button"
                    onClick={handlePublishRuleSet}
                    className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                  >
                    Publish New Rule Version
                  </button>
                )}
              </div>
            </div>

            {/* Simulation Output + Published Version History */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Policy Simulation Impact Preview
                </div>
                {!simReport ? (
                  <p className="text-xs text-slate-400">
                    Adjust thresholds or rule toggles on the left and click{' '}
                    <strong>Preview Policy Simulation</strong> to inspect impact before publishing.
                  </p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div className="rounded-lg bg-slate-950 border border-slate-800 p-2.5">
                        <div className="text-[10px] text-slate-400">Intervals Evaluated</div>
                        <div className="text-base font-bold text-white">
                          {simReport.totalEvaluatedSegments}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-950 border border-slate-800 p-2.5">
                        <div className="text-[10px] text-slate-400">Status Deltas</div>
                        <div className="text-base font-bold text-indigo-300">
                          {simReport.statusChangedCount}
                        </div>
                      </div>
                      <div className="rounded-lg bg-emerald-950/30 border border-emerald-800/60 p-2.5">
                        <div className="text-[10px] text-emerald-300">Retroactive Mutations</div>
                        <div className="text-base font-bold text-emerald-200">
                          {simReport.retroactiveHistoricalMutations}
                        </div>
                      </div>
                      <div className="rounded-lg bg-emerald-950/30 border border-emerald-800/60 p-2.5">
                        <div className="text-[10px] text-emerald-300">Auto Pay Deductions</div>
                        <div className="text-base font-bold text-emerald-200">
                          ${simReport.automatedPayDeductions}
                        </div>
                      </div>
                    </div>
                    {simReport.deltas.map((d) => (
                      <div
                        key={d.segmentId}
                        className="rounded border border-slate-800 bg-slate-950 p-2 text-[11px] font-mono"
                      >
                        <div className="text-slate-200">{d.label}</div>
                        <div className="text-indigo-300">
                          {d.currentStatus} → {d.simulatedStatus}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Rule Set Version Lineage (F3-001)
                </div>
                {ruleSets.map((rs) => (
                  <div
                    key={rs.id}
                    className="rounded-lg border border-slate-800 bg-slate-950 p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        v{rs.versionNumber} — {rs.versionLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Idle: {rs.rulesConfig.idleClarificationThresholdMinutes}m • DeepWork:{' '}
                        {rs.rulesConfig.deepWorkNoInputWindowMinutes}m • By {rs.createdByName}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                        rs.status === 'active'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-slate-800 text-slate-400'
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
          {/* F3-009: Historical Effort Variance */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                F3-008 & F3-009 • Outcome Association & Historical Effort Variance
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Compares task estimates against claimed, supported, and approved hours with
                engineering complexity reason codes.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {taskVariances.map((tv) => (
                <div
                  key={tv.taskId}
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-300">{tv.taskCode}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                        tv.variancePercent > 125
                          ? 'bg-amber-950 text-amber-300 border border-amber-700'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {tv.variancePercent}% of est.
                    </span>
                  </div>
                  <div className="font-semibold text-white">{tv.taskTitle}</div>
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px] bg-slate-900 p-2 rounded border border-slate-800">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Est</span>
                      <span>{tv.estimateMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-blue-400 block text-[10px]">Claimed</span>
                      <span>{tv.claimedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 block text-[10px]">Approved</span>
                      <span>{tv.approvedMinutes}m</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tv.reasonCodes.map((code) => (
                      <span
                        key={code}
                        className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Deliverables linked: <strong className="text-slate-200">{tv.linkedDeliverableCount}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* F3-004: Evidence Correlation Graph Edges */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-teal-400">
              F3-004 • Evidence Correlation Graph ({correlationEdges.length} Directed Edges)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-3">Source Node</th>
                    <th className="py-2 pr-3">Edge Relation</th>
                    <th className="py-2 pr-3">Target Node</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2">Traceability Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {correlationEdges.slice(0, 25).map((edge) => (
                    <tr key={edge.id} className="text-slate-300">
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        <span className="text-slate-500">[{edge.sourceNodeType}]</span>{' '}
                        {edge.sourceLabel}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono text-[10px]">
                          {edge.edgeType}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        <span className="text-slate-500">[{edge.targetNodeType}]</span>{' '}
                        {edge.targetLabel}
                      </td>
                      <td className="py-2 pr-3 font-mono text-emerald-300">
                        {Math.round(edge.confidence * 100)}%
                      </td>
                      <td className="py-2 text-slate-400">{edge.rationale}</td>
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
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  F3-020..F3-027 • Guardrailed AI Assistance & Tenant Opt-Out Gate
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Strict guardrails: 100% of cited IDs are verified against stored tenant events/artifacts;
                  raw code, keystrokes, and private URLs are stripped; drafts require human confirmation.
                </p>
              </div>

              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => toggleTenantAi(e.target.checked)}
                />
                <span className="font-semibold text-white">
                  Tenant AI Assistance (F3-027):{' '}
                  <span className={aiEnabled ? 'text-emerald-300' : 'text-amber-300'}>
                    {aiEnabled ? 'ON' : 'OFF (Deterministic Only)'}
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs pt-2 border-t border-slate-800">
              <select
                value={selectedTaskId || tasks[0]?.id || ''}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleGenerateAi('daily_summary')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
              >
                Daily Summary Draft (F3-020)
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('reviewer_digest')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold cursor-pointer"
              >
                Reviewer Digest (F3-023)
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('gap_explanation')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold cursor-pointer"
              >
                Gap Explanation (F3-022)
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('task_mapping')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold cursor-pointer"
              >
                Task Mapping (F3-021)
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('debug_investigation')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold cursor-pointer"
              >
                Debug Draft (F3-024)
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi('pattern_cluster')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold cursor-pointer"
              >
                Pattern Cluster (F3-025)
              </button>
            </div>
          </div>

          {/* Generated Drafts List */}
          <div className="space-y-4">
            {aiGenerations.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
                No AI or template drafts generated yet. Pick a task above and generate a draft.
              </div>
            ) : (
              aiGenerations.map((gen) => {
                const textValue =
                  editedAiText[gen.id] ?? gen.humanApprovedMarkdown ?? gen.draftMarkdown
                return (
                  <div
                    key={gen.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-mono uppercase text-[10px] font-bold">
                          {gen.generationMode === 'ai_guardrailed'
                            ? 'AI-Drafted (F3-026)'
                            : 'Deterministic Template (0 LLM Tokens)'}
                        </span>
                        <span className="font-semibold text-white">
                          {gen.targetType.replace('_', ' ').toUpperCase()} • {gen.targetLabel}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          model: {gen.modelId} • tokens: {gen.tokensUsed}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase border ${
                          gen.status === 'edited_approved'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                            : gen.status === 'discarded'
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-amber-950 text-amber-300 border-amber-700'
                        }`}
                      >
                        {gen.status}
                      </span>
                    </div>

                    <div className="font-mono text-[11px] text-teal-300">
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
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-slate-200 font-mono text-xs"
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-slate-200 font-mono text-xs">
                        {gen.humanApprovedMarkdown ?? gen.draftMarkdown}
                      </pre>
                    )}

                    <details className="text-[11px] text-slate-400">
                      <summary className="cursor-pointer hover:text-slate-200">
                        Inspect Sanitized Allowlisted Prompt Payload (Zero Raw Code / Keystrokes)
                      </summary>
                      <pre className="mt-2 rounded-lg bg-slate-950 border border-slate-800 p-2.5 overflow-x-auto text-[10px] text-emerald-300">
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
                              text: 'Confirmed & approved draft with source traceability (F3-020, F3-026).',
                            })
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                        >
                          Approve & Attach Draft
                        </button>
                        <button
                          type="button"
                          onClick={() => discardAiGeneration(gen.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
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

