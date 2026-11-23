import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type {
  ProjectRecord,
  SprintRecord,
  TaskIssueType,
  TaskRecord,
  WorkspaceMember,
} from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'
import {
  BOARD_COLUMNS,
  formatDuration,
  formatShortDate,
  getDefaultDueDate,
  sortTasksByBoardOrder,
  type ProjectPermissions,
  type TaskTimeStatsMap,
} from '../types'
import { InlineQuickCreate } from '../components/InlineQuickCreate'
import {
  IssueTypeBadge,
  MemberAvatar,
  PriorityBadge,
  StatusPill,
} from '../components/StatusPriorityBadges'

function DraggableBacklogRow({
  task,
  isSelected,
  assignedMembers,
  loggedMins,
  canDrag,
  canChangeStatus,
  onSelect,
  onStatusChange,
  onMoveSprint,
  availableSprints,
}: {
  task: TaskRecord
  isSelected: boolean
  assignedMembers: WorkspaceMember[]
  loggedMins: number
  canDrag: boolean
  canChangeStatus: boolean
  onSelect: (taskId: string) => void
  onStatusChange: (taskId: string, status: TaskRecord['status']) => void
  onMoveSprint: (taskId: string, sprintId: string | null) => void
  availableSprints: SprintRecord[]
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canDrag,
  })

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.35 : 1 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task.id)}
      className={`group flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
        isSelected
          ? 'bg-[#f4effc] dark:bg-[#6d25da]/20 ring-1 ring-[#6d25da]/40'
          : 'bg-white dark:bg-[#14141c] hover:bg-zinc-50 dark:hover:bg-white/[0.04] ring-1 ring-zinc-950/[0.05] dark:ring-white/[0.06]'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-zinc-300 dark:text-zinc-600 select-none text-[10px]">⋮⋮</span>
        <IssueTypeBadge type={task.issueType ?? 'task'} size="xs" />
        <span className="font-mono text-[11px] font-bold text-[#6d25da] dark:text-[#c5a8f0] shrink-0">
          {task.code}
        </span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
          {task.title}
        </span>
        {(task.labels ?? []).slice(0, 2).map((lbl) => (
          <span
            key={lbl}
            className="hidden md:inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300"
          >
            {lbl}
          </span>
        ))}
      </div>

      <div
        className="flex items-center gap-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="hidden lg:inline-block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          {formatDuration(loggedMins)} / {formatDuration(task.estimateMinutes)}
        </span>

        {task.storyPoints !== null && task.storyPoints !== undefined && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.08] font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
            {task.storyPoints}
          </span>
        )}

        <PriorityBadge priority={task.priority} compact />

        <select
          aria-label={`Change status for ${task.code}`}
          value={task.status}
          disabled={!canChangeStatus}
          onChange={(e) => onStatusChange(task.id, e.target.value as TaskRecord['status'])}
          className="!py-0.5 !pl-2 !pr-6 !text-[11px]"
        >
          {BOARD_COLUMNS.map((c) => (
            <option key={c.status} value={c.status}>
              {c.shortLabel}
            </option>
          ))}
        </select>

        {availableSprints.length > 0 && canChangeStatus && (
          <select
            aria-label={`Assign sprint for ${task.code}`}
            value={task.sprintId ?? ''}
            onChange={(e) => onMoveSprint(task.id, e.target.value || null)}
            className="hidden xl:block !py-0.5 !pl-2 !pr-6 !text-[11px] max-w-[120px]"
          >
            <option value="">Backlog</option>
            {availableSprints.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center -space-x-1 min-w-[24px] justify-end">
          {assignedMembers.slice(0, 2).map((m) => (
            <MemberAvatar key={m.id} name={m.name} id={m.id} size="xs" ring />
          ))}
        </div>
      </div>
    </div>
  )
}

function SprintDropContainer({
  droppableId,
  children,
}: {
  droppableId: string
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl p-4 space-y-3 transition-colors ${
        isOver
          ? 'bg-[#6d25da]/[0.07] dark:bg-[#6d25da]/[0.14] ring-2 ring-[#6d25da]/45'
          : 'bg-[#f1f3f8] dark:bg-white/[0.03] ring-1 ring-zinc-950/[0.05] dark:ring-white/[0.06]'
      }`}
    >
      {children}
    </div>
  )
}

export function BacklogSprintView({
  project,
  tasks,
  sprints,
  activeMembers,
  taskTimeStats,
  permissions,
  onOpenTaskModal,
  onUpdateTask,
  onQuickCreate,
  onCreateSprint,
  onUpdateSprint,
  onDeleteSprint,
  onLaunchTimer,
}: {
  project: ProjectRecord
  tasks: TaskRecord[]
  sprints: SprintRecord[]
  activeMembers: WorkspaceMember[]
  taskTimeStats: TaskTimeStatsMap
  permissions: ProjectPermissions
  onOpenTaskModal: (taskId: string) => void
  onUpdateTask: (taskId: string, patch: Partial<Omit<TaskRecord, 'id' | 'tenantId'>>) => void
  onQuickCreate: (sprintId: string | null, title: string, issueType: TaskIssueType) => void
  onCreateSprint: (input: {
    projectId: string
    name: string
    goal?: string
    startDate?: string | null
    endDate?: string | null
  }) => void
  onUpdateSprint: (
    sprintId: string,
    patch: Partial<Pick<SprintRecord, 'name' | 'goal' | 'status' | 'startDate' | 'endDate'>> & {
      moveIncompleteToSprintId?: string | null
    }
  ) => void
  onDeleteSprint: (sprintId: string) => void
  onLaunchTimer: (projectId: string, taskId: string, mode: WorkMode) => void
}) {
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [showCreateSprint, setShowCreateSprint] = useState(false)
  const [sprintName, setSprintName] = useState('')
  const [sprintGoal, setSprintGoal] = useState('')
  const [sprintStart, setSprintStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [sprintEnd, setSprintEnd] = useState(() => getDefaultDueDate(14))
  const [completingSprint, setCompletingSprint] = useState<SprintRecord | null>(null)
  const [rolloverTargetId, setRolloverTargetId] = useState<string>('')
  const [showCompletedSprints, setShowCompletedSprints] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const activeAndPlannedSprints = sprints.filter((s) => s.status !== 'completed')
  const completedSprints = sprints.filter((s) => s.status === 'completed')
  const sprintIdsSet = new Set(activeAndPlannedSprints.map((s) => s.id))
  const backlogTasks = sortTasksByBoardOrder(
    tasks.filter((t) => !t.sprintId || !sprintIdsSet.has(t.sprintId))
  )
  const previewTask = previewTaskId ? tasks.find((t) => t.id === previewTaskId) ?? null : null
  const draggingTask = draggingId ? tasks.find((t) => t.id === draggingId) ?? null : null

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null)
    if (!permissions.canEditTask && !permissions.canChangeTaskStatus) return
    const { active, over } = e
    if (!over) return
    const taskId = String(active.id)
    const targetId = String(over.id)
    if (targetId === 'drop:backlog') {
      onUpdateTask(taskId, { sprintId: null })
    } else if (targetId.startsWith('drop:sprint:')) {
      const spId = targetId.replace('drop:sprint:', '')
      onUpdateTask(taskId, { sprintId: spId })
    }
  }

  function handleCreateSprintSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nextNum = sprints.length + 1
    onCreateSprint({
      projectId: project.id,
      name: sprintName.trim() || `${project.code} Sprint ${nextNum}`,
      goal: sprintGoal.trim(),
      startDate: sprintStart || null,
      endDate: sprintEnd || null,
    })
    setSprintName('')
    setSprintGoal('')
    setShowCreateSprint(false)
  }

  function handleConfirmCompleteSprint() {
    if (!completingSprint) return
    onUpdateSprint(completingSprint.id, {
      status: 'completed',
      moveIncompleteToSprintId: rolloverTargetId || null,
    })
    setCompletingSprint(null)
    setRolloverTargetId('')
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Main Left Area: Sprints + Backlog */}
        <div className={`${previewTask ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-4`}>
          {/* Top Action Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Drag issues between Sprints and Backlog to plan iterations and capacity.
            </div>
            <div className="flex items-center gap-2">
              {completedSprints.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCompletedSprints((v) => !v)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-xs font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer"
                >
                  {showCompletedSprints ? 'Hide' : 'Show'} Completed ({completedSprints.length})
                </button>
              )}
              {(permissions.canEditProject || permissions.canCreateTask) && (
                <button
                  type="button"
                  onClick={() => {
                    setSprintName(`${project.code} Sprint ${sprints.length + 1}`)
                    setShowCreateSprint((v) => !v)
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-xs font-semibold text-white cursor-pointer"
                >
                  + Create Sprint
                </button>
              )}
            </div>
          </div>

          {/* Inline Create Sprint Form */}
          {showCreateSprint && (
            <form
              onSubmit={handleCreateSprintSubmit}
              className="rounded-2xl border border-[#6d25da]/30 bg-white dark:bg-[#13131b] p-4 space-y-3 text-xs"
            >
              <div className="font-bold text-zinc-900 dark:text-white">New Sprint</div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Sprint name"
                  value={sprintName}
                  onChange={(e) => setSprintName(e.target.value)}
                  className="sm:col-span-2 px-3 py-2"
                />
                <input
                  type="date"
                  value={sprintStart}
                  onChange={(e) => setSprintStart(e.target.value)}
                  className="px-3 py-2"
                />
                <input
                  type="date"
                  value={sprintEnd}
                  onChange={(e) => setSprintEnd(e.target.value)}
                  className="px-3 py-2"
                />
              </div>
              <input
                type="text"
                placeholder="Sprint goal (e.g. Ship v2 billing export & stabilize webhooks)..."
                value={sprintGoal}
                onChange={(e) => setSprintGoal(e.target.value)}
                className="w-full px-3 py-2"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSprint(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-[#6d25da] text-white font-semibold cursor-pointer"
                >
                  Create Sprint
                </button>
              </div>
            </form>
          )}

          {/* Active & Planned Sprints */}
          {activeAndPlannedSprints.map((sprint) => {
            const sprintTasks = sortTasksByBoardOrder(
              tasks.filter((t) => t.sprintId === sprint.id)
            )
            const doneCount = sprintTasks.filter((t) => t.status === 'done').length
            const estMins = sprintTasks.reduce((s, t) => s + t.estimateMinutes, 0)
            const loggedMins = sprintTasks.reduce(
              (s, t) => s + (taskTimeStats.get(t.id)?.loggedMinutes ?? 0),
              0
            )
            const pts = sprintTasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0)

            return (
              <SprintDropContainer key={sprint.id} droppableId={`drop:sprint:${sprint.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white">
                        {sprint.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase ${
                          sprint.status === 'active'
                            ? 'bg-[#6d25da]/15 text-[#581eae] dark:bg-[#6d25da]/30 dark:text-[#d8c4f8]'
                            : 'bg-zinc-200/80 text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300'
                        }`}
                      >
                        {sprint.status}
                      </span>
                      {(sprint.startDate || sprint.endDate) && (
                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
                        </span>
                      )}
                    </div>
                    {sprint.goal && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{sprint.goal}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded-md bg-white dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-200 font-semibold">
                        {doneCount}/{sprintTasks.length} done
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
                        {formatDuration(loggedMins)} / {formatDuration(estMins)}
                      </span>
                      {pts > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-[#6d25da]/10 text-[#6d25da] dark:text-[#c5a8f0] font-bold">
                          {pts} pts
                        </span>
                      )}
                    </div>

                    {sprint.status === 'planned' && (permissions.canEditProject || permissions.canEditTask) && (
                      <button
                        type="button"
                        onClick={() => onUpdateSprint(sprint.id, { status: 'active' })}
                        className="px-3 py-1 rounded-lg bg-[#6d25da] hover:bg-[#581eae] text-white text-xs font-semibold cursor-pointer"
                      >
                        Start Sprint
                      </button>
                    )}
                    {sprint.status === 'active' && (permissions.canEditProject || permissions.canEditTask) && (
                      <button
                        type="button"
                        onClick={() => setCompletingSprint(sprint)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        Complete Sprint
                      </button>
                    )}
                    {permissions.canEditProject && (
                      <button
                        type="button"
                        title="Delete sprint (issues return to backlog)"
                        onClick={() => {
                          if (window.confirm(`Delete "${sprint.name}"? Issues will return to Backlog.`)) {
                            onDeleteSprint(sprint.id)
                          }
                        }}
                        className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {sprintTasks.length === 0 ? (
                    <div className="py-6 text-center rounded-xl border border-dashed border-zinc-300/80 dark:border-white/[0.08] text-xs text-zinc-400">
                      Drag issues from Backlog into {sprint.name} or create one below.
                    </div>
                  ) : (
                    sprintTasks.map((task) => (
                      <DraggableBacklogRow
                        key={task.id}
                        task={task}
                        isSelected={previewTaskId === task.id}
                        assignedMembers={activeMembers.filter((m) =>
                          task.assignedMemberIds.includes(m.id)
                        )}
                        loggedMins={taskTimeStats.get(task.id)?.loggedMinutes ?? 0}
                        canDrag={permissions.canEditTask || permissions.canChangeTaskStatus}
                        canChangeStatus={permissions.canChangeTaskStatus}
                        onSelect={setPreviewTaskId}
                        onStatusChange={(id, status) => onUpdateTask(id, { status })}
                        onMoveSprint={(id, spId) => onUpdateTask(id, { sprintId: spId })}
                        availableSprints={activeAndPlannedSprints}
                      />
                    ))
                  )}
                </div>

                {permissions.canCreateTask && (
                  <InlineQuickCreate
                    compact
                    buttonLabel={`Create issue in ${sprint.name}`}
                    placeholder="Issue summary..."
                    onCreate={(title, issueType) => onQuickCreate(sprint.id, title, issueType)}
                  />
                )}
              </SprintDropContainer>
            )
          })}

          {/* Backlog Container */}
          <SprintDropContainer droppableId="drop:backlog">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-900 dark:text-white">Backlog</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300 font-semibold">
                  {backlogTasks.length} issues
                </span>
              </div>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                Est. {formatDuration(backlogTasks.reduce((s, t) => s + t.estimateMinutes, 0))}
              </span>
            </div>

            <div className="space-y-1.5">
              {backlogTasks.length === 0 ? (
                <div className="py-8 text-center rounded-xl border border-dashed border-zinc-300/80 dark:border-white/[0.08] text-xs text-zinc-400">
                  Backlog is empty. Add upcoming work items below.
                </div>
              ) : (
                backlogTasks.map((task) => (
                  <DraggableBacklogRow
                    key={task.id}
                    task={task}
                    isSelected={previewTaskId === task.id}
                    assignedMembers={activeMembers.filter((m) =>
                      task.assignedMemberIds.includes(m.id)
                    )}
                    loggedMins={taskTimeStats.get(task.id)?.loggedMinutes ?? 0}
                    canDrag={permissions.canEditTask || permissions.canChangeTaskStatus}
                    canChangeStatus={permissions.canChangeTaskStatus}
                    onSelect={setPreviewTaskId}
                    onStatusChange={(id, status) => onUpdateTask(id, { status })}
                    onMoveSprint={(id, spId) => onUpdateTask(id, { sprintId: spId })}
                    availableSprints={activeAndPlannedSprints}
                  />
                ))
              )}
            </div>

            {permissions.canCreateTask && (
              <InlineQuickCreate
                compact
                buttonLabel="Create backlog issue"
                placeholder="What should be tackled next?"
                onCreate={(title, issueType) => onQuickCreate(null, title, issueType)}
              />
            )}
          </SprintDropContainer>

          {/* Completed Sprints Archive */}
          {showCompletedSprints && completedSprints.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-[#111117] p-4 space-y-2 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.06]">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Completed Sprints
              </div>
              {completedSprints.map((sp) => {
                const spCount = tasks.filter((t) => t.sprintId === sp.id).length
                return (
                  <div
                    key={sp.id}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 dark:bg-white/[0.03] text-xs"
                  >
                    <div>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {sp.name}
                      </span>
                      {sp.goal && (
                        <span className="text-zinc-500 dark:text-zinc-400 ml-2">· {sp.goal}</span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      {spCount} shipped
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Split-Pane Quick Preview Drawer */}
        {previewTask && (
          <div className="xl:col-span-4 rounded-2xl bg-white dark:bg-[#13131b] p-5 ring-1 ring-zinc-950/[0.07] dark:ring-white/[0.08] space-y-4 sticky top-20">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <IssueTypeBadge type={previewTask.issueType ?? 'task'} size="sm" />
                <span className="font-mono text-xs font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                  {previewTask.code}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenTaskModal(previewTask.id)}
                  className="px-2.5 py-1 rounded-lg bg-[#6d25da]/10 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#d8c4f8] text-[11px] font-semibold cursor-pointer"
                >
                  Open Full View
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTaskId(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-base font-bold text-zinc-900 dark:text-white leading-snug">
                {previewTask.title}
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={previewTask.status} />
                <PriorityBadge priority={previewTask.priority} />
                <span className="text-[11px] capitalize font-semibold text-[#6d25da] dark:text-[#c5a8f0] px-2 py-0.5 rounded-md bg-[#f4effc] dark:bg-[#6d25da]/20">
                  {previewTask.defaultWorkMode}
                </span>
              </div>
              {previewTask.description && (
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {previewTask.description}
                </p>
              )}
              <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-1 text-xs">
                <div className="text-[10.5px] font-bold uppercase text-zinc-400">
                  Acceptance Criteria
                </div>
                <p className="text-zinc-700 dark:text-zinc-300">{previewTask.acceptanceCriteria}</p>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-zinc-500">Logged / Est.</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">
                  {formatDuration(taskTimeStats.get(previewTask.id)?.loggedMinutes ?? 0)} /{' '}
                  {formatDuration(previewTask.estimateMinutes)}
                </span>
              </div>

              {permissions.canTrackTimer && (
                <button
                  type="button"
                  onClick={() =>
                    onLaunchTimer(
                      previewTask.projectId,
                      previewTask.id,
                      previewTask.defaultWorkMode
                    )
                  }
                  className="w-full py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-xs font-semibold text-white cursor-pointer"
                >
                  ▶ Start Focus Timer
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {draggingTask ? (
          <div className="rounded-xl bg-white dark:bg-[#16161f] px-3.5 py-2.5 shadow-xl ring-2 ring-[#6d25da] flex items-center gap-2 text-xs max-w-md">
            <IssueTypeBadge type={draggingTask.issueType ?? 'task'} size="xs" />
            <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
              {draggingTask.code}
            </span>
            <span className="font-semibold text-zinc-900 dark:text-white truncate">
              {draggingTask.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Complete Sprint Rollover Modal */}
      {completingSprint &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
            onClick={() => setCompletingSprint(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="dp-popover-enter w-full max-w-md rounded-2xl bg-white dark:bg-[#13131b] p-6 shadow-(--dp-shadow-popover) space-y-4 text-xs"
            >
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Complete {completingSprint.name}
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Review sprint completion and choose where unfinished issues should move.
                </p>
              </div>
              {(() => {
                const spTasks = tasks.filter((t) => t.sprintId === completingSprint.id)
                const completedCount = spTasks.filter((t) => t.status === 'done').length
                const incompleteCount = spTasks.length - completedCount
                const nextSprints = activeAndPlannedSprints.filter(
                  (s) => s.id !== completingSprint.id
                )
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-emerald-500/10 p-3">
                        <div className="text-[10.5px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                          Completed
                        </div>
                        <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                          {completedCount}
                        </div>
                      </div>
                      <div className="rounded-xl bg-amber-500/10 p-3">
                        <div className="text-[10.5px] font-bold uppercase text-amber-700 dark:text-amber-300">
                          Open Issues
                        </div>
                        <div className="text-xl font-bold text-amber-700 dark:text-amber-300 font-mono">
                          {incompleteCount}
                        </div>
                      </div>
                    </div>

                    {incompleteCount > 0 && (
                      <div className="space-y-1.5">
                        <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                          Move {incompleteCount} open issue(s) to:
                        </label>
                        <select
                          value={rolloverTargetId}
                          onChange={(e) => setRolloverTargetId(e.target.value)}
                          className="w-full"
                        >
                          <option value="">Backlog</option>
                          {nextSprints.map((ns) => (
                            <option key={ns.id} value={ns.id}>
                              {ns.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingSprint(null)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.07] font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCompleteSprint}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white cursor-pointer"
                >
                  Complete Sprint
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </DndContext>
  )
}
