import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import {
  usePhase2Store,
  type IdleReconciliationChoice,
  type SessionAnnotationItem,
} from '@/context/Phase2Store'
import type { ArtifactLinkType } from '@/types/domain.types'
import { formatMinuteOfDay } from '@/lib/time-engine'

export function UnifiedTimelineView() {
  const { tasks, projects, timesheetLines, activeUser } = usePhase1Store()
  const {
    activityRollups,
    reconcileObservationGap,
    evidenceArtifacts,
    relinkEvidenceArtifact,
    confirmEvidenceArtifactLink,
    sessionAnnotations,
    addSessionAnnotation,
  } = usePhase2Store()

  const [selectedDate, setSelectedDate] = useState<string>('ALL')
  const [selectedGapBucketId, setSelectedGapBucketId] = useState<string | null>(
    () => activityRollups.find((r) => r.isObservationGap && !r.reconciliationChoice)?.id ?? null
  )
  const [gapChoice, setGapChoice] = useState<IdleReconciliationChoice>('thinking')
  const [gapNote, setGapNote] = useState('')

  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    () => evidenceArtifacts[0]?.id ?? null
  )
  const [overrideTaskId, setOverrideTaskId] = useState<string>(() => tasks[0]?.id ?? '')
  const [overrideLinkType, setOverrideLinkType] =
    useState<ArtifactLinkType>('contemporaneous')
  const [overrideRationale, setOverrideRationale] = useState('')

  const [annTaskId, setAnnTaskId] = useState<string>(() => tasks[0]?.id ?? '')
  const [annType, setAnnType] =
    useState<SessionAnnotationItem['annotationType']>('investigation_log')
  const [annTitle, setAnnTitle] = useState('')
  const [annContent, setAnnContent] = useState('')
  const [bannerMessage, setBannerMessage] = useState<string | null>(null)

  const isFinanceRole = activeUser.role === 'finance'

  if (isFinanceRole) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-3">
        <div className="text-xs font-mono uppercase tracking-wider text-amber-300 font-bold">
          Role Boundary Enforced (Section 12.4 & RLS Policy)
        </div>
        <h2 className="text-lg font-bold text-white">
          Raw Developer Timeline & Workstation Telemetry Restricted for Finance Role
        </h2>
        <p className="text-xs text-slate-300 max-w-3xl">
          Per DevProof governance rules and PostgreSQL RLS policies (
          <code className="text-amber-200">activity_events_select</code> &{' '}
          <code className="text-amber-200">evidence_artifacts_select</code>), the{' '}
          <strong>FINANCE</strong> role has access exclusively to approved commercial hours,
          effective-dated contract rates, and locked invoices-never raw IDE/desktop activity
          buckets or developer investigation notes. Switch to <strong>Developer</strong> or{' '}
          <strong>Project Manager</strong> in the top bar to inspect the Unified Developer Timeline.
        </p>
      </div>
    )
  }

  const availableDates = Array.from(
    new Set([
      ...activityRollups.map((r) => r.workDate),
      ...evidenceArtifacts.map((a) => a.workDate),
    ])
  ).sort()

  const filteredRollups =
    selectedDate === 'ALL'
      ? activityRollups
      : activityRollups.filter((r) => r.workDate === selectedDate)

  const filteredArtifacts =
    selectedDate === 'ALL'
      ? evidenceArtifacts
      : evidenceArtifacts.filter((a) => a.workDate === selectedDate)

  const filteredAnnotations =
    selectedDate === 'ALL'
      ? sessionAnnotations
      : sessionAnnotations.filter((a) => a.workDate === selectedDate)

  const activeGapBucket = activityRollups.find((b) => b.id === selectedGapBucketId) ?? null
  const activeArtifact = evidenceArtifacts.find((a) => a.id === selectedArtifactId) ?? null

  const totalRollupMinutes = filteredRollups.reduce((acc, r) => acc + r.durationMinutes, 0)
  const concurrentMergedMinutes = filteredRollups
    .filter((r) => r.concurrentSources.length > 1)
    .reduce((acc, r) => acc + r.durationMinutes, 0)
  const unobservedGapMinutes = filteredRollups
    .filter((r) => r.isObservationGap && !r.reconciliationChoice)
    .reduce((acc, r) => acc + r.durationMinutes, 0)

  function handleReconcileGapSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeGapBucket) return
    reconcileObservationGap(activeGapBucket.id, gapChoice, gapNote)
    setBannerMessage(
      `Reconciled ${activeGapBucket.durationMinutes}m unobserved interval (${formatMinuteOfDay(activeGapBucket.startMinuteOfDay)}–${formatMinuteOfDay(activeGapBucket.endMinuteOfDay)}) as "${gapChoice}".`
    )
    setGapNote('')
  }

  function handleRelinkArtifactSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeArtifact || !overrideTaskId) return
    relinkEvidenceArtifact(
      activeArtifact.id,
      overrideTaskId,
      overrideLinkType,
      overrideRationale
    )
    const targetTask = tasks.find((t) => t.id === overrideTaskId)
    setBannerMessage(
      `Updated evidence link for "${activeArtifact.externalId}" -> Task ${targetTask?.code ?? overrideTaskId} (${overrideLinkType}).`
    )
    setOverrideRationale('')
  }

  function handleAddAnnotationSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!annTitle.trim() || !annContent.trim()) return
    const task = tasks.find((t) => t.id === annTaskId) ?? tasks[0]
    if (!task) return
    addSessionAnnotation({
      projectId: task.projectId,
      taskId: task.id,
      workDate: selectedDate === 'ALL' ? '2026-11-11' : selectedDate,
      startMinuteOfDay: 600,
      endMinuteOfDay: 660,
      annotationType: annType,
      title: annTitle,
      contentMarkdown: annContent,
    })
    setAnnTitle('')
    setAnnContent('')
    setBannerMessage(`Added ${annType.replace('_', ' ')} to task ${task.code}.`)
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">
                Activity Timeline & Work Context
              </h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                Privacy-First Telemetry
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Your work sessions, coarse desktop/IDE activity buckets, and GitHub deliverables
              aligned on one timeline. Observation gaps can be explained calmly without penalty.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">Filter Work Date:</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            >
              <option value="ALL">All Pilot Dates (Nov 10–16)</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">Canonical Timeline Duration</div>
            <div className="text-lg font-bold font-mono text-white mt-0.5">
              {totalRollupMinutes}m
            </div>
            <div className="text-[10px] text-emerald-300 mt-0.5">
              Non-overlapping UTC intervals (F2-030)
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">Concurrent IDE + Desktop Merged</div>
            <div className="text-lg font-bold font-mono text-indigo-300 mt-0.5">
              {concurrentMergedMinutes}m (1x Counted)
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Never doubles parallel tool minutes (Sec 5.5)
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">Unexplained Observation Gaps</div>
            <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
              {unobservedGapMinutes}m
            </div>
            <div className="text-[10px] text-amber-200/80 mt-0.5">
              Marked &ldquo;unobserved&rdquo;, never fraud (F2-003)
            </div>
          </div>

          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">Corroborating Evidence Artifacts</div>
            <div className="text-lg font-bold font-mono text-emerald-300 mt-0.5">
              {filteredArtifacts.length} Artifacts
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Commits, PRs, CI, Debugger & Local Tests
            </div>
          </div>
        </div>

        {bannerMessage && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3.5 py-2 text-xs text-emerald-200 flex items-center justify-between">
            <span>{bannerMessage}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-emerald-300 hover:text-white font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Multi-Track Visual Developer Timeline (F2-030, F2-034) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              3-Track Unified Developer Timeline (F2-030)
            </h3>
            <p className="text-xs text-slate-400">
              Click any Amber Observation Gap on Track 2 to reconcile it (F2-004), or click any
              Evidence Pin on Track 3 to inspect provenance or override task linkage (F2-031 / F2-032).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700">
              IDE / Debugger
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700">
              Docs Browser / Research
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
              Terminal / Tests
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-dashed border-amber-500">
              Observation Gap (Unobserved Signal - F2-034)
            </span>
          </div>
        </div>

        {/* Track 1: Declared Sessions & 5 Time Metrics */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Track 1 - Declared Work Sessions & Work Modes (Elapsed vs. Claimed vs. Observed vs. Supported)</span>
            <span className="font-mono text-[11px] text-slate-400">UTC Canonical Intervals</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {timesheetLines.slice(0, 3).map((line) => (
              <div
                key={line.id}
                className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-indigo-300">
                    {line.workDate} • {line.startTime}–{line.endTime}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-indigo-950/90 text-indigo-200 border border-indigo-700/60">
                    {line.workMode}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white">
                  {line.taskCode}: {line.taskTitle}
                </div>
                <div className="grid grid-cols-5 gap-1 pt-1 text-[10px] font-mono">
                  <div className="bg-slate-900 p-1 rounded text-center">
                    <div className="text-slate-400">Elap</div>
                    <div className="text-white font-bold">{line.elapsedMinutes}m</div>
                  </div>
                  <div className="bg-slate-900 p-1 rounded text-center">
                    <div className="text-indigo-300">Claim</div>
                    <div className="text-indigo-200 font-bold">{line.claimedMinutes}m</div>
                  </div>
                  <div className="bg-slate-900 p-1 rounded text-center">
                    <div className="text-cyan-300">Obs</div>
                    <div className="text-cyan-200 font-bold">{line.observedMinutes}m</div>
                  </div>
                  <div className="bg-slate-900 p-1 rounded text-center">
                    <div className="text-emerald-300">Supp</div>
                    <div className="text-emerald-200 font-bold">{line.supportedMinutes}m</div>
                  </div>
                  <div className="bg-slate-900 p-1 rounded text-center">
                    <div className="text-amber-300">Appr</div>
                    <div className="text-amber-200 font-bold">{line.approvedBillableMinutes}m</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Track 2: Coarse Activity Rollup Buckets & Observation Gaps */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>
              Track 2 - Coarse Desktop & IDE Activity Buckets (F2-001, F2-002, F2-003, F2-034)
            </span>
            <span className="text-[11px] text-slate-400">
              Multi-display: coarse_metadata_only (0 screenshots)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredRollups.map((bucket) => {
              const task = tasks.find((t) => t.id === bucket.taskId)
              const isUnreconciledGap =
                bucket.isObservationGap && !bucket.reconciliationChoice
              const isSelected = bucket.id === selectedGapBucketId

              return (
                <div
                  key={bucket.id}
                  onClick={() => setSelectedGapBucketId(bucket.id)}
                  className={`rounded-xl p-3 border transition cursor-pointer space-y-1.5 ${isUnreconciledGap
                      ? 'border-dashed border-amber-500 bg-amber-950/25 hover:bg-amber-950/40'
                      : isSelected
                        ? 'border-indigo-500 bg-indigo-950/30'
                        : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-white">
                      {bucket.workDate} • {formatMinuteOfDay(bucket.startMinuteOfDay)}–
                      {formatMinuteOfDay(bucket.endMinuteOfDay)} ({bucket.durationMinutes}m)
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${isUnreconciledGap
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : bucket.appCategory === 'ide'
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                            : bucket.appCategory === 'docs_browser'
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        }`}
                    >
                      {bucket.appCategory.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-300">
                    <span>
                      Task: <strong className="text-white">{task?.code ?? 'DEV'}</strong> • Mode:{' '}
                      <strong className="text-indigo-300">{bucket.workMode}</strong>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Sources: [{bucket.concurrentSources.join(' + ')}]
                    </span>
                  </div>

                  {bucket.concurrentSources.length > 1 && (
                    <div className="text-[10px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded px-2 py-0.5">
                      Concurrent Desktop + IDE signals deduplicated to {bucket.durationMinutes}m
                    </div>
                  )}

                  {isUnreconciledGap && (
                    <div className="text-[11px] text-amber-200 font-medium">
                      Observation Gap (No input signal for {bucket.durationMinutes}m). Click to
                      reconcile as Thinking, Reading, Meeting, or Break (F2-004).
                    </div>
                  )}

                  {bucket.reconciliationChoice && (
                    <div className="text-[11px] text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded px-2 py-1">
                      <strong>Reconciled ({bucket.reconciliationChoice}):</strong>{' '}
                      {bucket.reconciliationNote}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Track 3: Evidence Artifacts Pins (F2-012..025, F2-031, F2-032) */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>
              Track 3 - Correlated Evidence Artifacts & Provenance Pins (F2-031, F2-032)
            </span>
            <span className="text-[11px] text-slate-400">
              Separates Contemporaneous Signals from Retrospective Outcomes (R-05)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredArtifacts.map((art) => {
              const selected = art.id === selectedArtifactId
              return (
                <div
                  key={art.id}
                  onClick={() => {
                    setSelectedArtifactId(art.id)
                    setOverrideTaskId(art.taskId)
                    setOverrideLinkType(art.linkType)
                  }}
                  className={`rounded-xl p-3 border transition cursor-pointer space-y-1.5 ${selected
                      ? 'border-indigo-500 bg-indigo-950/40'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                    }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                        {art.sourceType.toUpperCase()}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {art.externalId}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${art.linkType === 'retrospective_outcome'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                        }`}
                    >
                      {art.linkType === 'retrospective_outcome'
                        ? 'Retrospective Outcome (R-05)'
                        : 'Contemporaneous Signal'}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-white">{art.summaryTitle}</div>

                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Linked Task:{' '}
                      <strong className="text-emerald-300 font-mono">{art.taskCode}</strong> •
                      Confidence:{' '}
                      <strong className="text-white">
                        {Math.round(art.linkConfidence * 100)}%
                      </strong>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Provenance: {art.captureMode} ({art.reliabilityStatus})
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-300 bg-slate-900/80 rounded px-2.5 py-1">
                    {art.linkRationale}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom Interactive Inspector Row: Idle Gap Reconciliation (F2-004) + Evidence Re-Linking (F2-032) + Annotations (F2-033) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1: Return-from-Idle & Observation Gap Reconciler (F2-003, F2-004) */}
        <form
          onSubmit={handleReconcileGapSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700/60 font-bold">
              F2-003 & F2-004
            </span>
            <span className="text-[11px] text-slate-400">Never Labeled Fraud</span>
          </div>
          <h4 className="text-sm font-bold text-white">
            Return-from-Idle Gap Reconciliation
          </h4>
          <p className="text-xs text-slate-400">
            Selected Interval:{' '}
            {activeGapBucket ? (
              <strong className="text-amber-300 font-mono">
                {activeGapBucket.workDate} {formatMinuteOfDay(activeGapBucket.startMinuteOfDay)}–
                {formatMinuteOfDay(activeGapBucket.endMinuteOfDay)} (
                {activeGapBucket.durationMinutes}m)
              </strong>
            ) : (
              'Click any bucket on Track 2 above'
            )}
          </p>

          <div className="space-y-2">
            <label className="block text-xs text-slate-300 font-medium">
              How should this interval be categorized?
            </label>
            <select
              value={gapChoice}
              onChange={(e) => setGapChoice(e.target.value as IdleReconciliationChoice)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="thinking">Thinking / Architecture Whiteboarding</option>
              <option value="reading">Reading Documentation / Specifications</option>
              <option value="meeting">Meeting / Pair Discussion</option>
              <option value="break">Personal Break</option>
              <option value="away">Away from Workstation</option>
              <option value="other">Other Engineering Activity</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-slate-300 font-medium">
              Developer Context Note (Optional)
            </label>
            <input
              type="text"
              value={gapNote}
              onChange={(e) => setGapNote(e.target.value)}
              placeholder="e.g., Reviewed sequence diagram for webhook queue lock..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>

          <button
            type="submit"
            disabled={!activeGapBucket}
            className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-bold text-white cursor-pointer transition"
          >
            Save Gap Reconciliation
          </button>
        </form>

        {/* Card 2: Evidence-to-Task Linkage & Human Override (F2-031, F2-032) */}
        <form
          onSubmit={handleRelinkArtifactSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-bold">
              F2-031 & F2-032
            </span>
            {activeArtifact && (
              <button
                type="button"
                onClick={() => {
                  confirmEvidenceArtifactLink(activeArtifact.id)
                  setBannerMessage(`Confirmed task link for ${activeArtifact.externalId}.`)
                }}
                className="text-[11px] text-emerald-300 hover:underline cursor-pointer"
              >
                ✓ Confirm Current Link
              </button>
            )}
          </div>
          <h4 className="text-sm font-bold text-white">
            Evidence-to-Task Linkage Override
          </h4>
          <p className="text-xs text-slate-400">
            Selected Artifact:{' '}
            {activeArtifact ? (
              <strong className="text-indigo-300 font-mono">
                {activeArtifact.externalId} ({activeArtifact.sourceType})
              </strong>
            ) : (
              'Select an artifact on Track 3'
            )}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-300 mb-1">Target Task</label>
              <select
                value={overrideTaskId}
                onChange={(e) => setOverrideTaskId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-300 mb-1">Link Classification</label>
              <select
                value={overrideLinkType}
                onChange={(e) => setOverrideLinkType(e.target.value as ArtifactLinkType)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
              >
                <option value="contemporaneous">Contemporaneous</option>
                <option value="retrospective_outcome">Retrospective Outcome (R-05)</option>
                <option value="manual_attached">Manual Attached</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-300 mb-1">
              Override Rationale
            </label>
            <input
              type="text"
              value={overrideRationale}
              onChange={(e) => setOverrideRationale(e.target.value)}
              placeholder="Why does this artifact belong to the selected task?"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>

          <button
            type="submit"
            disabled={!activeArtifact}
            className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-bold text-white cursor-pointer transition"
          >
            Override Task Link (100% Human Confidence)
          </button>
        </form>

        {/* Card 3: Work-Session Annotations (Thinking Notes, Research Outcomes, Investigation Logs - F2-033) */}
        <form
          onSubmit={handleAddAnnotationSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-bold">
              F2-033
            </span>
            <span className="text-[11px] text-slate-400">
              {projects.length} Active Projects
            </span>
          </div>
          <h4 className="text-sm font-bold text-white">
            Attach Session Annotation / Investigation Log
          </h4>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-300 mb-1">Task</label>
              <select
                value={annTaskId}
                onChange={(e) => setAnnTaskId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-300 mb-1">Annotation Type</label>
              <select
                value={annType}
                onChange={(e) =>
                  setAnnType(e.target.value as SessionAnnotationItem['annotationType'])
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="investigation_log">Zero-Commit Investigation Log</option>
                <option value="thinking_note">Architectural Thinking Note</option>
                <option value="research_outcome">Documentation Research Outcome</option>
                <option value="pair_programming">Pair Programming Summary</option>
              </select>
            </div>
          </div>

          <input
            type="text"
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
            placeholder="Annotation title (e.g., Root cause of retry lock)"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
          />

          <textarea
            rows={2}
            value={annContent}
            onChange={(e) => setAnnContent(e.target.value)}
            placeholder="Describe hypotheses tested, architecture tradeoffs, or docs reviewed..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
          />

          <button
            type="submit"
            className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer transition"
          >
            Attach Contemporaneous Annotation
          </button>
        </form>
      </div>

      {/* Recorded Work-Session Annotations Ledger (F2-033) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Work-Session Annotations & Investigation Logs ({filteredAnnotations.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredAnnotations.map((ann) => {
            const task = tasks.find((t) => t.id === ann.taskId)
            return (
              <div
                key={ann.id}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-bold text-emerald-300">
                    [{ann.annotationType.toUpperCase()}] • {task?.code ?? 'TASK'}
                  </span>
                  <span className="font-mono text-slate-400">
                    {ann.workDate} ({formatMinuteOfDay(ann.startMinuteOfDay)}–
                    {formatMinuteOfDay(ann.endMinuteOfDay)})
                  </span>
                </div>
                <div className="text-xs font-bold text-white">{ann.title}</div>
                <p className="text-xs text-slate-300 leading-relaxed">{ann.contentMarkdown}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

