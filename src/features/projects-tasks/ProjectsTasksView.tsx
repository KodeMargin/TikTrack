import { useState } from 'react'
import { createPortal } from 'react-dom'
import { usePhase1Store, type TaskRecord } from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'

const WORK_MODE_OPTIONS: WorkMode[] = [
  'coding',
  'thinking',
  'debugging',
  'research',
  'testing',
  'review',
  'meeting',
  'design',
]

export function ProjectsTasksView({
  onLaunchTimerForTask,
}: {
  onLaunchTimerForTask: (projectId: string, taskId: string, mode: WorkMode) => void
}) {
  const {
    activeTenant,
    activeUser,
    members,
    projects,
    createProject,
    tasks,
    createTask,
    updateTask,
    deleteTask,
    updateTaskStatus,
    assignTaskMembers,
    addTaskAttachment,
    hasPermission,
  } = usePhase1Store()

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ''
  )
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)
  const [attachmentInput, setAttachmentInput] = useState<Record<string, string>>({})

  // Edit task state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCriteria, setEditCriteria] = useState('')
  const [editEstimate, setEditEstimate] = useState(120)
  const [editPriority, setEditPriority] = useState<TaskRecord['priority']>('medium')
  const [editMode, setEditMode] = useState<WorkMode>('coding')

  // Granular action permissions
  const canCreateProject = hasPermission('project:create')

  const canCreateTask = hasPermission('task:create')
  const canEditTask = hasPermission('task:edit')
  const canDeleteTask = hasPermission('task:delete')
  const canAssignTask = hasPermission('task:assign')
  const canChangeTaskStatus = hasPermission('task:status_change')
  const canApproveTask = hasPermission('task:approve')
  const canTrackTimer = hasPermission('timer:start_stop')

  // New project form state
  const [projCode, setProjCode] = useState('')
  const [projName, setProjName] = useState('')
  const [projClient, setProjClient] = useState('')
  const [projDesc, setProjDesc] = useState('')

  // New task form state
  const [taskCode, setTaskCode] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskCriteria, setTaskCriteria] = useState('')
  const [parentTaskId, setParentTaskId] = useState('')
  const [taskEstimate, setTaskEstimate] = useState(120)
  const [taskPriority, setTaskPriority] = useState<TaskRecord['priority']>('high')
  const [taskMode, setTaskMode] = useState<WorkMode>('coding')
  const [taskBillable, setTaskBillable] = useState(true)

  const currentProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0]
  const projectTasks = tasks.filter(
    (t) => !currentProject || t.projectId === currentProject.id
  )
  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null

  function startEditTask(task: TaskRecord) {
    setEditingTaskId(task.id)
    setEditTitle(task.title)
    setEditCriteria(task.acceptanceCriteria)
    setEditEstimate(task.estimateMinutes)
    setEditPriority(task.priority)
    setEditMode(task.defaultWorkMode)
  }

  function handleSaveEditTask(e: React.FormEvent) {
    e.preventDefault()
    if (!editingTaskId || !editTitle.trim()) return
    updateTask(editingTaskId, {
      title: editTitle.trim(),
      acceptanceCriteria: editCriteria.trim(),
      estimateMinutes: editEstimate,
      priority: editPriority,
      defaultWorkMode: editMode,
    })
    setEditingTaskId(null)
    setBanner({ ok: true, text: 'Task specifications updated successfully.' })
  }

  function handleDeleteTask(taskId: string) {
    if (window.confirm('Are you sure you want to delete this task?')) {
      const res = deleteTask(taskId)
      setBanner({ ok: res.ok, text: res.message })
    }
  }

  function handleApproveTask(task: TaskRecord) {
    updateTask(task.id, { status: 'done' })
    setBanner({
      ok: true,
      text: `Task ${task.code} acceptance criteria verified & marked Done.`,
    })
  }

  function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    if (!projCode.trim() || !projName.trim() || !projClient.trim()) return
    const res = createProject(
      projCode.trim(),
      projName.trim(),
      projClient.trim(),
      projDesc.trim()
    )
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) {
      setProjCode('')
      setProjName('')
      setProjClient('')
      setProjDesc('')
      setShowNewProjectModal(false)
    }
  }

  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!currentProject || !taskCode.trim() || !taskTitle.trim()) return
    createTask({
      projectId: currentProject.id,
      parentTaskId: parentTaskId || undefined,
      code: taskCode.trim().toUpperCase(),
      title: taskTitle.trim(),
      acceptanceCriteria:
        taskCriteria.trim() || '1. Unit tests passing. 2. Peer reviewed.',
      status: 'active',
      priority: taskPriority,
      estimateMinutes: taskEstimate,
      isBillable: taskBillable,
      defaultWorkMode: taskMode,
      assignedMemberIds: [activeUser.id],
      dueDate: '2026-11-22',
    })
    setTaskCode('')
    setTaskTitle('')
    setTaskCriteria('')
    setParentTaskId('')
    setShowNewTaskModal(false)
  }

  function toggleTaskAssignee(task: TaskRecord, memberId: string) {
    const exists = task.assignedMemberIds.includes(memberId)
    const next = exists
      ? task.assignedMemberIds.filter((id) => id !== memberId)
      : [...task.assignedMemberIds, memberId]
    assignTaskMembers(task.id, next)
  }

  const columns: { status: TaskRecord['status']; label: string }[] = [
    { status: 'backlog', label: 'Backlog' },
    { status: 'active', label: 'Active Work' },
    { status: 'review', label: 'In Review' },
    { status: 'done', label: 'Done' },
  ]

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            banner.ok
              ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200'
              : 'border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Project Directory Bar */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              {activeTenant.name} Projects
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  viewMode === 'kanban'
                    ? 'bg-[#702fe3] text-white'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Kanban Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#702fe3] text-white'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Task List
              </button>
            </div>

            {canCreateProject && (
              <button
                type="button"
                onClick={() => setShowNewProjectModal((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer"
              >
                + New Project
              </button>
            )}
            {canCreateTask && (
              <button
                type="button"
                onClick={() => setShowNewTaskModal((v) => !v)}
                className="px-3.5 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white cursor-pointer"
              >
                + New Task / Subtask
              </button>
            )}
          </div>
        </div>

        {/* Compact Horizontal Project Switcher (Space-Optimized) */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {projects.map((proj) => {
            const isSelected = currentProject?.id === proj.id
            const count = tasks.filter((t) => t.projectId === proj.id).length
            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => setSelectedProjectId(proj.id)}
                title={proj.description}
                className={`group inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-left transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-[#f6f4fc] dark:bg-[#6d25da]/15 text-zinc-900 dark:text-white shadow-[inset_0_0_0_1px_rgba(109,37,218,0.28)]'
                    : 'bg-zinc-100/70 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08]'
                }`}
              >
                <span className="font-mono text-[11px] font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                  {proj.code}
                </span>
                <span className="text-xs font-semibold truncate max-w-[160px]">
                  {proj.name}
                </span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/90 dark:bg-white/[0.07] text-zinc-500 dark:text-zinc-400">
                  {proj.clientName}
                </span>
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Create Project Inline Drawer */}
        {showNewProjectModal && (
          <form
            onSubmit={handleCreateProject}
            className="rounded-xl border border-[#6d25da]/40 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3"
          >
            <div className="text-xs font-semibold text-[#6d25da] dark:text-[#c5a8f0]">
              New Project
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <input
                type="text"
                placeholder="Project Code (e.g. CORE-API)"
                value={projCode}
                onChange={(e) => setProjCode(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
                required
              />
              <input
                type="text"
                placeholder="Project Name"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
                required
              />
              <input
                type="text"
                placeholder="Client Organization Name"
                value={projClient}
                onChange={(e) => setProjClient(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
                required
              />
            </div>
            <input
              type="text"
              placeholder="Project scope & deliverable summary..."
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewProjectModal(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-[#702fe3] text-xs font-semibold text-white cursor-pointer"
              >
                Save Project
              </button>
            </div>
          </form>
        )}

        {/* Create Task / Subtask Inline Drawer (F1-011, F1-012, F1-014) */}
        {showNewTaskModal && (
          <form
            onSubmit={handleCreateTask}
            className="rounded-xl border border-emerald-500/40 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3"
          >
            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              New Task
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              <input
                type="text"
                placeholder="Task Code (e.g. DEV-410)"
                value={taskCode}
                onChange={(e) => setTaskCode(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white font-mono"
                required
              />
              <input
                type="text"
                placeholder="Task Title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="md:col-span-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
                required
              />
              <select
                value={parentTaskId}
                onChange={(e) => setParentTaskId(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
              >
                <option value="">Top-Level Task (No Parent)</option>
                {projectTasks
                  .filter((pt) => !pt.parentTaskId)
                  .map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      Subtask of {pt.code}
                    </option>
                  ))}
              </select>
              <select
                value={taskMode}
                onChange={(e) => setTaskMode(e.target.value as WorkMode)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
              >
                {WORK_MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    Default Mode: {m.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <input
                type="text"
                placeholder="Acceptance criteria (used by manager during timesheet review)..."
                value={taskCriteria}
                onChange={(e) => setTaskCriteria(e.target.value)}
                className="md:col-span-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={taskEstimate}
                  onChange={(e) => setTaskEstimate(Number(e.target.value))}
                  className="w-28 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white font-mono"
                  title="Estimate in minutes"
                />
                <select
                  value={taskPriority}
                  onChange={(e) =>
                    setTaskPriority(e.target.value as TaskRecord['priority'])
                  }
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-zinc-900 dark:text-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <label className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={taskBillable}
                    onChange={(e) => setTaskBillable(e.target.checked)}
                  />
                  Billable
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewTaskModal(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white cursor-pointer"
              >
                Create Task
              </button>
            </div>
          </form>
        )}

        {/* Edit Task Inline Drawer (Granular: task:edit) */}
        {editingTaskId && (
          <form
            onSubmit={handleSaveEditTask}
            className="rounded-xl border border-[#6d25da]/50 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-[#6d25da] dark:text-[#c5a8f0]">
              <span>Edit Task Specifications & Acceptance Criteria (task:edit)</span>
              <button
                type="button"
                onClick={() => setEditingTaskId(null)}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <input
                type="text"
                placeholder="Task Title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="md:col-span-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
                required
              />
              <select
                value={editMode}
                onChange={(e) => setEditMode(e.target.value as WorkMode)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
              >
                {WORK_MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    Mode: {m.toUpperCase()}
                  </option>
                ))}
              </select>
              <select
                value={editPriority}
                onChange={(e) =>
                  setEditPriority(e.target.value as TaskRecord['priority'])
                }
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <input
                type="text"
                placeholder="Acceptance criteria..."
                value={editCriteria}
                onChange={(e) => setEditCriteria(e.target.value)}
                className="md:col-span-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
              />
              <input
                type="number"
                min={15}
                step={15}
                value={editEstimate}
                onChange={(e) => setEditEstimate(Number(e.target.value))}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white font-mono"
                title="Estimate in minutes"
              />
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setEditingTaskId(null)}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-[#702fe3] font-semibold text-white cursor-pointer hover:bg-[#5f21cc]"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Kanban Board or List View (Jira-style full-height columns) */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 items-stretch">
          {columns.map((col) => {
            const colTasks = projectTasks.filter((t) => t.status === col.status)
            const statusDotClass =
              col.status === 'backlog'
                ? 'bg-zinc-400'
                : col.status === 'active'
                  ? 'bg-[#6d25da] dark:bg-[#a87ce9]'
                  : col.status === 'review'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'

            return (
              <div
                key={col.status}
                className="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-2.5 flex flex-col gap-2.5 h-[calc(100vh-14.5rem)] min-h-[460px]"
              >
                <div className="flex items-center justify-between px-1 pb-1 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                      {col.label}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 shadow-[0_1px_2px_rgba(15,5,31,0.05)]">
                    {colTasks.length}
                  </span>
                </div>

                {colTasks.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-zinc-200/80 dark:border-white/[0.06] text-xs text-zinc-400 dark:text-zinc-500">
                    No tasks
                  </div>
                ) : (
                  <div className="flex-1 space-y-2.5 overflow-y-auto pr-0.5">
                    {colTasks.map((task) => {
                      const parentTask = task.parentTaskId
                        ? tasks.find((p) => p.id === task.parentTaskId)
                        : null
                      const assignedMembers = members.filter(
                        (m) => m.status === 'active' && task.assignedMemberIds.includes(m.id)
                      )

                      return (
                        <div
                          key={task.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedTaskId(task.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setSelectedTaskId(task.id)
                            }
                          }}
                          className="group rounded-xl bg-white dark:bg-[#131319] p-3.5 space-y-2.5 shadow-[0_1px_2px_rgba(15,5,31,0.04),0_4px_12px_-4px_rgba(15,5,31,0.06),0_0_0_1px_rgba(15,5,31,0.05)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_14px_-4px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.06)] hover:shadow-[0_6px_18px_-6px_rgba(109,37,218,0.14),0_0_0_1px_rgba(109,37,218,0.22)] hover:-translate-y-[1px] transition-all duration-150 cursor-pointer"
                        >
                          {/* Compact Header: Code + Priority */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-[11px] font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                                {task.code}
                              </span>
                              {parentTask && (
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400 truncate">
                                  ↳ {parentTask.code}
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                task.priority === 'urgent'
                                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                  : task.priority === 'high'
                                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                    : 'bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300'
                              }`}
                            >
                              {task.priority}
                            </span>
                          </div>

                          {/* Compact Title */}
                          <div className="text-[13px] font-semibold text-zinc-900 dark:text-white leading-snug line-clamp-2 group-hover:text-[#6d25da] dark:group-hover:text-[#c5a8f0] transition-colors">
                            {task.title}
                          </div>

                          {/* Compact Footer: Metadata + Quick Track */}
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <div className="flex items-center gap-1.5 min-w-0 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                              <span>{task.estimateMinutes}m</span>
                              <span>·</span>
                              <span className="text-[#6d25da] dark:text-[#c5a8f0] truncate">
                                {task.defaultWorkMode}
                              </span>
                              {task.attachments.length > 0 && (
                                <>
                                  <span>·</span>
                                  <span>📎 {task.attachments.length}</span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {assignedMembers.length > 0 && (
                                <span
                                  title={assignedMembers.map((m) => m.name).join(', ')}
                                  className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.08] text-[10px] font-semibold text-zinc-700 dark:text-zinc-300"
                                >
                                  {assignedMembers[0].name.split(' ')[0].slice(0, 2).toUpperCase()}
                                  {assignedMembers.length > 1 ? `+${assignedMembers.length - 1}` : ''}
                                </span>
                              )}

                              {canTrackTimer && (
                                <button
                                  type="button"
                                  title="Start Focus Session"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onLaunchTimerForTask(
                                      task.projectId,
                                      task.id,
                                      task.defaultWorkMode
                                    )
                                  }}
                                  className="h-6 px-2 rounded-md bg-[#6d25da]/10 hover:bg-[#6d25da] text-[#6d25da] hover:text-white dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] dark:hover:bg-[#6d25da] dark:hover:text-white text-[10px] font-semibold transition cursor-pointer"
                                >
                                  ▶
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-950/90 text-zinc-500 dark:text-zinc-400 uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Task & Acceptance Criteria</th>
                <th className="py-3 px-4">Work Mode</th>
                <th className="py-3 px-4">Estimate</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {projectTasks.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40">
                  <td className="py-3 px-4 font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                    {t.code}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-zinc-900 dark:text-white">{t.title}</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {t.acceptanceCriteria}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-[#6d25da] dark:text-[#c5a8f0]">
                    {t.defaultWorkMode}
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-700 dark:text-zinc-300">
                    {t.estimateMinutes}m
                  </td>
                  <td className="py-3 px-4 uppercase font-mono text-[11px]">
                    {t.status}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {canEditTask && (
                        <button
                          type="button"
                          title="Edit Task"
                          onClick={() => startEditTask(t)}
                          className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs cursor-pointer"
                        >
                          ✎
                        </button>
                      )}
                      {canDeleteTask && (
                        <button
                          type="button"
                          title="Delete Task"
                          onClick={() => handleDeleteTask(t.id)}
                          className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-rose-100 dark:hover:bg-rose-950 text-zinc-500 dark:text-zinc-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                      {canApproveTask && (t.status === 'review' || t.status === 'active') && (
                        <button
                          type="button"
                          title="Approve Acceptance Criteria"
                          onClick={() => handleApproveTask(t)}
                          className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs cursor-pointer"
                        >
                          ✓ Sign-off
                        </button>
                      )}
                      {canTrackTimer && (
                        <button
                          type="button"
                          onClick={() =>
                            onLaunchTimerForTask(t.projectId, t.id, t.defaultWorkMode)
                          }
                          className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold cursor-pointer text-xs"
                        >
                          ▶ Track
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Clean 2-Column Task Detail Modal (Portal to document.body for full-page backdrop) */}
      {selectedTask &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/45 backdrop-blur-xs"
            onClick={() => setSelectedTaskId(null)}
          >
          <div
            onClick={(e) => e.stopPropagation()}
            className="dp-popover-enter w-full max-w-2xl rounded-2xl bg-white dark:bg-[#131319] shadow-(--dp-shadow-popover) overflow-hidden max-h-[88vh] flex flex-col"
          >
            {/* Top Bar */}
            <div className="px-6 py-3.5 flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 min-w-0">
                <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                  {currentProject?.name ?? 'Project'}
                </span>
                <span>/</span>
                <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                  {selectedTask.code}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {canEditTask && (
                  <button
                    type="button"
                    title="Edit task"
                    onClick={() => {
                      startEditTask(selectedTask)
                      setSelectedTaskId(null)
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/[0.07] dark:hover:text-white transition cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                )}
                {canDeleteTask && (
                  <button
                    type="button"
                    title="Delete task"
                    onClick={() => {
                      handleDeleteTask(selectedTask.id)
                      setSelectedTaskId(null)
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 transition cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTaskId(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/[0.07] dark:hover:text-white transition cursor-pointer"
                  aria-label="Close task details"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 2-Column Body */}
            <div className="grid grid-cols-1 md:grid-cols-12 overflow-y-auto">
              {/* Left Column: Title, Criteria & Links */}
              <div className="md:col-span-7 p-6 space-y-6">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white leading-snug">
                  {selectedTask.title}
                </h3>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Acceptance Criteria
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {selectedTask.acceptanceCriteria}
                  </p>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Links &amp; Attachments
                  </div>
                  {selectedTask.attachments.length > 0 && (
                    <div className="space-y-1.5">
                      {selectedTask.attachments.map((att) => (
                        <div
                          key={att}
                          className="flex items-center gap-2 text-xs font-mono px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 truncate"
                        >
                          <svg className="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          <span className="truncate">{att}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Paste doc or PR URL..."
                      value={attachmentInput[selectedTask.id] ?? ''}
                      onChange={(e) =>
                        setAttachmentInput((prev) => ({
                          ...prev,
                          [selectedTask.id]: e.target.value,
                        }))
                      }
                      className="min-w-0 flex-1 px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = (attachmentInput[selectedTask.id] ?? '').trim()
                        if (!val) return
                        addTaskAttachment(selectedTask.id, val)
                        setAttachmentInput((prev) => ({ ...prev, [selectedTask.id]: '' }))
                      }}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Clean Properties Sidebar */}
              <div className="md:col-span-5 bg-zinc-50/80 dark:bg-white/[0.02] p-6 border-t md:border-t-0 md:border-l border-zinc-100 dark:border-white/[0.06] flex flex-col justify-between gap-6">
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Status</span>
                    <select
                      value={selectedTask.status}
                      disabled={!canChangeTaskStatus}
                      onChange={(e) =>
                        updateTaskStatus(
                          selectedTask.id,
                          e.target.value as TaskRecord['status']
                        )
                      }
                      className={`!py-1 !pl-2.5 !pr-7 !text-xs ${!canChangeTaskStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="backlog">Backlog</option>
                      <option value="active">Active Work</option>
                      <option value="review">In Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Priority</span>
                    <span
                      className={`text-[11px] font-semibold capitalize px-2 py-0.5 rounded-md ${
                        selectedTask.priority === 'urgent'
                          ? 'bg-rose-100/80 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                          : selectedTask.priority === 'high'
                            ? 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            : 'bg-zinc-200/70 dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {selectedTask.priority}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Estimate</span>
                    <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedTask.estimateMinutes} min
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Work Mode</span>
                    <span className="capitalize font-medium text-[#6d25da] dark:text-[#c5a8f0]">
                      {selectedTask.defaultWorkMode}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Billing</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedTask.isBillable ? 'Billable' : 'Non-Billable'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.06] space-y-2">
                    <div className="text-zinc-500 dark:text-zinc-400">Assignees</div>
                    <div className="flex flex-wrap gap-1.5">
                      {members
                        .filter((m) => m.status === 'active')
                        .map((m) => {
                          const assigned = selectedTask.assignedMemberIds.includes(m.id)
                          if (!canAssignTask) {
                            if (!assigned) return null
                            return (
                              <span
                                key={m.id}
                                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#f4effc] dark:bg-[#6d25da]/15 text-[#581eae] dark:text-[#c5a8f0]"
                              >
                                {m.name}
                              </span>
                            )
                          }
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleTaskAssignee(selectedTask, m.id)}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer ${
                                assigned
                                  ? 'bg-[#f4effc] dark:bg-[#6d25da]/20 text-[#581eae] dark:text-[#c5a8f0] shadow-[inset_0_0_0_1px_rgba(109,37,218,0.18)]'
                                  : 'bg-white dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                              }`}
                            >
                              {assigned ? '✓ ' : '+ '}
                              {m.name}
                            </button>
                          )
                        })}
                    </div>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="space-y-2 pt-3 border-t border-zinc-200/70 dark:border-white/[0.06]">
                  {canTrackTimer && (
                    <button
                      type="button"
                      onClick={() => {
                        onLaunchTimerForTask(
                          selectedTask.projectId,
                          selectedTask.id,
                          selectedTask.defaultWorkMode
                        )
                        setSelectedTaskId(null)
                      }}
                      className="w-full py-2 rounded-lg bg-[#6d25da] hover:bg-[#581eae] text-xs font-semibold text-white transition cursor-pointer"
                    >
                      ▶ Track Session
                    </button>
                  )}

                  {canApproveTask &&
                    (selectedTask.status === 'review' || selectedTask.status === 'active') && (
                      <button
                        type="button"
                        onClick={() => handleApproveTask(selectedTask)}
                        className="w-full py-2 rounded-lg bg-zinc-200/70 hover:bg-zinc-200 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition cursor-pointer"
                      >
                        ✓ Sign-off Task
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>,
          document.body
        )}
    </div>
  )
}
