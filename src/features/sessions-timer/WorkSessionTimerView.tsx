import { useMemo, useState } from 'react'
import { notifyFeedback } from '@/lib/notify'
import { usePhase1Store } from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ActiveRulesSummaryBanner } from '@/features/verification-ai/ActiveRulesSummaryBanner'
import { Select } from '@/components/Select'

const WORK_MODE_DETAILS: {
  mode: WorkMode
  label: string
  deepWork: boolean
  description: string
}[] = [
  {
    mode: 'coding',
    label: 'Coding',
    deepWork: false,
    description: 'Active implementation linked to assigned project/task.',
  },
  {
    mode: 'thinking',
    label: 'Thinking',
    deepWork: true,
    description: 'Declared deep reasoning or whiteboarding. Zero keyboard activity required.',
  },
  {
    mode: 'debugging',
    label: 'Debugging',
    deepWork: false,
    description: 'Root-cause investigation, stepping through debugger & test suites.',
  },
  {
    mode: 'research',
    label: 'Research',
    deepWork: true,
    description: 'Reading RFCs, specifications, or vendor docs without forced input.',
  },
  {
    mode: 'testing',
    label: 'Testing',
    deepWork: false,
    description: 'Writing and running automated test suites or QA checks.',
  },
  {
    mode: 'review',
    label: 'Code Review',
    deepWork: true,
    description: 'Reviewing pull requests, architecture docs, or security policies.',
  },
  {
    mode: 'meeting',
    label: 'Meeting / Pair',
    deepWork: true,
    description: 'Collaborative session or client sync where another person may type.',
  },
  {
    mode: 'design',
    label: 'System Design',
    deepWork: true,
    description: 'Schema design, wireframing, or technical specification writing.',
  },
]

function formatSecondsHms(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':')
}

function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function WorkSessionTimerView() {
  const {
    activeTenant,
    activeUser,
    acknowledgeCurrentPolicy,
    projects,
    tasks,
    timer,
    setTimerTaskAndMode,
    transitionTimer,
    toggleOfflineMode,
    resetTimerClock,
    completeAndRecordSession,
    addManualTimeEntry,
    timesheetLines,
    hasPermission,
  } = usePhase1Store()

  // Live session completion controls
  const [sessionDate, setSessionDate] = useState('2026-11-12')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:30')
  const [durationMinutes, setDurationMinutes] = useState(90)
  const [breakMinutes, setBreakMinutes] = useState(0)
  const setFeedbackBanner = notifyFeedback

  // Manual time entry state
  const [manualDate, setManualDate] = useState('2026-11-12')
  const [manualStart, setManualStart] = useState('16:00')
  const [manualEnd, setManualEnd] = useState('17:00')
  const [manualDuration, setManualDuration] = useState(60)
  const [manualMode, setManualMode] = useState<WorkMode>('thinking')
  const [manualReason, setManualReason] = useState('')
  const [manualNote, setManualNote] = useState('')

  const canViewTeamSessions =
    activeUser.role === 'super_admin' ||
    activeUser.role === 'tenant_owner' ||
    hasPermission('timer:view_team') ||
    hasPermission('timesheet:view_team')

  const recentLogs = useMemo(() => {
    const scoped = canViewTeamSessions
      ? timesheetLines
      : timesheetLines.filter((l) => l.developerId === activeUser.id)
    return scoped.slice(0, 6)
  }, [canViewTeamSessions, timesheetLines, activeUser.id])

  const activeProjectId = projects.some((p) => p.id === timer.projectId)
    ? timer.projectId
    : (projects[0]?.id ?? '')
  const projectTasks = tasks.filter((t) => t.projectId === activeProjectId)
  const currentTask = projectTasks.find((t) => t.id === timer.taskId) ?? projectTasks[0]
  const currentModeInfo =
    WORK_MODE_DETAILS.find((m) => m.mode === timer.workMode) ??
    WORK_MODE_DETAILS[0]

  const liveBreakMins = Math.floor(timer.breakSeconds / 60)
  const effectiveBreakMins = Math.max(breakMinutes, liveBreakMins)
  const netClaimedMins = Math.max(0, durationMinutes - effectiveBreakMins)

  function handleCompleteSession() {
    const res = completeAndRecordSession(
      durationMinutes,
      startTime,
      endTime,
      sessionDate,
      effectiveBreakMins
    )
    setFeedbackBanner({ ok: res.ok, text: res.message })
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentTask) {
      setFeedbackBanner({
        ok: false,
        text: 'Create a project and task first before submitting manual time.',
      })
      return
    }
    const res = addManualTimeEntry({
      projectId: currentTask.projectId,
      taskId: currentTask.id,
      workDate: manualDate,
      startTime: manualStart,
      endTime: manualEnd,
      durationMinutes: manualDuration,
      workMode: manualMode,
      manualReason,
      developerNote: manualNote,
    })
    setFeedbackBanner({ ok: res.ok, text: res.message })
    if (res.ok) {
      setManualReason('')
      setManualNote('')
    }
  }

  const lifecyclePill =
    timer.lifecycle === 'running'
      ? {
          label: `Recording · ${currentModeInfo.label}`,
          dot: 'dp-beacon text-[#8b51e1] bg-[#8b51e1]',
          cls: 'bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#d8c4f8] ring-1 ring-[#6d25da]/25',
        }
      : timer.lifecycle === 'on_break'
        ? {
            label: 'On Break (Excluded)',
            dot: 'bg-amber-500',
            cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20',
          }
        : timer.elapsedSeconds > 0
          ? {
              label: 'Paused · Zero Collection',
              dot: 'bg-amber-500',
              cls: 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200',
            }
          : {
              label: 'Ready to Track',
              dot: 'bg-zinc-400',
              cls: 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.07] dark:text-zinc-300',
            }

  return (
    <div className="space-y-6">
      {timer.recoveredFromCrash && (
        <div className="dp-view-enter rounded-xl bg-[#6d25da]/10 ring-1 ring-[#6d25da]/25 px-4 py-3 text-xs text-[#581eae] dark:text-[#c5a8f0] flex items-center justify-between">
          <span>
            <strong>Crash Recovery:</strong> Restored your in-progress session timer (
            <span className="font-mono font-semibold">{formatSecondsHms(timer.elapsedSeconds)}</span>) from local persistence.
          </span>
          <button
            type="button"
            onClick={resetTimerClock}
            className="underline font-semibold ml-4 cursor-pointer"
          >
            Discard
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Hero Focus Timer & Log Completed Session */}
        <div className="lg:col-span-7 space-y-5">
          {/* Hero Live Timer Card */}
          <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-[0_1px_2px_rgba(15,5,31,0.04),0_8px_24px_-10px_rgba(15,5,31,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_28px_-10px_rgba(0,0,0,0.55)] overflow-hidden">
            {/* Top Status Bar */}
            <div className="px-5 py-3.5 bg-zinc-50/80 dark:bg-white/[0.025] border-b border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${lifecyclePill.cls}`}
              >
                <span className={`h-2 w-2 rounded-full ${lifecyclePill.dot}`} />
                {lifecyclePill.label}
              </span>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={toggleOfflineMode}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    timer.isOfflineQueueActive
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
                      : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-600 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-zinc-300'
                  }`}
                >
                  {timer.isOfflineQueueActive ? '⚡ Offline Queue · Sync' : '● Synced'}
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              {/* Hero Clock & Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-4xl sm:text-5xl font-bold font-mono tracking-tight text-zinc-900 dark:text-white">
                    {formatSecondsHms(timer.elapsedSeconds)}
                  </div>
                  {timer.breakSeconds > 0 && (
                    <div className="text-xs font-mono text-amber-600 dark:text-amber-400 mt-1">
                      Break excluded: {formatSecondsHms(timer.breakSeconds)}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => transitionTimer('running')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] cursor-pointer ${
                      timer.lifecycle === 'running'
                        ? 'bg-[#6d25da] hover:bg-[#581eae] text-white shadow-md shadow-[#6d25da]/25'
                        : 'bg-[#702fe3] hover:bg-[#5f21cc] text-white shadow-xs'
                    }`}
                  >
                    ▶ {timer.elapsedSeconds > 0 && timer.lifecycle !== 'running' ? 'Resume' : 'Start'}
                  </button>
                  <button
                    type="button"
                    onClick={() => transitionTimer('paused')}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] cursor-pointer ${
                      timer.lifecycle === 'paused'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] dark:text-zinc-200'
                    }`}
                  >
                    ❚❚ Pause
                  </button>
                  <button
                    type="button"
                    onClick={() => transitionTimer('on_break')}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] cursor-pointer ${
                      timer.lifecycle === 'on_break'
                        ? 'bg-amber-600 text-white'
                        : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] dark:text-zinc-200'
                    }`}
                  >
                    ☕ Break
                  </button>
                </div>
              </div>

              {/* Project & Task Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                    Project
                  </label>
                  <Select
                    value={activeProjectId}
                    onChange={(e) => {
                      const nextProjId = e.target.value
                      const firstTask = tasks.find((t) => t.projectId === nextProjId)
                      setTimerTaskAndMode(
                        nextProjId,
                        firstTask?.id ?? '',
                        timer.workMode
                      )
                    }}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-medium"
                  >
                    {projects.length === 0 && <option value="">No projects yet</option>}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                    Task
                  </label>
                  <Select
                    value={currentTask?.id ?? ''}
                    onChange={(e) =>
                      setTimerTaskAndMode(activeProjectId, e.target.value, timer.workMode)
                    }
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-medium"
                  >
                    {projectTasks.length === 0 && <option value="">No tasks yet</option>}
                    {projectTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code}: {t.title}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Work Mode Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    <span>Work Mode</span>
                    <InfoTooltip
                      align="left"
                      text="Deep-work modes (Thinking, Research, Review, Meeting, Design) do not require continuous keyboard input."
                    />
                  </span>
                  {currentModeInfo.deepWork && (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/20 text-[#581eae] dark:text-[#c5a8f0] font-semibold">
                      Deep Work Mode
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {WORK_MODE_DETAILS.map((item) => {
                    const active = item.mode === timer.workMode
                    return (
                      <button
                        key={item.mode}
                        type="button"
                        title={item.description}
                        onClick={() =>
                          setTimerTaskAndMode(
                            activeProjectId,
                            currentTask?.id ?? '',
                            item.mode
                          )
                        }
                        className={`px-3 py-2 rounded-xl text-left text-xs font-semibold transition active:scale-[0.98] cursor-pointer ${
                          active
                            ? 'bg-[#6d25da] text-white shadow-xs'
                            : 'bg-zinc-50 dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] hover:ring-[#6d25da]/30'
                        }`}
                      >
                        <div className="truncate">{item.label}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Log Completed Session Card */}
          <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Log Completed Session
              </h3>
              <div className="text-right">
                <div className="text-[11px] text-zinc-400">Net Claimed</div>
                <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatDuration(netClaimedMins)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Start
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                  End
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Elapsed (m)
                </label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-amber-600 dark:text-amber-400 mb-1">
                  Break (m)
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={effectiveBreakMins}
                  onChange={(e) => setBreakMinutes(Number(e.target.value))}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2.5 py-1.5 text-amber-700 dark:text-amber-300 font-mono"
                />
              </div>
            </div>

            <textarea
              rows={2}
              value={timer.sessionNote}
              onChange={(e) => transitionTimer(timer.lifecycle, e.target.value)}
              placeholder="What did you accomplish during this session?"
              className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCompleteSession}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-xs font-semibold text-white transition cursor-pointer shadow-xs"
              >
                ✓ Log Session ({formatDuration(netClaimedMins)})
              </button>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Manual Time Entry & Policy Consent */}
        <div className="lg:col-span-5 space-y-5">
          <form
            onSubmit={handleManualSubmit}
            className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4 shadow-[0_1px_2px_rgba(15,5,31,0.03)]"
          >
            <div className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-white">
              <span>Manual Time Entry</span>
              <InfoTooltip
                align="left"
                text="Log offline work or missed timers for manager review."
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Work Date
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Work Mode
                </label>
                <Select
                  value={manualMode}
                  onChange={(e) => setManualMode(e.target.value as WorkMode)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2.5 py-1.5 text-zinc-900 dark:text-white"
                >
                  {WORK_MODE_DETAILS.map((m) => (
                    <option key={m.mode} value={m.mode}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Start – End
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="time"
                    value={manualStart}
                    onChange={(e) => setManualStart(e.target.value)}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                  <span className="text-zinc-400">–</span>
                  <input
                    type="time"
                    value={manualEnd}
                    onChange={(e) => setManualEnd(e.target.value)}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Claimed (Mins)
                </label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={manualDuration}
                  onChange={(e) => setManualDuration(Number(e.target.value))}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                />
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                  <span>Audit Reason</span>
                  <InfoTooltip
                    align="left"
                    text="Minimum 10 characters required for audit review."
                  />
                </label>
                <input
                  type="text"
                  placeholder="e.g. Offline architecture whiteboarding session"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                  Work Note
                </label>
                <input
                  type="text"
                  placeholder="Summary of work completed..."
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-xs font-semibold text-white transition cursor-pointer shadow-xs"
            >
              + Submit Manual Entry ({formatDuration(manualDuration)})
            </button>
          </form>

          {/* Policy Consent Card */}
          <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 flex items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">
                <span>Tracking Policy</span>
                <InfoTooltip
                  align="left"
                  text="Sessions record the active tracking policy version in effect when started."
                />
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Active: <span className="font-mono">{activeTenant.policyVersion}</span> · Signed:{' '}
                <span className="font-mono text-zinc-800 dark:text-zinc-200">
                  {activeUser.consentedPolicyVersion ?? 'Pending'}
                </span>
              </div>
            </div>

            {activeUser.consentedPolicyVersion !== activeTenant.policyVersion ? (
              <button
                type="button"
                onClick={acknowledgeCurrentPolicy}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold transition cursor-pointer"
              >
                Acknowledge
              </button>
            ) : (
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                ✓ Acknowledged
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Transparent Active Workspace Review Rules Banner */}
      <ActiveRulesSummaryBanner />

      {/* Recent Logged Sessions Strip */}
      <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            {canViewTeamSessions ? 'Recent Team Logged Sessions' : 'Your Recent Logged Sessions'}
          </h3>
          <span className="text-xs font-mono text-zinc-400">
            Showing {recentLogs.length} of {timesheetLines.length}
          </span>
        </div>

        {recentLogs.length === 0 ? (
          <div className="text-xs text-zinc-400 dark:text-zinc-500 py-4 text-center">
            No sessions logged yet. Start the timer or submit a manual entry above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-zinc-100/80 dark:hover:bg-white/[0.05] transition"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                      {log.taskCode}
                    </span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                      {log.taskTitle}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {log.developerName} · {log.workDate} ·{' '}
                    <span className="capitalize">{log.workMode}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-bold text-zinc-900 dark:text-white">
                    {formatDuration(log.claimedMinutes)}
                  </div>
                  <div className="text-[10.5px] capitalize text-zinc-500 dark:text-zinc-400">
                    {log.evidenceStatus.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
