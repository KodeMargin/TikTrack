import { useEffect, useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { CountryTimezonePicker } from '@/components/CountryTimezonePicker'
import { detectUserLocation } from '@/lib/countryTimezones'
import { RolesAndPermissionsManager } from '@/features/billing-contracts/RolesAndPermissionsManager'
import { PaymentModeConfigCard } from '@/features/payments/PaymentModeConfigCard'

export function AuthAndOnboardingView() {
  const {
    activeTenant,
    activeEntitlement,
    createTenantWorkspace,
    publishPolicyVersion,
    members,
    roles,
    activeUser,
    isSuperAdminSession,
    sessionUserEmail,
    sessionUserName,
    hasPermission,
    inviteMember,
    acknowledgeCurrentPolicy,
    projects,
  } = usePhase1Store()

  const defaultOwnerName = sessionUserName || activeUser.name || ''
  const defaultOwnerEmail = sessionUserEmail || activeUser.email || ''

  // Invite Team Member State
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('developer')
  const [inviteTempPassword, setInviteTempPassword] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteNotice, setInviteNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // Multi-Tenant Workspace Provisioning State (F1-001)
  const [wsName, setWsName] = useState('')
  const [wsSlug, setWsSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [wsCountryCode, setWsCountryCode] = useState(() => detectUserLocation().countryCode)
  const [wsTimezone, setWsTimezone] = useState(() => detectUserLocation().timezone)
  const [wsCurrency, setWsCurrency] = useState('USD')
  const [ownerName, setOwnerName] = useState(defaultOwnerName)
  const [ownerEmail, setOwnerEmail] = useState(defaultOwnerEmail)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [onboardingNotice, setOnboardingNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!isSuperAdminSession) {
      setOwnerName(defaultOwnerName)
      setOwnerEmail(defaultOwnerEmail)
    } else {
      if (!ownerName && defaultOwnerName) setOwnerName(defaultOwnerName)
      if (!ownerEmail && defaultOwnerEmail) setOwnerEmail(defaultOwnerEmail)
    }
  }, [defaultOwnerName, defaultOwnerEmail, isSuperAdminSession])

  // Policy Publisher State (F1-030)
  const [newPolicyCode, setNewPolicyCode] = useState('v1.1-2026-11')
  const [newPolicySummary, setNewPolicySummary] = useState(
    'Updated retention window to 365 days; keystrokes, clipboard & default screenshots remain hard-denied.'
  )

  const canManageMembers =
    hasPermission('member:invite') || hasPermission('member:edit_role') || isSuperAdminSession
  const canCreateWorkspace = activeUser.role === 'tenant_owner' || isSuperAdminSession

  function generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let pass = 'Dev@'
    for (let i = 0; i < 5; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    pass += `${Math.floor(10 + Math.random() * 90)}!`
    setInviteTempPassword(pass)
  }

  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteName.trim() || !inviteEmail.trim() || isInviting) return
    const tempPass = inviteTempPassword.trim() || `Dev@${Math.floor(1000 + Math.random() * 9000)}!`
    setIsInviting(true)
    setInviteNotice(null)
    try {
      const res = await inviteMember(inviteName.trim(), inviteEmail.trim(), inviteRole, tempPass)
      if (res.ok) {
        setInviteName('')
        setInviteEmail('')
        setInviteTempPassword('')
      }
      const issuedPass = res.temporaryPassword || tempPass
      setInviteNotice({
        ok: res.ok && res.emailSent !== false,
        text: res.ok ? `${res.message} Temporary Password: ${issuedPass}` : res.message,
      })
    } finally {
      setIsInviting(false)
    }
  }

  async function handleProvisionTenant(e: React.FormEvent) {
    e.preventDefault()
    const resolvedOwnerName = (isSuperAdminSession ? ownerName : defaultOwnerName).trim()
    const resolvedOwnerEmail = (isSuperAdminSession ? ownerEmail : defaultOwnerEmail).trim().toLowerCase()
    if (!wsName.trim() || !wsSlug.trim() || !resolvedOwnerName || !resolvedOwnerEmail || creatingWorkspace) {
      return
    }

    setCreatingWorkspace(true)
    setOnboardingNotice(null)
    try {
      const isSelfOwned =
        Boolean(defaultOwnerEmail) &&
        resolvedOwnerEmail === defaultOwnerEmail.trim().toLowerCase()

      const res = await createTenantWorkspace({
        name: wsName.trim(),
        slug: wsSlug.trim(),
        timezone: wsTimezone,
        currency: wsCurrency,
        ownerName: resolvedOwnerName,
        ownerEmail: resolvedOwnerEmail,
        skipOwnerInvite: isSelfOwned,
      })
      setOnboardingNotice({ ok: res.ok, text: res.message })
      if (res.ok) {
        setWsName('')
        setWsSlug('')
        setSlugTouched(false)
        if (isSuperAdminSession) {
          setOwnerName(defaultOwnerName)
          setOwnerEmail(defaultOwnerEmail)
        }
      }
    } finally {
      setCreatingWorkspace(false)
    }
  }

  const activeSeatCount = members.filter((m) => m.status === 'active').length

  return (
    <div className="space-y-6">
      {/* Top Grid: Invite Team Member + Add New Workspace */}
      {(canManageMembers || canCreateWorkspace) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Invite Team Member */}
          {canManageMembers && (
            <div className={`${canCreateWorkspace ? 'lg:col-span-6' : 'lg:col-span-12'} rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Invite Team Member
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Add a member to <strong className="text-zinc-700 dark:text-zinc-200">{activeTenant.name}</strong> and dispatch login credentials via email.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono border bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 shrink-0">
                  {activeSeatCount} / {activeEntitlement.maxSeats} Seats
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2.5">
                  <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Active Plan</span>
                  <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0] uppercase">
                    {activeTenant.planTier}
                  </span>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2.5">
                  <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Seat Quota</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    {activeSeatCount} / {activeEntitlement.maxSeats}
                  </span>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2.5">
                  <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Projects Quota</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    {projects.length} / {activeEntitlement.maxActiveProjects}
                  </span>
                </div>
              </div>

              {inviteNotice && (
                <div
                  className={`rounded-lg border p-2.5 text-xs ${
                    inviteNotice.ok
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                      : 'border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {inviteNotice.text}
                </div>
              )}

              <form onSubmit={(e) => void handleInviteMember(e)} className="space-y-2.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
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
                  <div>
                    <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Temporary Password</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Auto-generated if empty"
                        value={inviteTempPassword}
                        onChange={(e) => setInviteTempPassword(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={generateTempPassword}
                        title="Generate Random Temporary Password"
                        className="px-2.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[11px] font-semibold cursor-pointer shrink-0 transition"
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isInviting}
                  className="w-full py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] font-semibold text-white cursor-pointer disabled:opacity-50 transition"
                >
                  {isInviting ? 'Sending Invite...' : '+ Invite Member'}
                </button>
              </form>
            </div>
          )}

          {/* Create New Workspace (Tenant Owner & Super Admin) */}
          {canCreateWorkspace && (
            <div className={`${canManageMembers ? 'lg:col-span-6' : 'lg:col-span-12'} rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4`}>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Add New Workspace
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Provision an additional isolated tenant workspace under your ownership.
                </p>
              </div>

              {onboardingNotice && (
                <div
                  className={`rounded-lg border p-2.5 text-xs ${
                    onboardingNotice.ok
                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                      : 'border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {onboardingNotice.text}
                </div>
              )}

              <form onSubmit={(e) => void handleProvisionTenant(e)} className="space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Workspace / Organization Name"
                    value={wsName}
                    onChange={(e) => {
                      const next = e.target.value
                      setWsName(next)
                      if (!slugTouched) {
                        setWsSlug(
                          next
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-|-$/g, '')
                        )
                      }
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Workspace Slug"
                    value={wsSlug}
                    onChange={(e) => {
                      setSlugTouched(true)
                      setWsSlug(e.target.value)
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Currency</label>
                  <select
                    value={wsCurrency}
                    onChange={(e) => setWsCurrency(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="LKR">LKR (Rs)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="AUD">AUD (A$)</option>
                  </select>
                </div>

                <CountryTimezonePicker
                  countryCode={wsCountryCode}
                  timezone={wsTimezone}
                  onChange={({ countryCode, timezone }) => {
                    setWsCountryCode(countryCode)
                    setWsTimezone(timezone)
                  }}
                />

                {isSuperAdminSession ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder="Owner Full Name"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                      required
                    />
                    <input
                      type="email"
                      placeholder="Owner Email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
                      required
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-zinc-500 dark:text-zinc-400">Tenant Owner</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">
                      {defaultOwnerName} ({defaultOwnerEmail})
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creatingWorkspace}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-white cursor-pointer disabled:opacity-50 transition"
                >
                  {creatingWorkspace ? 'Creating Workspace...' : 'Create Workspace'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Workspace Feature Configuration (Payment Calculation Mode: User-Wise / Task-Wise / Hybrid) */}
      {(activeUser.role === 'tenant_owner' ||
        isSuperAdminSession ||
        hasPermission('payment:configure')) && <PaymentModeConfigCard />}

      {/* Team, Roles & Granular Permissions (RBAC) */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5">
        <RolesAndPermissionsManager hideInviteForm />
      </div>

      {/* Policy Versioning & Member Consent Matrix (F1-030) */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Privacy Policy ({activeTenant.policyVersion})
            </h3>
          </div>
          {activeUser.consentedPolicyVersion !== activeTenant.policyVersion && (
            <button
              type="button"
              onClick={acknowledgeCurrentPolicy}
              className="px-3.5 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white cursor-pointer"
            >
              Acknowledge Policy {activeTenant.policyVersion}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
          <div className="lg:col-span-6 space-y-2">
            <div className="font-semibold text-zinc-700 dark:text-zinc-300">Member Consent Status</div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70">
              {members.map((m) => {
                const upToDate = m.consentedPolicyVersion === activeTenant.policyVersion
                return (
                  <div key={m.id} className="px-3.5 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-zinc-900 dark:text-white">{m.name}</span>{' '}
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">({m.role})</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                        upToDate
                          ? 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800'
                          : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      {upToDate ? `✓ Consented (${m.consentedPolicyVersion})` : 'Pending Re-Consent'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {activeUser.role === 'tenant_owner' && (
            <div className="lg:col-span-6 space-y-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 p-4">
              <div className="font-semibold text-zinc-700 dark:text-white">
                Publish Policy Version
              </div>
              <input
                type="text"
                value={newPolicyCode}
                onChange={(e) => setNewPolicyCode(e.target.value)}
                className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-zinc-900 dark:text-white font-mono"
              />
              <textarea
                rows={2}
                value={newPolicySummary}
                onChange={(e) => setNewPolicySummary(e.target.value)}
                className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-zinc-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => publishPolicyVersion(newPolicyCode.trim(), newPolicySummary.trim())}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 font-semibold text-white cursor-pointer"
              >
                Publish Policy Version
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
