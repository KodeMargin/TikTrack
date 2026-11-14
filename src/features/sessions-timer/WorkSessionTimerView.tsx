import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'
import { InfoTooltip } from '@/components/InfoTooltip'

const WORK_MODE_DETAILS: {
  mode: WorkMode
  label: string
  deepWork: boolean
  description: string
}[] = [
    {
      mode: 'thinking',
      label: 'Thinking / Architecture',
      deepWork: true,
      description:
        'Declared deep reasoning or whiteboarding. Zero keyboard activity required (F1-023).',
    },
    {
      mode: 'coding',
      label: 'Coding',
      deepWork: false,
      description: 'Active implementation linked to assigned project/task.',
    },
    {
      mode: 'debugging',
      label: 'Debugging',
      deepWork: false,
      description: 'Root-cause investigation, stepping through debugger & test suites.',
    },
    {
      mode: 'research',
      label: 'Research / Reading Docs',
      deepWork: true,
      description: 'Reading RFCs, specifications, or vendor docs without forced input.',
    },
    {
      mode: 'testing',
      label: 'Testing / Verification',
      deepWork: false,
      description: 'Writing and running automated test suites or QA checks.',
    },
    {
      mode: 'review',
      label: 'Code & PR Review',
      deepWork: true,
      description: 'Reviewing pull requests, architecture docs, or security policies.',
    },
    {
      mode: 'meeting',
      label: 'Meeting / Pair Programming',
      deepWork: true,
      description: 'Collaborative session or client sync where another person may type.',
    },
    {
      mode: 'design',
      label: 'System / UI Design',
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
  } = usePhase1Store()

  // Live session completion controls
  const [sessionDate, setSessionDate] = useState('2026-11-12')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:30')
  const [durationMinutes, setDurationMinutes] = useState(90)
  const [breakMinutes, setBreakMinutes] = useState(0)
  const [feedbackBanner, setFeedbackBanner] = useState<{
    ok: boolean
    text: string
  } | null>(null)

  // Manual time entry state (F1-028)
  const [manualDate, setManualDate] = useState('2026-11-12')
  const [manualStart, setManualStart] = useState('16:00')
  const [manualEnd, setManualEnd] = useState('17:00')
  const [manualDuration, setManualDuration] = useState(60)
  const [manualMode, setManualMode] = useState<WorkMode>('thinking')
  const [manualReason, setManualReason] = useState('')
  const [manualNote, setManualNote] = useState('')

  const activeProjectId = projects.some((p) => p.id === timer.projectId)
    ? timer.projectId
    : (projects[0]?.id ?? '')
  const projectTasks = tasks.filter((t) => t.projectId === activeProjectId)
  const currentTask = projectTasks.find((t) => t.id === timer.taskId) ?? projectTasks[0]
  const currentModeInfo =
    WORK_MODE_DETAILS.find((m) => m.mode === timer.workMode) ??
    WORK_MODE_DETAILS[0]

  const liveBreakMins = Math.floor(timer.breakSeconds / 60)

  function handleCompleteSession() {
    const effectiveBreak = Math.max(breakMinutes, liveBreakMins)
    const res = completeAndRecordSession(
      durationMinutes,
      startTime,
      endTime,
      sessionDate,
      effectiveBreak
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
  }

  return (
    <div className="space-y-6">
      {timer.recoveredFromCrash && (
        <div className="rounded-xl border border-[#6d25da]/50 bg-[#f0e9fb] dark:bg-[#6d25da]/15 px-4 py-3 text-xs text-[#6d25da] dark:text-[#c5a8f0] flex items-center justify-between">
          <span>
            <strong>Crash Recovery (F1-022):</strong> Restored your in-progress session timer (
            <span className="font-mono">{formatSecondsHms(timer.elapsedSeconds)}</span>) from local persistence.
          </span>
          <button
            type="button"
            onClick={resetTimerClock}
            className="underline text-[#6d25da] dark:text-[#c5a8f0] cursor-pointer"
          >
            Discard Recovered Clock
          </button>
        </div>
      )}

      {feedbackBanner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${feedbackBanner.ok
              ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200'
              : 'border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200'
            }`}
        >
          <span>{feedbackBanner.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Active Session Timer & Deep-Work Controls */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-200 bg-white dark:bg-zinc-900/90 overflow-hidden">
          {/* Visible Tracking Tray Bar (F1-027) */}
          <div
            className={`px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold transition-colors duration-300 ${timer.lifecycle === 'running'
                ? 'bg-gradient-to-r from-[#6d25da]/10 via-[#6d25da]/5 to-transparent dark:from-[#6d25da]/20 dark:via-[#6d25da]/8 dark:to-transparent'
                : 'bg-[#f4f3fa]/80 dark:bg-white/[0.03]'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`h-2.5 w-2.5 rounded-full ${timer.lifecycle === 'running'
                    ? 'dp-beacon text-[#8b51e1] bg-[#8b51e1]'
                    : timer.lifecycle === 'on_break'
                      ? 'bg-zinc-400'
                      : timer.elapsedSeconds > 0
                        ? 'bg-amber-500'
                        : 'bg-zinc-500'
                  }`}
              />
              <span className={timer.lifecycle === 'running' ? 'text-[#6d25da] dark:text-[#a87ce9] font-bold' : 'text-zinc-700 dark:text-zinc-300'}>
                {timer.lifecycle === 'running'
                  ? `VISIBLE TRACKING ACTIVE • MODE: ${timer.workMode.toUpperCase()}`
                  : timer.lifecycle === 'on_break'
                    ? 'ON CONFIRMED BREAK (EXCLUDED FROM CLAIMED MINUTES)'
                    : timer.elapsedSeconds > 0
                      ? 'TIMER PAUSED - ZERO COLLECTION'
                      : 'TIMER IDLE - SELECT PROJECT & CLICK START'}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                {formatSecondsHms(timer.elapsedSeconds)}
              </span>
              {timer.breakSeconds > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  Break: {formatSecondsHms(timer.breakSeconds)}
                </span>
              )}
              <span className="text-zinc-500 dark:text-zinc-400">
                {timer.isOfflineQueueActive ? '⚡ OFFLINE QUEUE' : '● SYNCED'}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Project & Task Picker (F1-021) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Project
                </label>
                <select
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
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                >
                  {projects.length === 0 && (
                    <option value="">No projects yet</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} ({p.clientName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                  Task
                </label>
                <select
                  value={currentTask?.id ?? ''}
                  onChange={(e) =>
                    setTimerTaskAndMode(
                      activeProjectId,
                      e.target.value,
                      timer.workMode
                    )
                  }
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                >
                  {projectTasks.length === 0 && (
                    <option value="">No tasks yet</option>
                  )}
                  {projectTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}: {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Work Mode Picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <span>Work Mode</span>
                  <InfoTooltip
                    align="left"
                    text="Deep-work modes (Thinking, Research, Review, Meeting, Design) do not require continuous keyboard input."
                  />
                </span>
                {currentModeInfo.deepWork && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/20 text-[#6d25da] dark:text-[#c5a8f0] font-medium">
                    Deep Work
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
                      onClick={() =>
                        setTimerTaskAndMode(
                          timer.projectId,
                          currentTask?.id ?? '',
                          item.mode
                        )
                      }
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${active
                          ? 'border-[#6d25da] bg-[#f0e9fb] text-[#6d25da] dark:bg-[#6d25da]/20 dark:text-[#c5a8f0] dark:border-[#8b51e1]'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                        }`}
                    >
                      <div className="text-xs font-semibold">{item.label}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Lifecycle State Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => transitionTimer('running')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${timer.lifecycle === 'running'
                    ? 'bg-[#702fe3] hover:bg-[#5f21cc] text-white shadow-xs'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                  }`}
              >
                ▶ Start / Resume
              </button>
              <button
                type="button"
                onClick={() => transitionTimer('paused')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${timer.lifecycle === 'paused'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                  }`}
              >
                ❚❚ Pause
              </button>
              <button
                type="button"
                onClick={() => transitionTimer('on_break')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${timer.lifecycle === 'on_break'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                  }`}
              >
                ☕ Break
              </button>
              <button
                type="button"
                onClick={toggleOfflineMode}
                className={`ml-auto px-3 py-2 rounded-lg text-xs font-medium border transition cursor-pointer ${timer.isOfflineQueueActive
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300'
                  }`}
              >
                {timer.isOfflineQueueActive
                  ? '⚡ Reconnect & Sync'
                  : 'Offline Mode'}
              </button>
            </div>

            {/* Log Completed Session */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/90 p-4 space-y-3">
              <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                Log Completed Session
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                <div>
                  <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                    Work Date
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                    Elapsed (Mins)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-amber-700 dark:text-amber-300 mb-1">
                    Break Excl (Mins)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={Math.max(breakMinutes, liveBreakMins)}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-amber-800 dark:text-amber-200 font-mono"
                  />
                </div>
              </div>

              <textarea
                rows={2}
                value={timer.sessionNote}
                onChange={(e) => transitionTimer(timer.lifecycle, e.target.value)}
                placeholder="Session note..."
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-white"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Net Claimed:{' '}
                  <strong className="font-mono text-zinc-900 dark:text-white">
                    {Math.max(0, durationMinutes - Math.max(breakMinutes, liveBreakMins))}m
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={handleCompleteSession}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                >
                  ✓ Log Session
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Manual Time Entry & Policy */}
        <div className="lg:col-span-5 space-y-5">
          <form
            onSubmit={handleManualSubmit}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <span>Manual Time Entry</span>
                <InfoTooltip
                  align="left"
                  text="Log offline work or missed timers separately from tracked telemetry for manager review."
                />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">Work Date</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">Work Mode</label>
                <select
                  value={manualMode}
                  onChange={(e) => setManualMode(e.target.value as WorkMode)}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white"
                >
                  {WORK_MODE_DETAILS.map((m) => (
                    <option key={m.mode} value={m.mode}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Start – End Window
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="time"
                    value={manualStart}
                    onChange={(e) => setManualStart(e.target.value)}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                  <span>–</span>
                  <input
                    type="time"
                    value={manualEnd}
                    onChange={(e) => setManualEnd(e.target.value)}
                    className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5 text-zinc-900 dark:text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                  Claimed Minutes
                </label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={manualDuration}
                  onChange={(e) => setManualDuration(Number(e.target.value))}
                  className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                <span>Reason</span>
                <InfoTooltip
                  align="left"
                  text="Minimum 10 characters required for audit review."
                />
              </label>
              <input
                type="text"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                Work Note
              </label>
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-white"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition cursor-pointer"
            >
              + Submit Manual Entry
            </button>
          </form>

          {/* Policy Consent */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">
                <span>Policy Consent</span>
                <InfoTooltip
                  align="left"
                  text="Sessions record the active tracking policy version in effect when started."
                />
              </span>
              <span className="font-mono text-zinc-800 dark:text-zinc-200">
                {activeUser.consentedPolicyVersion ?? 'Unacknowledged'}
              </span>
            </div>
            {activeUser.consentedPolicyVersion !== activeTenant.policyVersion && (
              <button
                type="button"
                onClick={acknowledgeCurrentPolicy}
                className="px-3 py-1.5 rounded bg-[#702fe3] text-white font-semibold cursor-pointer"
              >
                Acknowledge Policy {activeTenant.policyVersion}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
