import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import {
  usePhase2Store,
  type IdleReconciliationChoice,
  type SessionAnnotationItem,
} from '@/context/Phase2Store'
import type { ArtifactLinkType } from '@/types/domain.types'
import { formatMinuteOfDay } from '@/lib/time-engine'
import { InfoTooltip } from '@/components/InfoTooltip'

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
      <div className="rounded-2xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-6 space-y-2">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          Timeline Restricted for Finance
        </h2>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 max-w-2xl">
          Finance users can view approved billing hours and invoices only. Switch to Developer or
          Project Manager to inspect the timeline.
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
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Activity Timeline & Work Context
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">Date:</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-900 dark:text-white"
            >
              <option value="ALL">All Dates (Nov 10–16)</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Timeline Duration</div>
            <div className="text-lg font-bold font-mono text-zinc-900 dark:text-white mt-0.5">
              {totalRollupMinutes}m
            </div>
          </div>

          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>Merged Activity</span>
              <InfoTooltip text="Concurrent IDE and desktop signals are merged so overlapping time is never double-counted." />
            </div>
            <div className="text-lg font-bold font-mono text-[#6d25da] dark:text-[#c5a8f0] mt-0.5">
              {concurrentMergedMinutes}m
            </div>
          </div>

          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>Observation Gaps</span>
              <InfoTooltip text="Intervals without IDE or desktop signals are marked unobserved—never penalized as fraud." />
            </div>
            <div className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300 mt-0.5">
              {unobservedGapMinutes}m
            </div>
          </div>

          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Evidence Artifacts</div>
            <div className="text-lg font-bold font-mono text-zinc-800 dark:text-zinc-200 mt-0.5">
              {filteredArtifacts.length}
            </div>
          </div>
        </div>

        {bannerMessage && (
          <div className="rounded-xl border border-emerald-500/40 bg-zinc-50 dark:bg-zinc-900/70 px-3.5 py-2 text-xs text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
            <span>{bannerMessage}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-zinc-800 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Multi-Track Visual Developer Timeline (F2-030, F2-034) */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Unified Timeline
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50">
              IDE / Debugger
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800">
              Docs Browser
            </span>
            <span className="px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800">
              Terminal / Tests
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-dashed border-amber-500">
              Observation Gap
            </span>
          </div>
        </div>

        {/* Track 1: Declared Sessions & 5 Time Metrics */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
            <span>Track 1 - Work Sessions</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {timesheetLines.slice(0, 3).map((line) => (
              <div
                key={line.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/90 p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                    {line.workDate} • {line.startTime}–{line.endTime}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50">
                    {line.workMode}
                  </span>
                </div>
                <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                  {line.taskCode}: {line.taskTitle}
                </div>
                <div className="grid grid-cols-5 gap-1 pt-1 text-[10px] font-mono">
                  <div className="bg-white dark:bg-zinc-900 p-1 rounded text-center">
                    <div className="text-zinc-500 dark:text-zinc-400">Elap</div>
                    <div className="text-zinc-900 dark:text-white font-bold">{line.elapsedMinutes}m</div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 p-1 rounded text-center">
                    <div className="text-[#6d25da] dark:text-[#c5a8f0]">Claim</div>
                    <div className="text-[#6d25da] dark:text-[#c5a8f0] font-bold">{line.claimedMinutes}m</div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 p-1 rounded text-center">
                    <div className="text-zinc-800 dark:text-zinc-200">Obs</div>
                    <div className="text-zinc-800 dark:text-zinc-200 font-bold">{line.observedMinutes}m</div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 p-1 rounded text-center">
                    <div className="text-zinc-800 dark:text-zinc-200">Supp</div>
                    <div className="text-zinc-800 dark:text-zinc-200 font-bold">{line.supportedMinutes}m</div>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 p-1 rounded text-center">
                    <div className="text-amber-700 dark:text-amber-300">Appr</div>
                    <div className="text-amber-800 dark:text-amber-200 font-bold">{line.approvedBillableMinutes}m</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Track 2: Coarse Activity Rollup Buckets & Observation Gaps */}
        <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
            <span>
              Track 2 - Activity Buckets
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
                      ? 'border-dashed border-amber-500 bg-amber-50 dark:bg-amber-950/25 hover:bg-amber-100 dark:hover:bg-amber-950/40'
                      : isSelected
                        ? 'border-[#6d25da] bg-[#f0e9fb] dark:bg-[#6d25da]/15'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {bucket.workDate} • {formatMinuteOfDay(bucket.startMinuteOfDay)}–
                      {formatMinuteOfDay(bucket.endMinuteOfDay)} ({bucket.durationMinutes}m)
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${isUnreconciledGap
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40'
                          : bucket.appCategory === 'ide'
                            ? 'bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50'
                            : bucket.appCategory === 'docs_browser'
                              ? 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800'
                              : 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800'
                        }`}
                    >
                      {bucket.appCategory.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-zinc-700 dark:text-zinc-300">
                    <span>
                      Task: <strong className="text-zinc-900 dark:text-white">{task?.code ?? 'DEV'}</strong> • Mode:{' '}
                      <strong className="text-[#6d25da] dark:text-[#c5a8f0]">{bucket.workMode}</strong>
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                      Sources: [{bucket.concurrentSources.join(' + ')}]
                    </span>
                  </div>

                  {bucket.concurrentSources.length > 1 && (
                    <div className="text-[10px] text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-0.5">
                      Merged signals ({bucket.durationMinutes}m)
                    </div>
                  )}

                  {isUnreconciledGap && (
                    <div className="text-[11px] text-amber-800 dark:text-amber-200 font-medium">
                      Observation Gap ({bucket.durationMinutes}m) — click to categorize
                    </div>
                  )}

                  {bucket.reconciliationChoice && (
                    <div className="text-[11px] text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1">
                      <strong>Reconciled ({bucket.reconciliationChoice}):</strong>{' '}
                      {bucket.reconciliationNote}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Track 3: Evidence Artifacts Pins */}
        <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
            <span>
              Track 3 - Evidence Artifacts
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
                      ? 'border-[#6d25da] bg-[#f0e9fb] dark:bg-[#6d25da]/15'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[#6d25da] dark:text-[#c5a8f0] border border-zinc-200 dark:border-zinc-700">
                        {art.sourceType.toUpperCase()}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {art.externalId}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${art.linkType === 'retrospective_outcome'
                          ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/60'
                          : 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800'
                        }`}
                    >
                      {art.linkType === 'retrospective_outcome'
                        ? 'Retrospective Outcome'
                        : 'Contemporaneous'}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-zinc-900 dark:text-white">{art.summaryTitle}</div>

                  <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>
                      Task:{' '}
                      <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{art.taskCode}</strong> •
                      Confidence:{' '}
                      <strong className="text-zinc-900 dark:text-white">
                        {Math.round(art.linkConfidence * 100)}%
                      </strong>
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                      {art.captureMode} ({art.reliabilityStatus})
                    </span>
                  </div>

                  <div className="text-[11px] text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/80 rounded px-2.5 py-1">
                    {art.linkRationale}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom Interactive Inspector Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Card 1: Resolve Idle Gap */}
        <form
          onSubmit={handleReconcileGapSubmit}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 flex flex-col justify-between gap-4"
        >
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
              Resolve Idle Gap
            </h4>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Interval:{' '}
              {activeGapBucket ? (
                <strong className="text-amber-700 dark:text-amber-300 font-mono">
                  {activeGapBucket.workDate} {formatMinuteOfDay(activeGapBucket.startMinuteOfDay)}–
                  {formatMinuteOfDay(activeGapBucket.endMinuteOfDay)} (
                  {activeGapBucket.durationMinutes}m)
                </strong>
              ) : (
                'Select a bucket above'
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                Category
              </label>
              <select
                value={gapChoice}
                onChange={(e) => setGapChoice(e.target.value as IdleReconciliationChoice)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
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
              <label className="block text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                Note (Optional)
              </label>
              <input
                type="text"
                value={gapNote}
                onChange={(e) => setGapNote(e.target.value)}
                placeholder="Add context..."
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!activeGapBucket}
            className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-bold text-white cursor-pointer transition"
          >
            Save
          </button>
        </form>

        {/* Card 2: Link Evidence to Task */}
        <form
          onSubmit={handleRelinkArtifactSubmit}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 flex flex-col justify-between gap-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                Link Evidence to Task
              </h4>
              {activeArtifact && (
                <button
                  type="button"
                  onClick={() => {
                    confirmEvidenceArtifactLink(activeArtifact.id)
                    setBannerMessage(`Confirmed task link for ${activeArtifact.externalId}.`)
                  }}
                  className="text-[11px] text-zinc-800 dark:text-zinc-200 hover:underline cursor-pointer"
                >
                  ✓ Confirm Link
                </button>
              )}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Artifact:{' '}
              {activeArtifact ? (
                <strong className="text-[#6d25da] dark:text-[#c5a8f0] font-mono">
                  {activeArtifact.externalId} ({activeArtifact.sourceType})
                </strong>
              ) : (
                'Select an artifact above'
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">Task</label>
                <select
                  value={overrideTaskId}
                  onChange={(e) => setOverrideTaskId(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-900 dark:text-white"
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} - {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">Link Type</label>
                <select
                  value={overrideLinkType}
                  onChange={(e) => setOverrideLinkType(e.target.value as ArtifactLinkType)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-900 dark:text-white"
                >
                  <option value="contemporaneous">Contemporaneous</option>
                  <option value="retrospective_outcome">Retrospective Outcome</option>
                  <option value="manual_attached">Manual Attached</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">
                Reason
              </label>
              <input
                type="text"
                value={overrideRationale}
                onChange={(e) => setOverrideRationale(e.target.value)}
                placeholder="Reason for link..."
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!activeArtifact}
            className="w-full py-2 px-3 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] disabled:opacity-40 text-xs font-bold text-white cursor-pointer transition"
          >
            Update Task Link
          </button>
        </form>

        {/* Card 3: Add Note */}
        <form
          onSubmit={handleAddAnnotationSubmit}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-4 flex flex-col justify-between gap-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                Add Note
              </h4>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {projects.length} Active Projects
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">Task</label>
                <select
                  value={annTaskId}
                  onChange={(e) => setAnnTaskId(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">Type</label>
                <select
                  value={annType}
                  onChange={(e) =>
                    setAnnType(e.target.value as SessionAnnotationItem['annotationType'])
                  }
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
                >
                  <option value="investigation_log">Investigation Log</option>
                  <option value="thinking_note">Thinking Note</option>
                  <option value="research_outcome">Research Outcome</option>
                  <option value="pair_programming">Pair Programming</option>
                </select>
              </div>
            </div>

            <input
              type="text"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Title"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
            />

            <textarea
              rows={2}
              value={annContent}
              onChange={(e) => setAnnContent(e.target.value)}
              placeholder="Details..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer transition"
          >
            Add Note
          </button>
        </form>
      </div>

      {/* Recorded Work-Session Annotations Ledger */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
          Session Notes ({filteredAnnotations.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredAnnotations.map((ann) => {
            const task = tasks.find((t) => t.id === ann.taskId)
            return (
              <div
                key={ann.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 p-3 space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                    [{ann.annotationType.toUpperCase()}] • {task?.code ?? 'TASK'}
                  </span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">
                    {ann.workDate} ({formatMinuteOfDay(ann.startMinuteOfDay)}–
                    {formatMinuteOfDay(ann.endMinuteOfDay)})
                  </span>
                </div>
                <div className="text-xs font-bold text-zinc-900 dark:text-white">{ann.title}</div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{ann.contentMarkdown}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

