import { useMemo } from 'react'
import type {
  AuditLogEntry,
  ProjectRecord,
  SprintRecord,
  TaskRecord,
  WorkspaceMember,
} from '@/context/Phase1Store'
import {
  BOARD_COLUMNS,
  formatDuration,
  ISSUE_TYPE_OPTIONS,
  isTaskOverdue,
  PRIORITY_OPTIONS,
  type TaskTimeStatsMap,
} from '../types'
import { IssueTypeBadge, MemberAvatar, PriorityBadge } from '../components/StatusPriorityBadges'

export function ProjectSummaryView({
  project,
  tasks,
  sprints,
  activeMembers,
  taskTimeStats,
  auditLogs,
  onSelectTask,
}: {
  project: ProjectRecord
  tasks: TaskRecord[]
  sprints: SprintRecord[]
  activeMembers: WorkspaceMember[]
  taskTimeStats: TaskTimeStatsMap
  auditLogs: AuditLogEntry[]
  onSelectTask: (taskId: string) => void
}) {
  const metrics = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter((t) => t.status === 'done').length
    const completionPct = total > 0 ? Math.round((done / total) * 100) : 0
    const totalEstMins = tasks.reduce((s, t) => s + t.estimateMinutes, 0)
    const totalLoggedMins = tasks.reduce(
      (s, t) => s + (taskTimeStats.get(t.id)?.loggedMinutes ?? 0),
      0
    )
    const totalApprovedMins = tasks.reduce(
      (s, t) => s + (taskTimeStats.get(t.id)?.approvedMinutes ?? 0),
      0
    )
    const billableCount = tasks.filter((t) => t.isBillable).length
    const billablePct = total > 0 ? Math.round((billableCount / total) * 100) : 0
    const overdueTasks = tasks.filter(isTaskOverdue)
    const overEstimateTasks = tasks.filter((t) => {
      const logged = taskTimeStats.get(t.id)?.loggedMinutes ?? 0
      return t.estimateMinutes > 0 && logged > t.estimateMinutes
    })

    return {
      total,
      done,
      completionPct,
      totalEstMins,
      totalLoggedMins,
      totalApprovedMins,
      billablePct,
      overdueTasks,
      overEstimateTasks,
    }
  }, [tasks, taskTimeStats])

  const workload = useMemo(() => {
    return activeMembers
      .map((member) => {
        const assigned = tasks.filter((t) => t.assignedMemberIds.includes(member.id))
        const openCount = assigned.filter((t) => t.status !== 'done').length
        const doneCount = assigned.filter((t) => t.status === 'done').length
        const estMins = assigned.reduce((s, t) => s + t.estimateMinutes, 0)
        const loggedMins = assigned.reduce(
          (s, t) => s + (taskTimeStats.get(t.id)?.loggedMinutes ?? 0),
          0
        )
        return {
          member,
          total: assigned.length,
          openCount,
          doneCount,
          estMins,
          loggedMins,
        }
      })
      .filter((w) => w.total > 0)
      .sort((a, b) => b.openCount - a.openCount || b.estMins - a.estMins)
  }, [activeMembers, tasks, taskTimeStats])

  const projectActivity = useMemo(() => {
    const taskCodes = new Set(tasks.map((t) => t.code))
    return auditLogs
      .filter(
        (log) =>
          log.targetEntity.includes(project.code) ||
          log.reason.includes(project.name) ||
          Array.from(taskCodes).some((code) => log.targetEntity.includes(code))
      )
      .slice(0, 8)
  }, [auditLogs, project, tasks])

  const activeSprint = sprints.find((s) => s.status === 'active')

  return (
    <div className="space-y-5">
      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white dark:bg-[#111117] p-5 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Completion Progress
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              {metrics.completionPct}%
            </span>
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
              {metrics.done} / {metrics.total} done
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${metrics.completionPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#111117] p-5 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Time Burn (Logged vs Est.)
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-[#6d25da] dark:text-[#c5a8f0]">
              {formatDuration(metrics.totalLoggedMins)}
            </span>
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              of {formatDuration(metrics.totalEstMins)}
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
            Approved billable: {formatDuration(metrics.totalApprovedMins)}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#111117] p-5 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Billable Coverage
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
              {metrics.billablePct}%
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeSprint ? activeSprint.name : `${sprints.length} sprint(s)`}
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Client: <strong className="text-zinc-800 dark:text-zinc-200">{project.clientName}</strong>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#111117] p-5 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Delivery Risks
          </div>
          <div className="flex items-baseline gap-4">
            <div>
              <span className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                {metrics.overdueTasks.length}
              </span>
              <span className="text-xs text-zinc-500 ml-1.5">overdue</span>
            </div>
            <div>
              <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {metrics.overEstimateTasks.length}
              </span>
              <span className="text-xs text-zinc-500 ml-1.5">over est.</span>
            </div>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {metrics.overdueTasks.length === 0 && metrics.overEstimateTasks.length === 0
              ? 'All tracked issues are on schedule.'
              : 'Review flagged issues below.'}
          </div>
        </div>
      </div>

      {/* Middle Grid: Status Breakdown + Priority & Type Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111117] p-5 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Status Overview
          </div>
          <div className="space-y-3">
            {BOARD_COLUMNS.map((col) => {
              const count = tasks.filter((t) => t.status === col.status).length
              const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0
              return (
                <div key={col.status} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-200">
                      <span className={`h-2 w-2 rounded-full ${col.dotClass}`} />
                      <span>{col.label}</span>
                    </div>
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${col.dotClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#111117] p-5 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Priority Breakdown
            </div>
            <div className="space-y-2">
              {PRIORITY_OPTIONS.map((p) => {
                const count = tasks.filter((t) => t.priority === p.value).length
                return (
                  <div
                    key={p.value}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03]"
                  >
                    <PriorityBadge priority={p.value} />
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Types of Work
            </div>
            <div className="space-y-2">
              {ISSUE_TYPE_OPTIONS.map((it) => {
                const count = tasks.filter(
                  (t) => (t.issueType ?? (t.parentTaskId ? 'subtask' : 'task')) === it.value
                ).length
                return (
                  <div
                    key={it.value}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03]"
                  >
                    <IssueTypeBadge type={it.value} showLabel size="xs" />
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Team Workload + Risk Watchlist / Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111117] p-5 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Team Workload
          </div>
          {workload.length === 0 ? (
            <p className="text-xs text-zinc-400 py-4">No assignees allocated to issues yet.</p>
          ) : (
            <div className="space-y-3">
              {workload.map((row) => {
                const pct =
                  row.estMins > 0
                    ? Math.min(100, Math.round((row.loggedMins / row.estMins) * 100))
                    : 0
                return (
                  <div
                    key={row.member.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] text-xs"
                  >
                    <MemberAvatar name={row.member.name} id={row.member.id} size="md" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-white truncate">
                          {row.member.name}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
                          {row.openCount} open · {row.doneCount} done ·{' '}
                          <strong className="text-zinc-800 dark:text-zinc-200">
                            {formatDuration(row.loggedMins)}
                          </strong>{' '}
                          / {formatDuration(row.estMins)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-200/70 dark:bg-white/[0.07] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#6d25da]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111117] p-5 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Attention &amp; Recent Activity
          </div>

          {metrics.overdueTasks.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                Overdue Issues
              </div>
              {metrics.overdueTasks.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTask(t.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-500/[0.07] hover:bg-rose-500/[0.12] text-xs text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                      {t.code}
                    </span>
                    <span className="font-semibold text-zinc-900 dark:text-white truncate">
                      {t.title}
                    </span>
                  </div>
                  <span className="font-mono text-[10.5px] text-rose-600 dark:text-rose-400 shrink-0">
                    {t.dueDate}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {projectActivity.length === 0 ? (
              <p className="text-xs text-zinc-400">No recent audit activity for this project.</p>
            ) : (
              projectActivity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-2 text-xs pb-2 border-b border-zinc-100 dark:border-white/[0.05] last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {log.actorName}
                    </span>{' '}
                    <span className="text-zinc-500 dark:text-zinc-400">{log.reason}</span>
                  </div>
                  <span className="font-mono text-[10.5px] text-zinc-400 shrink-0">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
