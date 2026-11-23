import { useMemo, useRef, useState } from 'react'
import { notifySuccess } from '@/lib/notify'
import { usePhase1Store } from '@/context/Phase1Store'
import {
  usePhase2Store,
  type IdleReconciliationChoice,
  type SessionAnnotationItem,
} from '@/context/Phase2Store'
import type { ArtifactLinkType } from '@/types/domain.types'
import { formatMinuteOfDay } from '@/lib/time-engine'
import { InfoTooltip } from '@/components/InfoTooltip'

function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const APP_CATEGORY_LABEL: Record<string, string> = {
  ide: 'Code Editor',
  docs_browser: 'Docs & Browser',
  terminal: 'Terminal & Tests',
  browser: 'Browser',
  meeting: 'Meeting App',
  design: 'Design Tool',
  unobserved: 'Quiet Period',
}

function getFriendlyCategory(cat: string): string {
  return APP_CATEGORY_LABEL[cat] ?? cat.replace(/_/g, ' ')
}

const GAP_CHOICE_LABEL: Record<IdleReconciliationChoice, string> = {
  thinking: 'Thinking & Planning',
  reading: 'Reading Docs / Specs',
  meeting: 'Meeting / Team Call',
  break: 'Personal Break',
  away: 'Away from Desk',
  other: 'Other Work Activity',
}

const LINK_TYPE_LABEL: Record<ArtifactLinkType, string> = {
  contemporaneous: 'During Work Session',
  retrospective_outcome: 'Finished After Session',
  manual_attached: 'Manually Linked',
}

const NOTE_TYPE_LABEL: Record<SessionAnnotationItem['annotationType'], string> = {
  investigation_log: 'Debugging & Investigation',
  thinking_note: 'Thinking & Architecture',
  research_outcome: 'Research Summary',
  pair_programming: 'Pair Programming',
  idle_reconciliation: 'Quiet Period Explanation',
}

export function UnifiedTimelineView() {
  const { tasks, projects, timesheetLines, activeUser, hasPermission } = usePhase1Store()
  const {
    activityRollups,
    reconcileObservationGap,
    evidenceArtifacts,
    relinkEvidenceArtifact,
    confirmEvidenceArtifactLink,
    sessionAnnotations,
    addSessionAnnotation,
  } = usePhase2Store()

  const gapFormRef = useRef<HTMLFormElement>(null)
  const linkFormRef = useRef<HTMLFormElement>(null)

  const [selectedDate, setSelectedDate] = useState<string>('ALL')
  const [selectedGapBucketId, setSelectedGapBucketId] = useState<string | null>(
    () =>
      activityRollups.find((r) => r.isObservationGap && !r.reconciliationChoice)?.id ??
      null
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
  const setBannerMessage = notifySuccess

  const canViewTeamTimeline =
    activeUser.role === 'super_admin' ||
    activeUser.role === 'tenant_owner' ||
    hasPermission('timeline:view_team')

  const isFinanceRole =
    activeUser.role === 'finance' && !canViewTeamTimeline

  const scopedSessions = useMemo(() => {
    const base = canViewTeamTimeline
      ? timesheetLines
      : timesheetLines.filter((l) => l.developerId === activeUser.id)
    if (selectedDate === 'ALL') return base
    return base.filter((l) => l.workDate === selectedDate)
  }, [canViewTeamTimeline, timesheetLines, activeUser.id, selectedDate])

  if (isFinanceRole) {
    return (
      <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/25 p-6 space-y-2">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          Daily Activity is Hidden for Finance
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 max-w-2xl">
          To protect team privacy, Finance accounts only view approved hours and invoices.
          Visit <strong>Timesheets</strong> or <strong>Contracts &amp; Invoicing</strong> to review billing totals.
        </p>
      </div>
    )
  }

  const availableDates = Array.from(
    new Set([
      ...activityRollups.map((r) => r.workDate),
      ...evidenceArtifacts.map((a) => a.workDate),
      ...timesheetLines.map((l) => l.workDate),
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

  const activeGapBucket =
    activityRollups.find((b) => b.id === selectedGapBucketId) ?? null
  const activeArtifact =
    evidenceArtifacts.find((a) => a.id === selectedArtifactId) ?? null

  const totalActiveMinutes = filteredRollups.reduce(
    (acc, r) => acc + r.durationMinutes,
    0
  )
  const syncedToolsMinutes = filteredRollups
    .filter((r) => r.concurrentSources.length > 1)
    .reduce((acc, r) => acc + r.durationMinutes, 0)
  const quietGaps = filteredRollups.filter(
    (r) => r.isObservationGap && !r.reconciliationChoice
  )
  const quietGapMinutes = quietGaps.reduce((acc, r) => acc + r.durationMinutes, 0)

  function handleReconcileGapSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeGapBucket) return
    reconcileObservationGap(activeGapBucket.id, gapChoice, gapNote)
    setBannerMessage(
      `Labeled ${formatDuration(activeGapBucket.durationMinutes)} quiet period (${formatMinuteOfDay(activeGapBucket.startMinuteOfDay)}–${formatMinuteOfDay(activeGapBucket.endMinuteOfDay)}) as "${GAP_CHOICE_LABEL[gapChoice]}".`
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
      `Connected "${activeArtifact.summaryTitle}" to task ${targetTask?.code ?? overrideTaskId}.`
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
    setBannerMessage(`Saved work note on task ${task.code}.`)
  }

  return (
    <div className="space-y-6">
      {/* Clean Header + Date Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
          Daily Work Activity &amp; Proof
        </h2>

        <div className="flex items-center gap-2 text-xs">
          <label
            htmlFor="timeline-date-filter"
            className="font-medium text-zinc-500 dark:text-zinc-400"
          >
            Date:
          </label>
          <select
            id="timeline-date-filter"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-xl bg-white dark:bg-[#131319] px-3 py-1.5 font-semibold text-zinc-900 dark:text-white"
          >
            <option value="ALL">All Recent Days</option>
            {availableDates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* First-Sight 4-Card KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Total Active Time
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {formatDuration(totalActiveMinutes)}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>Combined Tool Time</span>
            <InfoTooltip text="Overlapping editor and desktop time is merged so it is never counted twice." />
          </div>
          <div className="text-2xl font-bold font-mono text-[#6d25da] dark:text-[#c5a8f0]">
            {formatDuration(syncedToolsMinutes)}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>Quiet Periods</span>
            <InfoTooltip text="Intervals without keyboard or editor activity (thinking, reading, meetings)." />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {formatDuration(quietGapMinutes)}
            </span>
            {quietGaps.length > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                {quietGaps.length} {quietGaps.length === 1 ? 'gap' : 'gaps'}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/20 dark:ring-[#8b51e1]/30 p-4 space-y-1">
          <div className="text-xs font-semibold text-[#581eae] dark:text-[#c5a8f0]">
            Linked Work Proof
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {filteredArtifacts.length}
          </div>
        </div>
      </div>

      {/* Section 1: Logged Work Sessions */}
      <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            1. Logged Work Sessions
          </h3>
          <span className="text-xs font-mono text-zinc-400">
            {scopedSessions.length} {scopedSessions.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>

        {scopedSessions.length === 0 ? (
          <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No work sessions logged for this date yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {scopedSessions.slice(0, 6).map((line) => (
              <div
                key={line.id}
                className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                    {line.workDate} · {line.startTime}–{line.endTime}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold capitalize bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]">
                    {line.workMode}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-1">
                    <span className="font-mono text-[#6d25da] dark:text-[#c5a8f0] mr-1.5">
                      {line.taskCode}
                    </span>
                    {line.taskTitle}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {line.developerName}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono text-[11px]">
                  <div className="rounded-lg bg-white dark:bg-[#131319] py-1.5 px-1">
                    <div className="text-[10px] text-zinc-400">Logged</div>
                    <div className="font-bold text-zinc-900 dark:text-white">
                      {formatDuration(line.claimedMinutes)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-[#131319] py-1.5 px-1">
                    <div className="text-[10px] text-zinc-400">Detected</div>
                    <div className="font-bold text-zinc-700 dark:text-zinc-300">
                      {formatDuration(line.observedMinutes)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-[#131319] py-1.5 px-1">
                    <div className="text-[10px] text-zinc-400">Approved</div>
                    <div className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatDuration(line.approvedBillableMinutes)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: App Activity & Quiet Periods */}
      <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            2. App Activity &amp; Quiet Periods
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="px-2.5 py-0.5 rounded-full bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] font-medium">
              Code Editor
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 font-medium">
              Docs &amp; Terminal
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
              Quiet Period
            </span>
          </div>
        </div>

        {filteredRollups.length === 0 ? (
          <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No tool activity recorded for this date.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRollups.map((bucket) => {
              const task = tasks.find((t) => t.id === bucket.taskId)
              const needsLabel =
                bucket.isObservationGap && !bucket.reconciliationChoice
              const isSelected = bucket.id === selectedGapBucketId

              return (
                <button
                  key={bucket.id}
                  type="button"
                  onClick={() => {
                    setSelectedGapBucketId(bucket.id)
                    if (needsLabel) {
                      gapFormRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                      })
                    }
                  }}
                  className={`rounded-xl p-3.5 text-left space-y-2 transition-all duration-150 cursor-pointer ${
                    needsLabel
                      ? isSelected
                        ? 'bg-amber-500/15 ring-2 ring-amber-500 shadow-xs'
                        : 'bg-amber-500/[0.08] ring-1 ring-amber-500/35 hover:ring-amber-500/70'
                      : isSelected
                        ? 'bg-[#6d25da]/[0.08] dark:bg-[#6d25da]/20 ring-2 ring-[#6d25da]'
                        : 'bg-zinc-50/90 dark:bg-white/[0.03] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] hover:ring-[#6d25da]/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {formatMinuteOfDay(bucket.startMinuteOfDay)}–
                      {formatMinuteOfDay(bucket.endMinuteOfDay)}
                    </span>
                    <span
                      className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                        needsLabel
                          ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                          : bucket.appCategory === 'ide'
                            ? 'bg-[#6d25da]/12 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]'
                            : 'bg-white dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      {needsLabel ? 'Quiet Period' : getFriendlyCategory(bucket.appCategory)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300">
                    <span>
                      <strong className="font-mono text-zinc-900 dark:text-white">
                        {formatDuration(bucket.durationMinutes)}
                      </strong>{' '}
                      · {task?.code ?? 'General'}
                    </span>
                    <span className="text-[11px] capitalize text-[#6d25da] dark:text-[#c5a8f0] font-medium">
                      {bucket.workMode}
                    </span>
                  </div>

                  {bucket.concurrentSources.length > 1 && (
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Combined from {bucket.concurrentSources.length} active tools
                    </div>
                  )}

                  {needsLabel && (
                    <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      Click to explain what you were doing →
                    </div>
                  )}

                  {bucket.reconciliationChoice && (
                    <div className="rounded-lg bg-white/90 dark:bg-white/[0.05] px-2.5 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        ✓ {GAP_CHOICE_LABEL[bucket.reconciliationChoice]}
                      </span>
                      {bucket.reconciliationNote ? `: ${bucket.reconciliationNote}` : ''}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 3: Linked Work Proof (Commits, PRs & Tests) */}
      <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            3. Linked Work Proof
          </h3>
          <span className="text-xs font-mono text-zinc-400">
            {filteredArtifacts.length} {filteredArtifacts.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {filteredArtifacts.length === 0 ? (
          <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No commits, pull requests, or test results linked for this date yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredArtifacts.map((art) => {
              const selected = art.id === selectedArtifactId
              return (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => {
                    setSelectedArtifactId(art.id)
                    setOverrideTaskId(art.taskId)
                    setOverrideLinkType(art.linkType)
                    linkFormRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest',
                    })
                  }}
                  className={`rounded-xl p-4 text-left space-y-2 transition-all duration-150 cursor-pointer ${
                    selected
                      ? 'bg-[#6d25da]/[0.07] dark:bg-[#6d25da]/20 ring-2 ring-[#6d25da] shadow-xs'
                      : 'bg-zinc-50/90 dark:bg-white/[0.03] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] hover:ring-[#6d25da]/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-white dark:bg-white/[0.08] text-[#6d25da] dark:text-[#c5a8f0] uppercase">
                        {art.sourceType.replace(/_/g, ' ')}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {art.externalId}
                      </span>
                    </div>
                    <span
                      className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                        art.linkType === 'retrospective_outcome'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {LINK_TYPE_LABEL[art.linkType]}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-zinc-900 dark:text-white leading-snug">
                    {art.summaryTitle}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>
                      Linked to{' '}
                      <strong className="font-mono text-zinc-900 dark:text-white">
                        {art.taskCode}
                      </strong>{' '}
                      · Match{' '}
                      <strong className="text-zinc-900 dark:text-white">
                        {Math.round(art.linkConfidence * 100)}%
                      </strong>
                    </span>
                    <span className="capitalize">{art.reliabilityStatus}</span>
                  </div>

                  {art.linkRationale && (
                    <div className="rounded-lg bg-white/90 dark:bg-[#131319] px-2.5 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                      {art.linkRationale}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Quick Actions Row (Plain-English Forms) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        {/* Action 1: Explain a Quiet Period */}
        <form
          ref={gapFormRef}
          onSubmit={handleReconcileGapSubmit}
          className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 flex flex-col justify-between gap-4"
        >
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
              Explain a Quiet Period
            </h4>

            <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] px-3 py-2 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">Selected time: </span>
              {activeGapBucket ? (
                <strong className="text-amber-700 dark:text-amber-300 font-mono">
                  {activeGapBucket.workDate} ·{' '}
                  {formatMinuteOfDay(activeGapBucket.startMinuteOfDay)}–
                  {formatMinuteOfDay(activeGapBucket.endMinuteOfDay)} (
                  {formatDuration(activeGapBucket.durationMinutes)})
                </strong>
              ) : (
                <span className="text-zinc-400">Click an activity block above</span>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                What were you doing?
              </label>
              <select
                value={gapChoice}
                onChange={(e) =>
                  setGapChoice(e.target.value as IdleReconciliationChoice)
                }
                className="w-full rounded-xl px-3 py-2 text-xs"
              >
                <option value="thinking">Thinking &amp; Planning</option>
                <option value="reading">Reading Docs or Specs</option>
                <option value="meeting">Meeting / Team Call</option>
                <option value="break">Personal Break</option>
                <option value="away">Away from Desk</option>
                <option value="other">Other Work Activity</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                Short Note (Optional)
              </label>
              <input
                type="text"
                value={gapNote}
                onChange={(e) => setGapNote(e.target.value)}
                placeholder="e.g. Reviewing API docs on paper / whiteboard"
                className="w-full rounded-xl px-3 py-2 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!activeGapBucket}
            className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-semibold text-white cursor-pointer transition"
          >
            Save Explanation
          </button>
        </form>

        {/* Action 2: Connect Work Proof to a Task */}
        <form
          ref={linkFormRef}
          onSubmit={handleRelinkArtifactSubmit}
          className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 flex flex-col justify-between gap-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                Connect Proof to Task
              </h4>
              {activeArtifact && (
                <button
                  type="button"
                  onClick={() => {
                    confirmEvidenceArtifactLink(activeArtifact.id)
                    setBannerMessage(
                      `Confirmed link for "${activeArtifact.summaryTitle}".`
                    )
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold hover:bg-emerald-500/20 transition cursor-pointer"
                >
                  ✓ Confirm
                </button>
              )}
            </div>

            <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.04] px-3 py-2 text-xs truncate">
              <span className="text-zinc-500 dark:text-zinc-400">Selected item: </span>
              {activeArtifact ? (
                <strong className="text-[#6d25da] dark:text-[#c5a8f0] font-mono">
                  {activeArtifact.externalId}
                </strong>
              ) : (
                <span className="text-zinc-400">Click a proof item above</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Assign to Task
                </label>
                <select
                  value={overrideTaskId}
                  onChange={(e) => setOverrideTaskId(e.target.value)}
                  className="w-full rounded-xl px-2.5 py-2 text-xs"
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  When was it done?
                </label>
                <select
                  value={overrideLinkType}
                  onChange={(e) =>
                    setOverrideLinkType(e.target.value as ArtifactLinkType)
                  }
                  className="w-full rounded-xl px-2.5 py-2 text-xs"
                >
                  <option value="contemporaneous">During Work Session</option>
                  <option value="retrospective_outcome">Finished After Session</option>
                  <option value="manual_attached">Manually Linked</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Reason (Optional)
              </label>
              <input
                type="text"
                value={overrideRationale}
                onChange={(e) => setOverrideRationale(e.target.value)}
                placeholder="e.g. This PR fixes the login bug under DEV-209"
                className="w-full rounded-xl px-3 py-2 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!activeArtifact}
            className="w-full py-2.5 px-3 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] disabled:opacity-40 text-xs font-semibold text-white cursor-pointer transition"
          >
            Update Task Link
          </button>
        </form>

        {/* Action 3: Add a Work Note */}
        <form
          onSubmit={handleAddAnnotationSubmit}
          className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 flex flex-col justify-between gap-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                Add a Work Note
              </h4>
              <span className="text-[11px] text-zinc-400 shrink-0">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Task
                </label>
                <select
                  value={annTaskId}
                  onChange={(e) => setAnnTaskId(e.target.value)}
                  className="w-full rounded-xl px-2.5 py-2 text-xs"
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Note Type
                </label>
                <select
                  value={annType}
                  onChange={(e) =>
                    setAnnType(
                      e.target.value as SessionAnnotationItem['annotationType']
                    )
                  }
                  className="w-full rounded-xl px-2.5 py-2 text-xs"
                >
                  <option value="investigation_log">Debugging / Investigation</option>
                  <option value="thinking_note">Thinking &amp; Architecture</option>
                  <option value="research_outcome">Research Summary</option>
                  <option value="pair_programming">Pair Programming</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Short Title
              </label>
              <input
                type="text"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="e.g. Found root cause of timeout issue"
                className="w-full rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Details
              </label>
              <textarea
                rows={2}
                value={annContent}
                onChange={(e) => setAnnContent(e.target.value)}
                placeholder="Write a brief summary of what you researched or solved..."
                className="w-full rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer transition"
          >
            + Save Work Note
          </button>
        </form>
      </div>

      {/* Saved Work Notes */}
      <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Saved Work Notes
          </h3>
          <span className="text-xs font-mono text-zinc-400">
            {filteredAnnotations.length}{' '}
            {filteredAnnotations.length === 1 ? 'note' : 'notes'}
          </span>
        </div>

        {filteredAnnotations.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 py-2">
            No work notes saved for this date yet. Add one above to share context with your reviewer.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAnnotations.map((ann) => {
              const task = tasks.find((t) => t.id === ann.taskId)
              return (
                <div
                  key={ann.id}
                  className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-3.5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold px-2 py-0.5 rounded-md bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]">
                        {NOTE_TYPE_LABEL[ann.annotationType]}
                      </span>
                      <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                        {task?.code ?? 'TASK'}
                      </span>
                    </div>
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
                      {ann.workDate} · {formatMinuteOfDay(ann.startMinuteOfDay)}–
                      {formatMinuteOfDay(ann.endMinuteOfDay)}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white">
                    {ann.title}
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {ann.contentMarkdown}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
