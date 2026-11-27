import { useState } from 'react'
import { notifyError, notifyFeedback } from '@/lib/notify'
import { usePhase1Store } from '@/context/Phase1Store'
import { useTheme } from '@/context/ThemeContext'
import { CountryTimezonePicker } from '@/components/CountryTimezonePicker'
import { detectUserLocation } from '@/lib/countryTimezones'
import type { UserRole } from '@/types/domain.types'
import { Select } from '@/components/Select'

interface WorkspaceOnboardingScreenProps {
  onComplete: () => void
  allowCancel?: boolean
  onCancel?: () => void
}

interface InvitedSummary {
  name: string
  email: string
  role: UserRole
}

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function WorkspaceOnboardingScreen({
  onComplete,
  allowCancel = false,
  onCancel,
}: WorkspaceOnboardingScreenProps) {
  const { theme, toggleTheme } = useTheme()
  const {
    sessionUserEmail,
    sessionUserName,
    signOut,
    prismaStatus,
    refreshPrismaConnection,
    provisionWorkspaceSelfService,
    inviteMember,
  } = usePhase1Store()

  const [step, setStep] = useState<'company' | 'invite'>('company')
  const [companyName, setCompanyName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [ownerName, setOwnerName] = useState(
    () => sessionUserName || (sessionUserEmail ? sessionUserEmail.split('@')[0] : '')
  )
  const [ownerEmail, setOwnerEmail] = useState(() => sessionUserEmail || '')
  const [countryCode, setCountryCode] = useState(() => detectUserLocation().countryCode)
  const [timezone, setTimezone] = useState(() => detectUserLocation().timezone)
  const [currency, setCurrency] = useState('USD')
  const [creating, setCreating] = useState(false)
  const setError = (msg: string | null) => {
    if (msg) notifyError(msg)
  }
  const [createdCompanyName, setCreatedCompanyName] = useState('')
  const [createdSlug, setCreatedSlug] = useState('')

  // Step 2: Developer Invite state
  const [devName, setDevName] = useState('')
  const [devEmail, setDevEmail] = useState('')
  const [devRole, setDevRole] = useState<UserRole>('developer')
  const [devTempPassword, setDevTempPassword] = useState('')
  const setInviteNotice = (n: { ok: boolean; text: string } | null) => {
    if (n) notifyFeedback(n)
  }
  const [invitedList, setInvitedList] = useState<InvitedSummary[]>([])

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault()
    const cleanName = companyName.trim()
    if (!cleanName) {
      setError('Please enter your company name.')
      return
    }
    const cleanEmail = (sessionUserEmail || ownerEmail).trim()
    if (!cleanEmail) {
      setError('Owner email is required.')
      return
    }
    const cleanOwnerName = ownerName.trim() || cleanEmail.split('@')[0]
    const cleanSlug = toSlug(slug) || toSlug(cleanName) || `workspace-${Date.now()}`

    setCreating(true)
    setError(null)
    try {
      const res = await provisionWorkspaceSelfService({
        name: cleanName,
        slug: cleanSlug,
        timezone,
        currency,
        ownerName: cleanOwnerName,
        ownerEmail: cleanEmail,
      })
      if (!res.ok) {
        setError(res.message)
        return
      }
      setCreatedCompanyName(cleanName)
      setCreatedSlug(res.slug || cleanSlug)
      setStep('invite')
    } finally {
      setCreating(false)
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    const cleanName = devName.trim()
    const cleanEmail = devEmail.trim().toLowerCase()
    if (!cleanName || !cleanEmail) return

    const res = await inviteMember(
      cleanName,
      cleanEmail,
      devRole,
      devTempPassword.trim() || undefined
    )
    setInviteNotice({ ok: res.ok && res.emailSent !== false, text: res.message })
    if (res.ok) {
      setInvitedList((prev) => [
        ...prev.filter((item) => item.email !== cleanEmail),
        { name: cleanName, email: cleanEmail, role: devRole },
      ])
      setDevName('')
      setDevEmail('')
      setDevTempPassword('')
    }
  }

  function handleGenerateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#'
    let generated = ''
    for (let i = 0; i < 12; i += 1) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setDevTempPassword(generated)
  }

  return (
    <div className="min-h-screen bg-[#f5f5f9] text-zinc-900 dark:bg-[#07070a] dark:text-zinc-100 flex flex-col relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_65%_50%_at_50%_-10%,rgba(109,37,218,0.12),transparent)] dark:bg-[radial-gradient(ellipse_65%_50%_at_50%_-10%,rgba(139,81,225,0.2),transparent)]"
      />

      <header className="h-14 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-[#0c0c0e]/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <img
            src={theme === 'dark' ? '/images/Logo-Light2.png' : '/images/Logo-Dark2.png'}
            alt="TikTrack"
            className="h-8 w-auto object-contain"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {sessionUserEmail && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {sessionUserEmail}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refreshPrismaConnection()}
            className="hidden md:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 cursor-pointer"
          >
            <span
              className={`h-2 w-2 rounded-full ${prismaStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}
            />
            <span>{prismaStatus.connected ? 'Connected' : 'Offline Mode'}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 text-xs font-medium cursor-pointer"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          {allowCancel && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 text-xs font-medium cursor-pointer"
            >
              Back
            </button>
          ) : (
            sessionUserEmail && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-rose-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 text-xs font-medium cursor-pointer"
              >
                Sign out
              </button>
            )
          )}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 relative z-10">
        <div className="w-full max-w-xl rounded-2xl border border-zinc-200/90 bg-white dark:border-white/10 dark:bg-[#11131d] p-6 sm:p-8 shadow-xl space-y-6">
          {/* Stepper */}
          <div className="flex items-center gap-2 text-xs font-medium">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                step === 'company'
                  ? 'bg-[#6d25da]/10 text-[#6d25da] dark:bg-[#8b51e1]/20 dark:text-[#c5a8f0] font-semibold'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <span>{step === 'company' ? '1' : '✓'}</span>
              <span>Company Workspace</span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">→</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                step === 'invite'
                  ? 'bg-[#6d25da]/10 text-[#6d25da] dark:bg-[#8b51e1]/20 dark:text-[#c5a8f0] font-semibold'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.05] dark:text-zinc-400'
              }`}
            >
              <span>2</span>
              <span>Invite Developers</span>
            </span>
          </div>

          {step === 'company' ? (
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  Welcome! Enter your company name
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">
                  We&apos;ll create your dedicated workspace right away so you can start inviting your developers and tracking engineering time.
                </p>
              </div>

              <form onSubmit={(e) => void handleCreateWorkspace(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Company / Workspace Name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Acme Studio"
                    value={companyName}
                    onChange={(e) => {
                      const val = e.target.value
                      setCompanyName(val)
                      if (!slugEdited) {
                        setSlug(toSlug(val))
                      }
                    }}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] px-4 py-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                  />
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>Workspace URL:</span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">tiktrack.app/</span>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => {
                        setSlugEdited(true)
                        setSlug(toSlug(e.target.value))
                      }}
                      placeholder="acme-studio"
                      className="font-mono text-xs bg-transparent border-b border-dashed border-zinc-300 dark:border-zinc-700 focus:border-[#6d25da] focus:outline-none px-1 py-0.5 text-zinc-800 dark:text-zinc-200 min-w-[120px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                      Your Full Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Your name"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                      Billing Currency
                    </label>
                    <Select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="LKR">LKR (Rs)</option>
                      <option value="AUD">AUD (A$)</option>
                      <option value="CAD">CAD (C$)</option>
                    </Select>
                  </div>
                </div>

                {!sessionUserEmail && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                      Owner Email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="owner@company.com"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                    Country &amp; Timezone
                  </label>
                  <CountryTimezonePicker
                    countryCode={countryCode}
                    timezone={timezone}
                    onChange={({ countryCode: cc, timezone: tz }) => {
                      setCountryCode(cc)
                      setTimezone(tz)
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={creating || !companyName.trim()}
                  className="w-full rounded-xl bg-[#6d25da] hover:bg-[#5c1ec0] disabled:opacity-50 text-white py-3 text-sm font-semibold transition cursor-pointer shadow-sm"
                >
                  {creating ? 'Creating Workspace...' : 'Create Workspace & Continue →'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-2">
                  <span>✓</span>
                  <span>{createdCompanyName} is ready</span>
                  <span className="font-mono opacity-75">/{createdSlug}</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  Invite your developers
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  Add team members now so they can join <span className="font-semibold text-zinc-800 dark:text-zinc-200">{createdCompanyName}</span> right away, or skip and invite them later.
                </p>
              </div>

              <form onSubmit={(e) => void handleSendInvite(e)} className="space-y-3 rounded-xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/70 dark:bg-white/[0.02] p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                      Developer Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kasun Perera"
                      value={devName}
                      onChange={(e) => setDevName(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                      Work Email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="dev@company.com"
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1">
                      Role
                    </label>
                    <Select
                      value={devRole}
                      onChange={(e) => setDevRole(e.target.value as UserRole)}
                      className="w-full h-[38px] rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                    >
                      <option value="developer">Developer</option>
                      <option value="project_manager">Project Manager</option>
                      <option value="finance">Finance</option>
                      <option value="auditor">Auditor</option>
                    </Select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                        Temp Password <span className="text-zinc-400 font-normal">(Optional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateTempPassword}
                        title="Auto-generate a temporary password"
                        className="text-[11px] font-medium text-[#6d25da] dark:text-[#c5a8f0] hover:underline cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        Generate
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Leave blank for email link"
                      value={devTempPassword}
                      onChange={(e) => setDevTempPassword(e.target.value)}
                      className="w-full h-[38px] rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04] px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white/10 dark:hover:bg-white/15 text-white py-2 text-xs font-semibold transition cursor-pointer"
                >
                  + Send Developer Invite
                </button>
              </form>

              {invitedList.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Invited Team Members ({invitedList.length})
                  </div>
                  <div className="divide-y divide-zinc-200/80 dark:divide-white/10 rounded-xl border border-zinc-200/80 dark:border-white/10 overflow-hidden">
                    {invitedList.map((member) => (
                      <div
                        key={member.email}
                        className="flex items-center justify-between px-3 py-2 bg-white dark:bg-white/[0.02] text-xs"
                      >
                        <div>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {member.name}
                          </span>{' '}
                          <span className="text-zinc-500 dark:text-zinc-400">({member.email})</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium capitalize">
                          {member.role.replace('_', ' ')} • Invited ✓
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onComplete}
                  className="w-full sm:flex-1 rounded-xl bg-[#6d25da] hover:bg-[#5c1ec0] text-white py-3 text-sm font-semibold transition cursor-pointer shadow-sm"
                >
                  Go to {createdCompanyName} Workspace →
                </button>
                {invitedList.length === 0 && (
                  <button
                    type="button"
                    onClick={onComplete}
                    className="w-full sm:w-auto px-4 py-3 rounded-xl text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    Skip for now
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
