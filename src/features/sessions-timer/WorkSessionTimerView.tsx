import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'

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
        <div className="rounded-xl border border-indigo-500/50 bg-indigo-950/60 px-4 py-3 text-xs text-indigo-200 flex items-center justify-between">
          <span>
            <strong>Crash Recovery (F1-022):</strong> Restored your in-progress session timer (
            <span className="font-mono">{formatSecondsHms(timer.elapsedSeconds)}</span>) from local persistence.
          </span>
          <button
            type="button"
            onClick={resetTimerClock}
            className="underline text-indigo-300 cursor-pointer"
          >
            Discard Recovered Clock
          </button>
        </div>
      )}

      {feedbackBanner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${feedbackBanner.ok
              ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
              : 'border-rose-700 bg-rose-950/60 text-rose-200'
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
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-xl">
          {/* Visible Tracking Tray Bar (F1-027) */}
          <div
            className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-2 text-xs font-semibold ${timer.lifecycle === 'running'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
                : timer.lifecycle === 'on_break'
                  ? 'bg-indigo-950/80 border-indigo-800 text-indigo-200'
                  : timer.elapsedSeconds > 0
                    ? 'bg-amber-950/80 border-amber-800 text-amber-200'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${timer.lifecycle === 'running'
                    ? 'bg-emerald-400 animate-pulse'
                    : timer.lifecycle === 'on_break'
                      ? 'bg-indigo-400'
                      : timer.elapsedSeconds > 0
                        ? 'bg-amber-400'
                        : 'bg-slate-500'
                  }`}
              />
              <span>
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
              <span className="text-white font-bold">
                {formatSecondsHms(timer.elapsedSeconds)}
              </span>
              {timer.breakSeconds > 0 && (
                <span className="text-amber-300">
                  Break: {formatSecondsHms(timer.breakSeconds)}
                </span>
              )}
              <span>
                {timer.isOfflineQueueActive ? '⚡ OFFLINE QUEUE' : '● SYNCED'}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Project & Task Picker (F1-021) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Assigned Project (Tenant: {activeTenant.slug})
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
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  {projects.length === 0 && (
                    <option value="">No projects yet - create one in Projects &amp; Tasks</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} ({p.clientName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Assigned Task (F1-013, F1-021)
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
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  {projectTasks.length === 0 && (
                    <option value="">No tasks yet for this project</option>
                  )}
                  {projectTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}: {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Work Mode Picker with Deep-Work Highlight (F1-023) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Select Work Mode (F1-014, F1-023)
                </span>
                {currentModeInfo.deepWork && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                    Deep-Work Mode: Protected From Low-Input Suspicion
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
                          ? 'border-indigo-500 bg-indigo-950/60 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                        }`}
                    >
                      <div className="text-xs font-semibold">{item.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {item.deepWork ? 'Deep Work (No Input Req)' : 'Standard Mode'}
                      </div>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-slate-400">{currentModeInfo.description}</p>
            </div>

            {/* Lifecycle State Controls (F1-022, F1-024, F1-025) */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => transitionTimer('running')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${timer.lifecycle === 'running'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
              >
                ▶ Start / Resume
              </button>
              <button
                type="button"
                onClick={() => transitionTimer('paused')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${timer.lifecycle === 'paused'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
              >
                ❚❚ Pause
              </button>
              <button
                type="button"
                onClick={() => transitionTimer('on_break')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${timer.lifecycle === 'on_break'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
              >
                ☕ Break (F1-024)
              </button>
              <button
                type="button"
                onClick={toggleOfflineMode}
                className={`ml-auto px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer ${timer.isOfflineQueueActive
                    ? 'border-amber-500 bg-amber-950/60 text-amber-200'
                    : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
              >
                {timer.isOfflineQueueActive
                  ? '⚡ Reconnect & Deduplicate Offline Queue (F1-025)'
                  : 'Simulate Offline Queue'}
              </button>
            </div>

            {/* Contemporaneous Session Note & Record Segment Form (F1-024, F1-026, F1-029) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 space-y-3">
              <div className="text-xs font-semibold text-white">
                Log Completed Session to Canonical Timesheet (Break Subtraction F1-024 & Overlap Guard F1-029)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Work Date
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Elapsed (Mins)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-amber-300 mb-1">
                    Break Excl (Mins)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={Math.max(breakMinutes, liveBreakMins)}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-amber-200 font-mono"
                  />
                </div>
              </div>

              <textarea
                rows={2}
                value={timer.sessionNote}
                onChange={(e) => transitionTimer(timer.lifecycle, e.target.value)}
                placeholder="Session note / outcome summary (F1-026)..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">
                  Net Claimed:{' '}
                  <strong className="font-mono text-white">
                    {Math.max(0, durationMinutes - Math.max(breakMinutes, liveBreakMins))}m
                  </strong>{' '}
                  (Elapsed {durationMinutes}m minus {Math.max(breakMinutes, liveBreakMins)}m break)
                </span>
                <button
                  type="button"
                  onClick={handleCompleteSession}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                >
                  ✓ Stop & Commit Session to Timesheet
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Manual Time Entry (F1-028) & Policy Consent Status (F1-030) */}
        <div className="lg:col-span-5 space-y-5">
          <form
            onSubmit={handleManualSubmit}
            className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                F1-028 • Manual Time Entry (Provenance: manual_entry)
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-200 border border-amber-800">
                Requires Audit Reason
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Offline whiteboarding, paper design, or forgotten timers can be claimed manually. Marked distinctly from observed telemetry and routed for manager sign-off.
            </p>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Work Date</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Work Mode</label>
                <select
                  value={manualMode}
                  onChange={(e) => setManualMode(e.target.value as WorkMode)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                >
                  {WORK_MODE_DETAILS.map((m) => (
                    <option key={m.mode} value={m.mode}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Start – End Window
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="time"
                    value={manualStart}
                    onChange={(e) => setManualStart(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white font-mono"
                  />
                  <span>–</span>
                  <input
                    type="time"
                    value={manualEnd}
                    onChange={(e) => setManualEnd(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Claimed Minutes
                </label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={manualDuration}
                  onChange={(e) => setManualDuration(Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                Mandatory Manual Entry Reason (Min 10 chars - Enforced by DB Check Constraint)
              </label>
              <input
                type="text"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Deliverable / Work Outcome Note
              </label>
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition cursor-pointer"
            >
              + Submit Manual Time Claim for Review
            </button>
          </form>

          {/* Policy Consent & Provenance Card (F1-030) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">
                Active Policy Consent & Collection Scope (F1-030)
              </span>
              <span className="font-mono text-emerald-300">
                {activeUser.consentedPolicyVersion ?? 'Unacknowledged'}
              </span>
            </div>
            <p className="text-slate-400">
              Logged in as <strong>{activeUser.name}</strong> ({activeUser.role}). All sessions record the exact policy version in effect at `started_at_utc`.
            </p>
            {activeUser.consentedPolicyVersion !== activeTenant.policyVersion && (
              <button
                type="button"
                onClick={acknowledgeCurrentPolicy}
                className="px-3 py-1.5 rounded bg-indigo-600 text-white font-semibold cursor-pointer"
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
