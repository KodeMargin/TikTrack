import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type {
  ProjectRecord,
  TaskIssueType,
  TaskRecord,
  WorkspaceMember,
} from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'
import {
  BOARD_COLUMNS,
  formatDuration,
  PRIORITY_OPTIONS,
  sortTasksByBoardOrder,
  type ProjectPermissions,
  type SwimlaneMode,
  type TaskStatus,
  type TaskTimeStatsMap,
} from '../types'
import { InlineQuickCreate } from '../components/InlineQuickCreate'
import { IssueCardContent, SortableIssueCard } from '../components/IssueCard'
import { MemberAvatar, PriorityBadge } from '../components/StatusPriorityBadges'

function DroppableColumnBody({
  droppableId,
  children,
  className = '',
}: {
  droppableId: string
  children: React.ReactNode
  className?: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId })
  return (
    <div
      ref={setNodeRef}
      className={`transition-colors rounded-xl ${
        isOver
          ? 'bg-[#6d25da]/[0.07] dark:bg-[#6d25da]/[0.14] ring-2 ring-inset ring-[#6d25da]/40'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

interface SwimlaneBucket {
  id: string
  label: string
  subtitle?: string
  avatar?: { name: string; id: string }
  priority?: TaskRecord['priority']
  tasks: TaskRecord[]
}

export function KanbanBoardView({
  project,
  tasks,
  allProjectTasks,
  activeMembers,
  taskTimeStats,
  swimlaneMode,
  permissions,
  onSelectTask,
  onReorderTasks,
  onQuickCreate,
  onLaunchTimer,
}: {
  project: ProjectRecord
  tasks: TaskRecord[]
  allProjectTasks: TaskRecord[]
  activeMembers: WorkspaceMember[]
  taskTimeStats: TaskTimeStatsMap
  swimlaneMode: SwimlaneMode
  permissions: ProjectPermissions
  onSelectTask: (taskId: string) => void
  onReorderTasks: (
    items: { taskId: string; status?: TaskStatus; boardOrder: number }[]
  ) => void
  onQuickCreate: (status: TaskStatus, title: string, issueType: TaskIssueType) => void
  onLaunchTimer: (projectId: string, taskId: string, mode: WorkMode) => void
}) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>({})

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const taskById = useMemo(
    () => new Map(allProjectTasks.map((t) => [t.id, t])),
    [allProjectTasks]
  )

  const subtaskStatsByParent = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>()
    for (const t of allProjectTasks) {
      if (!t.parentTaskId) continue
      const cur = map.get(t.parentTaskId) ?? { total: 0, done: 0 }
      cur.total += 1
      if (t.status === 'done') cur.done += 1
      map.set(t.parentTaskId, cur)
    }
    return map
  }, [allProjectTasks])

  const wipLimits = project.boardConfig?.wipLimits ?? {}

  const swimlanes: SwimlaneBucket[] = useMemo(() => {
    if (swimlaneMode === 'none') return []

    if (swimlaneMode === 'priority') {
      return PRIORITY_OPTIONS.map((p) => ({
        id: `priority:${p.value}`,
        label: `${p.label} Priority`,
        priority: p.value,
        tasks: tasks.filter((t) => t.priority === p.value),
      })).filter((lane) => lane.tasks.length > 0)
    }

    if (swimlaneMode === 'assignee') {
      const lanes: SwimlaneBucket[] = activeMembers
        .map((m) => ({
          id: `assignee:${m.id}`,
          label: m.name,
          subtitle: m.role.replace(/_/g, ' '),
          avatar: { name: m.name, id: m.id },
          tasks: tasks.filter((t) => t.assignedMemberIds.includes(m.id)),
        }))
        .filter((lane) => lane.tasks.length > 0)

      const unassigned = tasks.filter((t) => t.assignedMemberIds.length === 0)
      if (unassigned.length > 0) {
        lanes.push({
          id: 'assignee:unassigned',
          label: 'Unassigned',
          subtitle: 'Needs owner',
          tasks: unassigned,
        })
      }
      return lanes
    }

    // Group by parent / epic
    const epicsAndParents = allProjectTasks.filter(
      (t) =>
        t.issueType === 'epic' ||
        allProjectTasks.some((child) => child.parentTaskId === t.id)
    )
    const usedIds = new Set<string>()
    const lanes: SwimlaneBucket[] = epicsAndParents
      .map((parent) => {
        const laneTasks = tasks.filter(
          (t) => t.parentTaskId === parent.id || t.id === parent.id
        )
        laneTasks.forEach((t) => usedIds.add(t.id))
        return {
          id: `parent:${parent.id}`,
          label: `${parent.code} · ${parent.title}`,
          subtitle: parent.issueType === 'epic' ? 'Epic' : 'Parent Issue',
          tasks: laneTasks,
        }
      })
      .filter((lane) => lane.tasks.length > 0)

    const standalone = tasks.filter((t) => !usedIds.has(t.id))
    if (standalone.length > 0) {
      lanes.push({
        id: 'parent:standalone',
        label: 'Standalone Issues',
        subtitle: 'No parent linked',
        tasks: standalone,
      })
    }
    return lanes
  }, [swimlaneMode, tasks, activeMembers, allProjectTasks])

  const activeDragTask = activeDragId ? taskById.get(activeDragId) ?? null : null

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null)
    if (!permissions.canChangeTaskStatus) return

    const { active, over } = event
    if (!over) return

    const draggedId = String(active.id)
    const overId = String(over.id)
    if (draggedId === overId) return

    const draggedTask = taskById.get(draggedId)
    if (!draggedTask) return

    // Resolve target status from droppable column ID ("col:active" or "lane:...:col:active") or target task card
    let targetStatus: TaskStatus | null = null
    if (overId.includes('col:')) {
      const statusPart = overId.split('col:').pop() as TaskStatus
      if (BOARD_COLUMNS.some((c) => c.status === statusPart)) {
        targetStatus = statusPart
      }
    } else {
      const overTask = taskById.get(overId)
      if (overTask) {
        targetStatus = overTask.status
      }
    }

    if (!targetStatus) return

    const destColumnTasks = sortTasksByBoardOrder(
      allProjectTasks.filter((t) => t.status === targetStatus && t.id !== draggedId)
    )

    let insertIndex = destColumnTasks.length
    if (!overId.includes('col:')) {
      const overIndex = destColumnTasks.findIndex((t) => t.id === overId)
      if (overIndex >= 0) insertIndex = overIndex
    }

    const updatedDest = [...destColumnTasks]
    updatedDest.splice(insertIndex, 0, { ...draggedTask, status: targetStatus })

    const batchUpdates: { taskId: string; status?: TaskStatus; boardOrder: number }[] =
      updatedDest.map((t, idx) => ({
        taskId: t.id,
        status: targetStatus!,
        boardOrder: idx,
      }))

    if (draggedTask.status !== targetStatus) {
      const srcColumnTasks = sortTasksByBoardOrder(
        allProjectTasks.filter((t) => t.status === draggedTask.status && t.id !== draggedId)
      )
      srcColumnTasks.forEach((t, idx) => {
        batchUpdates.push({
          taskId: t.id,
          status: draggedTask.status,
          boardOrder: idx,
        })
      })
    }

    onReorderTasks(batchUpdates)
  }

  function renderCard(task: TaskRecord) {
    const parentTask = task.parentTaskId ? taskById.get(task.parentTaskId) ?? null : null
    const assignedMembers = activeMembers.filter((m) =>
      task.assignedMemberIds.includes(m.id)
    )
    const sub = subtaskStatsByParent.get(task.id) ?? { total: 0, done: 0 }

    return (
      <SortableIssueCard
        key={task.id}
        task={task}
        parentTask={parentTask}
        subtaskCount={sub.total}
        subtaskDoneCount={sub.done}
        assignedMembers={assignedMembers}
        stats={taskTimeStats.get(task.id)}
        canDrag={permissions.canChangeTaskStatus}
        canTrackTimer={permissions.canTrackTimer}
        onSelect={onSelectTask}
        onLaunchTimer={onLaunchTimer}
      />
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {swimlaneMode === 'none' ? (
        /* STANDARD 4-COLUMN JIRA BOARD */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 items-stretch">
          {BOARD_COLUMNS.map((col) => {
            const colTasks = sortTasksByBoardOrder(
              tasks.filter((t) => t.status === col.status)
            )
            const totalEstMins = colTasks.reduce((s, t) => s + t.estimateMinutes, 0)
            const totalLoggedMins = colTasks.reduce(
              (s, t) => s + (taskTimeStats.get(t.id)?.loggedMinutes ?? 0),
              0
            )
            const wipLimit = wipLimits[col.status]
            const wipExceeded = Boolean(wipLimit && wipLimit > 0 && colTasks.length > wipLimit)

            return (
              <div
                key={col.status}
                className={`rounded-2xl p-2.5 flex flex-col gap-2.5 h-[calc(100vh-16.5rem)] min-h-[480px] transition-colors ${
                  wipExceeded
                    ? 'bg-rose-500/[0.06] dark:bg-rose-950/25 ring-1 ring-rose-500/35'
                    : 'bg-[#eef0f5] dark:bg-white/[0.03] ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.05]'
                }`}
              >
                {/* Column Header */}
                <div className="px-1.5 pt-0.5 pb-1 shrink-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${col.dotClass}`} />
                      <span className="text-[11.5px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200 truncate">
                        {col.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {wipLimit && wipLimit > 0 && (
                        <span
                          title={
                            wipExceeded
                              ? `WIP Limit exceeded (${colTasks.length} / ${wipLimit})`
                              : `WIP Limit: max ${wipLimit}`
                          }
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                            wipExceeded
                              ? 'bg-rose-600 text-white'
                              : 'bg-zinc-200/80 dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          MAX {wipLimit}
                        </span>
                      )}
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-white dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-200 shadow-xs">
                        {colTasks.length}
                      </span>
                    </div>
                  </div>

                  {/* Column Capacity Summary */}
                  <div className="flex items-center justify-between text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400">
                    <span>{formatDuration(totalLoggedMins)} logged</span>
                    <span>Est. {formatDuration(totalEstMins)}</span>
                  </div>
                </div>

                {/* Droppable Cards Container */}
                <DroppableColumnBody
                  droppableId={`col:${col.status}`}
                  className="flex-1 flex flex-col min-h-0 p-0.5"
                >
                  <SortableContext
                    items={colTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex-1 space-y-2.5 overflow-y-auto pr-0.5 pb-1">
                      {colTasks.length === 0 ? (
                        <div className="h-28 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300/80 dark:border-white/[0.08] text-xs text-zinc-400 dark:text-zinc-500 px-3 text-center">
                          <span>Drop issues here</span>
                        </div>
                      ) : (
                        colTasks.map((task) => renderCard(task))
                      )}
                    </div>
                  </SortableContext>
                </DroppableColumnBody>

                {/* Inline Column Quick Create */}
                {permissions.canCreateTask && (
                  <div className="shrink-0 pt-0.5">
                    <InlineQuickCreate
                      compact
                      buttonLabel="Create issue"
                      placeholder={`Add to ${col.label}...`}
                      onCreate={(title, issueType) =>
                        onQuickCreate(col.status, title, issueType)
                      }
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* SWIMLANE GROUPED BOARD */
        <div className="space-y-4">
          {/* Sticky Column Headers Row */}
          <div className="hidden xl:grid xl:grid-cols-4 gap-3.5 px-1">
            {BOARD_COLUMNS.map((col) => {
              const colCount = tasks.filter((t) => t.status === col.status).length
              return (
                <div
                  key={col.status}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-[#111117] shadow-xs ring-1 ring-zinc-950/[0.05] dark:ring-white/[0.06]"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.dotClass}`} />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                      {col.label}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-zinc-500 dark:text-zinc-400">
                    {colCount}
                  </span>
                </div>
              )
            })}
          </div>

          {swimlanes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 p-10 text-center text-xs text-zinc-400">
              No issues match the current filters.
            </div>
          ) : (
            swimlanes.map((lane) => {
              const collapsed = Boolean(collapsedLanes[lane.id])
              return (
                <div
                  key={lane.id}
                  className="rounded-2xl bg-white/80 dark:bg-[#111117] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.07] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedLanes((prev) => ({
                        ...prev,
                        [lane.id]: !prev[lane.id],
                      }))
                    }
                    className="w-full px-4 py-2.5 flex items-center justify-between gap-3 bg-zinc-50/90 dark:bg-white/[0.025] hover:bg-zinc-100/80 dark:hover:bg-white/[0.04] transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <svg
                        className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                      {lane.avatar && (
                        <MemberAvatar name={lane.avatar.name} id={lane.avatar.id} size="sm" />
                      )}
                      {lane.priority && <PriorityBadge priority={lane.priority} />}
                      <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                        {lane.label}
                      </span>
                      {lane.subtitle && (
                        <span className="text-[11px] capitalize text-zinc-500 dark:text-zinc-400">
                          · {lane.subtitle}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-300">
                      {lane.tasks.length} {lane.tasks.length === 1 ? 'issue' : 'issues'}
                    </span>
                  </button>

                  {!collapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 p-3">
                      {BOARD_COLUMNS.map((col) => {
                        const cellTasks = sortTasksByBoardOrder(
                          lane.tasks.filter((t) => t.status === col.status)
                        )
                        return (
                          <DroppableColumnBody
                            key={col.status}
                            droppableId={`lane:${lane.id}:col:${col.status}`}
                            className="rounded-xl bg-[#f1f3f8] dark:bg-white/[0.025] p-2 min-h-[110px] space-y-2"
                          >
                            <div className="xl:hidden flex items-center justify-between text-[10.5px] font-bold uppercase text-zinc-500 px-1 pb-1">
                              <span>{col.label}</span>
                              <span>{cellTasks.length}</span>
                            </div>
                            <SortableContext
                              items={cellTasks.map((t) => t.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {cellTasks.length === 0 ? (
                                <div className="h-16 flex items-center justify-center text-[11px] text-zinc-400/80 border border-dashed border-zinc-300/60 dark:border-white/[0.05] rounded-lg">
                                  —
                                </div>
                              ) : (
                                cellTasks.map((task) => renderCard(task))
                              )}
                            </SortableContext>
                          </DroppableColumnBody>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Drag Overlay Ghost Card */}
      <DragOverlay>
        {activeDragTask ? (
          <div className="w-[290px]">
            <IssueCardContent
              task={activeDragTask}
              parentTask={
                activeDragTask.parentTaskId
                  ? taskById.get(activeDragTask.parentTaskId) ?? null
                  : null
              }
              subtaskCount={subtaskStatsByParent.get(activeDragTask.id)?.total ?? 0}
              subtaskDoneCount={subtaskStatsByParent.get(activeDragTask.id)?.done ?? 0}
              assignedMembers={activeMembers.filter((m) =>
                activeDragTask.assignedMemberIds.includes(m.id)
              )}
              stats={taskTimeStats.get(activeDragTask.id)}
              canTrackTimer={false}
              onSelect={() => {}}
              onLaunchTimer={() => {}}
              isDragOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
