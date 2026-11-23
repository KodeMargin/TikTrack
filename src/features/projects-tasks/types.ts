import type {
  ProjectRecord,
  SprintRecord,
  TaskIssueType,
  TaskRecord,
  TimesheetLineItem,
  WorkspaceMember,
} from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'

export type ProjectTab =
  | 'board'
  | 'backlog'
  | 'list'
  | 'summary'
  | 'timeline'
  | 'settings'

export type SwimlaneMode = 'none' | 'assignee' | 'priority' | 'parent'

export type TaskStatus = TaskRecord['status']
export type TaskPriority = TaskRecord['priority']

export interface BoardFilters {
  search: string
  assigneeIds: string[]
  onlyMyIssues: boolean
  unassignedOnly: boolean
  priorities: TaskPriority[]
  issueTypes: TaskIssueType[]
  workModes: WorkMode[]
  billable: 'all' | 'billable' | 'non_billable'
  sprintFilter: 'all' | 'active_sprint' | 'backlog_only' | string
  overdueOnly: boolean
  overEstimateOnly: boolean
}

export const DEFAULT_BOARD_FILTERS: BoardFilters = {
  search: '',
  assigneeIds: [],
  onlyMyIssues: false,
  unassignedOnly: false,
  priorities: [],
  issueTypes: [],
  workModes: [],
  billable: 'all',
  sprintFilter: 'all',
  overdueOnly: false,
  overEstimateOnly: false,
}

export interface TaskTimeStats {
  loggedMinutes: number
  approvedMinutes: number
  entries: TimesheetLineItem[]
}

export type TaskTimeStatsMap = Map<string, TaskTimeStats>

export const BOARD_COLUMNS: {
  status: TaskStatus
  label: string
  shortLabel: string
  dotClass: string
  accentTextClass: string
}[] = [
  {
    status: 'backlog',
    label: 'Backlog',
    shortLabel: 'Backlog',
    dotClass: 'bg-zinc-400',
    accentTextClass: 'text-zinc-600 dark:text-zinc-300',
  },
  {
    status: 'active',
    label: 'Active Work',
    shortLabel: 'Active',
    dotClass: 'bg-[#6d25da] dark:bg-[#a87ce9]',
    accentTextClass: 'text-[#581eae] dark:text-[#c5a8f0]',
  },
  {
    status: 'review',
    label: 'In Review',
    shortLabel: 'Review',
    dotClass: 'bg-amber-500',
    accentTextClass: 'text-amber-700 dark:text-amber-300',
  },
  {
    status: 'done',
    label: 'Done',
    shortLabel: 'Done',
    dotClass: 'bg-emerald-500',
    accentTextClass: 'text-emerald-700 dark:text-emerald-300',
  },
]

export const WORK_MODE_OPTIONS: WorkMode[] = [
  'coding',
  'thinking',
  'debugging',
  'research',
  'testing',
  'review',
  'meeting',
  'design',
]

export const ISSUE_TYPE_OPTIONS: { value: TaskIssueType; label: string }[] = [
  { value: 'epic', label: 'Epic' },
  { value: 'story', label: 'Story' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'subtask', label: 'Subtask' },
]

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string; rank: number }[] = [
  { value: 'urgent', label: 'Urgent', rank: 4 },
  { value: 'high', label: 'High', rank: 3 },
  { value: 'medium', label: 'Medium', rank: 2 },
  { value: 'low', label: 'Low', rank: 1 },
]

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatShortDate(isoDate?: string | null): string {
  if (!isoDate) return ''
  const parts = isoDate.slice(0, 10).split('-')
  if (parts.length !== 3) return isoDate
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mIdx = Number(parts[1]) - 1
  const day = Number(parts[2])
  if (mIdx < 0 || mIdx > 11 || Number.isNaN(day)) return isoDate
  return `${months[mIdx]} ${day}`
}

export function getDefaultDueDate(daysAhead = 7): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

export function isTaskOverdue(task: TaskRecord): boolean {
  if (!task.dueDate || task.status === 'done') return false
  const today = new Date().toISOString().slice(0, 10)
  return task.dueDate.slice(0, 10) < today
}

export function generateNextTaskCode(project: ProjectRecord | undefined, allTasks: TaskRecord[]): string {
  const prefix = (project?.code || 'TASK')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'TASK'
  const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i')
  let maxNum = 100
  for (const t of allTasks) {
    const match = t.code.match(regex)
    if (match) {
      const num = Number(match[1])
      if (num > maxNum) maxNum = num
    }
  }
  return `${prefix}-${maxNum + 1}`
}

export function getMemberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function sortTasksByBoardOrder(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((a, b) => {
    const orderDiff = (a.boardOrder ?? 0) - (b.boardOrder ?? 0)
    if (orderDiff !== 0) return orderDiff
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  })
}

export function countActiveFilters(filters: BoardFilters): number {
  let count = 0
  if (filters.search.trim()) count++
  if (filters.assigneeIds.length > 0) count++
  if (filters.onlyMyIssues) count++
  if (filters.unassignedOnly) count++
  if (filters.priorities.length > 0) count++
  if (filters.issueTypes.length > 0) count++
  if (filters.workModes.length > 0) count++
  if (filters.billable !== 'all') count++
  if (filters.sprintFilter !== 'all') count++
  if (filters.overdueOnly) count++
  if (filters.overEstimateOnly) count++
  return count
}

export function applyBoardFilters(
  tasks: TaskRecord[],
  filters: BoardFilters,
  activeUserId: string,
  taskTimeStats: TaskTimeStatsMap,
  projectSprints: SprintRecord[]
): TaskRecord[] {
  const q = filters.search.trim().toLowerCase()
  const activeSprintIds = new Set(
    projectSprints.filter((s) => s.status === 'active').map((s) => s.id)
  )

  return tasks.filter((task) => {
    if (q) {
      const hay = [
        task.code,
        task.title,
        task.description ?? '',
        task.acceptanceCriteria,
        ...(task.labels ?? []),
      ]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }

    if (filters.onlyMyIssues && !task.assignedMemberIds.includes(activeUserId)) {
      return false
    }
    if (filters.unassignedOnly && task.assignedMemberIds.length > 0) {
      return false
    }
    if (
      filters.assigneeIds.length > 0 &&
      !filters.assigneeIds.some((id) => task.assignedMemberIds.includes(id))
    ) {
      return false
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) {
      return false
    }
    const effectiveType: TaskIssueType =
      task.issueType ?? (task.parentTaskId ? 'subtask' : 'task')
    if (filters.issueTypes.length > 0 && !filters.issueTypes.includes(effectiveType)) {
      return false
    }
    if (filters.workModes.length > 0 && !filters.workModes.includes(task.defaultWorkMode)) {
      return false
    }
    if (filters.billable === 'billable' && !task.isBillable) return false
    if (filters.billable === 'non_billable' && task.isBillable) return false

    if (filters.sprintFilter === 'active_sprint') {
      if (!task.sprintId || !activeSprintIds.has(task.sprintId)) return false
    } else if (filters.sprintFilter === 'backlog_only') {
      if (task.sprintId) return false
    } else if (filters.sprintFilter !== 'all') {
      if (task.sprintId !== filters.sprintFilter) return false
    }

    if (filters.overdueOnly && !isTaskOverdue(task)) return false
    if (filters.overEstimateOnly) {
      const logged = taskTimeStats.get(task.id)?.loggedMinutes ?? 0
      if (!(task.estimateMinutes > 0 && logged > task.estimateMinutes)) return false
    }

    return true
  })
}

export interface ProjectPermissions {
  canCreateProject: boolean
  canEditProject: boolean
  canDeleteProject: boolean
  canCreateTask: boolean
  canEditTask: boolean
  canDeleteTask: boolean
  canAssignTask: boolean
  canChangeTaskStatus: boolean
  canApproveTask: boolean
  canTrackTimer: boolean
}

export function getActiveMembers(members: WorkspaceMember[]): WorkspaceMember[] {
  return members.filter((m) => m.status === 'active' && !m.mustChangePassword)
}
