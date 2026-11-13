import { useState, useMemo, useEffect } from 'react'
import { usePhase1Store, type WorkspaceMember } from '@/context/Phase1Store'
import {
  PERMISSION_MODULES,
  ALL_TENANT_PERMISSIONS,
  DEFAULT_TENANT_OWNER_PERMISSIONS,
  type CustomRole,
} from '@/types/permissions.types'

export function RolesAndPermissionsManager() {
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
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  // Invite member state
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('developer')
  const [inviteTempPassword, setInviteTempPassword] = useState('')

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

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteName.trim() || !inviteEmail.trim()) return
    const tempPass = inviteTempPassword.trim() || `Dev@${Math.floor(1000 + Math.random() * 9000)}!`
    const res = inviteMember(inviteName.trim(), inviteEmail.trim(), inviteRole, tempPass)
    if (res.ok) {
      setInviteName('')
      setInviteEmail('')
      setInviteTempPassword('')
    }
    setBanner({ ok: res.ok, text: `${res.message} Temporary Password: ${tempPass}` })
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
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            banner.ok
              ? 'border-emerald-700 bg-emerald-950/60 text-emerald-200'
              : 'border-rose-700 bg-rose-950/70 text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="underline ml-4 cursor-pointer text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'roster'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>👥 Team Members & Role Grants</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-black/30">
              {members.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'roles'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🛡️ Pre-defined & Custom Roles</span>
            <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-black/30">
              {roles.length}
            </span>
          </button>

          {(isSuperAdminSession || activeUser.role === 'super_admin') && (
            <button
              type="button"
              onClick={() => setActiveTab('superadmin')}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'superadmin'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white font-semibold shadow-sm'
                  : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              <span>👑 Super Admin Governance</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-amber-200">
                MASTER
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            title={
              rbacSeedStatus
                ? `PostgreSQL RBAC Seed Checksum: ${rbacSeedStatus.checksum}`
                : 'Permissions seed status'
            }
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 ${
              prismaStatus.connected
                ? 'border-emerald-700/70 bg-emerald-950/50 text-emerald-300'
                : 'border-amber-700/70 bg-amber-950/50 text-amber-300'
            }`}
          >
            <span>{prismaStatus.connected ? '🗄️ DB Persisted:' : '💾 Offline Cache:'}</span>
            <strong>{permissionsCatalog.length} permissions</strong>
            {rbacSeedStatus && (
              <span className="text-slate-400">
                (seed #{rbacSeedStatus.checksum.slice(0, 8)})
              </span>
            )}
          </div>

          {prismaStatus.connected && (isSuperAdminSession || activeUser.role === 'super_admin') && (
            <button
              type="button"
              onClick={() => {
                void reseedPermissionsToDatabase().then((res) =>
                  setBanner({ ok: res.ok, text: res.message })
                )
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px] font-medium text-slate-200 cursor-pointer"
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
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer shadow-md shadow-indigo-600/20"
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
          {canManageMembers && (
            <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
              <input
                type="text"
                placeholder="Full Name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="sm:col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                required
              />
              <input
                type="email"
                placeholder="Email Address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="sm:col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                required
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="sm:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white font-medium"
              >
                <optgroup label="System Pre-Defined Roles">
                  <option value="developer">Developer</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="finance">Finance</option>
                  <option value="client_reviewer">Client Reviewer</option>
                  <option value="auditor">Auditor</option>
                </optgroup>
                {roles.filter((r) => !r.isSystemRole).length > 0 && (
                  <optgroup label="Tenant Custom Roles">
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
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-white text-[11px] font-mono"
                />
                <button
                  type="button"
                  onClick={generateTempPassword}
                  title="Generate Random Temporary Password"
                  className="px-2 py-2 rounded-lg border border-indigo-700 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-[10px] font-semibold cursor-pointer shrink-0"
                >
                  Auto
                </button>
              </div>
              <button
                type="submit"
                className="sm:col-span-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white px-3 py-2 cursor-pointer text-center transition"
              >
                + Invite Member
              </button>
            </form>
          )}

          {/* Members Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden text-xs">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Active Team Members & Granular Authorization
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tenant owners can allocate pre-defined system roles or custom roles, plus individual granular permission overrides.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {members.length} member(s) registered
              </span>
            </div>

            <div className="divide-y divide-slate-800">
              {members.map((m) => {
                const assignedRole = roles.find((r) => r.code === m.role || r.id === m.role)
                const isSuper = m.role === 'super_admin'
                const isOwner = m.role === 'tenant_owner'
                const effectivePermCount = getUserPermissions(m).length
                const customOverrideCount = m.customPermissions?.length ?? 0

                return (
                  <div
                    key={m.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-950/40 transition"
                  >
                    <div className="space-y-1 min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">
                          {m.name}
                        </span>
                        {isSuper ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-600">
                            👑 SUPER ADMIN (ALL PERMS)
                          </span>
                        ) : isOwner ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-600">
                            ★ TENANT OWNER
                          </span>
                        ) : assignedRole?.isSystemRole ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                            SYSTEM: {assignedRole.name}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-950 text-emerald-300 border border-emerald-700">
                            CUSTOM: {assignedRole?.name ?? m.role}
                          </span>
                        )}

                        {customOverrideCount > 0 && (
                          <span
                            title={`${customOverrideCount} individual permission override(s) active`}
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-violet-950 text-violet-300 border border-violet-700"
                          >
                            +{customOverrideCount} Overrides
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono">
                        {m.email} • Policy: {m.consentedPolicyVersion ?? 'None'} • {effectivePermCount} Action(s) Authorized
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                          m.status === 'active'
                            ? 'bg-emerald-950 text-emerald-300'
                            : m.status === 'invited'
                              ? 'bg-amber-950/90 border border-amber-700/80 text-amber-300'
                              : 'bg-rose-950 text-rose-300'
                        }`}
                      >
                        {m.status === 'invited' ? 'Pending 1st Login' : m.status}
                      </span>

                      {m.status === 'invited' && m.temporaryPassword && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 border border-slate-700 text-slate-300">
                          Key: {m.temporaryPassword}
                        </span>
                      )}

                      {m.status === 'invited' && (
                        <button
                          type="button"
                          onClick={() => {
                            const res = resendMemberInvite(m.id)
                            setBanner({ ok: res.ok, text: res.message })
                          }}
                          className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                        >
                          Resend Invite
                        </button>
                      )}

                      {canManageMembers && !isSuper && (
                        <button
                          type="button"
                          onClick={() => startEditMember(m)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer border border-slate-700"
                        >
                          ⚙️ Role & Overrides
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
                            className="text-[11px] underline text-slate-400 hover:text-white cursor-pointer px-1"
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
                            className="text-[11px] text-rose-400 hover:text-rose-300 underline cursor-pointer px-1"
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
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                        {isSuper ? '👑 ' : isOwner ? '★ ' : '🛡️ '}
                        {role.name}
                      </h4>
                      {role.isSystemRole ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                          Pre-Defined Role
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-950 text-emerald-300 border border-emerald-700">
                          Tenant Custom Role
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 min-h-[36px]">
                      {role.description}
                    </p>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>
                        {isSuper
                          ? 'All Permissions + Auto-Applied'
                          : `${role.permissions.length} Granular Permission(s)`}
                      </span>
                      <span>{assignedMembers.length} member(s)</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setInspectRoleId(role.id)}
                      className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      View Permissions Matrix
                    </button>

                    {!role.isSystemRole && canManageRoles && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditRole(role)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-medium cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(role)}
                          className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800 text-rose-300 cursor-pointer"
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
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Super Admin Universal Platform Authority
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500 text-amber-300 font-bold">
                      ACTIVE PRIVILEGE
                    </span>
                  </h3>
                  <p className="text-xs text-amber-200/80 mt-0.5">
                    Universal Wildcard (*): Automatically resolves and grants ALL current granular permissions and any future permissions registered in the platform without manual intervention.
                  </p>
                </div>
              </div>

              <div className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-black/40 text-xs font-mono text-amber-300">
                Tenant Context: <strong className="text-white">{activeTenant.name}</strong> ({activeTenant.slug})
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                  1. Tenant Governance
                </span>
                <div className="text-xs font-semibold text-white">Owner Restriction & Delegation</div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Super Admin controls the base permission bundle allocated to workspace Tenant Owners.
                </p>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                  2. Cross-Tenant Switcher
                </span>
                <div className="text-xs font-semibold text-white">Full Workspace Access</div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Seamlessly jump between workspaces or preview any role without authorization denial.
                </p>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                  3. Pricing & Entitlements
                </span>
                <div className="text-xs font-semibold text-white">Global SaaS Tier Override</div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Modify seat caps, data retention policies and billing rules across all subscription tiers.
                </p>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-black/30 p-3 space-y-1">
                <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                  4. Automated Inheritance
                </span>
                <div className="text-xs font-semibold text-white">Dynamic Auto-Granted</div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Any new module, route or API action added to TikTrack is automatically accessible to Super Admins.
                </p>
              </div>
            </div>
          </div>

          {/* Tenant Owner Permissions Customization Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Tenant Owner Permission Governance for</span>
                  <span className="text-indigo-400 font-mono">{activeTenant.name}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  As Super Admin, configure exactly which granular actions the Tenant Owner of this workspace is authorized to perform.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetTenantOwnerPerms}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                >
                  Reset Full Access
                </button>
                <button
                  type="button"
                  onClick={handleSaveTenantOwnerPerms}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  Save Tenant Owner Policy ({superAdminOwnerPerms.size} Actions)
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
                    className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-white">
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
                        className="text-[10px] font-medium text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
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
                                ? 'bg-indigo-950/40 text-slate-200'
                                : 'hover:bg-slate-900 text-slate-400'
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
                              className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                            />
                            <div>
                              <div className="font-semibold text-white leading-tight">
                                {perm.label}
                              </div>
                              <div className="text-[10px] text-slate-400 leading-tight">
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
          <div className="rounded-2xl border border-slate-800 bg-slate-900 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Create New Tenant Role (Podima Granular Level)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select exact fine-grained permissions for this role. Team members assigned this role will inherit these capabilities.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateRoleModal(false)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRoleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
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
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    System Identifier Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. qa_specialist"
                    value={newRoleCode}
                    onChange={(e) => setNewRoleCode(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="Responsibilities and access scope..."
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Permission Groups */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Granular Action Permissions Checklist ({newRolePerms.size} selected)
                  </span>
                  <div className="space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewRolePerms(new Set(ALL_TENANT_PERMISSIONS))}
                      className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRolePerms(new Set())}
                      className="text-slate-400 hover:text-slate-200 underline cursor-pointer"
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
                        className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                          <span className="text-xs font-bold text-white flex items-center gap-1">
                            <span>{mod.icon}</span>
                            <span>{mod.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              toggleModuleInSet(setNewRolePerms, mod.id)
                            }
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
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
                                    ? 'bg-indigo-950/40 text-slate-200'
                                    : 'text-slate-400 hover:bg-slate-900'
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
                                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                                />
                                <div>
                                  <div className="font-semibold text-white leading-tight">
                                    {perm.label}
                                  </div>
                                  <div className="text-[10px] text-slate-400 leading-tight">
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

              <div className="p-4 border-t border-slate-800 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowCreateRoleModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-white cursor-pointer shadow-md shadow-indigo-600/30"
                >
                  Save & Authorize Custom Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CUSTOM ROLE */}
      {editingRoleId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Edit Role & Granular Permissions
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update name, description or permissions assigned to this role.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRoleId(null)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateRoleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    value={editRoleName}
                    onChange={(e) => setEditRoleName(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editRoleDesc}
                    onChange={(e) => setEditRoleDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Permission Groups */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Permissions Checklist ({editRolePerms.size} assigned)
                  </span>
                  <div className="space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditRolePerms(new Set(ALL_TENANT_PERMISSIONS))}
                      className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditRolePerms(new Set())}
                      className="text-slate-400 hover:text-slate-200 underline cursor-pointer"
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
                        className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                          <span className="text-xs font-bold text-white flex items-center gap-1">
                            <span>{mod.icon}</span>
                            <span>{mod.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              toggleModuleInSet(setEditRolePerms, mod.id)
                            }
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
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
                                    ? 'bg-indigo-950/40 text-slate-200'
                                    : 'text-slate-400 hover:bg-slate-900'
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
                                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                                />
                                <div>
                                  <div className="font-semibold text-white leading-tight">
                                    {perm.label}
                                  </div>
                                  <div className="text-[10px] text-slate-400 leading-tight">
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

              <div className="p-4 border-t border-slate-800 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEditingRoleId(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-white cursor-pointer"
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
          <div className="rounded-2xl border border-slate-800 bg-slate-900 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Assign Role & Permissions:</span>
                  <span className="text-indigo-400 font-mono">
                    {selectedEditingMember.name}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tenant owner can change the member's primary role or grant fine-grained permission overrides for this individual.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMemberId(null)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMemberOverrides} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Primary Role Assignment
                </label>
                <select
                  value={memberRoleSelect}
                  onChange={(e) => setMemberRoleSelect(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-medium"
                >
                  <optgroup label="System Pre-Defined Roles">
                    <option value="developer">Developer</option>
                    <option value="project_manager">Project Manager</option>
                    <option value="finance">Finance</option>
                    <option value="client_reviewer">Client Reviewer</option>
                    <option value="auditor">Auditor</option>
                  </optgroup>
                  {roles.filter((r) => !r.isSystemRole).length > 0 && (
                    <optgroup label="Tenant Custom Roles">
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
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                    Individual Granular Overrides ({memberCustomPerms.size} extra granted)
                  </span>
                  <button
                    type="button"
                    onClick={() => setMemberCustomPerms(new Set())}
                    className="text-slate-400 hover:text-white underline"
                  >
                    Clear Overrides
                  </button>
                </div>

                <p className="text-slate-400 text-[11px]">
                  Permissions checked below are granted directly to {selectedEditingMember.name} in addition to the capabilities from their assigned role.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                  {permissionsCatalog.filter((p) => !p.isSuperAdminOnly).map((perm) => {
                    const checked = memberCustomPerms.has(perm.key)
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition ${
                          checked
                            ? 'border-indigo-600 bg-indigo-950/40 text-slate-200'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
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
                          className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-0"
                        />
                        <div>
                          <div className="font-semibold text-white leading-tight">
                            {perm.label}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {perm.key}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="p-4 border-t border-slate-800 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEditingMemberId(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-white cursor-pointer"
                >
                  Save Member Permissions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: INSPECT ROLE PERMISSIONS MATRIX */}
      {inspectRoleId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {(() => {
              const role = roles.find((r) => r.id === inspectRoleId)
              if (!role) return null
              const isSuper = role.code === 'super_admin'

              return (
                <>
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Role Permissions:</span>
                        <span className="text-indigo-400">{role.name}</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">{role.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectRoleId(null)}
                      className="text-slate-400 hover:text-white text-lg p-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                    {isSuper ? (
                      <div className="rounded-xl border border-amber-600/60 bg-amber-950/40 p-4 space-y-2">
                        <div className="font-bold text-amber-200">
                          👑 Universal Master Access
                        </div>
                        <p className="text-slate-300 text-xs">
                          Super Admin has wildcard full access to all system actions and platform functions. Any newly created permissions are automatically granted dynamically.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800">
                        {role.permissions.map((pk) => {
                          const def = permissionsCatalog.find((p) => p.key === pk)
                          return (
                            <div key={pk} className="py-2 flex items-start justify-between gap-3">
                              <div>
                                <span className="font-semibold text-white">
                                  {def?.label ?? pk}
                                </span>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {def?.description ?? pk}
                                </p>
                              </div>
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-indigo-300">
                                {pk}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t border-slate-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setInspectRoleId(null)}
                      className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
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

