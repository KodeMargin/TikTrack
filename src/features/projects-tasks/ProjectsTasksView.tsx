import { useState } from 'react'
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
              ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
              : 'border-rose-700 bg-rose-950/60 text-rose-200'
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {activeTenant.name} Projects
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Organize engineering tasks, estimates, and launch focus sessions directly from a card.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  viewMode === 'kanban'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Kanban Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Task List
              </button>
            </div>

            {canCreateProject && (
              <button
                type="button"
                onClick={() => setShowNewProjectModal((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
              >
                + New Project
              </button>
            )}
            {canCreateTask && (
              <button
                type="button"
                onClick={() => setShowNewTaskModal((v) => !v)}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
              >
                + New Task / Subtask
              </button>
            )}
          </div>
        </div>

        {/* Project Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {projects.map((proj) => {
            const isSelected = currentProject?.id === proj.id
            const count = tasks.filter((t) => t.projectId === proj.id).length
            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => setSelectedProjectId(proj.id)}
                className={`text-left p-4 rounded-xl border transition cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-950/40 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-indigo-300">
                    {proj.code}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                    {proj.clientName}
                  </span>
                </div>
                <div className="text-sm font-semibold mt-1.5">{proj.name}</div>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {proj.description}
                </p>
                <div className="text-[11px] font-mono text-slate-400 mt-2">
                  {count} assigned tasks • Tenant RLS Isolated
                </div>
              </button>
            )
          })}
        </div>

        {/* Create Project Inline Drawer */}
        {showNewProjectModal && (
          <form
            onSubmit={handleCreateProject}
            className="rounded-xl border border-indigo-500/40 bg-slate-950 p-4 space-y-3"
          >
            <div className="text-xs font-semibold text-indigo-300">
              Create New Client Project (F1-010)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <input
                type="text"
                placeholder="Project Code (e.g. CORE-API)"
                value={projCode}
                onChange={(e) => setProjCode(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                required
              />
              <input
                type="text"
                placeholder="Project Name"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                required
              />
              <input
                type="text"
                placeholder="Client Organization Name"
                value={projClient}
                onChange={(e) => setProjClient(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                required
              />
            </div>
            <input
              type="text"
              placeholder="Project scope & deliverable summary..."
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewProjectModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white cursor-pointer"
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
            className="rounded-xl border border-emerald-500/40 bg-slate-950 p-4 space-y-3"
          >
            <div className="text-xs font-semibold text-emerald-300">
              Create Task or Subtask with Acceptance Criteria & Default Work Mode (F1-011, F1-012, F1-014)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              <input
                type="text"
                placeholder="Task Code (e.g. DEV-410)"
                value={taskCode}
                onChange={(e) => setTaskCode(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white font-mono"
                required
              />
              <input
                type="text"
                placeholder="Task Title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                required
              />
              <select
                value={parentTaskId}
                onChange={(e) => setParentTaskId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
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
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
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
                className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={taskEstimate}
                  onChange={(e) => setTaskEstimate(Number(e.target.value))}
                  className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white font-mono"
                  title="Estimate in minutes"
                />
                <select
                  value={taskPriority}
                  onChange={(e) =>
                    setTaskPriority(e.target.value as TaskRecord['priority'])
                  }
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <label className="inline-flex items-center gap-1.5 text-slate-300">
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
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
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
            className="rounded-xl border border-indigo-500/50 bg-slate-950 p-4 space-y-3"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-300">
              <span>Edit Task Specifications & Acceptance Criteria (task:edit)</span>
              <button
                type="button"
                onClick={() => setEditingTaskId(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
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
                className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                required
              />
              <select
                value={editMode}
                onChange={(e) => setEditMode(e.target.value as WorkMode)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
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
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
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
                className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              />
              <input
                type="number"
                min={15}
                step={15}
                value={editEstimate}
                onChange={(e) => setEditEstimate(Number(e.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white font-mono"
                title="Estimate in minutes"
              />
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setEditingTaskId(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 font-semibold text-white cursor-pointer hover:bg-indigo-500"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Kanban Board or List View (F1-011, F1-016) */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map((col) => {
            const colTasks = projectTasks.filter((t) => t.status === col.status)
            return (
              <div
                key={col.status}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    {col.label}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {colTasks.map((task) => {
                    const parentTask = task.parentTaskId
                      ? tasks.find((p) => p.id === task.parentTaskId)
                      : null

                    return (
                      <div
                        key={task.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-indigo-300">
                              {task.code}
                            </span>
                            {parentTask && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                ↳ {parentTask.code}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                                task.priority === 'urgent'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : task.priority === 'high'
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                    : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {task.priority}
                            </span>
                            {canEditTask && (
                              <button
                                type="button"
                                title="Edit Task Specifications (task:edit)"
                                onClick={() => startEditTask(task)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] cursor-pointer"
                              >
                                ✎
                              </button>
                            )}
                            {canDeleteTask && (
                              <button
                                type="button"
                                title="Delete Task (task:delete)"
                                onClick={() => handleDeleteTask(task.id)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 text-[10px] cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="text-xs font-semibold text-white leading-snug">
                          {task.title}
                        </div>

                        <div className="rounded-lg bg-slate-900/90 border border-slate-800/80 p-2 text-[11px] text-slate-400">
                          <strong className="text-slate-300 block mb-0.5">
                            Acceptance Criteria:
                          </strong>
                          {task.acceptanceCriteria}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400 font-mono">
                          <span>Est: {task.estimateMinutes}m</span>
                          <span className="text-indigo-300">
                            Mode: {task.defaultWorkMode}
                          </span>
                          <span>{task.isBillable ? 'Billable' : 'Non-Billable'}</span>
                        </div>

                        {/* Contributors Assignment Picker (F1-013) */}
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                            Assigned Contributors (F1-013):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {members
                              .filter((m) => m.status === 'active')
                              .map((m) => {
                                const assigned = task.assignedMemberIds.includes(m.id)
                                if (!canAssignTask) {
                                  if (!assigned) return null
                                  return (
                                    <span
                                      key={m.id}
                                      className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950/70 border border-indigo-800/70 text-indigo-300"
                                    >
                                      ✓ {m.name.split(' ')[0]}
                                    </span>
                                  )
                                }
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => toggleTaskAssignee(task, m.id)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer ${
                                      assigned
                                        ? 'bg-indigo-950 text-indigo-200 border-indigo-700'
                                        : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                                    }`}
                                  >
                                    {assigned ? '✓ ' : '+ '}
                                    {m.name.split(' ')[0]}
                                  </button>
                                )
                              })}
                          </div>
                        </div>

                        {/* Attachments & Links (F1-015) */}
                        <div className="space-y-1">
                          {task.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {task.attachments.map((att) => (
                                <span
                                  key={att}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400"
                                >
                                  📎 {att}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="Attach doc/PR link (F1-015)..."
                              value={attachmentInput[task.id] ?? ''}
                              onChange={(e) =>
                                setAttachmentInput((prev) => ({
                                  ...prev,
                                  [task.id]: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const val = (attachmentInput[task.id] ?? '').trim()
                                if (!val) return
                                addTaskAttachment(task.id, val)
                                setAttachmentInput((prev) => ({ ...prev, [task.id]: '' }))
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer"
                            >
                              + Attach
                            </button>
                          </div>
                        </div>

                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={task.status}
                              disabled={!canChangeTaskStatus}
                              onChange={(e) =>
                                updateTaskStatus(
                                  task.id,
                                  e.target.value as TaskRecord['status']
                                )
                              }
                              className={`rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 ${
                                !canChangeTaskStatus ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              title={!canChangeTaskStatus ? 'Missing task:status_change permission' : undefined}
                            >
                              <option value="backlog">Backlog</option>
                              <option value="active">Active</option>
                              <option value="review">Review</option>
                              <option value="done">Done</option>
                            </select>

                            {canApproveTask && (task.status === 'review' || task.status === 'active') && (
                              <button
                                type="button"
                                onClick={() => handleApproveTask(task)}
                                title="Approve Acceptance Criteria & Sign-off Task (task:approve)"
                                className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-500 text-[10px] font-semibold text-white transition cursor-pointer"
                              >
                                ✓ Sign-off
                              </button>
                            )}
                          </div>

                          {canTrackTimer && (
                            <button
                              type="button"
                              onClick={() =>
                                onLaunchTimerForTask(
                                  task.projectId,
                                  task.id,
                                  task.defaultWorkMode
                                )
                              }
                              className="px-2.5 py-1 rounded bg-emerald-600/90 hover:bg-emerald-500 text-[11px] font-semibold text-white transition cursor-pointer"
                            >
                              ▶ Track Session
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/90 text-slate-400 uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Task & Acceptance Criteria</th>
                <th className="py-3 px-4">Work Mode</th>
                <th className="py-3 px-4">Estimate</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {projectTasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-950/40">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-300">
                    {t.code}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{t.title}</div>
                    <div className="text-[11px] text-slate-400">
                      {t.acceptanceCriteria}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-indigo-300">
                    {t.defaultWorkMode}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
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
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                        >
                          ✎
                        </button>
                      )}
                      {canDeleteTask && (
                        <button
                          type="button"
                          title="Delete Task"
                          onClick={() => handleDeleteTask(t.id)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 text-xs cursor-pointer"
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
    </div>
  )
}
