import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  AuditLogEntry,
  ProjectRecord,
  SprintRecord,
  TaskIssueType,
  TaskRecord,
  WorkspaceMember,
} from '@/context/Phase1Store'
import { usePhase2Store } from '@/context/Phase2Store'
import type { WorkMode } from '@/types/domain.types'
import {
  BOARD_COLUMNS,
  formatDuration,
  formatShortDate,
  ISSUE_TYPE_OPTIONS,
  isTaskOverdue,
  PRIORITY_OPTIONS,
  WORK_MODE_OPTIONS,
  type ProjectPermissions,
  type TaskTimeStats,
} from '../types'
import { IssueTypeBadge, MemberAvatar, PriorityBadge } from './StatusPriorityBadges'
import { Select } from '@/components/Select'

export function IssueDetailModal({
  task,
  project,
  projectTasks,
  projectSprints,
  members,
  activeUser,
  stats,
  auditLogs,
  permissions,
  onClose,
  onSelectTask,
  onUpdateTask,
  onDeleteTask,
  onAssignMembers,
  onAddAttachment,
  onAddNote,
  onDeleteNote,
  onCreateSubtask,
  onApproveTask,
  onLaunchTimer,
}: {
  task: TaskRecord
  project: ProjectRecord | undefined
  projectTasks: TaskRecord[]
  projectSprints: SprintRecord[]
  members: WorkspaceMember[]
  activeUser: WorkspaceMember
  stats?: TaskTimeStats
  auditLogs: AuditLogEntry[]
  permissions: ProjectPermissions
  onClose: () => void
  onSelectTask: (taskId: string) => void
  onUpdateTask: (taskId: string, patch: Partial<Omit<TaskRecord, 'id' | 'tenantId'>>) => void
  onDeleteTask: (taskId: string) => void
  onAssignMembers: (taskId: string, memberIds: string[]) => void
  onAddAttachment: (taskId: string, urlOrFile: string) => void
  onAddNote: (taskId: string, content: string) => void
  onDeleteNote: (taskId: string, noteId: string) => void
  onCreateSubtask: (parentTask: TaskRecord, title: string) => void
  onApproveTask: (task: TaskRecord) => void
  onLaunchTimer: (projectId: string, taskId: string, mode: WorkMode) => void
}) {
  const { evidenceArtifacts } = usePhase2Store()

  // Inline editing states
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState(task.description ?? '')
  const [editingCriteria, setEditingCriteria] = useState(false)
  const [criteriaDraft, setCriteriaDraft] = useState(task.acceptanceCriteria)

  // Subtask, comment, attachment, label inputs
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [commentText, setCommentText] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')
  const [labelDraft, setLabelDraft] = useState('')
  const [activityTab, setActivityTab] = useState<'comments' | 'worklogs' | 'history'>('comments')
  const [copiedKey, setCopiedKey] = useState(false)

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const parentTask = task.parentTaskId
    ? projectTasks.find((t) => t.id === task.parentTaskId) ?? null
    : null
  const subtasks = projectTasks.filter((t) => t.parentTaskId === task.id)
  const subtasksDone = subtasks.filter((t) => t.status === 'done').length
  const subtaskPct = subtasks.length > 0 ? Math.round((subtasksDone / subtasks.length) * 100) : 0

  const activeMembers = members.filter((m) => m.status === 'active' && !m.mustChangePassword)
  const linkedEvidence = evidenceArtifacts.filter(
    (ev) => ev.taskId === task.id || ev.taskCode.toUpperCase() === task.code.toUpperCase()
  )
  const taskAuditHistory = auditLogs.filter(
    (a) =>
      a.targetEntity.includes(task.code) ||
      a.targetEntity.includes(task.id) ||
      a.reason.includes(task.code)
  )

  const loggedMins = stats?.loggedMinutes ?? 0
  const approvedMins = stats?.approvedMinutes ?? 0
  const remainingMins = Math.max(0, task.estimateMinutes - loggedMins)
  const progressPct =
    task.estimateMinutes > 0
      ? Math.min(100, Math.round((loggedMins / task.estimateMinutes) * 100))
      : 0
  const isOverEstimate = task.estimateMinutes > 0 && loggedMins > task.estimateMinutes
  const overdue = isTaskOverdue(task)
  const notes = task.notes ?? []
  const labels = task.labels ?? []
  const entries = stats?.entries ?? []

  function saveTitle() {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdateTask(task.id, { title: trimmed })
    } else {
      setTitleDraft(task.title)
    }
    setEditingTitle(false)
  }

  function saveDesc() {
    onUpdateTask(task.id, { description: descDraft.trim() })
    setEditingDesc(false)
  }

  function saveCriteria() {
    onUpdateTask(task.id, { acceptanceCriteria: criteriaDraft.trim() })
    setEditingCriteria(false)
  }

  function toggleAssignee(memberId: string) {
    const exists = task.assignedMemberIds.includes(memberId)
    const next = exists
      ? task.assignedMemberIds.filter((id) => id !== memberId)
      : [...task.assignedMemberIds, memberId]
    onAssignMembers(task.id, next)
  }

  function handleAddLabel(e: React.FormEvent) {
    e.preventDefault()
    const clean = labelDraft.trim()
    if (!clean) return
    if (!labels.includes(clean)) {
      onUpdateTask(task.id, { labels: [...labels, clean] })
    }
    setLabelDraft('')
  }

  function removeLabel(lbl: string) {
    onUpdateTask(task.id, { labels: labels.filter((l) => l !== lbl) })
  }

  function handlePostComment(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = commentText.trim()
    if (!trimmed) return
    onAddNote(task.id, trimmed)
    setCommentText('')
  }

  function handleAddSubtaskSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = subtaskTitle.trim()
    if (!trimmed) return
    onCreateSubtask(task, trimmed)
    setSubtaskTitle('')
    setAddingSubtask(false)
  }

  function copyKey() {
    void navigator.clipboard?.writeText(task.code)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 1400)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="dp-popover-enter w-full max-w-5xl rounded-2xl bg-white dark:bg-[#12121a] shadow-(--dp-shadow-popover) overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Top Jira Breadcrumb Header */}
        <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-white/[0.06] shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 min-w-0">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[160px]">
              {project?.name ?? 'Project'}
            </span>
            {parentTask && (
              <>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => onSelectTask(parentTask.id)}
                  className="inline-flex items-center gap-1 font-mono font-semibold text-zinc-600 dark:text-zinc-300 hover:text-[#6d25da] dark:hover:text-[#c5a8f0] cursor-pointer"
                >
                  <IssueTypeBadge type={parentTask.issueType ?? 'task'} size="xs" />
                  <span>{parentTask.code}</span>
                </button>
              </>
            )}
            <span>/</span>
            <div className="inline-flex items-center gap-1.5">
              {permissions.canEditTask ? (
                <Select
                  aria-label="Change issue type"
                  value={task.issueType ?? (task.parentTaskId ? 'subtask' : 'task')}
                  onChange={(e) =>
                    onUpdateTask(task.id, { issueType: e.target.value as TaskIssueType })
                  }
                  className="!py-0.5 !pl-2 !pr-6 !text-[11px] font-semibold"
                >
                  {ISSUE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <IssueTypeBadge
                  type={task.issueType ?? (task.parentTaskId ? 'subtask' : 'task')}
                  showLabel
                  size="xs"
                />
              )}
              <button
                type="button"
                onClick={copyKey}
                title="Copy issue key"
                className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0] hover:underline cursor-pointer"
              >
                {copiedKey ? 'Copied!' : task.code}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {permissions.canDeleteTask && (
              <button
                type="button"
                title="Delete issue"
                onClick={() => {
                  onDeleteTask(task.id)
                  onClose()
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
              onClick={onClose}
              aria-label="Close issue detail"
              className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/[0.07] dark:hover:text-white transition cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Wide 2-Pane Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* LEFT PANE: Main Work Area */}
          <div className="lg:col-span-8 p-6 space-y-6 overflow-y-auto">
            {/* Inline Editable Title */}
            <div>
              {editingTitle && permissions.canEditTask ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTitle()
                      if (e.key === 'Escape') {
                        setTitleDraft(task.title)
                        setEditingTitle(false)
                      }
                    }}
                    autoFocus
                    className="w-full px-3 py-2 text-base font-bold"
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={saveTitle}
                      className="px-3 py-1 rounded-lg bg-[#6d25da] text-white font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTitleDraft(task.title)
                        setEditingTitle(false)
                      }}
                      className="px-3 py-1 rounded-lg bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <h2
                  onClick={() => permissions.canEditTask && setEditingTitle(true)}
                  title={permissions.canEditTask ? 'Click to edit title' : undefined}
                  className={`text-xl font-bold text-zinc-900 dark:text-white leading-snug rounded-lg px-2 py-1 -mx-2 transition ${permissions.canEditTask
                      ? 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.04] cursor-text'
                      : ''
                    }`}
                >
                  {task.title}
                </h2>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Description
                </span>
                {permissions.canEditTask && !editingDesc && (
                  <button
                    type="button"
                    onClick={() => setEditingDesc(true)}
                    className="text-[11px] font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingDesc && permissions.canEditTask ? (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    placeholder="Add technical specifications, context, or reproduction steps..."
                    autoFocus
                    className="w-full px-3 py-2 text-xs resize-y"
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={saveDesc}
                      className="px-3 py-1.5 rounded-lg bg-[#6d25da] text-white font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDescDraft(task.description ?? '')
                        setEditingDesc(false)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => permissions.canEditTask && setEditingDesc(true)}
                  className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap transition ${task.description?.trim()
                      ? 'bg-zinc-50/90 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300'
                      : 'bg-zinc-50/50 dark:bg-white/[0.02] text-zinc-400 italic'
                    } ${permissions.canEditTask ? 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.05] cursor-text' : ''}`}
                >
                  {task.description?.trim() || 'Add a detailed description...'}
                </div>
              )}
            </div>

            {/* Acceptance Criteria */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Acceptance Criteria (Review Sign-Off)
                </span>
                {permissions.canEditTask && !editingCriteria && (
                  <button
                    type="button"
                    onClick={() => setEditingCriteria(true)}
                    className="text-[11px] font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingCriteria && permissions.canEditTask ? (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={criteriaDraft}
                    onChange={(e) => setCriteriaDraft(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 text-xs resize-y"
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={saveCriteria}
                      className="px-3 py-1.5 rounded-lg bg-[#6d25da] text-white font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCriteriaDraft(task.acceptanceCriteria)
                        setEditingCriteria(false)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => permissions.canEditTask && setEditingCriteria(true)}
                  className={`rounded-xl px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50/90 dark:bg-white/[0.03] leading-relaxed whitespace-pre-wrap ${permissions.canEditTask ? 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.05] cursor-text' : ''
                    }`}
                >
                  {task.acceptanceCriteria || 'No acceptance criteria specified.'}
                </div>
              )}
            </div>

            {/* Child Subtasks Tree */}
            <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Child Issues / Subtasks ({subtasksDone}/{subtasks.length})
                  </span>
                </div>
                {permissions.canCreateTask && (
                  <button
                    type="button"
                    onClick={() => setAddingSubtask((v) => !v)}
                    className="text-[11px] font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:underline cursor-pointer"
                  >
                    + Add subtask
                  </button>
                )}
              </div>

              {subtasks.length > 0 && (
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${subtaskPct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                    {subtaskPct}% Done
                  </span>
                </div>
              )}

              {subtasks.length > 0 && (
                <div className="space-y-1.5">
                  {subtasks.map((sub) => {
                    const isDone = sub.status === 'done'
                    return (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isDone}
                            disabled={!permissions.canChangeTaskStatus}
                            onChange={() =>
                              onUpdateTask(sub.id, { status: isDone ? 'active' : 'done' })
                            }
                            className="h-3.5 w-3.5 rounded cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => onSelectTask(sub.id)}
                            className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
                          >
                            <span className="font-mono text-[11px] font-bold text-[#6d25da] dark:text-[#c5a8f0] shrink-0">
                              {sub.code}
                            </span>
                            <span
                              className={`font-medium truncate ${isDone
                                  ? 'line-through text-zinc-400 dark:text-zinc-500'
                                  : 'text-zinc-800 dark:text-zinc-200'
                                }`}
                            >
                              {sub.title}
                            </span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PriorityBadge priority={sub.priority} compact />
                          <span className="text-[10.5px] capitalize px-2 py-0.5 rounded-full bg-white dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
                            {sub.status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {addingSubtask && (
                <form onSubmit={handleAddSubtaskSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Subtask title..."
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!subtaskTitle.trim()}
                    className="px-3 py-1.5 rounded-lg bg-[#6d25da] text-white text-xs font-semibold disabled:opacity-45 cursor-pointer"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingSubtask(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.07] text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>

            {/* Linked Evidence (PRs/Commits) & Attachments */}
            <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Linked Evidence &amp; Attachments ({linkedEvidence.length + task.attachments.length})
              </div>

              {linkedEvidence.length > 0 && (
                <div className="space-y-1.5">
                  {linkedEvidence.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/[0.06] dark:bg-emerald-500/[0.08] border border-emerald-500/20 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {ev.summaryTitle}
                        </div>
                        <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 font-mono">
                          {ev.sourceType.replace(/_/g, ' ')} · {ev.externalId} · {ev.actorName}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                        {Math.round(ev.linkConfidence * 100)}% verified
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {task.attachments.length > 0 && (
                <div className="space-y-1.5">
                  {task.attachments.map((att) => (
                    <div
                      key={att}
                      className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 truncate"
                    >
                      <span className="shrink-0">📎</span>
                      {att.startsWith('http://') || att.startsWith('https://') ? (
                        <a
                          href={att}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#6d25da] dark:text-[#c5a8f0] hover:underline truncate"
                        >
                          {att}
                        </a>
                      ) : (
                        <span className="truncate">{att}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Paste GitHub PR, Figma, or spec URL..."
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && attachmentUrl.trim()) {
                      e.preventDefault()
                      onAddAttachment(task.id, attachmentUrl.trim())
                      setAttachmentUrl('')
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!attachmentUrl.trim()) return
                    onAddAttachment(task.id, attachmentUrl.trim())
                    setAttachmentUrl('')
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-xs font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer"
                >
                  Attach
                </button>
              </div>
            </div>

            {/* Activity Tabs: Comments / Work Logs / History */}
            <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mr-2">
                  Activity
                </span>
                {(
                  [
                    ['comments', `Comments (${notes.length})`],
                    ['worklogs', `Work Logs (${entries.length})`],
                    ['history', `History (${taskAuditHistory.length})`],
                  ] as const
                ).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setActivityTab(tabId)}
                    className={`px-2.5 py-1 rounded-lg text-[11.5px] font-semibold transition cursor-pointer ${activityTab === tabId
                        ? 'bg-[#6d25da]/12 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#d8c4f8]'
                        : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/[0.05]'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activityTab === 'comments' && (
                <div className="space-y-3">
                  <form onSubmit={handlePostComment} className="space-y-2">
                    <textarea
                      rows={2}
                      placeholder="Write a comment or update... (Ctrl/Cmd + Enter to post)"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          handlePostComment()
                        }
                      }}
                      className="w-full px-3 py-2 text-xs resize-y"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!commentText.trim()}
                        className="px-3.5 py-1.5 rounded-lg bg-[#6d25da] hover:bg-[#581eae] disabled:opacity-45 text-xs font-semibold text-white cursor-pointer"
                      >
                        Post Comment
                      </button>
                    </div>
                  </form>

                  {notes.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 py-2">
                      No comments yet. Share context, review notes, or blockers.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {notes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-3 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <MemberAvatar name={note.authorName} id={note.authorId} size="xs" />
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {note.authorName}
                              </span>
                              <span className="text-[10.5px] text-zinc-400 font-mono">
                                {new Date(note.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {(note.authorId === activeUser.id || permissions.canDeleteTask) && (
                              <button
                                type="button"
                                onClick={() => onDeleteNote(task.id, note.id)}
                                className="text-[10.5px] text-zinc-400 hover:text-rose-500 cursor-pointer"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap pl-7 leading-relaxed">
                            {note.contentMarkdown}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activityTab === 'worklogs' && (
                <div className="space-y-2">
                  {entries.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 py-2">
                      No developer sessions logged against this issue yet.
                    </p>
                  ) : (
                    entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03] text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MemberAvatar name={entry.developerName} id={entry.developerId} size="sm" />
                          <div className="min-w-0">
                            <div className="font-semibold text-zinc-900 dark:text-white truncate">
                              {entry.developerName}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                              {entry.workDate} · {entry.startTime}–{entry.endTime} ·{' '}
                              <span className="capitalize">{entry.workMode}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-zinc-900 dark:text-white">
                            {formatDuration(entry.claimedMinutes)}
                          </div>
                          <div className="text-[10.5px] capitalize text-zinc-500 dark:text-zinc-400">
                            {entry.evidenceStatus.replace(/_/g, ' ')}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activityTab === 'history' && (
                <div className="space-y-1.5">
                  {taskAuditHistory.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 py-2">
                      No recent audit events recorded for {task.code}.
                    </p>
                  ) : (
                    taskAuditHistory.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-white/[0.03] text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {log.actorName}
                          </span>{' '}
                          <span className="text-zinc-500 dark:text-zinc-400">{log.reason}</span>
                        </div>
                        <span className="font-mono text-[10.5px] text-zinc-400 shrink-0">
                          {new Date(log.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANE: Structured Jira Properties Sidebar */}
          <div className="lg:col-span-4 bg-zinc-50/90 dark:bg-[#0e0e14] p-5 border-t lg:border-t-0 lg:border-l border-zinc-100 dark:border-white/[0.06] overflow-y-auto space-y-5">
            {/* Primary Workflow Actions */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Select
                  aria-label="Issue status"
                  value={task.status}
                  disabled={!permissions.canChangeTaskStatus}
                  onChange={(e) =>
                    onUpdateTask(task.id, { status: e.target.value as TaskRecord['status'] })
                  }
                  className={`flex-1 font-semibold ${!permissions.canChangeTaskStatus ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                >
                  {BOARD_COLUMNS.map((c) => (
                    <option key={c.status} value={c.status}>
                      {c.label}
                    </option>
                  ))}
                </Select>

                {permissions.canApproveTask &&
                  (task.status === 'review' || task.status === 'active') && (
                    <button
                      type="button"
                      onClick={() => onApproveTask(task)}
                      title="Verify acceptance criteria & mark Done"
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shrink-0 cursor-pointer"
                    >
                      ✓ Sign-off
                    </button>
                  )}
              </div>

              {permissions.canTrackTimer && (
                <button
                  type="button"
                  onClick={() => {
                    onLaunchTimer(task.projectId, task.id, task.defaultWorkMode)
                    onClose()
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-xs font-semibold text-white shadow-sm shadow-[#6d25da]/25 transition cursor-pointer"
                >
                  ▶ Start Focus Timer ({task.defaultWorkMode})
                </button>
              )}
            </div>

            {/* Time Tracking Card */}
            <div className="rounded-xl bg-white dark:bg-[#14141c] p-3.5 space-y-2 shadow-[0_1px_2px_rgba(15,5,31,0.04),0_0_0_1px_rgba(15,5,31,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Time Tracking
                </span>
                <span
                  className={`font-mono font-semibold ${isOverEstimate ? 'text-rose-600 dark:text-rose-400' : 'text-[#6d25da] dark:text-[#c5a8f0]'
                    }`}
                >
                  {progressPct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isOverEstimate
                      ? 'bg-rose-500'
                      : task.status === 'done'
                        ? 'bg-emerald-500'
                        : 'bg-[#6d25da]'
                    }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1 text-[10.5px] font-mono">
                <div>
                  <div className="text-zinc-400">Logged</div>
                  <div className="font-bold text-zinc-900 dark:text-white">
                    {formatDuration(loggedMins)}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-400">Approved</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatDuration(approvedMins)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-zinc-400">Remaining</div>
                  <div className="font-bold text-zinc-700 dark:text-zinc-300">
                    {formatDuration(remainingMins)}
                  </div>
                </div>
              </div>
            </div>

            {/* Details Properties */}
            <div className="space-y-3 text-xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Details
              </div>

              {/* Priority */}
              <div className="grid grid-cols-5 items-center gap-2">
                <span className="col-span-2 text-zinc-500 dark:text-zinc-400">Priority</span>
                <div className="col-span-3">
                  <Select
                    value={task.priority}
                    disabled={!permissions.canEditTask}
                    onChange={(e) =>
                      onUpdateTask(task.id, { priority: e.target.value as TaskRecord['priority'] })
                    }
                    className="w-full !py-1 !text-xs"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Sprint */}
              <div className="grid grid-cols-5 items-center gap-2">
                <span className="col-span-2 text-zinc-500 dark:text-zinc-400">Sprint</span>
                <div className="col-span-3">
                  <Select
                    value={task.sprintId ?? ''}
                    disabled={!permissions.canEditTask}
                    onChange={(e) =>
                      onUpdateTask(task.id, { sprintId: e.target.value || null })
                    }
                    className="w-full !py-1 !text-xs"
                  >
                    <option value="">Backlog (None)</option>
                    {projectSprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Parent / Epic */}
              <div className="grid grid-cols-5 items-center gap-2">
                <span className="col-span-2 text-zinc-500 dark:text-zinc-400">Parent</span>
                <div className="col-span-3">
                  <Select
                    value={task.parentTaskId ?? ''}
                    disabled={!permissions.canEditTask}
                    onChange={(e) =>
                      onUpdateTask(task.id, { parentTaskId: e.target.value || undefined })
                    }
                    className="w-full !py-1 !text-xs"
                  >
                    <option value="">None (Top-Level)</option>
                    {projectTasks
                      .filter((pt) => pt.id !== task.id && !pt.parentTaskId)
                      .map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.code} · {pt.title.slice(0, 22)}
                        </option>
                      ))}
                  </Select>
                </div>
              </div>

              {/* Estimate & Story Points */}
              <div className="grid grid-cols-5 items-center gap-2">
                <span className="col-span-2 text-zinc-500 dark:text-zinc-400">Estimate (m)</span>
                <div className="col-span-3">
                  <input
                    type="number"
                    min={15}
                    step={15}
                    disabled={!permissions.canEditTask}
                    value={task.estimateMinutes}
                    onChange={(e) =>
                      onUpdateTask(task.id, {
                        estimateMinutes: Math.max(15, Number(e.target.value) || 15),
                      })
                    }
                    className="w-full !py-1 !px-2.5 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-5 items-center gap-2">
                <span className="col-span-2 text-zinc-500 dark:text-zinc-400">Story Points</span>
                <div className="col-span-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="-"
                    disabled={!permissions.canEditTask}
                    value={task.storyPoints ?? ''}
                    onChange={(e) =>
                      onUpdateTask(task.id, {
                        storyPoints: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-full !py-1 !px-2.5 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Work Mode */}
              <div className="grid grid-cols-5 items-center gap-2">
                <span className="col-span-2 text-zinc-500 dark:text-zinc-400">Work Mode</span>
                <div className="col-span-3">
                  <Select
                    value={task.defaultWorkMode}
                    disabled={!permissions.canEditTask}
                    onChange={(e) =>
                      onUpdateTask(task.id, { defaultWorkMode: e.target.value as WorkMode })
                    }
                    className="w-full !py-1 !text-xs capitalize"
                  >
                    {WORK_MODE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Due Date */}
              <div className="grid grid-cols-5 items-center gap-2">
                <span className="col-span-2 text-zinc-500 dark:text-zinc-400">
                  Due Date
                  {overdue && (
                    <span className="block text-[10px] font-semibold text-rose-500">Overdue</span>
                  )}
                </span>
                <div className="col-span-3">
                  <input
                    type="date"
                    disabled={!permissions.canEditTask}
                    value={task.dueDate || ''}
                    onChange={(e) => onUpdateTask(task.id, { dueDate: e.target.value })}
                    className="w-full !py-1 !px-2.5 text-xs"
                  />
                </div>
              </div>

              {/* Billable */}
              <div className="grid grid-cols-5 items-center gap-2">
                <span className="col-span-2 text-zinc-500 dark:text-zinc-400">Billing</span>
                <div className="col-span-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!permissions.canEditTask}
                      checked={task.isBillable}
                      onChange={(e) =>
                        onUpdateTask(task.id, { isBillable: e.target.checked })
                      }
                    />
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {task.isBillable ? 'Billable' : 'Non-Billable'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Labels */}
              <div className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.06] space-y-2">
                <div className="text-zinc-500 dark:text-zinc-400 font-medium">Labels</div>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((lbl) => (
                    <span
                      key={lbl}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#f4effc] text-[#581eae] dark:bg-[#6d25da]/22 dark:text-[#d8c4f8]"
                    >
                      <span>{lbl}</span>
                      {permissions.canEditTask && (
                        <button
                          type="button"
                          onClick={() => removeLabel(lbl)}
                          className="hover:text-rose-500 cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {permissions.canEditTask && (
                  <form onSubmit={handleAddLabel} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Add label..."
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      className="flex-1 !py-1 !px-2 text-xs"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded-lg bg-zinc-200/80 dark:bg-white/[0.08] text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer"
                    >
                      +
                    </button>
                  </form>
                )}
              </div>

              {/* Assignees */}
              <div className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.06] space-y-2">
                <div className="text-zinc-500 dark:text-zinc-400 font-medium">
                  Assignees (Active Profiles Only)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeMembers.map((m) => {
                    const assigned = task.assignedMemberIds.includes(m.id)
                    if (!permissions.canAssignTask) {
                      if (!assigned) return null
                      return (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f4effc] dark:bg-[#6d25da]/20 text-[#581eae] dark:text-[#d8c4f8]"
                        >
                          <MemberAvatar name={m.name} id={m.id} size="xs" />
                          {m.name}
                        </span>
                      )
                    }
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleAssignee(m.id)}
                        className={`inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer ${assigned
                            ? 'bg-[#f4effc] dark:bg-[#6d25da]/22 text-[#581eae] dark:text-[#d8c4f8] ring-1 ring-[#6d25da]/25'
                            : 'bg-white dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                      >
                        <MemberAvatar name={m.name} id={m.id} size="xs" />
                        <span>{m.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Timestamps */}
              {(task.createdAt || task.updatedAt) && (
                <div className="pt-3 border-t border-zinc-200/70 dark:border-white/[0.06] text-[10.5px] text-zinc-400 space-y-0.5 font-mono">
                  {task.createdAt && <div>Created: {formatShortDate(task.createdAt)}</div>}
                  {task.updatedAt && <div>Updated: {formatShortDate(task.updatedAt)}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
