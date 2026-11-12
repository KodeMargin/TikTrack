import { useEffect, useState, type ReactNode } from 'react'
import { Phase1StoreProvider, usePhase1Store } from '@/context/Phase1Store'
import { Phase2StoreProvider } from '@/context/Phase2Store'
import { Phase3StoreProvider } from '@/context/Phase3Store'
import { Phase4StoreProvider } from '@/context/Phase4Store'
import { Phase5StoreProvider } from '@/context/Phase5Store'
import { ThemeProvider, useTheme } from '@/context/ThemeContext'
import type { UserRole } from '@/types/domain.types'
import { AuthAndOnboardingView } from '@/features/auth-tenancy/AuthAndOnboardingView'
import { AuthLoginScreen } from '@/features/auth-tenancy/AuthLoginScreen'
import { isSupabaseAuthConfigured } from '@/lib/supabaseClient'
import { ProjectsTasksView } from '@/features/projects-tasks/ProjectsTasksView'
import { WorkSessionTimerView } from '@/features/sessions-timer/WorkSessionTimerView'
import { TimesheetsAndReviewView } from '@/features/timesheets-review/TimesheetsAndReviewView'
import { BillingAndAdminView } from '@/features/billing-contracts/BillingAndAdminView'
import { UnifiedTimelineView } from '@/features/timeline-evidence/UnifiedTimelineView'
import { PrivacyAuditView } from '@/features/timeline-evidence/PrivacyAuditView'
import { IntegrationsAndDevicesView } from '@/features/integrations/IntegrationsAndDevicesView'
import { VerificationAndAiView } from '@/features/verification-ai/VerificationAndAiView'
import { DisputesAndAppealsView } from '@/features/disputes/DisputesAndAppealsView'
import { ClientPortalView } from '@/features/client-portal/ClientPortalView'
import { SaasBillingAndEcosystemView } from '@/features/saas-ecosystem/SaasBillingAndEcosystemView'
import { EnterpriseComplianceView } from '@/features/enterprise-compliance/EnterpriseComplianceView'
import { GroundTruthSimulator } from '@/features/phase0-workbench/GroundTruthSimulator'
import { PrivacyDpiaInspector } from '@/features/phase0-workbench/PrivacyDpiaInspector'

type NavSection =
  | 'timesheets-review'
  | 'timer-sessions'
  | 'projects-tasks'
  | 'timeline-evidence'
  | 'verification-ai'
  | 'disputes-appeals'
  | 'integrations-devices'
  | 'privacy-audit'
  | 'billing-admin'
  | 'client-portal'
  | 'saas-ecosystem'
  | 'enterprise-compliance'
  | 'auth-privacy'
  | 'phase0-simulator'

interface NavItem {
  id: NavSection
  path: string
  label: string
  description: string
  group: 'workspace' | 'evidence' | 'admin'
  allowedRoles: UserRole[]
  icon: ReactNode
}

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'timesheets-review',
    path: '/timesheets',
    label: 'Timesheets',
    description: 'Review hours, context notes & approvals',
    group: 'workspace',
    allowedRoles: [
      'super_admin',
      'tenant_owner',
      'project_manager',
      'developer',
      'finance',
      'client_reviewer',
      'auditor',
    ],
    icon: <NavIcon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />,
  },
  {
    id: 'timer-sessions',
    path: '/timer',
    label: 'Focus Timer',
    description: 'Live session tracker & deep-work modes',
    group: 'workspace',
    allowedRoles: ['super_admin', 'tenant_owner', 'project_manager', 'developer'],
    icon: <NavIcon path="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
  },
  {
    id: 'projects-tasks',
    path: '/projects',
    label: 'Projects & Tasks',
    description: 'Boards, task estimates & assignments',
    group: 'workspace',
    allowedRoles: ['super_admin', 'tenant_owner', 'project_manager', 'developer'],
    icon: <NavIcon path="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  },
  {
    id: 'timeline-evidence',
    path: '/timeline',
    label: 'Activity Timeline',
    description: 'Unified timeline, gaps & annotations',
    group: 'evidence',
    allowedRoles: ['super_admin', 'tenant_owner', 'project_manager', 'developer', 'auditor'],
    icon: <NavIcon path="M3 12h4l3-7 4 14 3-7h4" />,
  },
  {
    id: 'verification-ai',
    path: '/verification',
    label: 'Verification & AI',
    description: 'Rules R-01..R-08, policy simulator & AI drafts',
    group: 'evidence',
    allowedRoles: ['super_admin', 'tenant_owner', 'auditor'],
    icon: <NavIcon path="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016Z" />,
  },
  {
    id: 'disputes-appeals',
    path: '/disputes',
    label: 'Disputes & Appeals',
    description: 'Clarifications, 2nd review & audit export',
    group: 'workspace',
    allowedRoles: ['super_admin', 'tenant_owner', 'project_manager', 'developer', 'auditor'],
    icon: <NavIcon path="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5Z" />,
  },
  {
    id: 'integrations-devices',
    path: '/integrations',
    label: 'Integrations',
    description: 'IDE extensions, GitHub & enrolled devices',
    group: 'evidence',
    allowedRoles: ['super_admin', 'tenant_owner', 'project_manager', 'developer'],
    icon: <NavIcon path="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />,
  },
  {
    id: 'privacy-audit',
    path: '/privacy/audit-log',
    label: 'Privacy & Audit',
    description: 'App exclusions & transmitted data log',
    group: 'evidence',
    allowedRoles: ['super_admin', 'tenant_owner', 'auditor'],
    icon: <NavIcon path="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  },
  {
    id: 'billing-admin',
    path: '/billing',
    label: 'Billing & Rates',
    description: 'Contracts, rate cards & client invoices',
    group: 'admin',
    allowedRoles: ['super_admin', 'tenant_owner', 'finance'],
    icon: <NavIcon path="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3Z" />,
  },
  {
    id: 'client-portal',
    path: '/portal',
    label: 'Client Portal',
    description: 'Read-only approved hours & deliverables',
    group: 'workspace',
    allowedRoles: ['super_admin', 'tenant_owner', 'finance', 'client_reviewer'],
    icon: <NavIcon path="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 0c-2.5 4.5-6 6-9 6s-6.5-1.5-9-6c2.5-4.5 6-6 9-6s6.5 1.5 9 6Z" />,
  },
  {
    id: 'saas-ecosystem',
    path: '/ecosystem',
    label: 'SaaS & Ecosystem',
    description: 'Plans, metering, API keys, webhooks & reports',
    group: 'admin',
    allowedRoles: ['super_admin', 'tenant_owner'],
    icon: <NavIcon path="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />,
  },
  {
    id: 'enterprise-compliance',
    path: '/enterprise',
    label: 'Enterprise & Scale',
    description: 'SSO, SCIM, 2-person governance, holds, SIEM & DR',
    group: 'admin',
    allowedRoles: ['super_admin'],
    icon: <NavIcon path="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-5 4v4h4v-4" />,
  },
  {
    id: 'auth-privacy',
    path: '/auth-privacy',
    label: 'Workspace & Access',
    description: 'Team members, MFA & tracking consent',
    group: 'admin',
    allowedRoles: ['super_admin', 'tenant_owner'],
    icon: <NavIcon path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />,
  },
  {
    id: 'phase0-simulator',
    path: '/simulator',
    label: 'Verification Lab',
    description: 'Ground-truth scenarios & schema tester',
    group: 'admin',
    allowedRoles: ['super_admin'],
    icon: <NavIcon path="M9 3h6m-5 0v5l-4.5 7.5A2 2 0 0 0 7.2 18h9.6a2 2 0 0 0 1.7-2.5L14 8V3" />,
  },
]

function FirstTimePasswordChangeModal({
  user,
  onComplete,
}: {
  user: { name: string; email: string; role: string }
  onComplete: (newPassword: string) => Promise<{ ok: boolean; message: string }>
}) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.')
      return
    }
    setLoading(true)
    const res = await onComplete(newPassword)
    setLoading(false)
    if (!res.ok) {
      setError(res.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-indigo-500/30 bg-[#0d111b] p-6 sm:p-8 shadow-2xl space-y-5 text-white">
        <div className="space-y-1.5 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold">First-Time Sign-In Required</h2>
          <p className="text-xs text-slate-400">
            Welcome, <strong>{user.name}</strong>! Your account was initialized with a temporary password. Before accessing your workspace, please set a new strong password.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-rose-500/50 bg-rose-950/60 text-rose-200 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Signed In Account</label>
            <input
              type="text"
              disabled
              value={user.email}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-400 cursor-not-allowed text-xs font-mono"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium">New Strong Password</label>
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-medium mb-1">Confirm New Password</label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={8}
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs transition cursor-pointer disabled:opacity-50 mt-2 shadow-md shadow-indigo-600/30"
          >
            {loading ? 'Securing Account...' : 'Set Password & Enter Workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}

function resolveSectionFromPath(pathname: string): NavSection {
  const match = NAV_ITEMS.find((item) => item.path === pathname)
  return match ? match.id : 'timesheets-review'
}

function DevProofShell() {
  const { theme, toggleTheme } = useTheme()
  const {
    tenants,
    activeTenant,
    setActiveTenantId,
    members,
    activeUser,
    isSuperAdminSession,
    setActiveUserId,
    authChecking,
    sessionUserEmail,
    signOut,
    completeFirstTimePasswordChange,
    timer,
    setTimerTaskAndMode,
    transitionTimer,
    prismaStatus,
    bootstrapLoaded,
    hasWorkspace,
    createTenantWorkspace,
    refreshPrismaConnection,
    notifications,
    unreadNotificationCount,
    markNotificationRead,
  } = usePhase1Store()

  const [setupName, setSetupName] = useState('')
  const [setupSlug, setSetupSlug] = useState('')
  const [setupCurrency, setSetupCurrency] = useState('USD')
  const [setupTimezone, setSetupTimezone] = useState('Asia/Colombo')
  const [setupOwnerName, setSetupOwnerName] = useState('')
  const [setupOwnerEmail, setSetupOwnerEmail] = useState(
    () => sessionUserEmail || 'iamartseeker@gmail.com'
  )
  const [setupError, setSetupError] = useState<string | null>(null)

  const [activeSection, setActiveSection] = useState<NavSection>(() =>
    typeof window !== 'undefined'
      ? resolveSectionFromPath(window.location.pathname)
      : 'timesheets-review'
  )
  const [notifOpen, setNotifOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.allowedRoles.includes(activeUser.role)
  )

  useEffect(() => {
    const onPopState = () => {
      setActiveSection(resolveSectionFromPath(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Route Guard: If active section is not permitted for the user's role, automatically redirect
  useEffect(() => {
    if (visibleNavItems.length > 0 && !visibleNavItems.some((n) => n.id === activeSection)) {
      const defaultSec = visibleNavItems[0].id
      setActiveSection(defaultSec)
      const target = NAV_ITEMS.find((n) => n.id === defaultSec)
      if (target && typeof window !== 'undefined') {
        window.history.replaceState({}, '', target.path)
      }
    }
  }, [activeUser.role, activeSection, visibleNavItems])

  function navigateToSection(section: NavSection) {
    const target = NAV_ITEMS.find((n) => n.id === section)
    if (!target || !target.allowedRoles.includes(activeUser.role)) {
      return
    }
    setActiveSection(section)
    setMobileMenuOpen(false)
    if (typeof window !== 'undefined' && window.location.pathname !== target.path) {
      window.history.pushState({}, '', target.path)
    }
  }

  const currentNav = NAV_ITEMS.find((i) => i.id === activeSection) ?? NAV_ITEMS[0]

  const renderNavGroup = (group: NavItem['group'], title: string) => {
    const items = visibleNavItems.filter((item) => item.group === group)
    if (items.length === 0) return null
    return (
      <div className="space-y-1">
        <div className="px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {title}
        </div>
        {items.map((item) => {
          const selected = item.id === activeSection
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateToSection(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition cursor-pointer ${selected
                ? 'bg-indigo-50 text-indigo-700 font-semibold dark:bg-indigo-500/15 dark:text-indigo-300'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
                }`}
            >
              <span className={selected ? 'text-indigo-600 dark:text-indigo-400' : 'opacity-75'}>
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (!bootstrapLoaded || authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090c14] dark:text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 mx-auto rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
            DP
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Loading DevProof...
          </p>
        </div>
      </div>
    )
  }

  // Enforce authentication gate: If Supabase Auth is active and user is not logged in, show AuthLoginScreen
  if (isSupabaseAuthConfigured && !sessionUserEmail) {
    return <AuthLoginScreen />
  }

  if (!hasWorkspace) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090c14] dark:text-slate-100 flex flex-col">
        <header className="h-14 border-b border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#0d111b]/80 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-xs font-bold text-white">
              DP
            </div>
            <span className="text-sm font-semibold">DevProof</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void refreshPrismaConnection()}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 cursor-pointer"
            >
              <span
                className={`h-2 w-2 rounded-full ${prismaStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
              />
              <span>
                {prismaStatus.connected ? 'Supabase Connected' : 'DB Disconnected (Retry)'}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 text-xs font-medium cursor-pointer"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white dark:border-white/10 dark:bg-[#111623] p-6 sm:p-8 shadow-sm space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Clean Supabase Database (0 Rows)
              </span>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                Create Your Workspace
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                All dummy data has been removed. Set up your company workspace and Owner account to start tracking developers in live PostgreSQL.
              </p>
            </div>

            {!prismaStatus.connected && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
                {prismaStatus.message}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const slug =
                  setupSlug.trim() ||
                  setupName
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                const res = createTenantWorkspace({
                  name: setupName.trim(),
                  slug,
                  timezone: setupTimezone,
                  currency: setupCurrency,
                  ownerName: setupOwnerName.trim(),
                  ownerEmail: setupOwnerEmail.trim(),
                })
                if (!res.ok) setSetupError(res.message)
                else setSetupError(null)
              }}
              className="space-y-3 text-sm"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Workspace / Company Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Studio"
                    value={setupName}
                    onChange={(e) => {
                      const val = e.target.value
                      setSetupName(val)
                      setSetupSlug(
                        val
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '')
                      )
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    URL Slug
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. acme-studio"
                    value={setupSlug}
                    onChange={(e) => setSetupSlug(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Your Name (Owner)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Your full name"
                    value={setupOwnerName}
                    onChange={(e) => setSetupOwnerName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Owner Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="iamartseeker@gmail.com"
                    value={setupOwnerEmail}
                    onChange={(e) => setSetupOwnerEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Currency
                  </label>
                  <select
                    value={setupCurrency}
                    onChange={(e) => setSetupCurrency(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="LKR">LKR (Rs)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="AUD">AUD (A$)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Timezone
                  </label>
                  <input
                    type="text"
                    required
                    value={setupTimezone}
                    onChange={(e) => setSetupTimezone(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {setupError && (
                <div className="text-xs text-rose-600 dark:text-rose-400">{setupError}</div>
              )}

              <button
                type="submit"
                disabled={!prismaStatus.connected}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition cursor-pointer"
              >
                Create Live Workspace in Supabase
              </button>
            </form>
          </div>
        </main>
      </div>
    )
  }

  const isFirstTimePasswordRequired =
    Boolean(sessionUserEmail) &&
    (activeUser.status === 'invited' || Boolean(activeUser.mustChangePassword))

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090c14] dark:text-slate-100 flex">
      {isFirstTimePasswordRequired && (
        <FirstTimePasswordChangeModal
          user={activeUser}
          onComplete={completeFirstTimePasswordChange}
        />
      )}
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Clean Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/80 dark:bg-[#0d111b] dark:border-white/10 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Brand */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-xs">
              DP
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
                DevProof
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-none">
                {activeTenant.name}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {renderNavGroup('workspace', 'Work & Time')}
          {renderNavGroup('evidence', 'Context & Privacy')}
          {renderNavGroup('admin', 'Organization')}
        </nav>

        {/* Minimal Footer Status */}
        <div className="p-3 border-t border-slate-200/70 dark:border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => void refreshPrismaConnection()}
            title={prismaStatus.message}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs bg-slate-100/80 hover:bg-slate-200/70 text-slate-600 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-400 transition cursor-pointer"
          >
            <span className="flex items-center gap-2 truncate">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${prismaStatus.connected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
              />
              <span className="truncate">
                {prismaStatus.connected ? 'Database Synced' : 'DB Disconnected'}
              </span>
            </span>
            <span className="text-[10px] font-mono opacity-75">
              {activeTenant.currency}
            </span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Slim Top Bar */}
        <header className="h-14 sticky top-0 z-30 bg-white/85 dark:bg-[#090c14]/85 backdrop-blur-md border-b border-slate-200/80 dark:border-white/10 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 cursor-pointer"
              aria-label="Open navigation"
            >
              <NavIcon path="M4 6h16M4 12h16M4 18h16" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {currentNav.label}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {currentNav.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Compact Live Timer Pill */}
            <button
              type="button"
              onClick={() => navigateToSection('timer-sessions')}
              className={`hidden md:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${timer.lifecycle === 'running'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
                : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-300'
                }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${timer.lifecycle === 'running'
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-500'
                  }`}
              />
              <span>
                {timer.lifecycle === 'running'
                  ? `Recording · ${timer.workMode}`
                  : `Timer ${timer.lifecycle}`}
              </span>
            </button>

            {/* Tenant Switcher: Only Super Admin can change across all tenants */}
            {isSuperAdminSession || activeUser.role === 'super_admin' ? (
              <select
                aria-label="Active workspace"
                value={activeTenant.id}
                onChange={(e) => setActiveTenantId(e.target.value)}
                className="hidden sm:block bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                {activeTenant.name}
              </span>
            )}

            {/* Role / Persona Switcher */}
            {isSuperAdminSession ? (
              <div className="flex items-center gap-1.5">
                <div
                  title={`Signed in as Platform Super Admin (${sessionUserEmail})`}
                  className="bg-amber-500/10 border border-amber-500/30 dark:bg-amber-500/20 dark:border-amber-500/40 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="truncate max-w-[130px]">{activeUser.name || 'Super Admin'}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/20 dark:bg-amber-500/30 text-amber-800 dark:text-amber-200 shrink-0 font-bold tracking-wider">
                    {activeUser.role === 'super_admin' ? 'SUPER ADMIN' : `PREVIEW: ${activeUser.role.replace('_', ' ')}`}
                  </span>
                </div>
                {members.length > 0 && (
                  <select
                    aria-label="Active user role"
                    value={activeUser.id}
                    onChange={(e) => setActiveUserId(e.target.value)}
                    className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer max-w-[150px]"
                  >
                    <option value="super-admin">Super Admin (System)</option>
                    {members
                      .filter((m) => m.email.toLowerCase().trim() !== (sessionUserEmail || '').toLowerCase().trim())
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          Simulate: {m.name} ({m.role.replace('_', ' ')})
                        </option>
                      ))}
                  </select>
                )}
              </div>
            ) : sessionUserEmail ? (
              <div
                title={`Signed in as ${activeUser.name} (${activeUser.email}) • Role: ${activeUser.role}`}
                className="bg-indigo-50 border border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 truncate max-w-[200px] flex items-center gap-1.5"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">{activeUser.name}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-indigo-200/50 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 shrink-0">
                  {activeUser.role.replace('_', ' ')}
                </span>
              </div>
            ) : (
              <select
                aria-label="Active user role"
                value={activeUser.id}
                onChange={(e) => setActiveUserId(e.target.value)}
                className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer max-w-[180px]"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role.replace('_', ' ')})
                  </option>
                ))}
              </select>
            )}

            {/* Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label="Notifications"
                className="relative p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-300 transition cursor-pointer"
              >
                <NavIcon path="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-indigo-600 text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111623] shadow-xl p-3 space-y-2 z-50">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 pb-1.5 border-b border-slate-200 dark:border-white/10">
                    <span>Notifications</span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4 text-center">
                      You are all caught up.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer space-y-0.5 transition ${n.readAt
                          ? 'border-slate-200/70 bg-slate-50 text-slate-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-400'
                          : 'border-indigo-200 bg-indigo-50/70 text-slate-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-100'
                          }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>{n.title}</span>
                          {!n.readAt && (
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                          )}
                        </div>
                        <p className="text-[11px] opacity-85 leading-snug">{n.body}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Light / Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-200 text-xs font-medium transition cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <NavIcon path="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <NavIcon path="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>

            {/* User Identity & Sign Out Button */}
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => {
                  navigateToSection('timer-sessions')
                })
              }}
              title={sessionUserEmail ? `Signed in as ${sessionUserEmail} — Click to Sign Out` : 'Sign out'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-xs font-semibold text-rose-700 dark:text-rose-300 transition cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Canvas with Strict RBAC Route Guard */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6">
          {!currentNav.allowedRoles.includes(activeUser.role) ? (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-8 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-300">
                <NavIcon path="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Access Restricted (RBAC)
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto mt-1">
                  Your current role (<strong>{activeUser.role.replace('_', ' ')}</strong>) does not have authorization to view {currentNav.label}. Contact your workspace administrator for elevated privileges.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateToSection(visibleNavItems[0]?.id || 'timer-sessions')}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                Return to {visibleNavItems[0]?.label || 'Workspace'}
              </button>
            </div>
          ) : (
            <>
              {activeSection === 'timesheets-review' && <TimesheetsAndReviewView />}
              {activeSection === 'timer-sessions' && <WorkSessionTimerView />}
              {activeSection === 'projects-tasks' && (
                <ProjectsTasksView
                  onLaunchTimerForTask={(projectId, taskId, mode) => {
                    setTimerTaskAndMode(projectId, taskId, mode)
                    transitionTimer('running')
                    navigateToSection('timer-sessions')
                  }}
                />
              )}
              {activeSection === 'timeline-evidence' && <UnifiedTimelineView />}
              {activeSection === 'verification-ai' && <VerificationAndAiView />}
              {activeSection === 'disputes-appeals' && <DisputesAndAppealsView />}
              {activeSection === 'integrations-devices' && <IntegrationsAndDevicesView />}
              {activeSection === 'privacy-audit' && <PrivacyAuditView />}
              {activeSection === 'billing-admin' && <BillingAndAdminView />}
              {activeSection === 'client-portal' && <ClientPortalView />}
              {activeSection === 'saas-ecosystem' && <SaasBillingAndEcosystemView />}
              {activeSection === 'enterprise-compliance' && <EnterpriseComplianceView />}
              {activeSection === 'auth-privacy' && <AuthAndOnboardingView />}
              {activeSection === 'phase0-simulator' && (
                <div className="space-y-8">
                  <GroundTruthSimulator />
                  <PrivacyDpiaInspector />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <Phase1StoreProvider>
        <Phase2StoreProvider>
          <Phase3StoreProvider>
            <Phase4StoreProvider>
              <Phase5StoreProvider>
                <DevProofShell />
              </Phase5StoreProvider>
            </Phase4StoreProvider>
          </Phase3StoreProvider>
        </Phase2StoreProvider>
      </Phase1StoreProvider>
    </ThemeProvider>
  )
}

export default App
