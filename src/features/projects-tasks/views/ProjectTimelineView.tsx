import { useMemo, useState } from 'react'
import type { SprintRecord, TaskRecord } from '@/context/Phase1Store'
import {
  formatDuration,
  formatShortDate,
  isTaskOverdue,
  type TaskTimeStatsMap,
} from '../types'
import { IssueTypeBadge } from '../components/StatusPriorityBadges'

function parseDayMs(iso?: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t) ? null : t
}

const DAY_MS = 86400000

export function ProjectTimelineView({
  tasks,
  sprints,
  taskTimeStats,
  onSelectTask,
}: {
  tasks: TaskRecord[]
  sprints: SprintRecord[]
  taskTimeStats: TaskTimeStatsMap
  onSelectTask: (taskId: string) => void
}) {
  const [todayIso] = useState(() => new Date().toISOString().slice(0, 10))

  const { windowStartMs, windowEndMs, totalDays, tickLabels, todayPct } = useMemo(() => {
    const todayMs = parseDayMs(todayIso) ?? 0
    const timestamps: number[] = [todayMs]

    for (const s of sprints) {
      const a = parseDayMs(s.startDate)
      const b = parseDayMs(s.endDate)
      if (a) timestamps.push(a)
      if (b) timestamps.push(b)
    }
    for (const t of tasks) {
      const due = parseDayMs(t.dueDate)
      if (due) {
        timestamps.push(due - 4 * DAY_MS)
        timestamps.push(due)
      }
    }

    const minMs = Math.min(...timestamps) - 3 * DAY_MS
    const maxMs = Math.max(...timestamps, minMs + 28 * DAY_MS) + 4 * DAY_MS
    const days = Math.max(14, Math.ceil((maxMs - minMs) / DAY_MS))

    const ticks: { label: string; pct: number }[] = []
    const stepDays = days > 45 ? 7 : 4
    for (let d = 0; d <= days; d += stepDays) {
      const iso = new Date(minMs + d * DAY_MS).toISOString().slice(0, 10)
      ticks.push({ label: formatShortDate(iso), pct: (d / days) * 100 })
    }

    const tPct = Math.max(0, Math.min(100, ((todayMs - minMs) / (days * DAY_MS)) * 100))

    return {
      windowStartMs: minMs,
      windowEndMs: minMs + days * DAY_MS,
      totalDays: days,
      tickLabels: ticks,
      todayPct: tPct,
    }
  }, [tasks, sprints, todayIso])

  function rangeBarStyle(startMs: number, endMs: number): { left: string; width: string } {
    const span = windowEndMs - windowStartMs
    const clampedStart = Math.max(windowStartMs, Math.min(windowEndMs, startMs))
    const clampedEnd = Math.max(clampedStart + DAY_MS, Math.min(windowEndMs, endMs))
    const leftPct = ((clampedStart - windowStartMs) / span) * 100
    const widthPct = Math.max(2.5, ((clampedEnd - clampedStart) / span) * 100)
    return { left: `${leftPct}%`, width: `${Math.min(100 - leftPct, widthPct)}%` }
  }

  const sprintById = useMemo(
    () => new Map(sprints.map((s) => [s.id, s])),
    [sprints]
  )

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) =>
        (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99')
      ),
    [tasks]
  )

  return (
    <div className="rounded-2xl bg-white dark:bg-[#111117] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Roadmap &amp; Schedule Timeline
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Visualizing {sprints.length} sprint(s) and {tasks.length} issue(s) across {totalDays} days.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#6d25da]" /> Active
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" /> In Review
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Done
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-rose-500" /> Overdue
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          {/* Date Axis Header */}
          <div className="grid grid-cols-12 border-b border-zinc-100 dark:border-white/[0.06] bg-zinc-50/90 dark:bg-white/[0.025] text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400">
            <div className="col-span-4 px-4 py-2.5 font-sans font-bold uppercase tracking-wider">
              Sprint / Issue
            </div>
            <div className="col-span-8 relative py-2.5">
              {tickLabels.map((t, idx) => (
                <span
                  key={idx}
                  style={{ left: `${t.pct}%` }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 whitespace-nowrap"
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Timeline Rows */}
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.05] relative">
            {/* Sprint Windows */}
            {sprints.map((sp) => {
              const sMs = parseDayMs(sp.startDate) ?? windowStartMs + 2 * DAY_MS
              const eMs = parseDayMs(sp.endDate) ?? sMs + 14 * DAY_MS
              const bar = rangeBarStyle(sMs, eMs)
              return (
                <div
                  key={sp.id}
                  className="grid grid-cols-12 items-center bg-[#f6f4fc]/60 dark:bg-[#6d25da]/[0.06]"
                >
                  <div className="col-span-4 px-4 py-2.5 text-xs flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-[#581eae] dark:text-[#d8c4f8] truncate block">
                        {sp.name}
                      </span>
                      <span className="text-[10.5px] text-zinc-500 capitalize">{sp.status} sprint</span>
                    </div>
                    <span className="font-mono text-[10.5px] text-zinc-500 shrink-0">
                      {formatShortDate(sp.startDate)} – {formatShortDate(sp.endDate)}
                    </span>
                  </div>
                  <div className="col-span-8 relative h-10">
                    <div
                      style={{ left: `${todayPct}%` }}
                      className="absolute inset-y-0 w-px bg-rose-500/60 pointer-events-none"
                    />
                    <div
                      style={bar}
                      className="absolute top-2 bottom-2 rounded-lg bg-[#6d25da]/20 dark:bg-[#6d25da]/35 border border-[#6d25da]/45 flex items-center px-2 text-[10.5px] font-bold text-[#581eae] dark:text-[#e2d3f8] truncate"
                    >
                      {sp.name}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Task Bars */}
            {sortedTasks.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-400">
                No issues to display on the timeline.
              </div>
            ) : (
              sortedTasks.map((task) => {
                const sprint = task.sprintId ? sprintById.get(task.sprintId) : null
                const dueMs =
                  parseDayMs(task.dueDate) ??
                  parseDayMs(sprint?.endDate) ??
                  windowStartMs + 10 * DAY_MS
                const estDays = Math.max(2, Math.ceil(task.estimateMinutes / 240))
                const startMs = parseDayMs(sprint?.startDate)
                  ? Math.min(parseDayMs(sprint!.startDate)!, dueMs - estDays * DAY_MS)
                  : dueMs - estDays * DAY_MS
                const bar = rangeBarStyle(startMs, dueMs)
                const overdue = isTaskOverdue(task)
                const loggedMins = taskTimeStats.get(task.id)?.loggedMinutes ?? 0

                const barColor = overdue
                  ? 'bg-rose-500 text-white'
                  : task.status === 'done'
                    ? 'bg-emerald-500 text-white'
                    : task.status === 'review'
                      ? 'bg-amber-500 text-white'
                      : task.status === 'active'
                        ? 'bg-[#6d25da] text-white'
                        : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100'

                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    className="grid grid-cols-12 items-center hover:bg-zinc-50 dark:hover:bg-white/[0.025] transition cursor-pointer"
                  >
                    <div className="col-span-4 px-4 py-2.5 flex items-center gap-2 text-xs min-w-0">
                      <IssueTypeBadge type={task.issueType ?? 'task'} size="xs" />
                      <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0] shrink-0">
                        {task.code}
                      </span>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {task.title}
                      </span>
                    </div>
                    <div className="col-span-8 relative h-10">
                      <div
                        style={{ left: `${todayPct}%` }}
                        className="absolute inset-y-0 w-px bg-rose-500/45 pointer-events-none"
                      />
                      <div
                        style={bar}
                        title={`${task.code}: ${task.title} · Logged ${formatDuration(loggedMins)} / Est. ${formatDuration(task.estimateMinutes)}`}
                        className={`absolute top-2 bottom-2 rounded-lg px-2 flex items-center justify-between gap-1 text-[10.5px] font-semibold shadow-xs truncate ${barColor}`}
                      >
                        <span className="truncate">{task.code}</span>
                        <span className="font-mono opacity-85 shrink-0">
                          {formatShortDate(task.dueDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
