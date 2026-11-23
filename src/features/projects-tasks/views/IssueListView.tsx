import { Fragment, useMemo, useState } from 'react'
import type {
  SprintRecord,
  TaskRecord,
  WorkspaceMember,
} from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'
import {
  BOARD_COLUMNS,
  formatDuration,
  formatShortDate,
  isTaskOverdue,
  PRIORITY_OPTIONS,
  type ProjectPermissions,
  type TaskPriority,
  type TaskStatus,
  type TaskTimeStatsMap,
} from '../types'
import { IssueTypeBadge, MemberAvatar } from '../components/StatusPriorityBadges'

type SortField = 'code' | 'title' | 'priority' | 'status' | 'dueDate' | 'logged'

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export function IssueListView({
  tasks,
  sprints,
  activeMembers,
  taskTimeStats,
  permissions,
  onSelectTask,
  onUpdateTask,
  onDeleteTask,
  onApproveTask,
  onLaunchTimer,
}: {
  tasks: TaskRecord[]
  sprints: SprintRecord[]
  activeMembers: WorkspaceMember[]
  taskTimeStats: TaskTimeStatsMap
  permissions: ProjectPermissions
  onSelectTask: (taskId: string) => void
  onUpdateTask: (taskId: string, patch: Partial<Omit<TaskRecord, 'id' | 'tenantId'>>) => void
  onDeleteTask: (taskId: string) => void
  onApproveTask: (task: TaskRecord) => void
  onLaunchTimer: (projectId: string, taskId: string, mode: WorkMode) => void
}) {
  const [sortField, setSortField] = useState<SortField>('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({})

  const sprintById = useMemo(
    () => new Map(sprints.map((s) => [s.id, s])),
    [sprints]
  )

  const taskIdsSet = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])

  const childrenByParent = useMemo(() => {
    const map = new Map<string, TaskRecord[]>()
    for (const t of tasks) {
      if (t.parentTaskId && taskIdsSet.has(t.parentTaskId)) {
        const list = map.get(t.parentTaskId) ?? []
        list.push(t)
        map.set(t.parentTaskId, list)
      }
    }
    return map
  }, [tasks, taskIdsSet])

  const topLevelTasks = useMemo(() => {
    const roots = tasks.filter(
      (t) => !t.parentTaskId || !taskIdsSet.has(t.parentTaskId)
    )
    const sorted = [...roots].sort((a, b) => {
      let cmp = 0
      if (sortField === 'code') cmp = a.code.localeCompare(b.code)
      else if (sortField === 'title') cmp = a.title.localeCompare(b.title)
      else if (sortField === 'priority')
        cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status)
      else if (sortField === 'dueDate')
        cmp = (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99')
      else if (sortField === 'logged') {
        const la = taskTimeStats.get(a.id)?.loggedMinutes ?? 0
        const lb = taskTimeStats.get(b.id)?.loggedMinutes ?? 0
        cmp = la - lb
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [tasks, taskIdsSet, sortField, sortDir, taskTimeStats])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function toggleSelect(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)))
    }
  }

  function applyBulkPatch(patch: Partial<Omit<TaskRecord, 'id' | 'tenantId'>>) {
    selectedIds.forEach((id) => onUpdateTask(id, patch))
    setSelectedIds(new Set())
  }

  function handleBulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.size} selected issue(s)?`)) return
    selectedIds.forEach((id) => onDeleteTask(id))
    setSelectedIds(new Set())
  }

  function renderRow(task: TaskRecord, isChild = false) {
    const children = childrenByParent.get(task.id) ?? []
    const isExpanded = expandedParents[task.id] ?? true
    const stats = taskTimeStats.get(task.id)
    const loggedMins = stats?.loggedMinutes ?? 0
    const pct =
      task.estimateMinutes > 0
        ? Math.min(100, Math.round((loggedMins / task.estimateMinutes) * 100))
        : 0
    const over = task.estimateMinutes > 0 && loggedMins > task.estimateMinutes
    const overdue = isTaskOverdue(task)
    const assigned = activeMembers.filter((m) =>
      task.assignedMemberIds.includes(m.id)
    )
    const sprint = task.sprintId ? sprintById.get(task.sprintId) : null

    return (
      <Fragment key={task.id}>
        <tr
          onClick={() => onSelectTask(task.id)}
          className={`cursor-pointer ${
            selectedIds.has(task.id)
              ? 'bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/[0.14]'
              : ''
          }`}
        >
          <td className="py-3 pl-4 pr-2 w-9" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              aria-label={`Select ${task.code}`}
              checked={selectedIds.has(task.id)}
              onChange={() => toggleSelect(task.id)}
              className="h-3.5 w-3.5 rounded cursor-pointer"
            />
          </td>

          <td className="py-3 px-3">
            <div className={`flex items-center gap-2 ${isChild ? 'pl-6' : ''}`}>
              {!isChild && children.length > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpandedParents((prev) => ({
                      ...prev,
                      [task.id]: !isExpanded,
                    }))
                  }}
                  className="p-0.5 rounded hover:bg-zinc-200/70 dark:hover:bg-white/10 text-zinc-400 cursor-pointer"
                  aria-label="Toggle subtasks"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}

              <IssueTypeBadge
                type={task.issueType ?? (isChild ? 'subtask' : 'task')}
                size="xs"
              />
              <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0] shrink-0">
                {task.code}
              </span>
              <span className="font-semibold text-zinc-900 dark:text-white truncate max-w-[300px]">
                {task.title}
              </span>
              {children.length > 0 && (
                <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.07] text-zinc-500 dark:text-zinc-400 shrink-0">
                  {children.filter((c) => c.status === 'done').length}/{children.length}
                </span>
              )}
              {sprint && (
                <span className="hidden 2xl:inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#f4effc] dark:bg-[#6d25da]/20 text-[#581eae] dark:text-[#c5a8f0] shrink-0">
                  {sprint.name}
                </span>
              )}
            </div>
          </td>

          <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
            <select
              aria-label={`Status for ${task.code}`}
              value={task.status}
              disabled={!permissions.canChangeTaskStatus}
              onChange={(e) =>
                onUpdateTask(task.id, { status: e.target.value as TaskStatus })
              }
              className="!py-1 !pl-2 !pr-7 !text-[11.5px] font-semibold"
            >
              {BOARD_COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>
                  {c.label}
                </option>
              ))}
            </select>
          </td>

          <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
            <select
              aria-label={`Priority for ${task.code}`}
              value={task.priority}
              disabled={!permissions.canEditTask}
              onChange={(e) =>
                onUpdateTask(task.id, { priority: e.target.value as TaskPriority })
              }
              className="!py-1 !pl-2 !pr-7 !text-[11.5px]"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </td>

          <td className="py-3 px-3">
            {assigned.length === 0 ? (
              <span className="text-[11px] text-zinc-400">Unassigned</span>
            ) : (
              <div className="flex items-center -space-x-1">
                {assigned.slice(0, 3).map((m) => (
                  <MemberAvatar key={m.id} name={m.name} id={m.id} size="xs" ring />
                ))}
                {assigned.length > 3 && (
                  <span className="h-5 w-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-[9px] font-bold flex items-center justify-center">
                    +{assigned.length - 3}
                  </span>
                )}
              </div>
            )}
          </td>

          <td className="py-3 px-3 font-mono text-[11px]">
            {task.dueDate ? (
              <span
                className={
                  overdue
                    ? 'text-rose-600 dark:text-rose-400 font-bold'
                    : 'text-zinc-600 dark:text-zinc-300'
                }
              >
                {formatShortDate(task.dueDate)}
              </span>
            ) : (
              <span className="text-zinc-400">—</span>
            )}
          </td>

          <td className="py-3 px-3 w-40">
            <div className="flex items-center justify-between font-mono text-[11px] mb-1">
              <span
                className={
                  over
                    ? 'text-rose-600 dark:text-rose-400 font-semibold'
                    : 'text-zinc-800 dark:text-zinc-200 font-semibold'
                }
              >
                {formatDuration(loggedMins)}
              </span>
              <span className="text-zinc-400">/ {formatDuration(task.estimateMinutes)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  over
                    ? 'bg-rose-500'
                    : task.status === 'done'
                      ? 'bg-emerald-500'
                      : 'bg-[#6d25da]'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </td>

          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-1.5">
              {permissions.canApproveTask &&
                (task.status === 'review' || task.status === 'active') && (
                  <button
                    type="button"
                    title="Approve Acceptance Criteria"
                    onClick={() => onApproveTask(task)}
                    className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] cursor-pointer"
                  >
                    ✓
                  </button>
                )}
              {permissions.canTrackTimer && (
                <button
                  type="button"
                  onClick={() =>
                    onLaunchTimer(task.projectId, task.id, task.defaultWorkMode)
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#6d25da] hover:bg-[#581eae] text-white font-semibold text-[11px] cursor-pointer"
                >
                  ▶ Track
                </button>
              )}
              {permissions.canDeleteTask && (
                <button
                  type="button"
                  title="Delete issue"
                  onClick={() => {
                    if (window.confirm(`Delete ${task.code}?`)) onDeleteTask(task.id)
                  }}
                  className="px-2 py-1 rounded-lg bg-zinc-100 dark:bg-white/[0.07] hover:bg-rose-100 dark:hover:bg-rose-950/60 text-zinc-500 hover:text-rose-600 text-[11px] cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </td>
        </tr>

        {!isChild &&
          isExpanded &&
          children.map((child) => renderRow(child, true))}
      </Fragment>
    )
  }

  return (
    <div className="space-y-3">
      {/* Multi-Select Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#6d25da] text-white px-4 py-2.5 text-xs shadow-md shadow-[#6d25da]/25">
          <div className="flex items-center gap-2 font-semibold">
            <span className="px-2 py-0.5 rounded-full bg-white/20 font-mono">
              {selectedIds.size}
            </span>
            <span>issue(s) selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {permissions.canChangeTaskStatus && (
              <select
                aria-label="Bulk change status"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    applyBulkPatch({ status: e.target.value as TaskStatus })
                  }
                }}
                className="!py-1 !text-xs !bg-white !text-zinc-900"
              >
                <option value="" disabled>
                  Move status...
                </option>
                {BOARD_COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}

            {permissions.canEditTask && (
              <select
                aria-label="Bulk change priority"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    applyBulkPatch({ priority: e.target.value as TaskPriority })
                  }
                }}
                className="!py-1 !text-xs !bg-white !text-zinc-900"
              >
                <option value="" disabled>
                  Set priority...
                </option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}

            {permissions.canEditTask && sprints.length > 0 && (
              <select
                aria-label="Bulk assign sprint"
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '__backlog__') applyBulkPatch({ sprintId: null })
                  else if (val) applyBulkPatch({ sprintId: val })
                }}
                className="!py-1 !text-xs !bg-white !text-zinc-900"
              >
                <option value="" disabled>
                  Move to sprint...
                </option>
                <option value="__backlog__">Backlog (Remove Sprint)</option>
                {sprints
                  .filter((s) => s.status !== 'completed')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            )}

            {permissions.canDeleteTask && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 font-semibold text-white cursor-pointer"
              >
                Delete
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Sortable Tree Table */}
      <div className="rounded-2xl bg-white dark:bg-[#111117] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50/90 dark:bg-white/[0.03] text-zinc-500 dark:text-zinc-400 uppercase text-[10.5px] font-bold tracking-wider">
            <tr>
              <th className="py-3 pl-4 pr-2 w-9">
                <input
                  type="checkbox"
                  aria-label="Select all issues"
                  checked={tasks.length > 0 && selectedIds.size === tasks.length}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded cursor-pointer"
                />
              </th>
              <th className="py-3 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort('code')}
                  className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <span>Issue</span>
                  {sortField === 'code' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="py-3 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <span>Status</span>
                  {sortField === 'status' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="py-3 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort('priority')}
                  className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <span>Priority</span>
                  {sortField === 'priority' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="py-3 px-3">Assignees</th>
              <th className="py-3 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort('dueDate')}
                  className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <span>Due</span>
                  {sortField === 'dueDate' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="py-3 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort('logged')}
                  className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <span>Logged / Est.</span>
                  {sortField === 'logged' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {topLevelTasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-zinc-400">
                  No issues match your current filters.
                </td>
              </tr>
            ) : (
              topLevelTasks.map((t) => renderRow(t, false))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
