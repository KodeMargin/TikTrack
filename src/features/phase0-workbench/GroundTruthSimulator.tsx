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
    className: 'bg-slate-800 text-slate-200 border-slate-700',
    meaning: 'Developer reported work mode/time; not yet corroborated.',
  },
  observed: {
    label: 'Observed',
    className: 'bg-sky-950/80 text-sky-300 border-sky-800',
    meaning: 'Tool emitted relevant coarse activity metadata.',
  },
  context_added: {
    label: 'Context Added',
    className: 'bg-teal-950/80 text-teal-300 border-teal-800',
    meaning: 'Supported by declared Deep-Work mode or reasoning note.',
  },
  corroborated: {
    label: 'Corroborated',
    className: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
    meaning: 'Supported by IDE debug/test/Git artifacts and context.',
  },
  needs_clarification: {
    label: 'Needs Clarification',
    className: 'bg-amber-950/80 text-amber-300 border-amber-700',
    meaning: 'Missing context in standard mode; never an accusation of fraud.',
  },
  approved: {
    label: 'Approved',
    className: 'bg-green-950/90 text-green-300 border-green-700',
    meaning: 'Authorized reviewer accepted time under contract terms.',
  },
  disputed: {
    label: 'Disputed',
    className: 'bg-rose-950/90 text-rose-300 border-rose-700',
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
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              D-005: Labeled Ground-Truth Pilot Scenarios
            </span>
            <span className="text-xs font-mono text-slate-400">
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
                      ? 'border-indigo-500 bg-indigo-950/60 text-white'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-mono text-[10px] text-indigo-300">{item.code}</div>
                  <div className="font-semibold mt-0.5">{item.title}</div>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed pt-1">{scenario.description}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs pt-1">
            <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-2.5">
              <span className="font-semibold text-emerald-300 block">
                ✓ Required DevProof Behavior:
              </span>
              <span className="text-slate-300 text-[11px]">{scenario.expectedSafeBehavior}</span>
            </div>
            <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-2.5">
              <span className="font-semibold text-rose-300 block">
                ✗ Prohibited Surveillance Behavior:
              </span>
              <span className="text-slate-300 text-[11px]">
                {scenario.prohibitedSurveillanceBehavior}
              </span>
            </div>
          </div>
        </div>

        {/* Contract Policy Controls (D-002 / F1-044) */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              D-002: Contract Billing & Rounding Rules
            </span>
            <span className="text-[11px] font-mono text-slate-400">{policy.clientName}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Time Rounding Rule</label>
              <select
                value={policy.roundingRule}
                onChange={(e) =>
                  setPolicy({ ...policy, roundingRule: e.target.value as RoundingRule })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="none">Exact Minutes (No Rounding)</option>
                <option value="nearest_5m">Nearest 5 Minutes</option>
                <option value="nearest_6m">Nearest 6 Minutes (0.1 hr)</option>
                <option value="nearest_15m">Nearest 15 Minutes (0.25 hr)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
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
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
              >
                <option value={60}>Up to 60 mins silent reasoning</option>
                <option value={90}>Up to 90 mins silent reasoning</option>
                <option value={120}>Up to 120 mins silent reasoning</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-300">
              Effective-Dated Contract Rate Versions (F1-044):
            </div>
            {policy.rateVersions.map((rv) => (
              <div
                key={rv.id}
                className="flex items-center justify-between text-[11px] font-mono text-slate-400"
              >
                <span>
                  {rv.effectiveFrom} → {rv.effectiveTo ?? 'Present'}
                </span>
                <span className="text-emerald-300 font-semibold">${rv.hourlyRate}/hr USD</span>
              </div>
            ))}
          </div>

          {rawSliceMinutesSum !== totals.elapsedMinutes && (
            <div className="rounded-lg border border-indigo-500/40 bg-indigo-950/30 p-2.5 text-[11px] text-indigo-200">
              <strong>No Double-Counting Guarantee (Principle 5):</strong> Raw device slices totaled{' '}
              <span className="font-mono">{rawSliceMinutesSum}m</span>, automatically deduplicated to{' '}
              <span className="font-mono font-bold">{totals.elapsedMinutes}m</span> canonical elapsed time.
            </div>
          )}
        </div>
      </div>

      {/* Five Separate Time Concepts Banner (F1-041) */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
          <div className="text-[11px] text-slate-400">1. Elapsed Time</div>
          <div className="text-xl font-bold font-mono text-slate-200 mt-1">
            {totals.elapsedMinutes}m
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Canonical non-overlapping</div>
        </div>
        <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-3.5">
          <div className="text-[11px] text-blue-300">2. Claimed Time</div>
          <div className="text-xl font-bold font-mono text-blue-200 mt-1">
            {totals.claimedMinutes}m
          </div>
          <div className="text-[10px] text-blue-400/80 mt-0.5">Developer timesheet claim</div>
        </div>
        <div className="rounded-xl border border-sky-900/60 bg-sky-950/20 p-3.5">
          <div className="text-[11px] text-sky-300">3. Observed Time</div>
          <div className="text-xl font-bold font-mono text-sky-200 mt-1">
            {totals.observedMinutes}m
          </div>
          <div className="text-[10px] text-sky-400/80 mt-0.5">Has IDE/desktop signal</div>
        </div>
        <div className="rounded-xl border border-teal-900/60 bg-teal-950/20 p-3.5">
          <div className="text-[11px] text-teal-300">4. Context Supported</div>
          <div className="text-xl font-bold font-mono text-teal-200 mt-1">
            {totals.supportedMinutes}m
          </div>
          <div className="text-[10px] text-teal-400/80 mt-0.5">
            Observed + Deep-Work/Notes
          </div>
        </div>
        <div className="rounded-xl border border-emerald-800/80 bg-emerald-950/25 p-3.5">
          <div className="text-[11px] text-emerald-300">5. Approved Billable</div>
          <div className="text-xl font-bold font-mono text-emerald-200 mt-1">
            {totals.approvedBillableMinutes}m
          </div>
          <div className="text-[10px] text-emerald-400/80 mt-0.5">
            Rounded ({policy.roundingRule})
          </div>
        </div>
        <div className="rounded-xl border border-indigo-800/80 bg-indigo-950/30 p-3.5">
          <div className="text-[11px] text-indigo-300">Invoice Draft Snapshot</div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            ${totals.totalEstimatedBillableAmount.toFixed(2)}
          </div>
          <div className="text-[10px] text-indigo-300/80 mt-0.5">Historical rate locked</div>
        </div>
      </div>

      {/* Canonical Segments Table & Manager/Developer Interactive Workflow */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Canonical Non-Overlapping Timeline & Evidence Graph
            </h3>
            <p className="text-xs text-slate-400">
              Test developer clarifications and manager review decisions on each canonical segment.
            </p>
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
            ✓ Manager: Approve All Eligible Segments
          </button>
        </div>

        <div className="divide-y divide-slate-800">
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
                      <span className="font-mono text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                        {seg.workDate} • {formatMinuteOfDay(seg.startMinuteOfDay)}–
                        {formatMinuteOfDay(seg.endMinuteOfDay)} ({seg.durationMinutes}m)
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                        Mode: {seg.workMode}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badge.className}`}
                        title={badge.meaning}
                      >
                        {badge.label}
                      </span>
                      {seg.wasDeduplicatedOverlap && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-purple-950/90 text-purple-200 border border-purple-700">
                          Deduplicated Overlap ({seg.contributingDevices.join(' + ')})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      Devices: <span className="text-slate-200">{seg.contributingDevices.join(', ')}</span>{' '}
                      • App Category: <span className="font-mono text-slate-300">{seg.appCategory}</span>{' '}
                      • Rate: <span className="font-mono text-emerald-300">${seg.appliedRate}/hr</span> (
                      {seg.appliedRateLabel})
                    </p>
                  </div>

                  {/* 5-Time Mini Breakdown per Segment */}
                  <div className="flex items-center gap-3 font-mono text-xs bg-slate-950/90 border border-slate-800 px-3 py-2 rounded-lg">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Elapsed</span>
                      <span>{seg.metrics.elapsedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-blue-400 block text-[10px]">Claimed</span>
                      <span>{seg.metrics.claimedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-sky-400 block text-[10px]">Observed</span>
                      <span>{seg.metrics.observedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-teal-400 block text-[10px]">Supported</span>
                      <span>{seg.metrics.supportedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 block text-[10px]">Approved</span>
                      <span className="font-bold text-emerald-300">
                        {seg.metrics.approvedBillableMinutes}m (${seg.estimatedCost.toFixed(2)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Developer Note & Linked Evidence Artifacts */}
                {seg.developerNote ? (
                  <div className="rounded-lg bg-slate-950/70 border border-slate-800/90 px-3.5 py-2 text-xs text-slate-200">
                    <span className="text-slate-400 font-semibold">Developer Context Note: </span>
                    {seg.developerNote}
                  </div>
                ) : (
                  matchingRawSlice && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/20 px-3.5 py-2 text-xs">
                      <span className="text-amber-200 font-medium">
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
                        className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-400/30 font-medium cursor-pointer"
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
                        className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs flex items-center gap-2"
                      >
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                          {art.sourceType}
                        </span>
                        <span className="text-slate-200 font-medium">{art.summaryTitle}</span>
                        {art.linkType === 'retrospective_outcome' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
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
                        className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-mono font-bold text-indigo-300 mr-2">
                            [{rule.ruleCode}] {rule.title}:
                          </span>
                          <span className="text-slate-300">{rule.triggerDescription}</span>
                        </div>
                        <span className="text-[11px] text-rose-300/90 font-mono">
                          Guardrail: {rule.prohibitedInference}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manager Review Actions (F1-042) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-400">{badge.meaning}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setManagerState((prev) => ({
                          ...prev,
                          [seg.id]: { status: 'approved' },
                        }))
                      }
                      className="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-800 text-xs font-medium cursor-pointer"
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
                      className="px-2.5 py-1 rounded bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-800 text-xs font-medium cursor-pointer"
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
                      className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 text-xs font-medium cursor-pointer"
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

