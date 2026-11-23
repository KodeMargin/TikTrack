import { useState } from 'react'
import type { ProjectRecord, WorkspaceMember } from '@/context/Phase1Store'
import { BOARD_COLUMNS, type ProjectPermissions, type TaskStatus } from '../types'
import { MemberAvatar } from '../components/StatusPriorityBadges'

const PROJECT_ROLES = ['lead', 'developer', 'reviewer', 'viewer'] as const

export function ProjectSettingsView({
  project,
  activeMembers,
  permissions,
  onUpdateProject,
  onDeleteProject,
  onUpsertMember,
  onRemoveMember,
  onNotify,
}: {
  project: ProjectRecord
  activeMembers: WorkspaceMember[]
  permissions: ProjectPermissions
  onUpdateProject: (
    projectId: string,
    patch: Partial<
      Pick<ProjectRecord, 'code' | 'name' | 'clientName' | 'description' | 'status' | 'boardConfig'>
    >
  ) => { ok: boolean; message: string }
  onDeleteProject: (
    projectId: string
  ) => Promise<{ ok: boolean; message: string; archivedOnly?: boolean }>
  onUpsertMember: (projectId: string, userId: string, projectRole: string) => void
  onRemoveMember: (projectId: string, userId: string) => void
  onNotify: (banner: { ok: boolean; text: string }) => void
}) {
  const [name, setName] = useState(project.name)
  const [code, setCode] = useState(project.code)
  const [clientName, setClientName] = useState(project.clientName)
  const [description, setDescription] = useState(project.description)
  const [status, setStatus] = useState<ProjectRecord['status']>(project.status)
  const [wipLimits, setWipLimits] = useState<Partial<Record<TaskStatus, number>>>(
    project.boardConfig?.wipLimits ?? {}
  )
  const [addMemberUserId, setAddMemberUserId] = useState('')
  const [addMemberRole, setAddMemberRole] = useState<string>('developer')
  const [deleting, setDeleting] = useState(false)

  const projectMembers = project.members ?? []
  const assignedUserIds = new Set(projectMembers.map((pm) => pm.userId))
  const availableToAdd = activeMembers.filter((m) => !assignedUserIds.has(m.id))

  function handleSaveGeneral(e: React.FormEvent) {
    e.preventDefault()
    const res = onUpdateProject(project.id, {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      clientName: clientName.trim(),
      description: description.trim(),
      status,
    })
    onNotify({ ok: res.ok, text: res.message })
  }

  function handleSaveBoardConfig(e: React.FormEvent) {
    e.preventDefault()
    const cleanWip: Partial<Record<TaskStatus, number>> = {}
    for (const col of BOARD_COLUMNS) {
      const val = wipLimits[col.status]
      if (val && val > 0) cleanWip[col.status] = val
    }
    const res = onUpdateProject(project.id, {
      boardConfig: {
        ...project.boardConfig,
        wipLimits: cleanWip,
      },
    })
    onNotify({
      ok: res.ok,
      text: res.ok ? 'Board WIP limits updated.' : res.message,
    })
  }

  function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!addMemberUserId) return
    onUpsertMember(project.id, addMemberUserId, addMemberRole)
    setAddMemberUserId('')
    onNotify({ ok: true, text: 'Member added to project team.' })
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Are you sure you want to delete/archive "${project.name}" (${project.code})? Projects with billing history are safely archived.`
      )
    ) {
      return
    }
    setDeleting(true)
    const res = await onDeleteProject(project.id)
    setDeleting(false)
    onNotify({ ok: res.ok, text: res.message })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Column: General Details & WIP Limits */}
      <div className="lg:col-span-7 space-y-5">
        {/* General Project Settings */}
        <form
          onSubmit={handleSaveGeneral}
          className="rounded-2xl bg-white dark:bg-[#111117] p-6 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] space-y-4 text-xs"
        >
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Project Details
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400">
              Configure project key, client organization, scope summary, and lifecycle status.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                Project Name
              </label>
              <input
                type="text"
                required
                disabled={!permissions.canEditProject}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                Project Key
              </label>
              <input
                type="text"
                required
                maxLength={10}
                disabled={!permissions.canEditProject}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                Client Organization
              </label>
              <input
                type="text"
                required
                disabled={!permissions.canEditProject}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
                Project Status
              </label>
              <select
                disabled={!permissions.canEditProject}
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectRecord['status'])}
                className="w-full"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Scope &amp; Description
            </label>
            <textarea
              rows={3}
              disabled={!permissions.canEditProject}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 resize-y"
            />
          </div>

          {permissions.canEditProject && (
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-white font-semibold cursor-pointer"
              >
                Save Project Settings
              </button>
            </div>
          )}
        </form>

        {/* Board Workflow & WIP Limits */}
        <form
          onSubmit={handleSaveBoardConfig}
          className="rounded-2xl bg-white dark:bg-[#111117] p-6 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] space-y-4 text-xs"
        >
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Board Columns &amp; WIP Limits
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400">
              Set Work-In-Progress limits per column. Columns highlight in rose when exceeded (leave empty for unlimited).
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {BOARD_COLUMNS.map((col) => (
              <div
                key={col.status}
                className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-2"
              >
                <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                  <span className={`h-2 w-2 rounded-full ${col.dotClass}`} />
                  <span className="truncate">{col.shortLabel}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={99}
                  placeholder="No limit"
                  disabled={!permissions.canEditProject}
                  value={wipLimits[col.status] ?? ''}
                  onChange={(e) =>
                    setWipLimits((prev) => ({
                      ...prev,
                      [col.status]: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full !px-2.5 !py-1.5 font-mono text-xs"
                />
              </div>
            ))}
          </div>

          {permissions.canEditProject && (
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-white font-semibold cursor-pointer"
              >
                Save WIP Limits
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Right Column: Project Team Roster + Danger Zone */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-2xl bg-white dark:bg-[#111117] p-6 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] space-y-4 text-xs">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Project Team ({projectMembers.length})
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400">
              Assign active workspace members and project-level roles.
            </p>
          </div>

          {permissions.canEditProject && availableToAdd.length > 0 && (
            <form onSubmit={handleAddMember} className="flex items-center gap-2">
              <select
                value={addMemberUserId}
                onChange={(e) => setAddMemberUserId(e.target.value)}
                className="flex-1 !py-1.5 !text-xs"
              >
                <option value="">Add workspace member...</option>
                {availableToAdd.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role.replace(/_/g, ' ')})
                  </option>
                ))}
              </select>
              <select
                value={addMemberRole}
                onChange={(e) => setAddMemberRole(e.target.value)}
                className="w-28 !py-1.5 !text-xs capitalize"
              >
                {PROJECT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!addMemberUserId}
                className="px-3 py-1.5 rounded-lg bg-[#6d25da] disabled:opacity-45 text-white font-semibold cursor-pointer shrink-0"
              >
                Add
              </button>
            </form>
          )}

          {projectMembers.length === 0 ? (
            <p className="text-zinc-400 py-3">
              No explicit project roster set yet — all active workspace members can participate.
            </p>
          ) : (
            <div className="space-y-2">
              {projectMembers.map((pm) => {
                const user = activeMembers.find((m) => m.id === pm.userId)
                return (
                  <div
                    key={pm.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MemberAvatar
                        name={user?.name ?? 'Member'}
                        id={pm.userId}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-900 dark:text-white truncate">
                          {user?.name ?? pm.userId.slice(0, 8)}
                        </div>
                        <div className="text-[10.5px] text-zinc-500 truncate">
                          {user?.email ?? ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        disabled={!permissions.canEditProject}
                        value={pm.projectRole}
                        onChange={(e) =>
                          onUpsertMember(project.id, pm.userId, e.target.value)
                        }
                        className="!py-0.5 !pl-2 !pr-6 !text-[11px] capitalize"
                      >
                        {PROJECT_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {permissions.canEditProject && (
                        <button
                          type="button"
                          onClick={() => onRemoveMember(project.id, pm.userId)}
                          className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 cursor-pointer"
                          title="Remove from project"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        {permissions.canDeleteProject && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-5 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-rose-700 dark:text-rose-300">
              Archive or Delete Project
            </h3>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Projects with logged timesheets or invoices are automatically archived to preserve financial audit records. Empty projects are permanently deleted.
            </p>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold cursor-pointer"
            >
              {deleting ? 'Processing...' : `Delete / Archive ${project.code}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
