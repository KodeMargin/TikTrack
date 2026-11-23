import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TaskRecord, WorkspaceMember } from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'
import {
  formatDuration,
  formatShortDate,
  isTaskOverdue,
  type TaskTimeStats,
} from '../types'
import { IssueTypeBadge, MemberAvatar, PriorityBadge } from './StatusPriorityBadges'

export interface IssueCardProps {
  task: TaskRecord
  parentTask?: TaskRecord | null
  subtaskCount: number
  subtaskDoneCount: number
  assignedMembers: WorkspaceMember[]
  stats?: TaskTimeStats
  canDrag: boolean
  canTrackTimer: boolean
  onSelect: (taskId: string) => void
  onLaunchTimer: (projectId: string, taskId: string, mode: WorkMode) => void
  isDragOverlay?: boolean
}

export function IssueCardContent({
  task,
  parentTask,
  subtaskCount,
  subtaskDoneCount,
  assignedMembers,
  stats,
  canTrackTimer,
  onSelect,
  onLaunchTimer,
  isDragOverlay = false,
}: Omit<IssueCardProps, 'canDrag'>) {
  const loggedMins = stats?.loggedMinutes ?? 0
  const progressPct =
    task.estimateMinutes > 0
      ? Math.min(100, Math.round((loggedMins / task.estimateMinutes) * 100))
      : 0
  const isOverEstimate =
    task.estimateMinutes > 0 && loggedMins > task.estimateMinutes
  const overdue = isTaskOverdue(task)
  const commentCount = task.notes?.filter((n) => n.contentMarkdown.trim().length > 0).length ?? 0
  const labels = task.labels ?? []

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(task.id)
        }
      }}
      className={`group rounded-xl bg-white dark:bg-[#14141b] p-3 space-y-2.5 select-none transition-all duration-150 cursor-pointer ${
        isDragOverlay
          ? 'shadow-[0_18px_40px_-10px_rgba(109,37,218,0.28),0_0_0_1.5px_rgba(109,37,218,0.5)] rotate-[1.2deg] scale-[1.02]'
          : 'shadow-[0_1px_2px_rgba(15,5,31,0.05),0_0_0_1px_rgba(15,5,31,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_-2px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.06)] hover:shadow-[0_6px_18px_-6px_rgba(109,37,218,0.16),0_0_0_1px_rgba(109,37,218,0.28)] hover:-translate-y-[1px]'
      }`}
    >
      {/* Row 1: Issue Type + Key + Parent + Priority & Story Points */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <IssueTypeBadge
            type={task.issueType ?? (task.parentTaskId ? 'subtask' : 'task')}
            size="xs"
          />
          <span className="font-mono text-[11px] font-bold text-[#6d25da] dark:text-[#c5a8f0] shrink-0">
            {task.code}
          </span>
          {parentTask && (
            <span
              title={`Parent: ${parentTask.code} ${parentTask.title}`}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400 truncate max-w-[90px]"
            >
              ↳ {parentTask.code}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {task.storyPoints !== null && task.storyPoints !== undefined && (
            <span
              title={`${task.storyPoints} story points`}
              className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-zinc-100 dark:bg-white/[0.08] font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-300"
            >
              {task.storyPoints}
            </span>
          )}
          <PriorityBadge priority={task.priority} compact />
        </div>
      </div>

      {/* Row 2: Title */}
      <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2 group-hover:text-[#6d25da] dark:group-hover:text-[#d8c4f8] transition-colors">
        {task.title}
      </div>

      {/* Row 3: Labels */}
      {labels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {labels.slice(0, 3).map((label) => (
            <span
              key={label}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#f4effc] text-[#581eae] dark:bg-[#6d25da]/20 dark:text-[#c5a8f0] truncate max-w-[110px]"
            >
              {label}
            </span>
          ))}
          {labels.length > 3 && (
            <span className="text-[10px] font-medium text-zinc-400">
              +{labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Row 4: TikTrack Time Progress Strip */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10.5px] font-mono">
          <span
            className={
              isOverEstimate
                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                : loggedMins > 0
                  ? 'text-zinc-700 dark:text-zinc-200 font-semibold'
                  : 'text-zinc-400 dark:text-zinc-500'
            }
          >
            {formatDuration(loggedMins)} logged
          </span>
          <span className="text-zinc-400 dark:text-zinc-500">
            Est. {formatDuration(task.estimateMinutes)}
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isOverEstimate
                ? 'bg-rose-500'
                : task.status === 'done'
                  ? 'bg-emerald-500'
                  : 'bg-[#6d25da]'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Row 5: Metadata Chips + Assignees + Quick Focus Timer */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0 text-[10.5px] text-zinc-500 dark:text-zinc-400">
          <span className="capitalize font-medium text-[#6d25da] dark:text-[#c5a8f0]">
            {task.defaultWorkMode}
          </span>

          {task.dueDate && (
            <span
              title={overdue ? 'Overdue' : `Due ${task.dueDate}`}
              className={`font-mono px-1.5 py-0.5 rounded ${
                overdue
                  ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400 font-semibold'
                  : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {formatShortDate(task.dueDate)}
            </span>
          )}

          {subtaskCount > 0 && (
            <span
              title={`${subtaskDoneCount} of ${subtaskCount} subtasks completed`}
              className={`inline-flex items-center gap-0.5 font-mono ${
                subtaskDoneCount === subtaskCount
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : ''
              }`}
            >
              ✓ {subtaskDoneCount}/{subtaskCount}
            </span>
          )}

          {commentCount > 0 && (
            <span title={`${commentCount} comments`} className="font-mono">
              💬 {commentCount}
            </span>
          )}

          {task.attachments.length > 0 && (
            <span title={`${task.attachments.length} links/attachments`} className="font-mono">
              📎 {task.attachments.length}
            </span>
          )}

          {task.isBillable && (
            <span
              title="Billable task"
              className="font-mono text-emerald-600 dark:text-emerald-400 font-bold"
            >
              $
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {assignedMembers.length > 0 && (
            <div className="flex items-center -space-x-1.5">
              {assignedMembers.slice(0, 2).map((m) => (
                <MemberAvatar key={m.id} name={m.name} id={m.id} size="xs" ring />
              ))}
              {assignedMembers.length > 2 && (
                <span className="h-5 w-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-[9px] font-bold text-zinc-700 dark:text-zinc-200 flex items-center justify-center ring-2 ring-white dark:ring-[#14141b]">
                  +{assignedMembers.length - 2}
                </span>
              )}
            </div>
          )}

          {canTrackTimer && (
            <button
              type="button"
              title="Start Focus Timer on this task"
              onClick={(e) => {
                e.stopPropagation()
                onLaunchTimer(task.projectId, task.id, task.defaultWorkMode)
              }}
              className="h-6 px-2 rounded-md bg-[#6d25da]/10 hover:bg-[#6d25da] text-[#6d25da] hover:text-white dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] dark:hover:bg-[#6d25da] dark:hover:text-white text-[10px] font-semibold transition active:scale-95 cursor-pointer"
            >
              ▶
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function SortableIssueCard(props: IssueCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.task.id,
    disabled: !props.canDrag,
    data: {
      type: 'task',
      task: props.task,
    },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <IssueCardContent {...props} />
    </div>
  )
}
