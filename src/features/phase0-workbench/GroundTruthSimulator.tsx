import { useState } from 'react'
import type {
  ContractBillingPolicy,
  EvidenceStatus,
  RoundingRule,
} from '@/types/domain.types'
import {
  DEFAULT_CONTRACT_POLICY,
  PILOT_SCENARIO_FIXTURES,
} from '@/lib/fixtures/pilot-scenarios'
import {
  evaluateCanonicalTimeline,
  formatMinuteOfDay,
} from '@/lib/time-engine'

const STATUS_BADGE_STYLES: Record<
  EvidenceStatus,
  { label: string; className: string; meaning: string }
> = {
  declared: {
    label: 'Declared',
    className: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700',
    meaning: 'Developer reported work mode/time; not yet corroborated.',
  },
  observed: {
    label: 'Observed',
    className: 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800',
    meaning: 'Tool emitted relevant coarse activity metadata.',
  },
  context_added: {
    label: 'Context Added',
    className: 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800',
    meaning: 'Supported by declared Deep-Work mode or reasoning note.',
  },
  corroborated: {
    label: 'Corroborated',
    className: 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800',
    meaning: 'Supported by IDE debug/test/Git artifacts and context.',
  },
  needs_clarification: {
    label: 'Needs Clarification',
    className: 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
    meaning: 'Missing context in standard mode; never an accusation of fraud.',
  },
  approved: {
    label: 'Approved',
    className: 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800',
    meaning: 'Authorized reviewer accepted time under contract terms.',
  },
  disputed: {
    label: 'Disputed',
    className: 'bg-rose-50 dark:bg-rose-950/90 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700',
    meaning: 'Under structured review appeal; uncontested lines still bill.',
  },
}

export function GroundTruthSimulator() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    PILOT_SCENARIO_FIXTURES[0].id
  )
  const [policy, setPolicy] = useState<ContractBillingPolicy>(DEFAULT_CONTRACT_POLICY)
  const [managerState, setManagerState] = useState<
    Record<string, { status: 'pending' | 'approved' | 'clarify' | 'disputed'; adjustedMinutes?: number }>
  >({})
  const [developerGapNotes, setDeveloperGapNotes] = useState<Record<string, string>>({})

  const scenario =
    PILOT_SCENARIO_FIXTURES.find((s) => s.id === selectedScenarioId) ??
    PILOT_SCENARIO_FIXTURES[0]

  // Merge any interactive developer clarifications into the scenario slices
  const slicesWithNotes = scenario.slices.map((s) => ({
    ...s,
    developerNote: developerGapNotes[s.id] ?? s.developerNote,
  }))

  const { segments, totals } = evaluateCanonicalTimeline(
    slicesWithNotes,
    policy,
    scenario.taskEstimateMinutes,
    managerState
  )

  const rawSliceMinutesSum = scenario.slices.reduce(
    (sum, s) => sum + (s.endMinuteOfDay - s.startMinuteOfDay),
    0
  )

  return (
    <div className="space-y-6">
      {/* Top Scenario Picker & Contract Policy Bar (D-005 & D-002) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
              Pilot Scenarios
            </span>
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              Task {scenario.taskCode} • Est. {scenario.taskEstimateMinutes}m
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PILOT_SCENARIO_FIXTURES.map((item) => {
              const active = item.id === scenario.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedScenarioId(item.id)
                    setManagerState({})
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition cursor-pointer ${
                    active
                      ? 'border-[#6d25da] bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-zinc-900 dark:text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="font-semibold">{item.title}</div>
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs pt-1">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-2.5">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">
                ✓ Required DevProof Behavior:
              </span>
              <span className="text-zinc-700 dark:text-zinc-300 text-[11px]">{scenario.expectedSafeBehavior}</span>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 p-2.5">
              <span className="font-semibold text-rose-700 dark:text-rose-300 block">
                ✗ Prohibited Surveillance Behavior:
              </span>
              <span className="text-zinc-700 dark:text-zinc-300 text-[11px]">
                {scenario.prohibitedSurveillanceBehavior}
              </span>
            </div>
          </div>
        </div>

        {/* Contract Policy Controls (D-002 / F1-044) */}
        <div className="lg:col-span-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
              Billing & Rounding Rules
            </span>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">{policy.clientName}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Time Rounding Rule</label>
              <select
                value={policy.roundingRule}
                onChange={(e) =>
                  setPolicy({ ...policy, roundingRule: e.target.value as RoundingRule })
                }
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
              >
                <option value="none">Exact Minutes (No Rounding)</option>
                <option value="nearest_5m">Nearest 5 Minutes</option>
                <option value="nearest_6m">Nearest 6 Minutes (0.1 hr)</option>
                <option value="nearest_15m">Nearest 15 Minutes (0.25 hr)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                Deep-Work Window (No Input)
              </label>
              <select
                value={policy.deepWorkNoInputWindowMinutes}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    deepWorkNoInputWindowMinutes: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
              >
                <option value={60}>Up to 60 mins silent reasoning</option>
                <option value={90}>Up to 90 mins silent reasoning</option>
                <option value={120}>Up to 120 mins silent reasoning</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 p-2.5 space-y-1.5">
            <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
              Contract Rate Versions
            </div>
            {policy.rateVersions.map((rv) => (
              <div
                key={rv.id}
                className="flex items-center justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400"
              >
                <span>
                  {rv.effectiveFrom} → {rv.effectiveTo ?? 'Present'}
                </span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">${rv.hourlyRate}/hr USD</span>
              </div>
            ))}
          </div>

          {rawSliceMinutesSum !== totals.elapsedMinutes && (
            <div className="rounded-lg border border-[#6d25da]/40 bg-[#f0e9fb] dark:bg-[#6d25da]/15 p-2.5 text-[11px] text-[#6d25da] dark:text-[#c5a8f0]">
              <strong>Deduplicated:</strong> Raw device slices totaled{' '}
              <span className="font-mono">{rawSliceMinutesSum}m</span>, automatically deduplicated to{' '}
              <span className="font-mono font-bold">{totals.elapsedMinutes}m</span> canonical elapsed time.
            </div>
          )}
        </div>
      </div>

      {/* Five Separate Time Concepts Banner (F1-041) */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Elapsed Time</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.elapsedMinutes}m
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Claimed Time</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.claimedMinutes}m
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Observed Time</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.observedMinutes}m
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Context Supported</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.supportedMinutes}m
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Approved Billable</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.approvedBillableMinutes}m
          </div>
        </div>
        <div className="rounded-xl border border-[#6d25da]/30 bg-[#6d25da]/5 dark:border-[#6d25da]/40 dark:bg-[#6d25da]/10 p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-[#6d25da] dark:text-[#a87ce9]">Invoice Draft</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-white mt-1">
            ${totals.totalEstimatedBillableAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Canonical Segments Table & Manager/Developer Interactive Workflow */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Timeline & Evidence
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              const allApproved: Record<string, { status: 'approved' }> = {}
              for (const seg of segments) {
                allApproved[seg.id] = { status: 'approved' }
              }
              setManagerState(allApproved)
            }}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition cursor-pointer"
          >
            Approve All Segments
          </button>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {segments.map((seg) => {
            const badge = STATUS_BADGE_STYLES[seg.evidenceStatus]
            const matchingRawSlice = scenario.slices.find(
              (s) =>
                s.workDate === seg.workDate &&
                s.startMinuteOfDay <= seg.startMinuteOfDay &&
                s.endMinuteOfDay >= seg.endMinuteOfDay
            )

            return (
              <div key={seg.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                        {seg.workDate} • {formatMinuteOfDay(seg.startMinuteOfDay)}–
                        {formatMinuteOfDay(seg.endMinuteOfDay)} ({seg.durationMinutes}m)
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50">
                        Mode: {seg.workMode}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badge.className}`}
                        title={badge.meaning}
                      >
                        {badge.label}
                      </span>
                      {seg.wasDeduplicatedOverlap && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800">
                          Deduplicated Overlap ({seg.contributingDevices.join(' + ')})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Devices: <span className="text-zinc-800 dark:text-zinc-200">{seg.contributingDevices.join(', ')}</span>{' '}
                      • App Category: <span className="font-mono text-zinc-700 dark:text-zinc-300">{seg.appCategory}</span>{' '}
                      • Rate: <span className="font-mono text-zinc-800 dark:text-zinc-200">${seg.appliedRate}/hr</span> (
                      {seg.appliedRateLabel})
                    </p>
                  </div>

                  {/* 5-Time Mini Breakdown per Segment */}
                  <div className="flex items-center gap-3 font-mono text-xs bg-zinc-50 dark:bg-zinc-950/90 border border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-lg">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Elapsed</span>
                      <span>{seg.metrics.elapsedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[#6d25da] dark:text-[#a87ce9] block text-[10px]">Claimed</span>
                      <span>{seg.metrics.claimedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[#6d25da] dark:text-[#a87ce9] block text-[10px]">Observed</span>
                      <span>{seg.metrics.observedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[#6d25da] dark:text-[#a87ce9] block text-[10px]">Supported</span>
                      <span>{seg.metrics.supportedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[#6d25da] dark:text-[#a87ce9] block text-[10px]">Approved</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {seg.metrics.approvedBillableMinutes}m (${seg.estimatedCost.toFixed(2)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Developer Note & Linked Evidence Artifacts */}
                {seg.developerNote ? (
                  <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800/90 px-3.5 py-2 text-xs text-zinc-800 dark:text-zinc-200">
                    <span className="text-zinc-500 dark:text-zinc-400 font-semibold">Developer Context Note: </span>
                    {seg.developerNote}
                  </div>
                ) : (
                  matchingRawSlice && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-3.5 py-2 text-xs">
                      <span className="text-amber-800 dark:text-amber-200 font-medium">
                        Unexplained gap in standard mode. Developer can attach context:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDeveloperGapNotes((prev) => ({
                            ...prev,
                            [matchingRawSlice.id]:
                              'Reviewed Stripe webhook signing docs and discussed edge cases on voice huddle.',
                          }))
                        }
                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-100 border border-amber-400/30 font-medium cursor-pointer"
                      >
                        + Add Developer Explanation Note
                      </button>
                    </div>
                  )
                )}

                {seg.artifacts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {seg.artifacts.map((art) => (
                      <div
                        key={art.id}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs flex items-center gap-2"
                      >
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50">
                          {art.sourceType}
                        </span>
                        <span className="text-zinc-800 dark:text-zinc-200 font-medium">{art.summaryTitle}</span>
                        {art.linkType === 'retrospective_outcome' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Retrospective Outcome (Does not alter past duration)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Triggered Verification Rules (R-01..R-08) */}
                {seg.triggeredRules.length > 0 && (
                  <div className="space-y-1.5">
                    {seg.triggeredRules.map((rule) => (
                      <div
                        key={rule.ruleCode}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0] mr-2">
                            {rule.title}:
                          </span>
                          <span className="text-zinc-700 dark:text-zinc-300">{rule.triggerDescription}</span>
                        </div>
                        <span className="text-[11px] text-rose-700 dark:text-rose-300/90 font-mono">
                          Guardrail: {rule.prohibitedInference}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manager Review Actions (F1-042) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{badge.meaning}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setManagerState((prev) => ({
                          ...prev,
                          [seg.id]: { status: 'approved' },
                        }))
                      }
                      className="px-2.5 py-1 rounded bg-zinc-50 dark:bg-zinc-900/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-xs font-medium cursor-pointer"
                    >
                      Approve ({seg.metrics.claimedMinutes}m)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setManagerState((prev) => ({
                          ...prev,
                          [seg.id]: { status: 'clarify' },
                        }))
                      }
                      className="px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-xs font-medium cursor-pointer"
                    >
                      Ask Clarification
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setManagerState((prev) => ({
                          ...prev,
                          [seg.id]: { status: 'disputed' },
                        }))
                      }
                      className="px-2.5 py-1 rounded bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 text-xs font-medium cursor-pointer"
                    >
                      Mark Disputed
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

