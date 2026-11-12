import { useEffect, useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { isSupabaseAuthConfigured, supabase } from '@/lib/supabaseClient'

export function AuthAndOnboardingView() {
  const {
    activeTenant,
    activeEntitlement,
    createTenantWorkspace,
    publishPolicyVersion,
    members,
    activeUser,
    signOut,
    acknowledgeCurrentPolicy,
    projects,
  } = usePhase1Store()

  // Supabase Auth State (F1-002)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'magiclink' | 'recovery'>('login')
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null)
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [isRecoverySession, setIsRecoverySession] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  useEffect(() => {
    if (!supabase || !isSupabaseAuthConfigured) return
    let active = true

    if (window.location.hash.includes('type=recovery')) {
      setIsRecoverySession(true)
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedInEmail(data.session?.user?.email ?? null)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setSignedInEmail(session?.user?.email ?? null)
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true)
        setAuthNotice('Password recovery link verified. Enter your new password below.')
      }
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  // Tenant Onboarding State (F1-001)
  const [wsName, setWsName] = useState('')
  const [wsSlug, setWsSlug] = useState('')
  const [wsTimezone, setWsTimezone] = useState('America/New_York')
  const [wsCurrency, setWsCurrency] = useState('USD')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [onboardingNotice, setOnboardingNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // Policy Publisher State (F1-030)
  const [newPolicyCode, setNewPolicyCode] = useState('v1.1-2026-11')
  const [newPolicySummary, setNewPolicySummary] = useState(
    'Updated retention window to 365 days; keystrokes, clipboard & default screenshots remain hard-denied.'
  )

  async function handleSupabaseAuth(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !isSupabaseAuthConfigured) {
      setAuthNotice(
        'Supabase Auth client is in local preview mode (configure VITE_SUPABASE_URL & VITE_SUPABASE_PUBLISHABLE_KEY in .env.local to authenticate against Supabase Auth).'
      )
      return
    }

    const appRedirect = `${window.location.origin}/auth-privacy`

    if (authMode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      })
      setAuthNotice(error ? `Auth error: ${error.message}` : `Signed in as ${data.user?.email}`)
    } else if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          emailRedirectTo: appRedirect,
        },
      })
      setAuthNotice(
        error
          ? `Signup error: ${error.message}`
          : `Verification email sent to ${data.user?.email ?? authEmail} via Resend. Please check your inbox!`
      )
    } else if (authMode === 'magiclink') {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: {
          emailRedirectTo: appRedirect,
        },
      })
      setAuthNotice(
        error
          ? `Magic link error: ${error.message}`
          : `Magic link dispatched to ${authEmail} via Resend. Check your inbox to sign in with one click!`
      )
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
        redirectTo: appRedirect,
      })
      setAuthNotice(
        error
          ? `Recovery error: ${error.message}`
          : `Password recovery link sent to ${authEmail} via Resend. Check your inbox!`
      )
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !newPassword.trim()) return
    setIsUpdatingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword.trim() })
    setIsUpdatingPassword(false)
    if (error) {
      setAuthNotice(`Update password error: ${error.message}`)
    } else {
      setAuthNotice('Password updated successfully! You are now logged in with your new password.')
      setIsRecoverySession(false)
      setNewPassword('')
    }
  }

  async function handleEnrollTotpMfa() {
    if (!supabase || !isSupabaseAuthConfigured) {
      setAuthNotice('TOTP MFA enrollment requires an active authenticated Supabase session.')
      return
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error) {
      setAuthNotice(`MFA enroll error: ${error.message}`)
      return
    }
    setMfaFactorId(data.id)
    setMfaQrCode(data.totp.qr_code)
    setAuthNotice('Scan the TOTP QR code with your authenticator app and verify below.')
  }

  async function handleVerifyTotpMfa() {
    if (!supabase || !mfaFactorId) return
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId,
      code: mfaCode,
    })
    setAuthNotice(error ? `MFA verification failed: ${error.message}` : 'TOTP MFA verified and active!')
  }

  function handleProvisionTenant(e: React.FormEvent) {
    e.preventDefault()
    if (!wsName.trim() || !wsSlug.trim() || !ownerName.trim() || !ownerEmail.trim()) return
    const res = createTenantWorkspace({
      name: wsName.trim(),
      slug: wsSlug.trim(),
      timezone: wsTimezone,
      currency: wsCurrency,
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim(),
    })
    setOnboardingNotice({ ok: res.ok, text: res.message })
    if (res.ok) {
      setWsName('')
      setWsSlug('')
      setOwnerName('')
      setOwnerEmail('')
    }
  }

  const activeSeatCount = members.filter((m) => m.status === 'active').length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Supabase Auth + TOTP MFA Panel (F1-002) */}
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                F1-002 • Identity, Recovery & TOTP MFA
              </span>
              <h3 className="text-sm font-bold text-white mt-0.5">
                Supabase Auth Sign-In & Privileged Role MFA
              </h3>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                isSupabaseAuthConfigured
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-amber-950 text-amber-300 border-amber-700'
              }`}
            >
              {isSupabaseAuthConfigured ? 'Supabase Auth Ready' : 'Preview Mode'}
            </span>
          </div>

          {signedInEmail && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-700/60 bg-emerald-950/50 px-3 py-2 text-xs text-emerald-200">
              <span>
                Signed in via Supabase Auth: <strong>{signedInEmail}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => {
                    setSignedInEmail(null)
                    setAuthNotice('Signed out from Supabase Auth.')
                  })
                }}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          )}

          {isRecoverySession && (
            <form
              onSubmit={(e) => void handleUpdatePassword(e)}
              className="p-3 rounded-lg border border-amber-500/50 bg-amber-950/30 space-y-2 text-xs"
            >
              <div className="font-semibold text-amber-300">Set New Password</div>
              <p className="text-[11px] text-slate-300">
                You have authenticated via a secure email recovery link. Enter your new password below.
              </p>
              <input
                type="password"
                placeholder="New Password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-amber-700/60 bg-slate-950 px-3 py-2 text-white"
                required
                minLength={6}
              />
              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {isUpdatingPassword ? 'Updating Password...' : 'Save New Password'}
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            {(['signup', 'login', 'recovery'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAuthMode(mode)}
                className={`px-3 py-1.5 rounded-lg font-medium capitalize cursor-pointer ${
                  authMode === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 border border-slate-800 text-slate-300'
                }`}
              >
                {mode === 'recovery'
                  ? 'Reset Password'
                  : mode === 'signup'
                    ? 'Sign Up'
                    : 'Log In'}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void handleSupabaseAuth(e)} className="space-y-3 text-xs">
            <input
              type="email"
              placeholder="Work Email (e.g. aria@northstar.dev)"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              required
            />
            {authMode !== 'recovery' && authMode !== 'magiclink' && (
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                required
              />
            )}
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white cursor-pointer"
            >
              {authMode === 'login'
                ? 'Sign In via Supabase Auth'
                : authMode === 'signup'
                  ? 'Create Verified Account (Email Verification)'
                  : authMode === 'magiclink'
                    ? 'Send One-Click Magic Link Email'
                    : 'Send Password Reset Email'}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">
                TOTP Multi-Factor Authentication (Required for Owner / Finance)
              </span>
              <button
                type="button"
                onClick={() => void handleEnrollTotpMfa()}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-medium cursor-pointer"
              >
                Enroll TOTP Factor
              </button>
            </div>
            {mfaQrCode && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <img src={mfaQrCode} alt="TOTP MFA QR Code" className="h-20 w-20 bg-white p-1 rounded" />
                <div className="space-y-2 flex-1">
                  <input
                    type="text"
                    placeholder="6-digit TOTP code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => void handleVerifyTotpMfa()}
                    className="px-3 py-1 rounded bg-emerald-600 text-white font-semibold cursor-pointer"
                  >
                    Verify MFA Code
                  </button>
                </div>
              </div>
            )}
            {authNotice && (
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-2.5 text-slate-300">
                {authNotice}
              </div>
            )}
          </div>
        </div>

        {/* Tenant Provisioning Wizard (F1-001) + Plan Entitlements (F1-006) */}
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              F1-001 / F1-006 • Tenant Registration & Plan Entitlements
            </span>
            <h3 className="text-sm font-bold text-white mt-0.5">
              Provision New Organization Workspace
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
              <span className="text-slate-400 block text-[10px]">Active Plan</span>
              <span className="font-mono font-bold text-indigo-300 uppercase">
                {activeTenant.planTier}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
              <span className="text-slate-400 block text-[10px]">Seat Quota (F1-006)</span>
              <span className="font-mono font-bold text-white">
                {activeSeatCount} / {activeEntitlement.maxSeats}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
              <span className="text-slate-400 block text-[10px]">Projects Quota</span>
              <span className="font-mono font-bold text-white">
                {projects.length} / {activeEntitlement.maxActiveProjects}
              </span>
            </div>
          </div>

          {onboardingNotice && (
            <div
              className={`rounded-lg border p-2.5 text-xs ${
                onboardingNotice.ok
                  ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                  : 'border-rose-700 bg-rose-950/40 text-rose-200'
              }`}
            >
              {onboardingNotice.text}
            </div>
          )}

          <form onSubmit={handleProvisionTenant} className="space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                placeholder="Organization Name (e.g. Horizon Labs)"
                value={wsName}
                onChange={(e) => {
                  setWsName(e.target.value)
                  if (!wsSlug) {
                    setWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
                  }
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                required
              />
              <input
                type="text"
                placeholder="Slug (e.g. horizon-labs)"
                value={wsSlug}
                onChange={(e) => setWsSlug(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                placeholder="Timezone (e.g. UTC)"
                value={wsTimezone}
                onChange={(e) => setWsTimezone(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono"
                required
              />
              <select
                value={wsCurrency}
                onChange={(e) => setWsCurrency(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                placeholder="Owner Full Name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                required
              />
              <input
                type="email"
                placeholder="Owner Email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-white cursor-pointer"
            >
              + Provision Tenant Workspace (F1-001)
            </button>
          </form>
        </div>
      </div>

      {/* Policy Versioning & Member Consent Matrix (F1-030) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              F1-030 & Principle 6 • Versioned Privacy Policies & Member Consent Ledger
            </span>
            <h3 className="text-sm font-bold text-white mt-0.5">
              Active Policy: {activeTenant.policyVersion}
            </h3>
          </div>
          {activeUser.consentedPolicyVersion !== activeTenant.policyVersion && (
            <button
              type="button"
              onClick={acknowledgeCurrentPolicy}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
            >
              Acknowledge Policy {activeTenant.policyVersion}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
          <div className="lg:col-span-6 space-y-2">
            <div className="font-semibold text-slate-300">Member Consent Status</div>
            <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/70">
              {members.map((m) => {
                const upToDate = m.consentedPolicyVersion === activeTenant.policyVersion
                return (
                  <div key={m.id} className="px-3.5 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-white">{m.name}</span>{' '}
                      <span className="font-mono text-[11px] text-slate-400">({m.role})</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                        upToDate
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
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
            <div className="lg:col-span-6 space-y-2.5 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <div className="font-semibold text-white">
                Publish New Tracking Policy Version (Non-Retroactive)
              </div>
              <input
                type="text"
                value={newPolicyCode}
                onChange={(e) => setNewPolicyCode(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-white font-mono"
              />
              <textarea
                rows={2}
                value={newPolicySummary}
                onChange={(e) => setNewPolicySummary(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-white"
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

