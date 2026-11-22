import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Phase1StoreProvider, usePhase1Store } from '@/context/Phase1Store'
import { Phase2StoreProvider } from '@/context/Phase2Store'
import { Phase3StoreProvider } from '@/context/Phase3Store'
import { Phase4StoreProvider } from '@/context/Phase4Store'
import { ThemeProvider, useTheme } from '@/context/ThemeContext'
import type { UserRole } from '@/types/domain.types'
import { AuthAndOnboardingView } from '@/features/auth-tenancy/AuthAndOnboardingView'
import { AuthLoginScreen } from '@/features/auth-tenancy/AuthLoginScreen'
import { WorkspaceOnboardingScreen } from '@/features/auth-tenancy/WorkspaceOnboardingScreen'
import { isSupabaseAuthConfigured } from '@/lib/supabaseClient'
import { ProjectsTasksView } from '@/features/projects-tasks/ProjectsTasksView'
import { WorkSessionTimerView } from '@/features/sessions-timer/WorkSessionTimerView'
import { TimesheetsAndReviewView } from '@/features/timesheets-review/TimesheetsAndReviewView'
import { DeveloperPaymentsView } from '@/features/payments/DeveloperPaymentsView'
import { BillingAndAdminView } from '@/features/billing-contracts/BillingAndAdminView'
import { UnifiedTimelineView } from '@/features/timeline-evidence/UnifiedTimelineView'
import { PrivacyAuditView } from '@/features/timeline-evidence/PrivacyAuditView'
import { IntegrationsAndDevicesView } from '@/features/integrations/IntegrationsAndDevicesView'
import { VerificationAndAiView } from '@/features/verification-ai/VerificationAndAiView'
import { DisputesAndAppealsView } from '@/features/disputes/DisputesAndAppealsView'
import { PricingPlansView } from '@/features/saas-ecosystem/PricingPlansView'
import { GroundTruthSimulator } from '@/features/phase0-workbench/GroundTruthSimulator'
import { PrivacyDpiaInspector } from '@/features/phase0-workbench/PrivacyDpiaInspector'

type NavSection =
  | 'timesheets-review'
  | 'developer-payments'
  | 'timer-sessions'
  | 'projects-tasks'
  | 'timeline-evidence'
  | 'verification-ai'
  | 'disputes-appeals'
  | 'integrations-devices'
  | 'privacy-audit'
  | 'billing-admin'
  | 'pricing-plans'
  | 'auth-privacy'
  | 'phase0-simulator'

interface NavItem {
  id: NavSection
  path: string
  label: string
  description: string
  group: 'workspace' | 'evidence' | 'finance' | 'admin'
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
  // 1. WORK & TIME (Plan -> Track -> Review -> Resolve)
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
    id: 'timer-sessions',
    path: '/timer',
    label: 'Focus Timer',
    description: 'Live session tracker & deep-work modes',
    group: 'workspace',
    allowedRoles: ['super_admin', 'tenant_owner', 'project_manager', 'developer'],
    icon: <NavIcon path="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
  },
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
    id: 'disputes-appeals',
    path: '/disputes',
    label: 'Disputes & Appeals',
    description: 'Clarifications, 2nd review & audit export',
    group: 'workspace',
    allowedRoles: ['super_admin', 'tenant_owner', 'project_manager', 'developer', 'auditor'],
    icon: <NavIcon path="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5Z" />,
  },

  // 2. CONTEXT & EVIDENCE (Observe -> Verify -> Connect -> Protect)
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
    id: 'integrations-devices',
    path: '/integrations',
    label: 'Integrations & API',
    description: 'Apps, Git, Calendar, PM tools, API keys & webhooks',
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

  // 3. PAYMENTS & BILLING (Staff Payouts -> Client Billing -> Portal -> Subscription)
  {
    id: 'developer-payments',
    path: '/payments',
    label: 'Payments',
    description: 'Pay rates, earnings breakdown & payout history',
    group: 'finance',
    allowedRoles: [
      'super_admin',
      'tenant_owner',
      'project_manager',
      'developer',
      'finance',
      'client_reviewer',
      'auditor',
    ],
    icon: <NavIcon path="M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m2 4h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm7-5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />,
  },
  {
    id: 'billing-admin',
    path: '/billing',
    label: 'Contracts & Invoicing',
    description: 'Contracts, rate cards & client invoices',
    group: 'finance',
    allowedRoles: ['super_admin', 'tenant_owner', 'finance'],
    icon: <NavIcon path="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3Z" />,
  },
  {
    id: 'pricing-plans',
    path: '/pricing',
    label: 'Plan & Usage',
    description: 'Subscription plans, usage limits & billing receipts',
    group: 'finance',
    allowedRoles: ['super_admin', 'tenant_owner', 'finance'],
    icon: <NavIcon path="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  },

  // 4. ORGANIZATION (Access & Config -> Lab)
  {
    id: 'auth-privacy',
    path: '/auth-privacy',
    label: 'Workspace & Access',
    description: 'Workspaces, branding, team members, roles & consent',
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
  onClose,
  onSignOut,
}: {
  user: { name: string; email: string; role: string }
  onComplete: (newPassword: string) => Promise<{ ok: boolean; message: string }>
  onClose: () => void
  onSignOut: () => void
}) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [loading, onClose])

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
    <div className="fixed inset-0 z-50 bg-zinc-900/40 dark:bg-[#09090b]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800/80 dark:bg-[#121215] dark:text-white p-6 sm:p-8 shadow-2xl space-y-5">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label="Close password change popup"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="space-y-1.5 text-center">
          <img
            src="/images/logo-only.png"
            alt="TikTrack"
            className="h-12 w-12 mx-auto mb-2"
          />
          <h2 className="text-lg font-bold">First-Time Sign-In Required</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Welcome, <strong>{user.name}</strong>! Your account was initialized with a temporary password. Before accessing your workspace, please set a new strong password.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-rose-500/50 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Signed In Account</label>
            <input
              type="text"
              disabled
              value={user.email}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5 px-3 py-2 text-zinc-500 dark:text-zinc-400 cursor-not-allowed text-xs font-mono"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-zinc-700 dark:text-zinc-300 font-medium">New Strong Password</label>
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="text-[11px] text-[#6d25da] dark:text-[#a87ce9] hover:text-[#581eae] dark:hover:text-[#c5a8f0] cursor-pointer"
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
              className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da] text-xs"
            />
          </div>
          <div>
            <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1">Confirm New Password</label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={8}
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da] text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] font-semibold text-white text-xs transition cursor-pointer disabled:opacity-50 mt-2 shadow-md shadow-indigo-600/30"
          >
            {loading ? 'Securing Account...' : 'Set Password & Enter Workspace'}
          </button>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition cursor-pointer disabled:opacity-50"
            >
              Close for now
            </button>
            <button
              type="button"
              onClick={onSignOut}
              disabled={loading}
              className="text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition cursor-pointer disabled:opacity-50"
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Granular permissions that unlock each section for workspace roles
// (tenant_owner, predefined roles, custom roles, and individual overrides).
const NAV_PERMISSION_MAP: Partial<Record<NavSection, string[]>> = {
  'timesheets-review': ['timesheet:view_own', 'timesheet:view_team', 'timesheet:approve'],
  'developer-payments': [
    'payment:view_own',
    'payment:view_team',
    'payment:configure',
    'payment:record_payout',
  ],
  'timer-sessions': ['timer:start_stop', 'timer:view_own', 'timer:view_team'],
  'projects-tasks': ['task:view', 'project:view'],
  'timeline-evidence': ['timeline:view_own', 'timeline:view_team'],
  'verification-ai': ['verification:view', 'verification:manage_rules'],
  'disputes-appeals': ['dispute:view', 'dispute:open', 'dispute:resolve'],
  'integrations-devices': ['integration:view', 'integration:manage'],
  'privacy-audit': ['compliance:view', 'compliance:audit_export'],
  'billing-admin': ['billing:view', 'invoice:create_draft'],
  'auth-privacy': ['member:invite', 'member:edit_role', 'role:create', 'role:edit'],
}

function resolveSectionFromPath(pathname: string): NavSection {
  const match = NAV_ITEMS.find((item) => item.path === pathname)
  return match ? match.id : 'projects-tasks'
}

function DevProofShell() {
  const { theme, toggleTheme } = useTheme()
  const {
    accessibleTenants,
    activeTenant,
    setActiveTenantId,
    members,
    activeUser,
    isSuperAdminSession,
    isSuperAdminAccount,
    superAdminViewMode,
    setSuperAdminViewMode,
    setActiveUserId,
    authChecking,
    sessionUserEmail,
    signOut,
    completeFirstTimePasswordChange,
    timer,
    setTimerTaskAndMode,
    transitionTimer,
    bootstrapLoaded,
    hasWorkspace,
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    hasPermission,
  } = usePhase1Store()

  const isInSuperAdminPortal = isSuperAdminAccount && superAdminViewMode === 'portal'

  const canAccessNav = (item: NavItem) => {
    // Super Admin Portal mode: full access to every page & system detail
    if (isSuperAdminSession || activeUser.role === 'super_admin') return true

    // Super Admin-only pages are never accessible in Workspace mode or by non-super-admin roles
    if (item.allowedRoles.length === 1 && item.allowedRoles[0] === 'super_admin') {
      return false
    }

    // Role-based granular permission check
    const requiredPerms = NAV_PERMISSION_MAP[item.id]
    if (requiredPerms && requiredPerms.length > 0) {
      return requiredPerms.some((perm) => hasPermission(perm))
    }

    // Fallback for sections without granular permission keys (e.g. pricing-plans)
    return item.allowedRoles.includes(activeUser.role)
  }

  const [onboardingActive, setOnboardingActive] = useState(false)
  const [creatingAdditionalWorkspace, setCreatingAdditionalWorkspace] = useState(false)
  const [passwordModalDismissed, setPasswordModalDismissed] = useState(false)

  useEffect(() => {
    setPasswordModalDismissed(false)
  }, [sessionUserEmail, activeUser.id])

  useEffect(() => {
    if (bootstrapLoaded && !authChecking && !hasWorkspace) {
      setOnboardingActive(true)
    }
  }, [bootstrapLoaded, authChecking, hasWorkspace])

  useEffect(() => {
    if (!sessionUserEmail) {
      setOnboardingActive(false)
      setCreatingAdditionalWorkspace(false)
      setSuperAdminViewMode('portal')
    }
  }, [sessionUserEmail])

  const [activeSection, setActiveSection] = useState<NavSection>(() =>
    typeof window !== 'undefined'
      ? resolveSectionFromPath(window.location.pathname)
      : 'timesheets-review'
  )
  const [notifOpen, setNotifOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false)
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const personaMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        workspaceMenuRef.current &&
        !workspaceMenuRef.current.contains(event.target as Node)
      ) {
        setWorkspaceMenuOpen(false)
      }
      if (
        personaMenuRef.current &&
        !personaMenuRef.current.contains(event.target as Node)
      ) {
        setPersonaMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    canAccessNav(item)
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
    if (!target || !canAccessNav(target)) {
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
        <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400/90 dark:text-zinc-500">
          {title}
        </div>
        {items.map((item) => {
          const selected = item.id === activeSection
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateToSection(item.id)}
              className={`group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d25da]/30 ${selected
                ? 'bg-zinc-900/[0.055] text-zinc-950 font-semibold dark:bg-white/[0.08] dark:text-white'
                : 'text-zinc-600 hover:bg-zinc-900/[0.035] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100'
                }`}
            >
              {selected && (
                <span className="absolute left-1 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-[#6d25da] dark:bg-[#a87ce9]" />
              )}
              <span
                className={`transition-transform duration-200 group-hover:scale-105 group-hover:translate-x-0.5 ${selected ? 'text-[#6d25da] dark:text-[#c5a8f0]' : 'opacity-70 group-hover:opacity-100'
                  }`}
              >
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
      <div className="min-h-screen bg-white text-zinc-900 dark:bg-[#09090b] dark:text-zinc-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <img
            src="/images/logo-only.png"
            alt="TikTrack"
            className="h-10 w-10 mx-auto animate-pulse"
          />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Loading TikTrack...
          </p>
        </div>
      </div>
    )
  }

  // Enforce authentication gate: If Supabase Auth is active and user is not logged in, show AuthLoginScreen
  if (isSupabaseAuthConfigured && !sessionUserEmail) {
    return <AuthLoginScreen />
  }

  if (!hasWorkspace || onboardingActive) {
    return (
      <WorkspaceOnboardingScreen
        onComplete={() => setOnboardingActive(false)}
      />
    )
  }

  if (creatingAdditionalWorkspace) {
    return (
      <WorkspaceOnboardingScreen
        allowCancel
        onCancel={() => setCreatingAdditionalWorkspace(false)}
        onComplete={() => {
          setCreatingAdditionalWorkspace(false)
          if (isSuperAdminAccount) {
            setSuperAdminViewMode('workspace')
          }
        }}
      />
    )
  }

  const isFirstTimePasswordRequired =
    Boolean(sessionUserEmail) &&
    !passwordModalDismissed &&
    activeUser.email.toLowerCase().trim() === (sessionUserEmail || '').toLowerCase().trim() &&
    (activeUser.status === 'invited' || Boolean(activeUser.mustChangePassword))

  return (
    <div className="h-screen overflow-hidden bg-[#f4f5f9] text-zinc-900 dark:bg-[#09090c] dark:text-zinc-100 flex relative">
      {isFirstTimePasswordRequired && (
        <FirstTimePasswordChangeModal
          user={activeUser}
          onComplete={completeFirstTimePasswordChange}
          onClose={() => setPasswordModalDismissed(true)}
          onSignOut={() => {
            setPasswordModalDismissed(false)
            void signOut().then(() => {
              navigateToSection('timer-sessions')
            })
          }}
        />
      )}
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Fixed Independent Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 h-full shrink-0 bg-white shadow-[1px_0_0_rgba(15,5,31,0.08)] dark:bg-[#0c0c10] dark:shadow-[1px_0_0_rgba(255,255,255,0.06)] flex flex-col transition-transform duration-250 ease-out lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Brand */}
        <div className="h-16 shrink-0 px-4 flex items-center justify-between gap-2 shadow-[0_1px_0_rgba(15,5,31,0.05)] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center min-w-0">
            <img
              src={theme === 'dark' ? '/images/Logo-Light2.png' : '/images/Logo-Dark2.png'}
              alt="TikTrack"
              className="h-10 w-auto object-contain transition-transform duration-200 hover:scale-[1.02]"
            />
          </div>
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-tight truncate max-w-[125px] shrink-0 ${isInSuperAdminPortal
              ? 'bg-[#6d25da]/12 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]'
              : 'bg-zinc-200/60 text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-300'
              }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#6d25da] dark:bg-[#a87ce9] shrink-0" />
            <span className="truncate">{isInSuperAdminPortal ? 'Admin Portal' : activeTenant.name}</span>
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-white/10 cursor-pointer"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        {/* Independently Scrollable Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {renderNavGroup('workspace', 'Work & Time')}
          {renderNavGroup('evidence', 'Context & Evidence')}
          {renderNavGroup('finance', 'Payments & Billing')}
          {renderNavGroup('admin', 'Organization')}
        </nav>
      </aside>

      {/* Independently Scrollable Main Column */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto flex flex-col relative z-10">
        {/* Sticky Top Bar */}
        <header className="h-16 shrink-0 sticky top-0 z-30 bg-white/90 dark:bg-[#09090c]/85 backdrop-blur-xl shadow-[0_1px_0_rgba(15,5,31,0.08)] dark:shadow-[0_1px_0_rgba(255,255,255,0.055)] px-4 sm:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-xl bg-white dark:bg-white/5 shadow-(--dp-shadow-pill) text-zinc-600 dark:text-zinc-300 cursor-pointer"
              aria-label="Open navigation"
            >
              <NavIcon path="M4 6h16M4 12h16M4 18h16" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Compact Live Timer Pill */}
            <button
              type="button"
              onClick={() => navigateToSection('timer-sessions')}
              title={
                timer.lifecycle === 'running'
                  ? `Recording active work session (${timer.workMode}) - Click to view timer`
                  : timer.lifecycle === 'on_break'
                    ? `Session on break - Click to view timer`
                    : timer.elapsedSeconds > 0
                      ? `Session paused (${Math.floor(timer.elapsedSeconds / 60)}m elapsed) - Click to resume`
                      : 'Timer idle - Click to start tracking time'
              }
              className={`hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:-translate-y-[0.5px] cursor-pointer ${timer.lifecycle === 'running'
                  ? 'bg-[#6d25da]/12 text-[#581eae] shadow-[0_0_0_1px_rgba(109,37,218,0.22),0_4px_14px_-4px_rgba(109,37,218,0.3)] dark:bg-[#6d25da]/22 dark:text-[#d8c4f8] dark:shadow-[0_0_0_1px_rgba(139,81,225,0.35),0_4px_16px_-4px_rgba(139,81,225,0.35)]'
                  : timer.lifecycle === 'on_break'
                    ? 'bg-white text-zinc-700 shadow-(--dp-shadow-pill) dark:bg-white/6 dark:text-zinc-300'
                    : timer.elapsedSeconds > 0
                      ? 'bg-amber-500/12 text-amber-700 shadow-[0_0_0_1px_rgba(245,158,11,0.25)] dark:text-amber-300'
                      : 'bg-white/90 text-zinc-600 shadow-(--dp-shadow-pill) hover:bg-white dark:bg-white/[0.045] dark:hover:bg-white/[0.08] dark:text-zinc-300'
                }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${timer.lifecycle === 'running'
                    ? 'dp-beacon text-[#8b51e1] bg-[#8b51e1]'
                    : timer.lifecycle === 'on_break'
                      ? 'bg-zinc-400'
                      : timer.elapsedSeconds > 0
                        ? 'bg-amber-500'
                        : 'bg-zinc-400'
                  }`}
              />
              <span>
                {timer.lifecycle === 'running'
                  ? `Recording · ${timer.workMode}`
                  : timer.lifecycle === 'on_break'
                    ? `On Break (${Math.floor(timer.breakSeconds / 60)}m)`
                    : timer.elapsedSeconds > 0
                      ? `Paused (${Math.floor(timer.elapsedSeconds / 60)}m)`
                      : 'Timer Idle'}
              </span>
            </button>

            {/* Workspace Switcher: Custom Sleek Dropdown */}
            {isSuperAdminAccount || activeUser.role === 'super_admin' || activeUser.role === 'tenant_owner' || accessibleTenants.length > 1 ? (
              <div className="relative" ref={workspaceMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceMenuOpen((prev) => !prev)
                    setPersonaMenuOpen(false)
                    setNotifOpen(false)
                  }}
                  aria-label="Switch workspace"
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/70 text-zinc-800 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-zinc-200 text-xs font-semibold transition cursor-pointer"
                >
                  <span className="h-2 w-2 rounded-full bg-[#6d25da] dark:bg-[#a87ce9] shrink-0" />
                  <span className="truncate max-w-[140px]">{activeTenant.name}</span>
                  <svg
                    className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${workspaceMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {workspaceMenuOpen && (
                  <div className="dp-popover-enter absolute left-0 mt-2 w-64 rounded-2xl bg-white/95 dark:bg-[#14141b]/95 backdrop-blur-2xl shadow-(--dp-shadow-popover) p-1.5 z-50">
                    <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <span>Workspaces</span>
                      <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded text-[9px] font-mono">
                        {accessibleTenants.length}
                      </span>
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1 space-y-0.5">
                      {accessibleTenants.map((t) => {
                        const isSelected = t.id === activeTenant.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setActiveTenantId(t.id)
                              if (isSuperAdminAccount) {
                                setSuperAdminViewMode('workspace')
                              }
                              setWorkspaceMenuOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer text-left ${isSelected
                                ? 'bg-[#6d25da]/15 dark:bg-[#6d25da]/20 text-[#6d25da] dark:text-[#a87ce9] font-semibold'
                                : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                              }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${isSelected ? 'bg-[#8b51e1]' : 'bg-zinc-300 dark:bg-zinc-600'
                                  }`}
                              />
                              <div className="truncate">
                                <div className="truncate">{t.name}</div>
                                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate font-mono">
                                  {t.slug} • {t.currency}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <svg
                                className="h-4 w-4 text-[#8b51e1] shrink-0 ml-2"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setWorkspaceMenuOpen(false)
                          setCreatingAdditionalWorkspace(true)
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:bg-[#6d25da]/10 transition cursor-pointer text-left"
                      >
                        <span>+ Create New Workspace</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#f0e9fb]/90 text-[#581eae] shadow-[0_0_0_1px_rgba(109,37,218,0.14)] dark:bg-[#6d25da]/18 dark:text-[#e2d3f8] dark:shadow-[0_0_0_1px_rgba(139,81,225,0.28)] text-xs font-bold">
                <span className="h-2 w-2 rounded-full bg-[#6d25da] dark:bg-[#a87ce9]" />
                {activeTenant.name}
              </span>
            )}

            {/* Custom Super Admin Portal & Accessible Workspaces Switcher Dropdown */}
            {isSuperAdminAccount ? (
              <div className="relative" ref={personaMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setPersonaMenuOpen((prev) => !prev)
                    setWorkspaceMenuOpen(false)
                    setNotifOpen(false)
                  }}
                  aria-label="Switch between Super Admin Portal and Workspaces"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-50 shadow-(--dp-shadow-pill) dark:bg-white/[0.05] dark:hover:bg-white/[0.09] text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition cursor-pointer"
                >
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${isInSuperAdminPortal ? 'bg-[#8b51e1]' : 'bg-emerald-500'
                      }`}
                  />
                  <span className="truncate max-w-[130px] font-bold">
                    {isInSuperAdminPortal ? 'Super Admin' : activeTenant.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono uppercase shrink-0 font-bold tracking-wider ${isInSuperAdminPortal
                        ? 'bg-[#6d25da]/12 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]'
                        : 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                      }`}
                  >
                    {isInSuperAdminPortal ? 'PORTAL' : 'WORKSPACE'}
                  </span>
                  <svg
                    className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${personaMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {personaMenuOpen && (
                  <div className="dp-popover-enter absolute right-0 mt-2 w-72 rounded-2xl bg-white/95 dark:bg-[#14141b]/95 backdrop-blur-2xl shadow-(--dp-shadow-popover) p-2 z-50">
                    {/* Identity card */}
                    <div className="px-3 py-2.5 bg-[#f5f4fa] dark:bg-white/[0.04] rounded-xl mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#6d25da] to-[#8b51e1] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                          {(sessionUserEmail?.[0] || 'A').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">
                            {sessionUserEmail?.split('@')[0]}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono">
                            {sessionUserEmail}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#6d25da]/15 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#a87ce9]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#8b51e1]" />
                        System Super Admin
                      </div>
                    </div>

                    {/* Super Admin Portal Switch */}
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Super Admin Portal
                    </div>
                    <div className="mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSuperAdminViewMode('portal')
                          setPersonaMenuOpen(false)
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition cursor-pointer text-left ${isInSuperAdminPortal
                            ? 'bg-[#6d25da]/15 dark:bg-[#6d25da]/20 text-[#6d25da] dark:text-[#a87ce9] font-semibold'
                            : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                          }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${isInSuperAdminPortal ? 'bg-[#8b51e1]' : 'bg-zinc-300 dark:bg-zinc-600'
                              }`}
                          />
                          <div className="truncate">
                            <div className="truncate font-semibold">Super Admin Portal</div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                              Full system access &amp; all pages
                            </div>
                          </div>
                        </div>
                        {isInSuperAdminPortal && (
                          <svg
                            className="h-4 w-4 text-[#8b51e1] shrink-0 ml-1.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Accessible Workspaces Section (own/authorized workspaces only — separate from Super Admin Portal) */}
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/80 pt-2">
                      <span>Your Workspaces</span>
                      <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded text-[9px] font-mono">
                        {accessibleTenants.length}
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {accessibleTenants.map((t) => {
                        const isSelected = !isInSuperAdminPortal && t.id === activeTenant.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setActiveTenantId(t.id)
                              setSuperAdminViewMode('workspace')
                              setPersonaMenuOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition cursor-pointer text-left ${isSelected
                                ? 'bg-emerald-500/12 dark:bg-emerald-500/18 text-emerald-700 dark:text-emerald-300 font-semibold'
                                : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                              }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${isSelected ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
                                  }`}
                              />
                              <div className="truncate">
                                <div className="truncate font-medium">{t.name}</div>
                                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate font-mono">
                                  {t.slug} • {t.currency}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <svg
                                className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 ml-1.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setPersonaMenuOpen(false)
                          setCreatingAdditionalWorkspace(true)
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:bg-[#6d25da]/10 transition cursor-pointer text-left"
                      >
                        <span>+ Create New Workspace</span>
                      </button>
                    </div>

                    <div className="mt-2 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => {
                          setPersonaMenuOpen(false)
                          void signOut().then(() => {
                            navigateToSection('timer-sessions')
                          })
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer text-left"
                      >
                        <svg
                          className="w-4 h-4 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : sessionUserEmail ? (
              <div className="relative" ref={personaMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setPersonaMenuOpen((prev) => !prev)
                    setWorkspaceMenuOpen(false)
                    setNotifOpen(false)
                  }}
                  title={`Signed in as ${activeUser.name} (${activeUser.email}) • Role: ${activeUser.role}`}
                  className="bg-white hover:bg-zinc-50 shadow-(--dp-shadow-pill) dark:bg-white/[0.05] dark:hover:bg-white/[0.09] rounded-xl px-2.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate max-w-[220px] flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8b51e1] shrink-0" />
                  <span className="truncate">{activeUser.name}</span>
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono uppercase bg-[#6d25da]/12 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] shrink-0">
                    {activeUser.role.replace('_', ' ')}
                  </span>
                  <svg
                    className={`h-3.5 w-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${personaMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {personaMenuOpen && (
                  <div className="dp-popover-enter absolute right-0 mt-2 w-64 rounded-2xl bg-white/95 dark:bg-[#14141b]/95 backdrop-blur-2xl shadow-(--dp-shadow-popover) p-2 z-50">
                    <div className="px-2.5 py-2 bg-[#f5f4fa] dark:bg-white/[0.04] rounded-xl mb-2">
                      <div className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate">
                        {activeUser.name}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {activeUser.email || sessionUserEmail}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPersonaMenuOpen(false)
                        void signOut().then(() => {
                          navigateToSection('timer-sessions')
                        })
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer text-left"
                    >
                      <svg
                        className="w-4 h-4 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                      </svg>
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative" ref={personaMenuRef}>
                <button
                  type="button"
                  onClick={() => setPersonaMenuOpen((prev) => !prev)}
                  className="bg-white hover:bg-zinc-50 shadow-(--dp-shadow-pill) dark:bg-white/[0.05] dark:hover:bg-white/[0.09] rounded-xl px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 focus:outline-none cursor-pointer flex items-center gap-1.5"
                >
                  <span className="truncate max-w-[120px]">{activeUser.name}</span>
                  <span className="text-[10px] text-zinc-400 uppercase font-mono">({activeUser.role.replace('_', ' ')})</span>
                  <svg
                    className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${personaMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {personaMenuOpen && (
                  <div className="dp-popover-enter absolute right-0 mt-2 w-56 rounded-2xl bg-white/95 dark:bg-[#14141b]/95 backdrop-blur-2xl shadow-(--dp-shadow-popover) p-1.5 z-50">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setActiveUserId(m.id)
                          setPersonaMenuOpen(false)
                        }}
                        className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition ${activeUser.id === m.id
                            ? 'bg-[#6d25da]/15 dark:bg-[#6d25da]/20 text-[#6d25da] dark:text-[#a87ce9] font-semibold'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                          }`}
                      >
                        {m.name} ({m.role.replace('_', ' ')})
                      </button>
                    ))}
                    <div className="mt-1 pt-1 border-t border-zinc-200/80 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => {
                          setPersonaMenuOpen(false)
                          void signOut().then(() => {
                            navigateToSection('timer-sessions')
                          })
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer text-left"
                      >
                        <svg
                          className="w-4 h-4 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label="Notifications"
                className="relative p-2 rounded-xl bg-white hover:bg-zinc-50 shadow-(--dp-shadow-pill) text-zinc-600 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] dark:text-zinc-300 transition cursor-pointer"
              >
                <NavIcon path="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-[#6d25da] text-[10px] font-bold text-white shadow-[0_2px_8px_rgba(109,37,218,0.5)] flex items-center justify-center">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="dp-popover-enter absolute right-0 mt-2 w-80 max-h-80 overflow-y-auto rounded-2xl bg-white/95 dark:bg-[#14141b]/95 backdrop-blur-2xl shadow-(--dp-shadow-popover) p-3 space-y-2 z-50">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-200 pb-2 border-b border-zinc-200/60 dark:border-white/5">
                    <span>Notifications</span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="text-xs text-zinc-500 py-4 text-center">
                      You are all caught up.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-2.5 rounded-xl text-xs cursor-pointer space-y-0.5 transition ${n.readAt
                          ? 'bg-zinc-50/80 text-zinc-500 hover:bg-zinc-100/80 dark:bg-white/[0.025] dark:hover:bg-white/[0.045] dark:text-zinc-400'
                          : 'bg-[#6d25da]/10 text-zinc-800 shadow-[inset_0_0_0_1px_rgba(109,37,218,0.18)] dark:bg-[#6d25da]/18 dark:text-zinc-100 dark:shadow-[inset_0_0_0_1px_rgba(139,81,225,0.28)]'
                          }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>{n.title}</span>
                          {!n.readAt && (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#8b51e1]" />
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
              className="p-2 rounded-xl bg-white hover:bg-zinc-50 shadow-(--dp-shadow-pill) text-zinc-600 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] dark:text-zinc-300 transition cursor-pointer"
            >
              {theme === 'dark' ? (
                <NavIcon path="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
              ) : (
                <NavIcon path="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              )}
            </button>
          </div>
        </header>

        {/* Main Workspace Canvas with Strict RBAC Route Guard */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-5 sm:px-8 py-6">
          {!canAccessNav(currentNav) ? (
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
                className="px-4 py-2 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold cursor-pointer"
              >
                Return to {visibleNavItems[0]?.label || 'Workspace'}
              </button>
            </div>
          ) : (
            <div key={activeSection} className="dp-view-enter">
              {activeSection === 'timesheets-review' && <TimesheetsAndReviewView />}
              {activeSection === 'developer-payments' && <DeveloperPaymentsView />}
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
              {activeSection === 'pricing-plans' && <PricingPlansView />}
              {activeSection === 'auth-privacy' && <AuthAndOnboardingView />}
              {activeSection === 'phase0-simulator' && (
                <div className="space-y-8">
                  <GroundTruthSimulator />
                  <PrivacyDpiaInspector />
                </div>
              )}
            </div>
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
              <DevProofShell />
            </Phase4StoreProvider>
          </Phase3StoreProvider>
        </Phase2StoreProvider>
      </Phase1StoreProvider>
    </ThemeProvider>
  )
}

export default App
