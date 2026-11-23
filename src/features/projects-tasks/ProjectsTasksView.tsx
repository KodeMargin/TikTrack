import { useMemo, useState } from 'react'
import { notifyFeedback } from '@/lib/notify'
import {
  usePhase1Store,
  type TaskIssueType,
  type TaskRecord,
} from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'
import {
  applyBoardFilters,
  DEFAULT_BOARD_FILTERS,
  generateNextTaskCode,
  getActiveMembers,
  getDefaultDueDate,
  type BoardFilters,
  type ProjectPermissions,
  type ProjectTab,
  type SwimlaneMode,
  type TaskStatus,
  type TaskTimeStatsMap,
} from './types'
import { ProjectHeaderBar } from './components/ProjectHeaderBar'
import { BoardFilterToolbar } from './components/BoardFilterToolbar'
import { CreateProjectModal } from './components/CreateProjectModal'
import { CreateIssueModal } from './components/CreateIssueModal'
import { IssueDetailModal } from './components/IssueDetailModal'
import { KanbanBoardView } from './views/KanbanBoardView'
import { BacklogSprintView } from './views/BacklogSprintView'
import { IssueListView } from './views/IssueListView'
import { ProjectSummaryView } from './views/ProjectSummaryView'
import { ProjectTimelineView } from './views/ProjectTimelineView'
import { ProjectSettingsView } from './views/ProjectSettingsView'

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
    updateProject,
    deleteProject,
    upsertProjectMember,
    removeProjectMember,
    sprints,
    createSprint,
    updateSprint,
    deleteSprint,
    tasks,
    createTask,
    updateTask,
    reorderTasks,
    deleteTask,
    assignTaskMembers,
    addTaskAttachment,
    addTaskNote,
    deleteTaskNote,
    timesheetLines,
    auditLogs,
    hasPermission,
  } = usePhase1Store()

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => projects[0]?.id ?? ''
  )
  const [activeTab, setActiveTab] = useState<ProjectTab>('board')
  const [swimlaneMode, setSwimlaneMode] = useState<SwimlaneMode>('none')
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_BOARD_FILTERS)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [showNewIssueModal, setShowNewIssueModal] = useState(false)

  const permissions: ProjectPermissions = useMemo(
    () => ({
      canCreateProject: hasPermission('project:create'),
      canEditProject: hasPermission('project:edit'),
      canDeleteProject: hasPermission('project:delete'),
      canCreateTask: hasPermission('task:create'),
      canEditTask: hasPermission('task:edit'),
      canDeleteTask: hasPermission('task:delete'),
      canAssignTask: hasPermission('task:assign'),
      canChangeTaskStatus: hasPermission('task:status_change'),
      canApproveTask: hasPermission('task:approve'),
      canTrackTimer: hasPermission('timer:start_stop'),
    }),
    [hasPermission]
  )

  const canViewTeamLogs =
    activeUser.role === 'super_admin' ||
    activeUser.role === 'tenant_owner' ||
    hasPermission('timesheet:view_team')

  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId]
  )

  const activeMembers = useMemo(() => getActiveMembers(members), [members])

  const taskCountByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1)
    }
    return map
  }, [tasks])

  const scopedTimesheetLines = useMemo(() => {
    if (canViewTeamLogs) return timesheetLines
    return timesheetLines.filter((l) => l.developerId === activeUser.id)
  }, [canViewTeamLogs, timesheetLines, activeUser.id])

  const taskTimeStats: TaskTimeStatsMap = useMemo(() => {
    const map: TaskTimeStatsMap = new Map()
    for (const line of scopedTimesheetLines) {
      const existing = map.get(line.taskId) ?? {
        loggedMinutes: 0,
        approvedMinutes: 0,
        entries: [],
      }
      existing.loggedMinutes += line.claimedMinutes
      existing.approvedMinutes += line.approvedBillableMinutes
      existing.entries.push(line)
      map.set(line.taskId, existing)
    }
    return map
  }, [scopedTimesheetLines])

  const projectTasks = useMemo(
    () => (currentProject ? tasks.filter((t) => t.projectId === currentProject.id) : []),
    [tasks, currentProject]
  )

  const projectSprints = useMemo(
    () => (currentProject ? sprints.filter((s) => s.projectId === currentProject.id) : []),
    [sprints, currentProject]
  )

  const activeSprint = useMemo(
    () => projectSprints.find((s) => s.status === 'active'),
    [projectSprints]
  )

  const filteredTasks = useMemo(
    () =>
      applyBoardFilters(
        projectTasks,
        filters,
        activeUser.id,
        taskTimeStats,
        projectSprints
      ),
    [projectTasks, filters, activeUser.id, taskTimeStats, projectSprints]
  )

  const backlogCount = useMemo(() => {
    const activeIds = new Set(
      projectSprints.filter((s) => s.status !== 'completed').map((s) => s.id)
    )
    return projectTasks.filter((t) => !t.sprintId || !activeIds.has(t.sprintId)).length
  }, [projectTasks, projectSprints])

  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.id === selectedTaskId) ?? null
    : null

  function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId)
    setFilters((prev) => ({ ...prev, sprintFilter: 'all' }))
  }

  function handleQuickCreateOnBoard(
    status: TaskStatus,
    title: string,
    issueType: TaskIssueType
  ) {
    if (!currentProject) return
    const nextCode = generateNextTaskCode(currentProject, tasks)
    const defaultSprint =
      filters.sprintFilter === 'active_sprint'
        ? activeSprint?.id ?? null
        : filters.sprintFilter !== 'all' && filters.sprintFilter !== 'backlog_only'
          ? filters.sprintFilter
          : activeSprint?.id ?? null

    createTask({
      projectId: currentProject.id,
      sprintId: defaultSprint,
      code: nextCode,
      title,
      description: '',
      acceptanceCriteria: '1. Implementation verified. 2. Code reviewed & tested.',
      issueType,
      status,
      priority: 'medium',
      labels: [],
      storyPoints: null,
      estimateMinutes: 120,
      isBillable: true,
      defaultWorkMode: 'coding',
      assignedMemberIds: activeMembers.some((m) => m.id === activeUser.id)
        ? [activeUser.id]
        : [],
      dueDate: getDefaultDueDate(7),
    })
  }

  function handleQuickCreateInBacklog(
    sprintId: string | null,
    title: string,
    issueType: TaskIssueType
  ) {
    if (!currentProject) return
    const nextCode = generateNextTaskCode(currentProject, tasks)
    createTask({
      projectId: currentProject.id,
      sprintId,
      code: nextCode,
      title,
      description: '',
      acceptanceCriteria: '1. Implementation verified. 2. Code reviewed & tested.',
      issueType,
      status: sprintId ? 'active' : 'backlog',
      priority: 'medium',
      labels: [],
      storyPoints: null,
      estimateMinutes: 120,
      isBillable: true,
      defaultWorkMode: 'coding',
      assignedMemberIds: [],
      dueDate: getDefaultDueDate(10),
    })
  }

  function handleCreateSubtask(parentTask: TaskRecord, title: string) {
    if (!currentProject) return
    const nextCode = generateNextTaskCode(currentProject, tasks)
    createTask({
      projectId: parentTask.projectId,
      parentTaskId: parentTask.id,
      sprintId: parentTask.sprintId ?? null,
      code: nextCode,
      title,
      description: '',
      acceptanceCriteria: 'Subtask deliverables completed and verified.',
      issueType: 'subtask',
      status: 'backlog',
      priority: parentTask.priority,
      labels: [],
      storyPoints: null,
      estimateMinutes: 60,
      isBillable: parentTask.isBillable,
      defaultWorkMode: parentTask.defaultWorkMode,
      assignedMemberIds: parentTask.assignedMemberIds,
      dueDate: parentTask.dueDate || getDefaultDueDate(7),
    })
  }

  function handleApproveTask(task: TaskRecord) {
    updateTask(task.id, { status: 'done' })
    notifyFeedback({
      ok: true,
      text: `Issue ${task.code} acceptance criteria signed off & marked Done.`,
    })
  }

  function handleDeleteTaskWithFeedback(taskId: string) {
    const res = deleteTask(taskId)
    notifyFeedback(res)
  }

  const showFilterBar =
    Boolean(currentProject) &&
    (activeTab === 'board' || activeTab === 'backlog' || activeTab === 'list')

  return (
    <div className="space-y-4">
      {/* Jira-Style Project Header & Tab Navigation */}
      <ProjectHeaderBar
        tenantName={activeTenant.name}
        projects={projects}
        currentProject={currentProject}
        activeSprint={activeSprint}
        taskCountByProject={taskCountByProject}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSelectProject={handleSelectProject}
        onOpenNewProject={() => setShowNewProjectModal(true)}
        onOpenNewIssue={() => setShowNewIssueModal(true)}
        permissions={permissions}
        projectTaskCount={projectTasks.length}
        backlogTaskCount={backlogCount}
      />

      {/* Empty Workspace Onboarding State */}
      {!currentProject ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 bg-white dark:bg-[#111117] p-12 text-center space-y-4">
          <div className="h-12 w-12 mx-auto rounded-2xl bg-[#6d25da]/12 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] flex items-center justify-center font-mono text-lg font-bold">
            +
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Create your first software project
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Organize epics, sprints, drag-and-drop Kanban boards, acceptance sign-offs, and billable time tracking in one unified workspace.
            </p>
          </div>
          {permissions.canCreateProject && (
            <button
              type="button"
              onClick={() => setShowNewProjectModal(true)}
              className="px-4 py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-xs font-semibold text-white cursor-pointer"
            >
              + Create First Project
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Rich Filter & Swimlane Toolbar */}
          {showFilterBar && (
            <BoardFilterToolbar
              filters={filters}
              onChangeFilters={setFilters}
              activeMembers={activeMembers}
              sprints={projectSprints}
              showSwimlanes={activeTab === 'board'}
              swimlaneMode={swimlaneMode}
              onChangeSwimlaneMode={setSwimlaneMode}
              totalCount={projectTasks.length}
              filteredCount={filteredTasks.length}
            />
          )}

          {/* Active Tab Workspace */}
          {activeTab === 'board' && (
            <KanbanBoardView
              project={currentProject}
              tasks={filteredTasks}
              allProjectTasks={projectTasks}
              activeMembers={activeMembers}
              taskTimeStats={taskTimeStats}
              swimlaneMode={swimlaneMode}
              permissions={permissions}
              onSelectTask={setSelectedTaskId}
              onReorderTasks={reorderTasks}
              onQuickCreate={handleQuickCreateOnBoard}
              onLaunchTimer={onLaunchTimerForTask}
            />
          )}

          {activeTab === 'backlog' && (
            <BacklogSprintView
              project={currentProject}
              tasks={filteredTasks}
              sprints={projectSprints}
              activeMembers={activeMembers}
              taskTimeStats={taskTimeStats}
              permissions={permissions}
              onOpenTaskModal={setSelectedTaskId}
              onUpdateTask={updateTask}
              onQuickCreate={handleQuickCreateInBacklog}
              onCreateSprint={(input) => {
                const res = createSprint(input)
                notifyFeedback(res)
              }}
              onUpdateSprint={updateSprint}
              onDeleteSprint={deleteSprint}
              onLaunchTimer={onLaunchTimerForTask}
            />
          )}

          {activeTab === 'list' && (
            <IssueListView
              tasks={filteredTasks}
              sprints={projectSprints}
              activeMembers={activeMembers}
              taskTimeStats={taskTimeStats}
              permissions={permissions}
              onSelectTask={setSelectedTaskId}
              onUpdateTask={updateTask}
              onDeleteTask={handleDeleteTaskWithFeedback}
              onApproveTask={handleApproveTask}
              onLaunchTimer={onLaunchTimerForTask}
            />
          )}

          {activeTab === 'summary' && (
            <ProjectSummaryView
              project={currentProject}
              tasks={projectTasks}
              sprints={projectSprints}
              activeMembers={activeMembers}
              taskTimeStats={taskTimeStats}
              auditLogs={auditLogs}
              onSelectTask={setSelectedTaskId}
            />
          )}

          {activeTab === 'timeline' && (
            <ProjectTimelineView
              tasks={projectTasks}
              sprints={projectSprints}
              taskTimeStats={taskTimeStats}
              onSelectTask={setSelectedTaskId}
            />
          )}

          {activeTab === 'settings' && (
            <ProjectSettingsView
              key={currentProject.id}
              project={currentProject}
              activeMembers={activeMembers}
              permissions={permissions}
              onUpdateProject={updateProject}
              onDeleteProject={async (projectId) => {
                const res = await deleteProject(projectId)
                if (res.ok && !res.archivedOnly) {
                  setActiveTab('board')
                }
                return res
              }}
              onUpsertMember={upsertProjectMember}
              onRemoveMember={removeProjectMember}
              onNotify={notifyFeedback}
            />
          )}
        </>
      )}

      {/* Create Project Portal Modal */}
      <CreateProjectModal
        open={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreate={({ code, name, clientName, description }) => {
          const res = createProject(code, name, clientName, description)
          notifyFeedback(res)
          if (res.ok && res.projectId) {
            setSelectedProjectId(res.projectId)
          }
          return res
        }}
      />

      {/* Create Issue Portal Modal */}
      {showNewIssueModal && currentProject && (
        <CreateIssueModal
          key={`${currentProject.id}-${tasks.length}`}
          open={showNewIssueModal}
          project={currentProject}
          allTasks={tasks}
          projectTasks={projectTasks}
          projectSprints={projectSprints}
          activeMembers={activeMembers}
          currentUserId={activeUser.id}
          defaultSprintId={activeSprint?.id ?? null}
          onClose={() => setShowNewIssueModal(false)}
          onCreate={(input) => {
            const created = createTask(input)
            notifyFeedback({
              ok: true,
              text: `Issue ${created.code} created in ${currentProject?.name ?? 'project'}.`,
            })
          }}
        />
      )}

      {/* Wide 2-Pane Jira Issue Detail Modal */}
      {selectedTask && (
        <IssueDetailModal
          key={selectedTask.id}
          task={selectedTask}
          project={projects.find((p) => p.id === selectedTask.projectId) ?? currentProject}
          projectTasks={tasks.filter((t) => t.projectId === selectedTask.projectId)}
          projectSprints={sprints.filter((s) => s.projectId === selectedTask.projectId)}
          members={members}
          activeUser={activeUser}
          stats={taskTimeStats.get(selectedTask.id)}
          auditLogs={auditLogs}
          permissions={permissions}
          onClose={() => setSelectedTaskId(null)}
          onSelectTask={setSelectedTaskId}
          onUpdateTask={updateTask}
          onDeleteTask={handleDeleteTaskWithFeedback}
          onAssignMembers={assignTaskMembers}
          onAddAttachment={addTaskAttachment}
          onAddNote={(taskId, content) => addTaskNote(taskId, content)}
          onDeleteNote={deleteTaskNote}
          onCreateSubtask={handleCreateSubtask}
          onApproveTask={handleApproveTask}
          onLaunchTimer={onLaunchTimerForTask}
        />
      )}
    </div>
  )
}
