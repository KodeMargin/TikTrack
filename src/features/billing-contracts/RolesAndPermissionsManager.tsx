import { useState, useMemo, useEffect } from 'react'
import { notifyFeedback } from '@/lib/notify'
import { usePhase1Store, type WorkspaceMember } from '@/context/Phase1Store'
import {
  PERMISSION_MODULES,
  ALL_TENANT_PERMISSIONS,
  DEFAULT_TENANT_OWNER_PERMISSIONS,
  type CustomRole,
} from '@/types/permissions.types'

export function RolesAndPermissionsManager({
  hideInviteForm = false,
}: {
  hideInviteForm?: boolean
} = {}) {
  const {
    activeTenant,
    activeUser,
    isSuperAdminSession,
    members,
    roles,
    permissionsCatalog,
    rbacSeedStatus,
    prismaStatus,
    tenantOwnerPermissions,
    hasPermission,
    getUserPermissions,
    createCustomRole,
    updateCustomRole,
    deleteCustomRole,
    updateMemberRole,
    updateTenantOwnerPermissions,
    reseedPermissionsToDatabase,
    inviteMember,
    resendMemberInvite,
    toggleMemberStatus,
    deleteMember,
  } = usePhase1Store()

  const [activeTab, setActiveTab] = useState<'roster' | 'roles' | 'superadmin'>('roster')
  const setBanner = notifyFeedback

  // Invite member state
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('developer')
  const [inviteTempPassword, setInviteTempPassword] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [resendingMemberId, setResendingMemberId] = useState<string | null>(null)

  // Create role state
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleCode, setNewRoleCode] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [newRolePerms, setNewRolePerms] = useState<Set<string>>(new Set())

  // Edit custom role state
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editRoleName, setEditRoleName] = useState('')
  const [editRoleDesc, setEditRoleDesc] = useState('')
  const [editRolePerms, setEditRolePerms] = useState<Set<string>>(new Set())

  // Inspect system role state
  const [inspectRoleId, setInspectRoleId] = useState<string | null>(null)

  // Edit member role & custom overrides state
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [memberRoleSelect, setMemberRoleSelect] = useState<string>('developer')
  const [memberCustomPerms, setMemberCustomPerms] = useState<Set<string>>(new Set())

  // Super Admin Tenant Owner Permissions Governance state
  const activeTenantOwnerPerms = useMemo(() => {
    return new Set(tenantOwnerPermissions[activeTenant.id] ?? DEFAULT_TENANT_OWNER_PERMISSIONS)
  }, [tenantOwnerPermissions, activeTenant.id])

  const [superAdminOwnerPerms, setSuperAdminOwnerPerms] = useState<Set<string>>(
    () => new Set(activeTenantOwnerPerms)
  )

  // Sync state if tenant changes
  useEffect(() => {
    setSuperAdminOwnerPerms(new Set(activeTenantOwnerPerms))
  }, [activeTenantOwnerPerms])

  const canManageRoles = hasPermission('role:create') || hasPermission('role:edit') || isSuperAdminSession
  const canManageMembers = hasPermission('member:invite') || hasPermission('member:edit_role') || isSuperAdminSession

  function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let pass = 'Dev@'
    for (let i = 0; i < 5; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    pass += `${Math.floor(10 + Math.random() * 90)}!`
    setInviteTempPassword(pass)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteName.trim() || !inviteEmail.trim() || isInviting) return
    const tempPass = inviteTempPassword.trim() || `Dev@${Math.floor(1000 + Math.random() * 9000)}!`
    setIsInviting(true)
    try {
      const res = await inviteMember(inviteName.trim(), inviteEmail.trim(), inviteRole, tempPass)
      if (res.ok) {
        setInviteName('')
        setInviteEmail('')
        setInviteTempPassword('')
      }
      const issuedPass = res.temporaryPassword || tempPass
      setBanner({
        ok: res.ok && res.emailSent !== false,
        text: res.ok ? `${res.message} Temporary Password: ${issuedPass}` : res.message,
      })
    } finally {
      setIsInviting(false)
    }
  }

  function handleCreateRoleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newRoleName.trim()) return
    const res = createCustomRole({
      name: newRoleName.trim(),
      code: newRoleCode.trim() || undefined,
      description: newRoleDesc.trim(),
      permissions: Array.from(newRolePerms),
    })
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) {
      setNewRoleName('')
      setNewRoleCode('')
      setNewRoleDesc('')
      setNewRolePerms(new Set())
      setShowCreateRoleModal(false)
    }
  }

  function startEditRole(role: CustomRole) {
    setEditingRoleId(role.id)
    setEditRoleName(role.name)
    setEditRoleDesc(role.description)
    setEditRolePerms(new Set(role.permissions))
  }

  function handleUpdateRoleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingRoleId || !editRoleName.trim()) return
    const res = updateCustomRole(editingRoleId, {
      name: editRoleName.trim(),
      description: editRoleDesc.trim(),
      permissions: Array.from(editRolePerms),
    })
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) {
      setEditingRoleId(null)
    }
  }

  function handleDeleteRole(role: CustomRole) {
    if (window.confirm(`Are you sure you want to delete custom role "${role.name}"?`)) {
      const res = deleteCustomRole(role.id)
      setBanner({ ok: res.ok, text: res.message })
    }
  }

  function startEditMember(member: WorkspaceMember) {
    setEditingMemberId(member.id)
    setMemberRoleSelect(member.role)
    setMemberCustomPerms(new Set(member.customPermissions || []))
  }

  function handleSaveMemberOverrides(e: React.FormEvent) {
    e.preventDefault()
    if (!editingMemberId) return
    const res = updateMemberRole(
      editingMemberId,
      memberRoleSelect,
      Array.from(memberCustomPerms)
    )
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) {
      setEditingMemberId(null)
    }
  }

  function handleSaveTenantOwnerPerms() {
    const res = updateTenantOwnerPermissions(
      activeTenant.id,
      Array.from(superAdminOwnerPerms)
    )
    setBanner({
      ok: res.ok,
      text: `Tenant Owner permissions for ${activeTenant.name} updated (${superAdminOwnerPerms.size} actions authorized).`,
    })
  }

  function handleResetTenantOwnerPerms() {
    setSuperAdminOwnerPerms(new Set(DEFAULT_TENANT_OWNER_PERMISSIONS))
    const res = updateTenantOwnerPermissions(
      activeTenant.id,
      DEFAULT_TENANT_OWNER_PERMISSIONS
    )
    setBanner({
      ok: res.ok,
      text: `Restored full default Tenant Owner permissions (${DEFAULT_TENANT_OWNER_PERMISSIONS.length} actions).`,
    })
  }

  function togglePermissionInSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string
  ) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function toggleModuleInSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    moduleId: string
  ) {
    const modulePerms = permissionsCatalog.filter((p) => p.module === moduleId && !p.isSuperAdminOnly).map((p) => p.key)
    setter((prev) => {
      const next = new Set(prev)
      const allSelected = modulePerms.every((k) => next.has(k))
      if (allSelected) {
        modulePerms.forEach((k) => next.delete(k))
      } else {
        modulePerms.forEach((k) => next.add(k))
      }
      return next
    })
  }

  const selectedEditingMember = members.find((m) => m.id === editingMemberId)

  return (
    <div className="space-y-5">
      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="inline-flex rounded-2xl bg-zinc-200/60 dark:bg-white/[0.045] p-1 text-xs font-medium shadow-[inset_0_1px_2px_rgba(15,5,31,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`px-3.5 py-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 ${
              activeTab === 'roster'
                ? 'bg-white dark:bg-[#6d25da]/28 text-[#581eae] dark:text-[#d8c4f8] font-bold shadow-[0_2px_8px_-2px_rgba(15,5,31,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_-2px_rgba(109,37,218,0.35)]'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <span>👥 Team Members</span>
            <span
              className={`font-mono text-[11px] px-1.5 py-0.5 rounded-md ${
                activeTab === 'roster'
                  ? 'bg-[#f0e9fb] dark:bg-[#6d25da]/40 text-[#6d25da] dark:text-[#e2d3f8]'
                  : 'bg-zinc-200/80 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {members.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`px-3.5 py-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 ${
              activeTab === 'roles'
                ? 'bg-white dark:bg-[#6d25da]/28 text-[#581eae] dark:text-[#d8c4f8] font-bold shadow-[0_2px_8px_-2px_rgba(15,5,31,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_-2px_rgba(109,37,218,0.35)]'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <span>🛡️ Roles & Permissions</span>
            <span
              className={`font-mono text-[11px] px-1.5 py-0.5 rounded-md ${
                activeTab === 'roles'
                  ? 'bg-[#f0e9fb] dark:bg-[#6d25da]/40 text-[#6d25da] dark:text-[#e2d3f8]'
                  : 'bg-zinc-200/80 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {roles.length}
            </span>
          </button>

          {(isSuperAdminSession || activeUser.role === 'super_admin') && (
            <button
              type="button"
              onClick={() => setActiveTab('superadmin')}
              className={`px-3.5 py-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                activeTab === 'superadmin'
                  ? 'bg-white dark:bg-[#6d25da]/28 text-[#581eae] dark:text-[#d8c4f8] font-bold shadow-[0_2px_8px_-2px_rgba(15,5,31,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_-2px_rgba(109,37,218,0.35)]'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <span>👑 Super Admin</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                  activeTab === 'superadmin'
                    ? 'bg-[#f0e9fb] dark:bg-[#6d25da]/40 text-[#6d25da] dark:text-[#e2d3f8]'
                    : 'bg-zinc-200/80 dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-300'
                }`}
              >
                MASTER
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            title={
              rbacSeedStatus
                ? `Permissions Checksum: ${rbacSeedStatus.checksum}`
                : 'Permissions status'
            }
            className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400 text-[11px] font-mono flex items-center gap-1.5"
          >
            <span>{prismaStatus.connected ? '🗄️ Synced:' : '💾 Cached:'}</span>
            <strong className="text-zinc-800 dark:text-zinc-200">{permissionsCatalog.length} permissions</strong>
          </div>

          {prismaStatus.connected && (isSuperAdminSession || activeUser.role === 'super_admin') && (
            <button
              type="button"
              onClick={() => {
                void reseedPermissionsToDatabase().then((res) =>
                  setBanner({ ok: res.ok, text: res.message })
                )
              }}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer shadow-xs transition"
            >
              ↻ Re-run DB Seed
            </button>
          )}

          {activeTab === 'roles' && canManageRoles && (
            <button
              type="button"
              onClick={() => {
                setNewRolePerms(
                  new Set(
                    permissionsCatalog
                      .filter((p) => p.module === 'tasks')
                      .map((p) => p.key)
                  )
                )
                setShowCreateRoleModal(true)
              }}
              className="px-3.5 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white cursor-pointer shadow-xs transition"
            >
              + Create Custom Role
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: TEAM MEMBERS ROSTER & INDIVIDUAL ROLE ASSIGNMENT */}
      {activeTab === 'roster' && (
        <div className="space-y-5">
          {/* Quick Invite Form */}
          {!hideInviteForm && canManageMembers && (
            <form onSubmit={(e) => void handleInvite(e)} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-3.5">
              <input
                type="text"
                placeholder="Full Name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="sm:col-span-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
                required
              />
              <input
                type="email"
                placeholder="Email Address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="sm:col-span-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
                required
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="sm:col-span-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white font-medium"
              >
                <optgroup label="System Roles">
                  <option value="developer">Developer</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="finance">Finance</option>
                  <option value="client_reviewer">Client Reviewer</option>
                  <option value="auditor">Auditor</option>
                </optgroup>
                {roles.filter((r) => !r.isSystemRole).length > 0 && (
                  <optgroup label="Custom Roles">
                    {roles
                      .filter((r) => !r.isSystemRole)
                      .map((r) => (
                        <option key={r.id} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
              <div className="sm:col-span-2 flex gap-1">
                <input
                  type="text"
                  placeholder="Temp Password"
                  value={inviteTempPassword}
                  onChange={(e) => setInviteTempPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-2 text-zinc-900 dark:text-white text-[11px] font-mono"
                />
                <button
                  type="button"
                  onClick={generateTempPassword}
                  title="Generate Random Temporary Password"
                  className="px-2 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[10px] font-semibold cursor-pointer shrink-0 transition"
                >
                  Auto
                </button>
              </div>
              <button
                type="submit"
                disabled={isInviting}
                className="sm:col-span-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] font-semibold text-white px-3 py-2 cursor-pointer text-center shadow-xs transition disabled:opacity-50"
              >
                {isInviting ? 'Sending Invite...' : '+ Invite Member'}
              </button>
            </form>
          )}

          {/* Members Table */}
          <div className="rounded-xl border border-zinc-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 overflow-hidden text-xs">
            <div className="p-4 border-b border-zinc-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Team Members
              </h3>
              <span className="text-xs font-mono text-zinc-500 dark:text-slate-400">
                {members.length} members
              </span>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-slate-800">
              {members.map((m) => {
                const assignedRole = roles.find((r) => r.code === m.role || r.id === m.role)
                const isSuper = m.role === 'super_admin'
                const isOwner = m.role === 'tenant_owner'
                const effectivePermCount = getUserPermissions(m).length
                const customOverrideCount = m.customPermissions?.length ?? 0

                return (
                  <div
                    key={m.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-slate-950/40 transition"
                  >
                    <div className="space-y-1 min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-white text-sm">
                          {m.name}
                        </span>
                        {isSuper ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#6d25da]/15 text-[#6d25da] border border-[#6d25da]/30 dark:bg-[#6d25da]/25 dark:text-[#a87ce9]">
                            👑 SUPER ADMIN
                          </span>
                        ) : isOwner ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#6d25da]/15 text-[#6d25da] border border-[#6d25da]/30 dark:bg-[#6d25da]/25 dark:text-[#a87ce9]">
                            ★ OWNER
                          </span>
                        ) : assignedRole?.isSystemRole ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {assignedRole.name}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {assignedRole?.name ?? m.role}
                          </span>
                        )}

                        {customOverrideCount > 0 && (
                          <span
                            title={`${customOverrideCount} individual permission override(s) active`}
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                          >
                            +{customOverrideCount} Overrides
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                        {m.email} • Policy: {m.consentedPolicyVersion ?? 'None'} • {effectivePermCount} Action(s) Authorized
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${
                          m.status === 'active'
                            ? 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                            : m.status === 'invited'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {m.status === 'invited' ? 'Pending 1st Login' : m.status}
                      </span>

                      {m.status === 'invited' && m.temporaryPassword && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                          Key: {m.temporaryPassword}
                        </span>
                      )}

                      {m.status === 'invited' && (
                        <button
                          type="button"
                          disabled={resendingMemberId === m.id}
                          onClick={() => {
                            setResendingMemberId(m.id)
                            void resendMemberInvite(m.id)
                              .then((res) => {
                                setBanner({ ok: res.ok, text: res.message })
                              })
                              .finally(() => {
                                setResendingMemberId(null)
                              })
                          }}
                          className="text-[11px] font-medium text-[#6d25da] dark:text-[#a87ce9] hover:text-[#581eae] dark:hover:text-[#c5a8f0] underline cursor-pointer disabled:opacity-50"
                        >
                          {resendingMemberId === m.id ? 'Sending...' : 'Resend Invite'}
                        </button>
                      )}

                      {canManageMembers && !isSuper && (
                        <button
                          type="button"
                          onClick={() => startEditMember(m)}
                          className="px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium cursor-pointer border border-zinc-200 dark:border-zinc-700"
                        >
                          ⚙️ Edit Role
                        </button>
                      )}

                      {(activeUser.role === 'tenant_owner' || isSuperAdminSession) && m.id !== activeUser.id && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              toggleMemberStatus(
                                m.id,
                                m.status === 'active' ? 'revoked' : 'active'
                              )
                            }
                            className="text-[11px] underline text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer px-1"
                          >
                            {m.status === 'active' ? 'Revoke' : 'Restore'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Are you sure you want to delete member ${m.name}? Cascade will clear assigned tasks and timesheets.`
                                )
                              ) {
                                const res = deleteMember(m.id)
                                setBanner({ ok: res.ok, text: res.message })
                              }
                            }}
                            className="text-[11px] text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 underline cursor-pointer px-1"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRE-DEFINED & CUSTOM ROLES MANAGER */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => {
              const isSuper = role.code === 'super_admin'
              const isOwner = role.code === 'tenant_owner'
              const assignedMembers = members.filter(
                (m) => m.role === role.code || m.role === role.id
              )

              return (
                <div
                  key={role.id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        {isSuper ? '👑 ' : isOwner ? '★ ' : '🛡️ '}
                        {role.name}
                      </h4>
                      {role.isSystemRole ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                          System Role
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800">
                          Custom Role
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 min-h-[36px]">
                      {role.description}
                    </p>

                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
                      <span>
                        {isSuper
                          ? 'All Permissions'
                          : `${role.permissions.length} permissions`}
                      </span>
                      <span>{assignedMembers.length} members</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setInspectRoleId(role.id)}
                      className="text-[#6d25da] dark:text-[#a87ce9] hover:text-[#581eae] dark:hover:text-[#c5a8f0] underline cursor-pointer"
                    >
                      View Permissions
                    </button>

                    {!role.isSystemRole && canManageRoles && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditRole(role)}
                          className="px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(role)}
                          className="px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 3: SUPER ADMIN PLATFORM GOVERNANCE (Visible to Super Admin) */}
      {activeTab === 'superadmin' && (
        <div className="space-y-6">
          {/* Master Privilege Card */}
          <div className="rounded-xl border border-amber-600/60 bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/50 p-5 space-y-4 shadow-lg shadow-amber-950/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500 flex items-center justify-center text-xl shrink-0">
                  👑
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    Super Admin Authority
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500 text-amber-700 dark:text-amber-300 font-bold">
                      ACTIVE
                    </span>
                  </h3>
                </div>
              </div>

              <div className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-black/40 text-xs font-mono text-amber-300">
                Workspace: <strong className="text-zinc-900 dark:text-white">{activeTenant.name}</strong> ({activeTenant.slug})
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase text-amber-600 dark:text-amber-400 font-bold block">
                  1. Tenant Governance
                </span>
                <div className="text-xs font-semibold text-zinc-900 dark:text-white">Owner Restriction & Delegation</div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase text-amber-600 dark:text-amber-400 font-bold block">
                  2. Cross-Tenant Switcher
                </span>
                <div className="text-xs font-semibold text-zinc-900 dark:text-white">Full Workspace Access</div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase text-amber-600 dark:text-amber-400 font-bold block">
                  3. Pricing & Entitlements
                </span>
                <div className="text-xs font-semibold text-zinc-900 dark:text-white">Global SaaS Tier Override</div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase text-amber-600 dark:text-amber-400 font-bold block">
                  4. Automated Inheritance
                </span>
                <div className="text-xs font-semibold text-zinc-900 dark:text-white">Dynamic Auto-Granted</div>
              </div>
            </div>
          </div>

          {/* Tenant Owner Permissions Customization Card */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <span>Owner Permissions for</span>
                  <span className="text-[#6d25da] dark:text-[#a87ce9] font-mono">{activeTenant.name}</span>
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetTenantOwnerPerms}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Reset Full Access
                </button>
                <button
                  type="button"
                  onClick={handleSaveTenantOwnerPerms}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  Save Policy ({superAdminOwnerPerms.size})
                </button>
              </div>
            </div>

            {/* Grouped Permission Toggles for Tenant Owner */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PERMISSION_MODULES.filter((m) => m.id !== 'superadmin').map((mod) => {
                const modPerms = permissionsCatalog.filter(
                  (p) => p.module === mod.id && !p.isSuperAdminOnly
                )
                const allSelected = modPerms.every((p) => superAdminOwnerPerms.has(p.key))

                return (
                  <div
                    key={mod.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200 dark:border-zinc-800">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-900 dark:text-white">
                        <span>{mod.icon}</span>
                        <span>{mod.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          toggleModuleInSet(setSuperAdminOwnerPerms,
                            mod.id
                          )
                        }
                        className="text-[10px] font-medium text-[#6d25da] dark:text-[#a87ce9] hover:text-[#581eae] dark:hover:text-[#c5a8f0] underline cursor-pointer"
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {modPerms.map((perm) => {
                        const checked = superAdminOwnerPerms.has(perm.key)
                        return (
                          <label
                            key={perm.key}
                            className={`flex items-start gap-2 p-1.5 rounded-lg cursor-pointer transition text-xs ${
                              checked
                                ? 'bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-zinc-800 dark:text-zinc-200'
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                togglePermissionInSet(setSuperAdminOwnerPerms,
                                  perm.key
                                )
                              }
                              className="mt-0.5 rounded border-zinc-200 dark:border-zinc-700 text-[#6d25da] dark:text-[#a87ce9] focus:ring-0"
                            />
                            <div>
                              <div className="font-semibold text-zinc-900 dark:text-white leading-tight">
                                {perm.label}
                              </div>
                              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                                {perm.description}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE CUSTOM ROLE */}
      {showCreateRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Create Custom Role
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateRoleModal(false)}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRoleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lead QA Specialist"
                    value={newRoleName}
                    onChange={(e) => {
                      setNewRoleName(e.target.value)
                      if (!newRoleCode) {
                        setNewRoleCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_'))
                      }
                    }}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
                    Role Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. qa_specialist"
                    value={newRoleCode}
                    onChange={(e) => setNewRoleCode(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="Description"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Permission Groups */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                    Permissions ({newRolePerms.size} selected)
                  </span>
                  <div className="space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewRolePerms(new Set(ALL_TENANT_PERMISSIONS))}
                      className="text-[#6d25da] dark:text-[#a87ce9] hover:text-[#581eae] dark:hover:text-[#c5a8f0] underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRolePerms(new Set())}
                      className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {PERMISSION_MODULES.filter((m) => m.id !== 'superadmin').map((mod) => {
                    const modPerms = permissionsCatalog.filter(
                      (p) => p.module === mod.id && !p.isSuperAdminOnly
                    )
                    const allSelected = modPerms.every((p) => newRolePerms.has(p.key))

                    return (
                      <div
                        key={mod.id}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-1">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1">
                            <span>{mod.icon}</span>
                            <span>{mod.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              toggleModuleInSet(setNewRolePerms, mod.id)
                            }
                            className="text-[10px] text-[#6d25da] dark:text-[#a87ce9] hover:text-[#581eae] dark:hover:text-[#c5a8f0] underline cursor-pointer"
                          >
                            {allSelected ? 'Clear' : 'All'}
                          </button>
                        </div>

                        <div className="space-y-1">
                          {modPerms.map((perm) => {
                            const checked = newRolePerms.has(perm.key)
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-start gap-2 p-1 rounded cursor-pointer text-xs ${
                                  checked
                                    ? 'bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-zinc-800 dark:text-zinc-200'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    togglePermissionInSet(setNewRolePerms,
                                      perm.key
                                    )
                                  }
                                  className="mt-0.5 rounded border-zinc-200 dark:border-zinc-700 text-[#6d25da] dark:text-[#a87ce9] focus:ring-0"
                                />
                                <div>
                                  <div className="font-semibold text-zinc-900 dark:text-white leading-tight">
                                    {perm.label}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                                    {perm.description}
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowCreateRoleModal(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] font-bold text-white cursor-pointer shadow-md shadow-indigo-600/30"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CUSTOM ROLE */}
      {editingRoleId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Edit Role
              </h3>
              <button
                type="button"
                onClick={() => setEditingRoleId(null)}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateRoleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    value={editRoleName}
                    onChange={(e) => setEditRoleName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editRoleDesc}
                    onChange={(e) => setEditRoleDesc(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Permission Groups */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                    Permissions ({editRolePerms.size} selected)
                  </span>
                  <div className="space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditRolePerms(new Set(ALL_TENANT_PERMISSIONS))}
                      className="text-[#6d25da] dark:text-[#a87ce9] hover:text-[#581eae] dark:hover:text-[#c5a8f0] underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditRolePerms(new Set())}
                      className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {PERMISSION_MODULES.filter((m) => m.id !== 'superadmin').map((mod) => {
                    const modPerms = permissionsCatalog.filter(
                      (p) => p.module === mod.id && !p.isSuperAdminOnly
                    )
                    const allSelected = modPerms.every((p) => editRolePerms.has(p.key))

                    return (
                      <div
                        key={mod.id}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-1">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1">
                            <span>{mod.icon}</span>
                            <span>{mod.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              toggleModuleInSet(setEditRolePerms, mod.id)
                            }
                            className="text-[10px] text-[#6d25da] dark:text-[#a87ce9] hover:text-[#581eae] dark:hover:text-[#c5a8f0] underline cursor-pointer"
                          >
                            {allSelected ? 'Clear' : 'All'}
                          </button>
                        </div>

                        <div className="space-y-1">
                          {modPerms.map((perm) => {
                            const checked = editRolePerms.has(perm.key)
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-start gap-2 p-1 rounded cursor-pointer text-xs ${
                                  checked
                                    ? 'bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-zinc-800 dark:text-zinc-200'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    togglePermissionInSet(setEditRolePerms,
                                      perm.key
                                    )
                                  }
                                  className="mt-0.5 rounded border-zinc-200 dark:border-zinc-700 text-[#6d25da] dark:text-[#a87ce9] focus:ring-0"
                                />
                                <div>
                                  <div className="font-semibold text-zinc-900 dark:text-white leading-tight">
                                    {perm.label}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                                    {perm.description}
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEditingRoleId(null)}
                  className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] font-bold text-white cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT MEMBER ROLE & INDIVIDUAL PERMISSION OVERRIDES */}
      {editingMemberId && selectedEditingMember && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>Edit Member:</span>
                <span className="text-[#6d25da] dark:text-[#a87ce9] font-mono">
                  {selectedEditingMember.name}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingMemberId(null)}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMemberOverrides} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-semibold mb-1">
                  Role
                </label>
                <select
                  value={memberRoleSelect}
                  onChange={(e) => setMemberRoleSelect(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white font-medium"
                >
                  <optgroup label="System Roles">
                    <option value="developer">Developer</option>
                    <option value="project_manager">Project Manager</option>
                    <option value="finance">Finance</option>
                    <option value="client_reviewer">Client Reviewer</option>
                    <option value="auditor">Auditor</option>
                  </optgroup>
                  {roles.filter((r) => !r.isSystemRole).length > 0 && (
                    <optgroup label="Custom Roles">
                      {roles
                        .filter((r) => !r.isSystemRole)
                        .map((r) => (
                          <option key={r.id} value={r.code}>
                            {r.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Extra Granular Overrides */}
              <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]">
                    Permission Overrides ({memberCustomPerms.size})
                  </span>
                  <button
                    type="button"
                    onClick={() => setMemberCustomPerms(new Set())}
                    className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline"
                  >
                    Clear Overrides
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                  {permissionsCatalog.filter((p) => !p.isSuperAdminOnly).map((perm) => {
                    const checked = memberCustomPerms.has(perm.key)
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition ${
                          checked
                            ? 'border-[#6d25da] bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-zinc-800 dark:text-zinc-200'
                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            togglePermissionInSet(setMemberCustomPerms,
                              perm.key
                            )
                          }
                          className="mt-0.5 rounded border-zinc-200 dark:border-zinc-700 text-[#6d25da] dark:text-[#a87ce9] focus:ring-0"
                        />
                        <div>
                          <div className="font-semibold text-zinc-900 dark:text-white leading-tight">
                            {perm.label}
                          </div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                            {perm.key}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEditingMemberId(null)}
                  className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] font-bold text-white cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: INSPECT ROLE PERMISSIONS MATRIX */}
      {inspectRoleId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {(() => {
              const role = roles.find((r) => r.id === inspectRoleId)
              if (!role) return null
              const isSuper = role.code === 'super_admin'

              return (
                <>
                  <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <span>Role Permissions:</span>
                        <span className="text-[#6d25da] dark:text-[#a87ce9]">{role.name}</span>
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{role.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectRoleId(null)}
                      className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-lg p-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                    {isSuper ? (
                      <div className="rounded-xl border border-amber-600/60 bg-amber-50 dark:bg-amber-950/40 p-4 space-y-2">
                        <div className="font-bold text-amber-800 dark:text-amber-200">
                          👑 Universal Master Access
                        </div>
                        <p className="text-zinc-700 dark:text-zinc-300 text-xs">
                          Super Admin has wildcard full access to all system actions and platform functions. Any newly created permissions are automatically granted dynamically.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {role.permissions.map((pk) => {
                          const def = permissionsCatalog.find((p) => p.key === pk)
                          return (
                            <div key={pk} className="py-2 flex items-start justify-between gap-3">
                              <div>
                                <span className="font-semibold text-zinc-900 dark:text-white">
                                  {def?.label ?? pk}
                                </span>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                  {def?.description ?? pk}
                                </p>
                              </div>
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[#6d25da] dark:text-[#c5a8f0]">
                                {pk}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setInspectRoleId(null)}
                      className="px-4 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

