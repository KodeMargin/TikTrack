import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  generateNextTaskCode,
  getDefaultDueDate,
  ISSUE_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  WORK_MODE_OPTIONS,
} from '../types'
import { MemberAvatar } from './StatusPriorityBadges'

export function CreateIssueModal({
  open,
  project,
  allTasks,
  projectTasks,
  projectSprints,
  activeMembers,
  currentUserId,
  defaultStatus = 'backlog',
  defaultSprintId = null,
  defaultParentTaskId = '',
  onClose,
  onCreate,
}: {
  open: boolean
  project: ProjectRecord | undefined
  allTasks: TaskRecord[]
  projectTasks: TaskRecord[]
  projectSprints: SprintRecord[]
  activeMembers: WorkspaceMember[]
  currentUserId: string
  defaultStatus?: TaskRecord['status']
  defaultSprintId?: string | null
  defaultParentTaskId?: string
  onClose: () => void
  onCreate: (input: Omit<TaskRecord, 'id' | 'tenantId' | 'attachments'>) => void
}) {
  const [code, setCode] = useState(() => generateNextTaskCode(project, allTasks))
  const [issueType, setIssueType] = useState<TaskIssueType>(() =>
    defaultParentTaskId ? 'subtask' : 'task'
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
  const [status, setStatus] = useState<TaskRecord['status']>(defaultStatus)
  const [priority, setPriority] = useState<TaskRecord['priority']>('medium')
  const [parentTaskId, setParentTaskId] = useState(defaultParentTaskId)
  const [sprintId, setSprintId] = useState<string>(defaultSprintId ?? '')
  const [estimateMinutes, setEstimateMinutes] = useState(120)
  const [storyPoints, setStoryPoints] = useState<string>('')
  const [defaultWorkMode, setDefaultWorkMode] = useState<WorkMode>('coding')
  const [dueDate, setDueDate] = useState(() => getDefaultDueDate(7))
  const [isBillable, setIsBillable] = useState(true)
  const [labelsInput, setLabelsInput] = useState('')
  const [assignedMemberIds, setAssignedMemberIds] = useState<string[]>(() =>
    activeMembers.some((m) => m.id === currentUserId) ? [currentUserId] : []
  )

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !project) return null

  function toggleMember(memberId: string) {
    setAssignedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!project || !code.trim() || !title.trim()) return

    const parsedLabels = Array.from(
      new Set(
        labelsInput
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)
      )
    )
    const parsedPoints = storyPoints.trim() ? Number(storyPoints) : null

    onCreate({
      projectId: project.id,
      parentTaskId: parentTaskId || undefined,
      sprintId: sprintId || null,
      code: code.trim().toUpperCase(),
      title: title.trim(),
      description: description.trim(),
      acceptanceCriteria:
        acceptanceCriteria.trim() || '1. Implementation verified. 2. Code reviewed & tested.',
      issueType,
      status,
      priority,
      labels: parsedLabels,
      storyPoints: parsedPoints !== null && !Number.isNaN(parsedPoints) ? parsedPoints : null,
      estimateMinutes: Math.max(15, estimateMinutes),
      isBillable,
      defaultWorkMode,
      assignedMemberIds,
      dueDate,
    })

    setTitle('')
    setDescription('')
    setAcceptanceCriteria('')
    setLabelsInput('')
    setStoryPoints('')
    onClose()
  }

  const parentCandidates = projectTasks.filter((t) => !t.parentTaskId)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="dp-popover-enter w-full max-w-2xl rounded-2xl bg-white dark:bg-[#13131b] shadow-(--dp-shadow-popover) overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-100 dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#6d25da]/12 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]">
              {project.code}
            </span>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Create Issue
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create issue modal"
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/[0.07] dark:hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
          {/* Row 1: Issue Type, Key, Status, Priority */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Issue Type
              </label>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value as TaskIssueType)}
                className="w-full"
              >
                {ISSUE_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Issue Key *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 font-mono uppercase"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskRecord['status'])}
                className="w-full"
              >
                {BOARD_COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskRecord['priority'])}
                className="w-full"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Summary / Title */}
          <div className="space-y-1">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Summary *
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Short, action-oriented issue summary..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm"
            />
          </div>

          {/* Row 3: Description */}
          <div className="space-y-1">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Technical context, reproduction steps, or implementation notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 resize-y"
            />
          </div>

          {/* Row 4: Acceptance Criteria */}
          <div className="space-y-1">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Acceptance Criteria
            </label>
            <input
              type="text"
              placeholder="Definition of done used during review & timesheet sign-off..."
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              className="w-full px-3 py-2"
            />
          </div>

          {/* Row 5: Sprint, Parent / Epic, Work Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Sprint
              </label>
              <select
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full"
              >
                <option value="">Backlog (No Sprint)</option>
                {projectSprints
                  .filter((s) => s.status !== 'completed')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Parent / Epic
              </label>
              <select
                value={parentTaskId}
                onChange={(e) => {
                  setParentTaskId(e.target.value)
                  if (e.target.value && issueType === 'task') {
                    setIssueType('subtask')
                  }
                }}
                className="w-full"
              >
                <option value="">Top-Level Issue</option>
                {parentCandidates.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.code} · {pt.title.slice(0, 32)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Default Work Mode
              </label>
              <select
                value={defaultWorkMode}
                onChange={(e) => setDefaultWorkMode(e.target.value as WorkMode)}
                className="w-full capitalize"
              >
                {WORK_MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 6: Estimate, Story Points, Due Date, Labels */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Estimate (min)
              </label>
              <input
                type="number"
                min={15}
                step={15}
                value={estimateMinutes}
                onChange={(e) => setEstimateMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Story Points
              </label>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 3"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                className="w-full px-3 py-2 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Labels (comma)
              </label>
              <input
                type="text"
                placeholder="api, frontend"
                value={labelsInput}
                onChange={(e) => setLabelsInput(e.target.value)}
                className="w-full px-3 py-2"
              />
            </div>
          </div>

          {/* Row 7: Assignees + Billable */}
          <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
            <div className="space-y-1.5 flex-1 min-w-[220px]">
              <label className="block font-semibold text-zinc-600 dark:text-zinc-400">
                Assignees (Active Profiles)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {activeMembers.map((m) => {
                  const selected = assignedMemberIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px] font-medium transition cursor-pointer ${
                        selected
                          ? 'bg-[#6d25da]/14 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#d8c4f8] ring-1 ring-[#6d25da]/30'
                          : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                    >
                      <MemberAvatar name={m.name} id={m.id} size="xs" />
                      <span>{m.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 pt-5 font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span>Billable to Client</span>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] font-semibold text-white cursor-pointer"
            >
              Create Issue
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
