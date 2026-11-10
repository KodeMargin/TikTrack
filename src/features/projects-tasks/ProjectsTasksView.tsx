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
    projects,
    createProject,
    tasks,
    createTask,
    updateTaskStatus,
  } = usePhase1Store()

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ''
  )
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)

  // New project form state
  const [projCode, setProjCode] = useState('')
  const [projName, setProjName] = useState('')
  const [projClient, setProjClient] = useState('')
  const [projDesc, setProjDesc] = useState('')

  // New task form state
  const [taskCode, setTaskCode] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskCriteria, setTaskCriteria] = useState('')
  const [taskEstimate, setTaskEstimate] = useState(120)
  const [taskPriority, setTaskPriority] = useState<TaskRecord['priority']>('high')
  const [taskMode, setTaskMode] = useState<WorkMode>('coding')
  const [taskBillable, setTaskBillable] = useState(true)

  const currentProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0]
  const projectTasks = tasks.filter(
    (t) => !currentProject || t.projectId === currentProject.id
  )

  const canManageProjects =
    activeUser.role === 'tenant_owner' || activeUser.role === 'project_manager'

  function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    if (!projCode.trim() || !projName.trim() || !projClient.trim()) return
    createProject(projCode.trim(), projName.trim(), projClient.trim(), projDesc.trim())
    setProjCode('')
    setProjName('')
    setProjClient('')
    setProjDesc('')
    setShowNewProjectModal(false)
  }

  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!currentProject || !taskCode.trim() || !taskTitle.trim()) return
    createTask({
      projectId: currentProject.id,
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
    setShowNewTaskModal(false)
  }

  const columns: { status: TaskRecord['status']; label: string }[] = [
    { status: 'backlog', label: 'Backlog' },
    { status: 'active', label: 'Active Work' },
    { status: 'review', label: 'In Review' },
    { status: 'done', label: 'Done' },
  ]

  return (
    <div className="space-y-6">
      {/* Project Directory Bar (F1-010) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Milestone 1.2 • Project & Task Management (F1-010 – F1-016)
            </span>
            <h2 className="text-base font-bold text-white mt-0.5">
              {activeTenant.name} — Scoped Engineering Projects
            </h2>
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

            {canManageProjects && (
              <button
                type="button"
                onClick={() => setShowNewProjectModal((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
              >
                + New Project
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNewTaskModal((v) => !v)}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
            >
              + New Task
            </button>
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

        {/* Create Task Inline Drawer (F1-012, F1-014) */}
        {showNewTaskModal && (
          <form
            onSubmit={handleCreateTask}
            className="rounded-xl border border-emerald-500/40 bg-slate-950 p-4 space-y-3"
          >
            <div className="text-xs font-semibold text-emerald-300">
              Create Task with Acceptance Criteria & Default Work Mode (F1-012, F1-014)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
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
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-300">
                          {task.code}
                        </span>
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

                      <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-800/80">
                        <select
                          value={task.status}
                          onChange={(e) =>
                            updateTaskStatus(
                              task.id,
                              e.target.value as TaskRecord['status']
                            )
                          }
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                        >
                          <option value="backlog">Backlog</option>
                          <option value="active">Active</option>
                          <option value="review">Review</option>
                          <option value="done">Done</option>
                        </select>

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
                      </div>
                    </div>
                  ))}
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
                    <button
                      type="button"
                      onClick={() =>
                        onLaunchTimerForTask(t.projectId, t.id, t.defaultWorkMode)
                      }
                      className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold cursor-pointer"
                    >
                      ▶ Track
                    </button>
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

