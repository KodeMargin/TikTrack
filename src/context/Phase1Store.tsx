/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase, isSupabaseAuthConfigured } from '@/lib/supabaseClient'
import type {
  ContractBillingPolicy,
  ContractRateVersion,
  EvidenceStatus,
  RoundingRule,
  SessionLifecycleState,
  SessionProvenance,
  UserRole,
  WorkMode,
  CustomRole,
} from '@/types/domain.types'
import {
  DEFAULT_PREDEFINED_ROLES,
  DEFAULT_TENANT_OWNER_PERMISSIONS,
  GRANULAR_PERMISSIONS,
  type GranularPermissionDef,
  type PermissionModuleId,
} from '@/types/permissions.types'
import { applyTimeRounding, resolveEffectiveRate } from '@/lib/time-engine'
import {
  assignTaskMembersViaPrisma,
  createCustomRoleViaPrisma,
  createProjectViaPrisma,
  createTaskViaPrisma,
  createTenantViaPrisma,
  deleteCustomRoleViaPrisma,
  fetchPrismaBootstrap,
  inviteMemberViaPrisma,
  registerPermissionViaPrisma,
  resendMemberInviteViaPrisma,
  runPermissionsSeedViaPrisma,
  lockInvoiceViaPrisma,
  markNotificationReadViaPrisma,
  partialApproveTimesheetViaPrisma,
  recordAuditViaPrisma,
  recordSessionViaPrisma,
  reviewTimesheetLineViaPrisma,
  submitTimesheetViaPrisma,
  updateCustomRoleViaPrisma,
  updateMemberRoleViaPrisma,
  updateMemberStatusViaPrisma,
  deleteMemberViaPrisma,
  updateTaskStatusViaPrisma,
  updateTenantOwnerPermissionsViaPrisma,
  updateTenantSettingsViaPrisma,
  type PrismaConnectionStatus,
  type PrismaPhase2BootstrapPayload,
  type PrismaPhase3BootstrapPayload,
  type PrismaPhase4BootstrapPayload,
  type PrismaPhase5BootstrapPayload,
  type PrismaRbacBootstrapPayload,
} from '@/lib/prismaApiClient'

export interface PolicyVersionRecord {
  id: string
  versionCode: string
  summaryMarkdown: string
  effectiveFrom: string
}

export interface TenantWorkspace {
  id: string
  name: string
  slug: string
  timezone: string
  currency: string
  planTier: 'starter' | 'team' | 'agency' | 'enterprise'
  aiEnabled?: boolean
  roundingRule: RoundingRule
  paidBreakMinutesPerDay: number
  weeklyCapMinutes: number
  brandingConfig?: Record<string, unknown>
  policyVersion: string
  policyVersions?: PolicyVersionRecord[]
}

export interface PlanEntitlementSpec {
  planTier: TenantWorkspace['planTier']
  maxSeats: number
  maxActiveProjects: number
  retentionDays: number
}

export const PLAN_ENTITLEMENTS: Record<TenantWorkspace['planTier'], PlanEntitlementSpec> = {
  starter: { planTier: 'starter', maxSeats: 5, maxActiveProjects: 3, retentionDays: 90 },
  team: { planTier: 'team', maxSeats: 25, maxActiveProjects: 25, retentionDays: 365 },
  agency: { planTier: 'agency', maxSeats: 100, maxActiveProjects: 100, retentionDays: 730 },
  enterprise: { planTier: 'enterprise', maxSeats: 10000, maxActiveProjects: 10000, retentionDays: 2555 },
}

export interface WorkspaceMember {
  id: string
  tenantId: string
  name: string
  email: string
  role: UserRole
  status: 'active' | 'invited' | 'suspended' | 'revoked'
  mfaEnabled: boolean
  consentedPolicyVersion: string | null
  assignedProjectIds: string[]
  mustChangePassword?: boolean
  temporaryPassword?: string
  customPermissions?: string[]
}

export interface ProjectRecord {
  id: string
  tenantId: string
  code: string
  name: string
  clientName: string
  status: 'active' | 'paused' | 'archived'
  description: string
}

export interface TaskRecord {
  id: string
  tenantId: string
  projectId: string
  parentTaskId?: string
  code: string
  title: string
  acceptanceCriteria: string
  status: 'backlog' | 'active' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  estimateMinutes: number
  isBillable: boolean
  defaultWorkMode: WorkMode
  assignedMemberIds: string[]
  dueDate: string
  attachments: string[]
}

export interface TimesheetLineItem {
  id: string
  timesheetId?: string
  timesheetStatus?: 'draft' | 'submitted' | 'needs_clarification' | 'partially_approved' | 'approved' | 'locked' | 'disputed'
  tenantId: string
  projectId: string
  taskId: string
  taskCode: string
  taskTitle: string
  developerId: string
  developerName: string
  workDate: string
  startTime: string
  endTime: string
  workMode: WorkMode
  provenance: SessionProvenance
  elapsedMinutes: number
  claimedMinutes: number
  observedMinutes: number
  supportedMinutes: number
  approvedBillableMinutes: number
  evidenceStatus: EvidenceStatus
  snapshotHourlyRate: number
  rateLabel: string
  developerNote: string
  manualReason?: string
  managerComment?: string
  disputeReason?: string
  disputeMessages: { author: string; role: string; text: string; timestamp: string }[]
  isLocked: boolean
  offlineBatchId?: string
}

export interface InvoiceDraftRecord {
  id: string
  tenantId: string
  invoiceNumber: string
  projectId: string
  projectName: string
  clientName: string
  currency: string
  periodLabel: string
  totalApprovedMinutes: number
  subtotalAmount: number
  taxPercent: number
  taxAmount: number
  totalAmount: number
  status: 'draft' | 'finalized_locked' | 'credited_adjusted'
  referenceCreditForInvoiceId?: string
  createdAt: string
  lines: {
    lineId: string
    workDate: string
    taskCode: string
    description: string
    approvedMinutes: number
    hourlyRate: number
    amount: number
  }[]
}

export interface NotificationItem {
  id: string
  tenantId: string
  recipientUserId: string
  type:
  | 'missing_timesheet'
  | 'clarification_requested'
  | 'clarification_replied'
  | 'timesheet_approved'
  | 'timesheet_adjusted'
  | 'dispute_opened'
  | 'invoice_locked'
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

export interface AuditLogEntry {
  id: string
  tenantId: string
  actorName: string
  actorRole: UserRole
  actionType: string
  targetEntity: string
  reason: string
  timestamp: string
}

interface ActiveTimerState {
  isRunning: boolean
  lifecycle: SessionLifecycleState
  projectId: string
  taskId: string
  workMode: WorkMode
  startedAtIso: string
  elapsedSeconds: number
  breakSeconds: number
  isOfflineQueueActive: boolean
  queuedOfflineBatches: string[]
  sessionNote: string
  recoveredFromCrash: boolean
}

const TIMER_RECOVERY_STORAGE_KEY = 'devproof_active_timer_recovery_v1'
const CUSTOM_ROLES_STORAGE_KEY = 'devproof_custom_roles_v1'
const TENANT_OWNER_PERMS_STORAGE_KEY = 'devproof_tenant_owner_perms_v1'

interface Phase1StoreContextValue {
  tenants: TenantWorkspace[]
  accessibleTenants: TenantWorkspace[]
  activeTenant: TenantWorkspace
  activeEntitlement: PlanEntitlementSpec
  setActiveTenantId: (id: string) => void
  createTenantWorkspace: (input: {
    name: string
    slug: string
    timezone: string
    currency: string
    ownerName: string
    ownerEmail: string
    skipOwnerInvite?: boolean
  }) => Promise<{ ok: boolean; message: string }>
  provisionWorkspaceSelfService: (input: {
    name: string
    slug: string
    timezone: string
    currency: string
    ownerName: string
    ownerEmail: string
  }) => Promise<{ ok: boolean; message: string; tenantId?: string; slug?: string }>
  updateTenantSettings: (patch: Partial<TenantWorkspace>) => void
  publishPolicyVersion: (versionCode: string, summaryMarkdown: string) => void
  members: WorkspaceMember[]
  activeUser: WorkspaceMember
  isSuperAdminSession: boolean
  authChecking: boolean
  sessionUserEmail: string | null
  sessionUserName: string | null
  signOut: () => Promise<void>
  setActiveUserId: (id: string) => void
  inviteMember: (
    name: string,
    email: string,
    role: UserRole,
    temporaryPassword?: string,
    customPermissions?: string[]
  ) => Promise<{ ok: boolean; message: string; emailSent?: boolean; temporaryPassword?: string }>
  completeFirstTimePasswordChange: (
    newPassword: string
  ) => Promise<{ ok: boolean; message: string }>
  resendMemberInvite: (memberId: string) => Promise<{ ok: boolean; message: string }>
  toggleMemberStatus: (memberId: string, nextStatus: WorkspaceMember['status']) => void
  deleteMember: (memberId: string) => { ok: boolean; message: string }
  acknowledgeCurrentPolicy: () => void
  roles: CustomRole[]
  permissionsCatalog: GranularPermissionDef[]
  rbacSeedStatus: PrismaRbacBootstrapPayload['seedStatus'] | null
  tenantOwnerPermissions: Record<string, string[]>
  hasPermission: (permission: string, member?: WorkspaceMember) => boolean
  getUserPermissions: (member?: WorkspaceMember) => string[]
  createCustomRole: (input: {
    name: string
    code?: string
    description: string
    permissions: string[]
  }) => { ok: boolean; message: string; role?: CustomRole }
  updateCustomRole: (
    roleId: string,
    updates: Partial<{ name: string; description: string; permissions: string[] }>
  ) => { ok: boolean; message: string }
  deleteCustomRole: (roleId: string) => { ok: boolean; message: string }
  updateMemberRole: (
    memberId: string,
    role: string,
    customPermissions?: string[]
  ) => { ok: boolean; message: string }
  updateTenantOwnerPermissions: (
    tenantId: string,
    permissions: string[]
  ) => { ok: boolean; message: string }
  registerNewPermission: (input: {
    key: string
    module: PermissionModuleId
    label: string
    description: string
    isSuperAdminOnly?: boolean
  }) => Promise<{ ok: boolean; message: string }>
  reseedPermissionsToDatabase: () => Promise<{ ok: boolean; message: string }>
  projects: ProjectRecord[]
  createProject: (code: string, name: string, clientName: string, description: string) => { ok: boolean; message: string }
  tasks: TaskRecord[]
  createTask: (input: Omit<TaskRecord, 'id' | 'tenantId' | 'attachments'>) => void
  updateTask: (taskId: string, patch: Partial<Omit<TaskRecord, 'id' | 'tenantId'>>) => void
  deleteTask: (taskId: string) => { ok: boolean; message: string }
  updateTaskStatus: (taskId: string, status: TaskRecord['status']) => void
  assignTaskMembers: (taskId: string, memberIds: string[]) => void
  addTaskAttachment: (taskId: string, fileName: string) => void
  contractPolicy: ContractBillingPolicy
  updateContractPolicy: (next: ContractBillingPolicy) => void
  addContractRateVersion: (rate: Omit<ContractRateVersion, 'id'>) => { ok: boolean; message: string }
  timer: ActiveTimerState
  setTimerTaskAndMode: (projectId: string, taskId: string, mode: WorkMode) => void
  transitionTimer: (nextState: SessionLifecycleState, note?: string) => void
  toggleOfflineMode: () => void
  resetTimerClock: () => void
  completeAndRecordSession: (
    durationMinutes: number,
    startTime: string,
    endTime: string,
    workDate: string,
    breakMinutes?: number
  ) => { ok: boolean; message: string }
  addManualTimeEntry: (input: {
    projectId: string
    taskId: string
    workDate: string
    startTime: string
    endTime: string
    durationMinutes: number
    workMode: WorkMode
    manualReason: string
    developerNote: string
  }) => { ok: boolean; message: string }
  timesheetLines: TimesheetLineItem[]
  submitTimesheetPeriod: (projectId: string) => { ok: boolean; message: string }
  respondToClarification: (lineId: string, explanation: string) => void
  openDisputeOnLine: (lineId: string, disputeReason: string) => void
  reviewTimesheetLine: (
    lineId: string,
    decision: 'approve' | 'ask_clarification' | 'adjust_with_reason' | 'reject',
    reason: string,
    adjustedMinutes?: number,
    lockLine?: boolean
  ) => { ok: boolean; message: string }
  approveUncontestedTimesheetLines: (projectId?: string) => {
    ok: boolean
    approvedCount: number
    heldCount: number
    message: string
  }
  resolveDisputeLineAdjust: (
    lineId: string,
    approvedMinutes: number,
    resolutionNote: string
  ) => { ok: boolean; createdCreditInvoiceId?: string; message: string }
  invoices: InvoiceDraftRecord[]
  generateInvoiceFromApproved: (projectId: string, taxPercent: number) => { ok: boolean; message: string }
  lockInvoice: (invoiceId: string) => void
  issueCreditAdjustmentInvoice: (
    lockedInvoiceId: string,
    creditAmount: number,
    reason: string
  ) => { ok: boolean; message: string }
  notifications: NotificationItem[]
  unreadNotificationCount: number
  markNotificationRead: (notificationId: string) => void
  auditLogs: AuditLogEntry[]
  prismaStatus: PrismaConnectionStatus
  bootstrapLoaded: boolean
  hasWorkspace: boolean
  phase2Bootstrap: PrismaPhase2BootstrapPayload | null
  phase3Bootstrap: PrismaPhase3BootstrapPayload | null
  phase4Bootstrap: PrismaPhase4BootstrapPayload | null
  phase5Bootstrap: PrismaPhase5BootstrapPayload | null
  setTenantPlanTierState: (tenantId: string, planTier: TenantWorkspace['planTier']) => void
  setTenantBrandingState: (tenantId: string, brandingConfig: Record<string, unknown>) => void
  refreshPrismaConnection: () => Promise<void>
}

const EMPTY_CONTRACT_POLICY: ContractBillingPolicy = {
  id: '',
  tenantId: '',
  projectName: 'No active contract',
  clientName: '-',
  roundingRule: 'none',
  paidBreakAllowanceMinutesPerDay: 15,
  weeklyCapMinutes: 2400,
  deepWorkNoInputWindowMinutes: 90,
  idleClarificationThresholdMinutes: 15,
  rateVersions: [],
}

const EMPTY_TENANT_PLACEHOLDER: TenantWorkspace = {
  id: '',
  name: '',
  slug: '',
  timezone: 'UTC',
  currency: 'USD',
  planTier: 'starter',
  roundingRule: 'none',
  paidBreakMinutesPerDay: 15,
  weeklyCapMinutes: 2400,
  policyVersion: 'v1.0-2026-11',
  policyVersions: [],
}

const EMPTY_MEMBER_PLACEHOLDER: WorkspaceMember = {
  id: '',
  tenantId: '',
  name: '',
  email: '',
  role: 'tenant_owner',
  status: 'active',
  mfaEnabled: true,
  consentedPolicyVersion: null,
  assignedProjectIds: [],
}

function loadRecoveredTimerState(): ActiveTimerState {
  const defaultState: ActiveTimerState = {
    isRunning: false,
    lifecycle: 'paused',
    projectId: '',
    taskId: '',
    workMode: 'coding',
    startedAtIso: new Date().toISOString(),
    elapsedSeconds: 0,
    breakSeconds: 0,
    isOfflineQueueActive: false,
    queuedOfflineBatches: [],
    sessionNote: '',
    recoveredFromCrash: false,
  }

  try {
    const raw = localStorage.getItem(TIMER_RECOVERY_STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw) as Partial<ActiveTimerState>
    // Critical: A time-tracker must NEVER auto-tick on app start or page refresh.
    // Time must only be tracked when the developer explicitly starts the timer.
    if (parsed && typeof parsed.elapsedSeconds === 'number' && parsed.elapsedSeconds > 0) {
      const recovered: ActiveTimerState = {
        ...defaultState,
        ...parsed,
        isRunning: false,
        lifecycle: 'paused',
        recoveredFromCrash: true,
      }
      try {
        localStorage.setItem(TIMER_RECOVERY_STORAGE_KEY, JSON.stringify(recovered))
      } catch {
        // Ignore storage errors
      }
      return recovered
    } else {
      // If elapsed seconds was 0 or invalid, clear out stale state
      try {
        localStorage.removeItem(TIMER_RECOVERY_STORAGE_KEY)
      } catch {
        // Ignore
      }
    }
  } catch {
    // Ignore storage parse failure
  }
  return defaultState
}

const Phase1StoreContext = createContext<Phase1StoreContextValue | null>(null)

const SUPER_ADMIN_EMAILS_SET = new Set([
  ...(
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPER_ADMIN_EMAILS) ||
    'iamartseeker@gmail.com'
  )
    .toLowerCase()
    .split(',')
    .map((e: string) => e.trim())
    .filter(Boolean),
  'iamartseeker@gmail.com',
])

export function Phase1StoreProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<TenantWorkspace[]>([])
  const [activeTenantId, setActiveTenantIdState] = useState<string>('')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [activeUserId, setActiveUserId] = useState<string>('')
  const [authChecking, setAuthChecking] = useState(isSupabaseAuthConfigured)
  const [sessionUserEmail, setSessionUserEmail] = useState<string | null>(null)
  const [sessionUserName, setSessionUserName] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [contractPolicy, setContractPolicy] =
    useState<ContractBillingPolicy>(EMPTY_CONTRACT_POLICY)
  const [timesheetLines, setTimesheetLines] = useState<TimesheetLineItem[]>([])
  const [invoices, setInvoices] = useState<InvoiceDraftRecord[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [phase2Bootstrap, setPhase2Bootstrap] =
    useState<PrismaPhase2BootstrapPayload | null>(null)
  const [phase3Bootstrap, setPhase3Bootstrap] =
    useState<PrismaPhase3BootstrapPayload | null>(null)
  const [phase4Bootstrap, setPhase4Bootstrap] =
    useState<PrismaPhase4BootstrapPayload | null>(null)
  const [phase5Bootstrap, setPhase5Bootstrap] =
    useState<PrismaPhase5BootstrapPayload | null>(null)
  const [bootstrapLoaded, setBootstrapLoaded] = useState(false)
  const [prismaStatus, setPrismaStatus] = useState<PrismaConnectionStatus>({
    connected: false,
    configured: false,
    projectRef: null,
    message: 'Connecting to Supabase PostgreSQL...',
  })
  const [timer, setTimer] = useState<ActiveTimerState>(loadRecoveredTimerState)
  const [permissionsCatalog, setPermissionsCatalog] =
    useState<GranularPermissionDef[]>(GRANULAR_PERMISSIONS)
  const [rbacSeedStatus, setRbacSeedStatus] = useState<
    PrismaRbacBootstrapPayload['seedStatus'] | null
  >(null)

  const [roles, setRoles] = useState<CustomRole[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_PREDEFINED_ROLES
    try {
      const stored = localStorage.getItem(CUSTOM_ROLES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CustomRole[]
        const customOnly = parsed.filter((r) => !r.isSystemRole)
        return [...DEFAULT_PREDEFINED_ROLES, ...customOnly]
      }
    } catch {
      // ignore
    }
    return DEFAULT_PREDEFINED_ROLES
  })

  const [tenantOwnerPermissions, setTenantOwnerPermissions] = useState<Record<string, string[]>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = localStorage.getItem(TENANT_OWNER_PERMS_STORAGE_KEY)
      if (stored) return JSON.parse(stored)
    } catch {
      // ignore
    }
    return {}
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CUSTOM_ROLES_STORAGE_KEY, JSON.stringify(roles))
      } catch {
        // ignore
      }
    }
  }, [roles])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          TENANT_OWNER_PERMS_STORAGE_KEY,
          JSON.stringify(tenantOwnerPermissions)
        )
      } catch {
        // ignore
      }
    }
  }, [tenantOwnerPermissions])

  function applyBootstrapPayload(
    payload: NonNullable<Awaited<ReturnType<typeof fetchPrismaBootstrap>>>
  ) {
    setPrismaStatus(payload.status)

    if (payload.status.connected) {
      setTenants(payload.tenants)
      setActiveTenantIdState((prev) =>
        payload.tenants.some((t) => t.id === prev)
          ? prev
          : (payload.tenants[0]?.id ?? '')
      )
      const upgradedMembers = payload.members.map((m) =>
        SUPER_ADMIN_EMAILS_SET.has(m.email.toLowerCase().trim())
          ? { ...m, role: 'super_admin' as const }
          : m
      )
      setMembers(upgradedMembers)
      setActiveUserId((prev) => {
        if (prev && payload.members.some((m) => m.id === prev)) return prev
        if (sessionUserEmail) {
          const match = payload.members.find(
            (m) => m.email.toLowerCase().trim() === sessionUserEmail
          )
          if (match) return match.id
          if (SUPER_ADMIN_EMAILS_SET.has(sessionUserEmail.toLowerCase().trim())) return 'super-admin'
        }
        return payload.members[0]?.id ?? ''
      })
      setProjects(payload.projects)
      setTasks(payload.tasks)
      setTimesheetLines(payload.timesheetLines)
      setInvoices(payload.invoices)
      setNotifications(payload.notifications ?? [])
      setAuditLogs(payload.auditLogs)
      if (payload.contracts && payload.contracts.length > 0) {
        setContractPolicy(payload.contracts[0])
      } else {
        setContractPolicy(EMPTY_CONTRACT_POLICY)
      }
      setPhase2Bootstrap(payload.phase2 ?? null)
      setPhase3Bootstrap(payload.phase3 ?? null)
      setPhase4Bootstrap(payload.phase4 ?? null)
      setPhase5Bootstrap(payload.phase5 ?? null)
      if (payload.rbac) {
        setRbacSeedStatus(payload.rbac.seedStatus)
        if (payload.rbac.permissions.length > 0) {
          setPermissionsCatalog(payload.rbac.permissions)
        }
        if (payload.rbac.roles.length > 0) {
          setRoles(payload.rbac.roles)
        }
        setTenantOwnerPermissions(payload.rbac.tenantOwnerPermissions)
      }
    } else {
      setTenants([])
      setMembers([])
      setProjects([])
      setTasks([])
      setTimesheetLines([])
      setInvoices([])
      setNotifications([])
      setAuditLogs([])
      setContractPolicy(EMPTY_CONTRACT_POLICY)
      setPhase2Bootstrap(null)
      setPhase3Bootstrap(null)
      setPhase4Bootstrap(null)
      setPhase5Bootstrap(null)
    }

    setBootstrapLoaded(true)
  }

  async function refreshPrismaConnection() {
    const payload = await fetchPrismaBootstrap()
    if (!payload) {
      setBootstrapLoaded(true)
      return
    }
    applyBootstrapPayload(payload)
  }

  useEffect(() => {
    let active = true
    void fetchPrismaBootstrap().then((payload) => {
      if (!active) return
      if (!payload) {
        setBootstrapLoaded(true)
        return
      }
      applyBootstrapPayload(payload)
    })
    return () => {
      active = false
    }
  }, [])

  // Live 1-second monotonic ticker + crash-recovery checkpoint (F1-022, F1-024)
  useEffect(() => {
    if (timer.lifecycle !== 'running' && timer.lifecycle !== 'on_break') {
      return
    }
    const intervalId = window.setInterval(() => {
      setTimer((prev) => {
        const updated = {
          ...prev,
          elapsedSeconds: prev.lifecycle === 'running' ? prev.elapsedSeconds + 1 : prev.elapsedSeconds,
          breakSeconds: prev.lifecycle === 'on_break' ? prev.breakSeconds + 1 : prev.breakSeconds,
        }
        try {
          localStorage.setItem(TIMER_RECOVERY_STORAGE_KEY, JSON.stringify(updated))
        } catch {
          // Ignore quota errors
        }
        return updated
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [timer.lifecycle])

  // Sync Supabase Auth Session (F1-002) -> active session user
  useEffect(() => {
    if (!supabase || !isSupabaseAuthConfigured) {
      setAuthChecking(false)
      return
    }
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const user = data.session?.user
      const email = user?.email?.toLowerCase().trim() ?? null
      const metaName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : null
      setSessionUserEmail(email)
      setSessionUserName(metaName || (email ? email.split('@')[0] : null))
      setAuthChecking(false)
    })

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      const email = user?.email?.toLowerCase().trim() ?? null
      const metaName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : null
      setSessionUserEmail(email)
      setSessionUserName(metaName || (email ? email.split('@')[0] : null))
      setAuthChecking(false)
    })

    return () => {
      active = false
      authSub.subscription.unsubscribe()
    }
  }, [])

  // When session user or members change, ensure active user matches the logged-in email
  useEffect(() => {
    if (!sessionUserEmail || members.length === 0) return
    const isSuper = SUPER_ADMIN_EMAILS_SET.has(sessionUserEmail.toLowerCase().trim())
    const matchingMember = members.find(
      (m) => m.email.toLowerCase().trim() === sessionUserEmail
    )
    if (matchingMember) {
      setActiveUserId(matchingMember.id)
      setActiveTenantIdState((prev) => {
        const belongsToCurrent = members.some(
          (m) => m.tenantId === prev && m.email.toLowerCase().trim() === sessionUserEmail
        )
        return belongsToCurrent ? prev : matchingMember.tenantId
      })
    } else if (isSuper) {
      setActiveUserId('super-admin')
    }
  }, [sessionUserEmail, members])

  const normalizedMembers: WorkspaceMember[] = useMemo(() => {
    return members.map((m: WorkspaceMember): WorkspaceMember =>
      SUPER_ADMIN_EMAILS_SET.has(m.email.toLowerCase().trim())
        ? { ...m, role: 'super_admin' as const }
        : m
    )
  }, [members])

  const rawSessionMember = sessionUserEmail
    ? normalizedMembers.find((m) => m.email.toLowerCase().trim() === sessionUserEmail)
    : undefined

  const sessionMember = rawSessionMember
    ? (SUPER_ADMIN_EMAILS_SET.has(rawSessionMember.email.toLowerCase().trim())
      ? { ...rawSessionMember, role: 'super_admin' as const }
      : rawSessionMember)
    : undefined

  const isSuperAdminSession = sessionMember
    ? sessionMember.role === 'super_admin'
    : (sessionUserEmail ? SUPER_ADMIN_EMAILS_SET.has(sessionUserEmail.toLowerCase().trim()) : false)

  const accessibleTenants = useMemo(() => {
    if (!sessionUserEmail || isSuperAdminSession) return tenants
    const myTenantIds = new Set(
      normalizedMembers
        .filter((m) => m.email.toLowerCase().trim() === sessionUserEmail)
        .map((m) => m.tenantId)
    )
    return tenants.filter((t) => myTenantIds.has(t.id))
  }, [tenants, normalizedMembers, sessionUserEmail, isSuperAdminSession])

  const hasWorkspace = sessionUserEmail && !isSuperAdminSession
    ? accessibleTenants.length > 0 && Boolean(sessionMember)
    : tenants.length > 0 && members.length > 0

  const activeTenant =
    accessibleTenants.find((t) => t.id === activeTenantId) ??
    accessibleTenants[0] ??
    EMPTY_TENANT_PLACEHOLDER
  const activeEntitlement = PLAN_ENTITLEMENTS[activeTenant.planTier]

  const tenantMembers = normalizedMembers.filter((m) => m.tenantId === activeTenant.id)

  const superAdminFallbackMember: WorkspaceMember | undefined =
    isSuperAdminSession && sessionUserEmail
      ? {
        id: 'super-admin',
        tenantId: activeTenant.id,
        name: sessionMember?.name || sessionUserEmail.split('@')[0] || 'Super Admin',
        email: sessionUserEmail,
        role: 'super_admin' as const,
        status: 'active' as const,
        mfaEnabled: true,
        consentedPolicyVersion: activeTenant.policyVersion,
        assignedProjectIds: [],
      }
      : undefined

  const activeUser: WorkspaceMember = useMemo(() => {
    if (isSuperAdminSession) {
      if (activeUserId && activeUserId !== 'super-admin' && activeUserId !== sessionMember?.id) {
        const simulated = tenantMembers.find((m) => m.id === activeUserId)
        if (simulated) {
          return simulated
        }
      }
      return sessionMember ?? superAdminFallbackMember ?? EMPTY_MEMBER_PLACEHOLDER
    }

    if (sessionUserEmail) {
      const match = tenantMembers.find(
        (m) => m.email.toLowerCase().trim() === sessionUserEmail
      )
      if (match) return match
      if (sessionMember) return sessionMember
    }

    if (activeUserId) {
      const match = tenantMembers.find((m) => m.id === activeUserId)
      if (match) return match
    }

    return tenantMembers[0] ?? normalizedMembers[0] ?? EMPTY_MEMBER_PLACEHOLDER
  }, [
    isSuperAdminSession,
    activeUserId,
    sessionMember,
    superAdminFallbackMember,
    tenantMembers,
    sessionUserEmail,
    normalizedMembers,
  ])

  async function signOut(): Promise<void> {
    if (supabase) {
      try {
        await supabase.auth.signOut()
      } catch (err) {
        console.warn('Sign out warning:', err)
      }
    }
    setSessionUserEmail(null)
    setSessionUserName(null)
    setActiveUserId('')
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('sb-') || key.includes('supabase.auth')) {
          localStorage.removeItem(key)
        }
      })
    } catch {
      // ignore
    }
  }

  function appendAudit(actionType: string, targetEntity: string, reason: string) {
    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: activeTenant.id,
        actorName: activeUser.name,
        actorRole: activeUser.role,
        actionType,
        targetEntity,
        reason,
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ])
    if (prismaStatus.connected) {
      void recordAuditViaPrisma({
        tenantId: activeTenant.id,
        actorUserId: activeUser.id,
        actionType,
        targetEntity,
        reason,
      })
    }
  }

  function pushNotification(
    recipientUserId: string,
    type: NotificationItem['type'],
    title: string,
    body: string
  ) {
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        tenantId: activeTenant.id,
        recipientUserId,
        type,
        title,
        body,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ])
  }

  function setActiveTenantId(id: string) {
    setActiveTenantIdState(id)
    if (sessionUserEmail && !isSuperAdminSession) {
      const myMember = members.find(
        (m) => m.tenantId === id && m.email.toLowerCase().trim() === sessionUserEmail
      )
      if (myMember) {
        setActiveUserId(myMember.id)
        return
      }
    }
    const firstMember = members.find((m) => m.tenantId === id)
    if (firstMember) setActiveUserId(firstMember.id)
  }

  function buildLocalTenantAndOwner(input: {
    name: string
    slug: string
    timezone: string
    currency: string
    ownerName: string
    ownerEmail: string
  }) {
    const cleanSlug =
      input.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') || `workspace-${Date.now()}`
    const newTenantId = `tenant-${Date.now()}`
    const newOwnerId = `usr-${Date.now()}`
    const newTenant: TenantWorkspace = {
      id: newTenantId,
      name: input.name,
      slug: cleanSlug,
      timezone: input.timezone,
      currency: input.currency,
      planTier: 'starter',
      roundingRule: 'none',
      paidBreakMinutesPerDay: 15,
      weeklyCapMinutes: 2400,
      policyVersion: 'v1.0-2026-11',
      policyVersions: [
        {
          id: `pv-${Date.now()}`,
          versionCode: 'v1.0-2026-11',
          summaryMarkdown: 'Privacy-first baseline policy.',
          effectiveFrom: new Date().toISOString(),
        },
      ],
    }

    const isSuper = SUPER_ADMIN_EMAILS_SET.has(input.ownerEmail.toLowerCase().trim())
    const newOwner: WorkspaceMember = {
      id: newOwnerId,
      tenantId: newTenantId,
      name: input.ownerName,
      email: input.ownerEmail,
      role: isSuper ? 'super_admin' : 'tenant_owner',
      status: 'active',
      mfaEnabled: true,
      consentedPolicyVersion: 'v1.0-2026-11',
      assignedProjectIds: [],
    }

    return { cleanSlug, newTenantId, newOwnerId, newTenant, newOwner }
  }

  function syncProvisionedIds(
    tempTenantId: string,
    tempOwnerId: string,
    realTenantId: string,
    realOwnerId: string,
    realSlug?: string
  ) {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === tempTenantId
          ? { ...t, id: realTenantId, slug: realSlug || t.slug }
          : t
      )
    )
    setMembers((prev) =>
      prev.map((m) =>
        m.id === tempOwnerId && m.tenantId === tempTenantId
          ? { ...m, id: realOwnerId, tenantId: realTenantId }
          : m.tenantId === tempTenantId
            ? { ...m, tenantId: realTenantId }
            : m
      )
    )
    setActiveTenantIdState(realTenantId)
    setActiveUserId(realOwnerId)
  }

  async function createTenantWorkspace(input: {
    name: string
    slug: string
    timezone: string
    currency: string
    ownerName: string
    ownerEmail: string
    skipOwnerInvite?: boolean
  }): Promise<{ ok: boolean; message: string }> {
    const cleanSlugCheck = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (tenants.some((t) => t.slug === cleanSlugCheck)) {
      return { ok: false, message: `Workspace slug "${cleanSlugCheck}" already exists.` }
    }

    const { newTenantId, newOwnerId, newTenant, newOwner } = buildLocalTenantAndOwner(input)

    setTenants((prev) => [...prev, newTenant])
    setMembers((prev) => [...prev, newOwner])
    setActiveTenantIdState(newTenantId)
    setActiveUserId(newOwnerId)

    if (prismaStatus.connected) {
      try {
        const res = await createTenantViaPrisma(input)
        if (res?.ok && res.tenantId && res.ownerId) {
          syncProvisionedIds(newTenantId, newOwnerId, res.tenantId, res.ownerId, res.slug)
          void refreshPrismaConnection()
        } else {
          return {
            ok: false,
            message: 'Workspace could not be persisted to database. Please try again.',
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create workspace'
        return { ok: false, message: msg }
      }
    }

    return { ok: true, message: `Workspace "${input.name}" provisioned and activated.` }
  }

  async function provisionWorkspaceSelfService(input: {
    name: string
    slug: string
    timezone: string
    currency: string
    ownerName: string
    ownerEmail: string
  }): Promise<{ ok: boolean; message: string; tenantId?: string; slug?: string }> {
    const baseSlug =
      input.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') || `workspace-${Date.now()}`
    const uniqueSlug = tenants.some((t) => t.slug === baseSlug)
      ? `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
      : baseSlug

    const { newTenantId, newOwnerId, newTenant, newOwner } = buildLocalTenantAndOwner({
      ...input,
      slug: uniqueSlug,
    })

    setTenants((prev) => [...prev, newTenant])
    setMembers((prev) => [...prev, newOwner])
    setActiveTenantIdState(newTenantId)
    setActiveUserId(newOwnerId)

    if (prismaStatus.connected) {
      try {
        const res = await createTenantViaPrisma({
          ...input,
          slug: uniqueSlug,
          skipOwnerInvite: true,
        })
        if (res?.ok && res.tenantId && res.ownerId) {
          syncProvisionedIds(newTenantId, newOwnerId, res.tenantId, res.ownerId, res.slug)
          void refreshPrismaConnection()
          return {
            ok: true,
            message: `Workspace "${input.name}" is ready!`,
            tenantId: res.tenantId,
            slug: res.slug || uniqueSlug,
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to persist workspace'
        return { ok: false, message: msg }
      }
    }

    return {
      ok: true,
      message: `Workspace "${input.name}" is ready!`,
      tenantId: newTenantId,
      slug: uniqueSlug,
    }
  }

  function updateTenantSettings(patch: Partial<TenantWorkspace>) {
    setTenants((prev) =>
      prev.map((t) => (t.id === activeTenant.id ? { ...t, ...patch } : t))
    )
    appendAudit(
      'TENANT_SETTINGS_UPDATED',
      `tenants:${activeTenant.slug}`,
      `Updated workspace settings (${Object.keys(patch).join(', ')})`
    )
    if (prismaStatus.connected) {
      void updateTenantSettingsViaPrisma({
        tenantId: activeTenant.id,
        roundingRule: patch.roundingRule,
        paidBreakMinutesPerDay: patch.paidBreakMinutesPerDay,
        weeklyCapMinutes: patch.weeklyCapMinutes,
      })
    }
  }

  function publishPolicyVersion(versionCode: string, summaryMarkdown: string) {
    const newPolicy: PolicyVersionRecord = {
      id: `pv-${Date.now()}`,
      versionCode,
      summaryMarkdown,
      effectiveFrom: new Date().toISOString(),
    }
    setTenants((prev) =>
      prev.map((t) =>
        t.id === activeTenant.id
          ? {
            ...t,
            policyVersion: versionCode,
            policyVersions: [newPolicy, ...(t.policyVersions ?? [])],
          }
          : t
      )
    )
    appendAudit(
      'POLICY_VERSION_PUBLISHED',
      `policy_versions:${versionCode}`,
      `Published policy ${versionCode} (requires developer acknowledgment prior to next session)`
    )
  }

  async function inviteMember(
    name: string,
    email: string,
    role: UserRole,
    temporaryPassword?: string,
    customPermissions?: string[]
  ): Promise<{ ok: boolean; message: string; emailSent?: boolean; temporaryPassword?: string }> {
    const activeSeatCount = tenantMembers.filter((m) => m.status === 'active').length
    if (activeSeatCount >= activeEntitlement.maxSeats) {
      return {
        ok: false,
        message: `Plan Entitlement Limit (F1-006): ${activeTenant.planTier.toUpperCase()} plan allows up to ${activeEntitlement.maxSeats} active seats.`,
      }
    }

    const normalizedEmail = email.toLowerCase().trim()
    const existingIndex = members.findIndex(
      (m) => m.tenantId === activeTenant.id && m.email.toLowerCase().trim() === normalizedEmail
    )

    if (existingIndex >= 0) {
      setMembers((prev) =>
        prev.map((m, idx) =>
          idx === existingIndex
            ? {
              ...m,
              name: name.trim(),
              role,
              customPermissions: customPermissions || m.customPermissions,
              status: 'invited',
              mustChangePassword: true,
              temporaryPassword,
            }
            : m
        )
      )
    } else {
      const newMember: WorkspaceMember = {
        id: `usr-${Date.now()}`,
        tenantId: activeTenant.id,
        name: name.trim(),
        email: normalizedEmail,
        role,
        customPermissions: customPermissions || [],
        status: 'invited',
        mustChangePassword: true,
        temporaryPassword,
        mfaEnabled: false,
        consentedPolicyVersion: activeTenant.policyVersion,
        assignedProjectIds: projects
          .filter((p) => p.tenantId === activeTenant.id)
          .map((p) => p.id),
      }
      setMembers((prev) => [...prev, newMember])
    }

    appendAudit(
      'MEMBER_INVITED',
      `memberships:${normalizedEmail}`,
      `Invited ${name} (${normalizedEmail}) with role ${role}`
    )

    if (prismaStatus.connected) {
      const res = await inviteMemberViaPrisma({
        tenantId: activeTenant.id,
        name: name.trim(),
        email: normalizedEmail,
        role,
        temporaryPassword,
        customPermissions,
      })

      if (!res || !res.ok) {
        return {
          ok: false,
          emailSent: false,
          message: res?.error || 'Failed to save invitation or dispatch email. Check server logs.',
        }
      }

      const issuedTempPass = res.temporaryPassword || temporaryPassword
      if (res.userId) {
        setMembers((prev) =>
          prev.map((m) =>
            m.tenantId === activeTenant.id && m.email.toLowerCase().trim() === normalizedEmail
              ? {
                ...m,
                id: res.userId!,
                mustChangePassword: true,
                temporaryPassword: issuedTempPass,
              }
              : m
          )
        )
      }

      if (res.emailSent === false) {
        return {
          ok: true,
          emailSent: false,
          temporaryPassword: issuedTempPass,
          message: `Member ${name} was added, but invitation email failed: ${res.emailMessage || 'Email service error'}`,
        }
      }

      return {
        ok: true,
        emailSent: true,
        temporaryPassword: issuedTempPass,
        message: `Invited ${name} (${role}) to ${activeTenant.name}. Invitation email sent to ${normalizedEmail} via Resend!`,
      }
    }

    return {
      ok: true,
      emailSent: false,
      temporaryPassword,
      message: `Invited ${name} (${role}) locally (database offline — email not dispatched).`,
    }
  }

  async function completeFirstTimePasswordChange(
    newPassword: string
  ): Promise<{ ok: boolean; message: string }> {
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, message: 'Password must be at least 6 characters long.' }
    }

    if (supabase) {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { mustChangePassword: false },
      })
      if (error) {
        return { ok: false, message: error.message }
      }
    }

    // Update member status to active
    setMembers((prev) =>
      prev.map((m) =>
        m.id === activeUser.id
          ? { ...m, status: 'active', mustChangePassword: false, temporaryPassword: undefined }
          : m
      )
    )

    if (prismaStatus.connected && activeUser.tenantId && activeUser.id) {
      void updateMemberStatusViaPrisma({
        tenantId: activeUser.tenantId,
        userId: activeUser.id,
        status: 'active',
      })
    }

    appendAudit(
      'FIRST_LOGIN_PASSWORD_CHANGED',
      `memberships:${activeUser.email}`,
      `User ${activeUser.name} (${activeUser.email}) replaced initial temporary password.`
    )

    return { ok: true, message: 'Password successfully updated! Your workspace is ready.' }
  }

  async function resendMemberInvite(memberId: string): Promise<{ ok: boolean; message: string }> {
    const member = members.find((m) => m.id === memberId)
    if (!member) return { ok: false, message: 'Member not found' }
    appendAudit(
      'INVITE_RESENT',
      `memberships:${member.email}`,
      `Resent invitation email to ${member.name} (${member.email})`
    )
    if (prismaStatus.connected) {
      const res = await resendMemberInviteViaPrisma({
        tenantId: activeTenant.id,
        userId: member.id,
        temporaryPassword: member.temporaryPassword,
      })
      if (!res || !res.ok) {
        return {
          ok: false,
          message: res?.message || res?.error || `Failed to resend invitation email to ${member.email}.`,
        }
      }
      if (res.temporaryPassword) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id && m.tenantId === activeTenant.id
              ? { ...m, temporaryPassword: res.temporaryPassword }
              : m
          )
        )
      }
      return {
        ok: true,
        message: res.message || `Invitation email resent to ${member.email} via Resend.`,
      }
    }
    return {
      ok: false,
      message: `Cannot send email to ${member.email} while database/API is offline.`,
    }
  }

  function toggleMemberStatus(memberId: string, nextStatus: WorkspaceMember['status']) {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, status: nextStatus } : m))
    )
    appendAudit(
      'MEMBERSHIP_STATUS_CHANGED',
      `memberships:${memberId}`,
      `Changed member status to ${nextStatus}`
    )
    if (prismaStatus.connected) {
      void updateMemberStatusViaPrisma({
        tenantId: activeTenant.id,
        userId: memberId,
        status: nextStatus,
      })
    }
  }

  function deleteMember(memberId: string): { ok: boolean; message: string } {
    const member = members.find((m) => m.id === memberId)
    if (!member) return { ok: false, message: 'Member not found' }
    if (member.id === activeUser.id) {
      return { ok: false, message: 'You cannot delete your own active account.' }
    }

    setMembers((prev) => prev.filter((m) => m.id !== memberId))
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        assignedMemberIds: t.assignedMemberIds.filter((id) => id !== memberId),
      }))
    )
    setTimesheetLines((prev) => prev.filter((l) => l.developerId !== memberId))

    appendAudit(
      'MEMBER_CASCADE_DELETED',
      `memberships:${member.email}`,
      `Deleted member ${member.name} (${member.email}) and purged associated timesheet and session records.`
    )

    if (prismaStatus.connected) {
      void deleteMemberViaPrisma({ tenantId: activeTenant.id, userId: memberId })
    }

    return {
      ok: true,
      message: `Permanently deleted member ${member.name} (${member.email}) and purged all associated data.`,
    }
  }

  function acknowledgeCurrentPolicy() {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === activeUser.id
          ? { ...m, consentedPolicyVersion: activeTenant.policyVersion }
          : m
      )
    )
    appendAudit(
      'POLICY_CONSENT_ACKNOWLEDGED',
      `policy_consents:${activeUser.id}`,
      `Acknowledged tracking policy ${activeTenant.policyVersion}`
    )
  }

  function hasPermission(permission: string, member?: WorkspaceMember): boolean {
    const targetMember = member ?? activeUser
    if (!targetMember) return false

    // SUPER ADMIN PRIVILEGE:
    // If user has role super_admin or session is super admin (unless intentionally evaluating another member),
    // they get automatic master authorization for ALL current and future permissions.
    const isSuper =
      targetMember.role === 'super_admin' ||
      (!member && isSuperAdminSession && activeUser.role === 'super_admin')
    if (isSuper) {
      return true
    }

    // Tenant owner permissions (can be customized by super admin per tenant)
    if (targetMember.role === 'tenant_owner') {
      const allowed =
        tenantOwnerPermissions[activeTenant.id] ?? DEFAULT_TENANT_OWNER_PERMISSIONS
      const direct = targetMember.customPermissions ?? []
      return allowed.includes(permission) || direct.includes(permission)
    }

    // System or custom role resolution
    const matchedRole = roles.find(
      (r) =>
        (r.tenantId === 'system' || r.tenantId === activeTenant.id) &&
        (r.code === targetMember.role || r.id === targetMember.role)
    )

    const rolePerms = matchedRole ? matchedRole.permissions : []
    const directPerms = targetMember.customPermissions ?? []
    return rolePerms.includes(permission) || directPerms.includes(permission)
  }

  function getUserPermissions(member?: WorkspaceMember): string[] {
    const targetMember = member ?? activeUser
    if (!targetMember) return []

    const isSuper =
      targetMember.role === 'super_admin' ||
      (!member && isSuperAdminSession && activeUser.role === 'super_admin')
    if (isSuper) {
      return permissionsCatalog.map((p) => p.key)
    }

    if (targetMember.role === 'tenant_owner') {
      const base =
        tenantOwnerPermissions[activeTenant.id] ?? DEFAULT_TENANT_OWNER_PERMISSIONS
      const direct = targetMember.customPermissions ?? []
      return Array.from(new Set([...base, ...direct]))
    }

    const matchedRole = roles.find(
      (r) =>
        (r.tenantId === 'system' || r.tenantId === activeTenant.id) &&
        (r.code === targetMember.role || r.id === targetMember.role)
    )
    const rolePerms = matchedRole ? matchedRole.permissions : []
    const directPerms = targetMember.customPermissions ?? []
    return Array.from(new Set([...rolePerms, ...directPerms]))
  }

  function createCustomRole(input: {
    name: string
    code?: string
    description: string
    permissions: string[]
  }): { ok: boolean; message: string; role?: CustomRole } {
    if (!input.name.trim()) {
      return { ok: false, message: 'Role name cannot be empty.' }
    }
    const cleanCode = (
      input.code?.trim() ||
      input.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
    ).slice(0, 32)

    const exists = roles.some(
      (r) =>
        (r.tenantId === 'system' || r.tenantId === activeTenant.id) &&
        r.code.toLowerCase() === cleanCode.toLowerCase()
    )
    if (exists) {
      return { ok: false, message: `A role with identifier "${cleanCode}" already exists.` }
    }

    const tempId = `role-${Date.now()}`
    const newRole: CustomRole = {
      id: tempId,
      tenantId: activeTenant.id,
      name: input.name.trim(),
      code: cleanCode,
      description:
        input.description.trim() || 'Custom tenant role with granular permissions',
      isSystemRole: false,
      permissions: input.permissions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setRoles((prev) => [...prev, newRole])
    appendAudit(
      'ROLE_CREATED',
      `roles:${cleanCode}`,
      `Created custom role "${newRole.name}" with ${newRole.permissions.length} granular action(s)`
    )

    if (prismaStatus.connected) {
      void createCustomRoleViaPrisma({
        tenantId: activeTenant.id,
        name: newRole.name,
        code: cleanCode,
        description: newRole.description,
        permissions: newRole.permissions,
        createdBy: activeUser.id,
      }).then((res) => {
        if (res?.ok && res.role) {
          setRoles((prev) => prev.map((r) => (r.id === tempId ? res.role! : r)))
        }
      })
    }

    return { ok: true, message: `Role "${newRole.name}" saved to database.`, role: newRole }
  }

  function updateCustomRole(
    roleId: string,
    updates: Partial<{ name: string; description: string; permissions: string[] }>
  ): { ok: boolean; message: string } {
    const target = roles.find((r) => r.id === roleId)
    if (!target) return { ok: false, message: 'Role not found.' }

    setRoles((prev) =>
      prev.map((r) => {
        if (r.id !== roleId) return r
        return {
          ...r,
          name: updates.name?.trim() || r.name,
          description:
            updates.description !== undefined
              ? updates.description.trim()
              : r.description,
          permissions: updates.permissions ? updates.permissions : r.permissions,
          updatedAt: new Date().toISOString(),
        }
      })
    )
    appendAudit('ROLE_UPDATED', `roles:${target.code}`, `Updated role "${target.name}" permissions`)

    if (prismaStatus.connected) {
      void updateCustomRoleViaPrisma({
        roleId,
        tenantId: activeTenant.id,
        name: updates.name,
        description: updates.description,
        permissions: updates.permissions,
      })
    }

    return { ok: true, message: `Role "${target.name}" updated in database.` }
  }

  function deleteCustomRole(roleId: string): { ok: boolean; message: string } {
    const target = roles.find((r) => r.id === roleId)
    if (!target) return { ok: false, message: 'Role not found.' }
    if (target.isSystemRole) {
      return { ok: false, message: 'Pre-defined system roles cannot be deleted.' }
    }

    const assignedCount = members.filter(
      (m) =>
        m.tenantId === activeTenant.id &&
        (m.role === target.code || m.role === target.id)
    ).length
    if (assignedCount > 0) {
      return {
        ok: false,
        message: `Cannot delete role "${target.name}" because it is currently assigned to ${assignedCount} member(s). Reassign them first.`,
      }
    }

    setRoles((prev) => prev.filter((r) => r.id !== roleId))
    appendAudit('ROLE_DELETED', `roles:${target.code}`, `Deleted custom role "${target.name}"`)

    if (prismaStatus.connected) {
      void deleteCustomRoleViaPrisma({ roleId, tenantId: activeTenant.id })
    }

    return { ok: true, message: `Role "${target.name}" removed from database.` }
  }

  function updateMemberRole(
    memberId: string,
    role: string,
    customPermissions?: string[]
  ): { ok: boolean; message: string } {
    const member = members.find((m) => m.id === memberId)
    if (!member) return { ok: false, message: 'Member not found.' }

    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
            ...m,
            role: role as UserRole,
            customPermissions:
              customPermissions !== undefined
                ? customPermissions
                : m.customPermissions,
          }
          : m
      )
    )

    appendAudit(
      'MEMBER_ROLE_UPDATED',
      `memberships:${member.email}`,
      `Updated member ${member.name} role to "${role}" with ${customPermissions?.length ?? 0} permission override(s)`
    )

    if (prismaStatus.connected) {
      void updateMemberRoleViaPrisma({
        tenantId: activeTenant.id,
        userId: memberId,
        role,
        customPermissions,
        grantedBy: activeUser.id,
      })
    }

    return { ok: true, message: `Permissions for ${member.name} saved to database.` }
  }

  function updateTenantOwnerPermissions(
    tenantId: string,
    permissions: string[]
  ): { ok: boolean; message: string } {
    setTenantOwnerPermissions((prev) => ({
      ...prev,
      [tenantId]: permissions,
    }))
    appendAudit(
      'TENANT_OWNER_PERMS_UPDATED',
      `tenants:${tenantId}`,
      `Super Admin updated Tenant Owner base permissions (${permissions.length} actions allowed)`
    )

    if (prismaStatus.connected) {
      void updateTenantOwnerPermissionsViaPrisma({
        tenantId,
        permissions,
        updatedBy: activeUser.id,
      })
    }

    return { ok: true, message: `Tenant Owner permissions saved to database.` }
  }

  async function registerNewPermission(input: {
    key: string
    module: PermissionModuleId
    label: string
    description: string
    isSuperAdminOnly?: boolean
  }): Promise<{ ok: boolean; message: string }> {
    const cleanKey = input.key.trim().toLowerCase()
    const cleanLabel = input.label.trim()
    if (!cleanKey || !cleanKey.includes(':') || !cleanLabel) {
      return {
        ok: false,
        message: 'Permission key (format module:action) and label are required.',
      }
    }

    const newPerm: GranularPermissionDef = {
      key: cleanKey,
      module: input.module,
      label: cleanLabel,
      description: input.description.trim(),
      isSuperAdminOnly: input.isSuperAdminOnly || undefined,
    }

    setPermissionsCatalog((prev) => {
      const filtered = prev.filter((p) => p.key !== cleanKey)
      return [...filtered, newPerm]
    })

    // Automatically add to super_admin (and tenant_owner if not superadmin-only) in state
    setRoles((prev) =>
      prev.map((r) => {
        if (r.code === 'super_admin') {
          return {
            ...r,
            permissions: Array.from(new Set([...r.permissions, cleanKey])),
          }
        }
        if (r.code === 'tenant_owner' && !input.isSuperAdminOnly) {
          return {
            ...r,
            permissions: Array.from(new Set([...r.permissions, cleanKey])),
          }
        }
        return r
      })
    )

    if (prismaStatus.connected) {
      const res = await registerPermissionViaPrisma(input)
      if (!res?.ok) {
        return {
          ok: false,
          message: res?.error ?? 'Failed to save permission to database.',
        }
      }
    }

    appendAudit(
      'PERMISSION_REGISTERED',
      `permissions:${cleanKey}`,
      `Registered new granular permission "${cleanKey}" (${cleanLabel}) - auto-applied to Super Admin`
    )
    return {
      ok: true,
      message: `Permission "${cleanKey}" saved to database and automatically granted to Super Admin.`,
    }
  }

  async function reseedPermissionsToDatabase(): Promise<{
    ok: boolean
    message: string
  }> {
    if (!prismaStatus.connected) {
      return { ok: false, message: 'PostgreSQL is not connected.' }
    }
    const res = await runPermissionsSeedViaPrisma()
    if (!res?.ok) {
      return { ok: false, message: 'Failed to execute permissions seed.' }
    }
    setRbacSeedStatus({
      seeded: res.seeded,
      firstTime: res.firstTime,
      checksum: res.checksum,
      moduleCount: res.moduleCount,
      permissionCount: res.permissionCount,
      systemRoleCount: res.systemRoleCount,
    })
    return {
      ok: true,
      message: `Seeded ${res.permissionCount} permissions across ${res.moduleCount} modules and ${res.systemRoleCount} system roles into PostgreSQL.`,
    }
  }

  function createProject(
    code: string,
    name: string,
    clientName: string,
    description: string
  ): { ok: boolean; message: string } {
    const tenantProjects = projects.filter((p) => p.tenantId === activeTenant.id)
    if (tenantProjects.length >= activeEntitlement.maxActiveProjects) {
      return {
        ok: false,
        message: `Plan Entitlement Limit (F1-006): ${activeTenant.planTier.toUpperCase()} plan allows up to ${activeEntitlement.maxActiveProjects} active projects.`,
      }
    }

    const newProj: ProjectRecord = {
      id: `proj-${Date.now()}`,
      tenantId: activeTenant.id,
      code: code.toUpperCase(),
      name,
      clientName,
      status: 'active',
      description,
    }
    setProjects((prev) => [...prev, newProj])
    appendAudit('PROJECT_CREATED', `projects:${newProj.code}`, `Created project ${name}`)

    if (prismaStatus.connected) {
      void createProjectViaPrisma({
        tenantId: activeTenant.id,
        code,
        name,
        clientName,
        description,
        actorUserId: activeUser.id,
      }).then((res) => {
        if (res?.ok && res.project) {
          setProjects((prev) =>
            prev.map((p) => (p.id === newProj.id ? res.project! : p))
          )
        }
      })
    }
    return { ok: true, message: `Project ${newProj.code} created.` }
  }

  function createTask(input: Omit<TaskRecord, 'id' | 'tenantId' | 'attachments'>) {
    const activeMemberIds = new Set(
      members
        .filter((m) => m.tenantId === activeTenant.id && m.status === 'active' && !m.mustChangePassword)
        .map((m) => m.id)
    )
    const eligibleAssignees = (input.assignedMemberIds ?? []).filter((id) => activeMemberIds.has(id))
    const newTask: TaskRecord = {
      ...input,
      assignedMemberIds: eligibleAssignees,
      id: `tsk-${Date.now()}`,
      tenantId: activeTenant.id,
      attachments: [],
    }
    setTasks((prev) => [...prev, newTask])
    appendAudit('TASK_CREATED', `tasks:${newTask.code}`, `Created task ${newTask.title}`)

    if (prismaStatus.connected) {
      void createTaskViaPrisma({
        ...input,
        assignedMemberIds: eligibleAssignees,
        tenantId: activeTenant.id,
      }).then((res) => {
        if (res?.ok && res.task) {
          setTasks((prev) => prev.map((t) => (t.id === newTask.id ? res.task! : t)))
        }
      })
    }
  }

  function updateTask(
    taskId: string,
    patch: Partial<Omit<TaskRecord, 'id' | 'tenantId'>>
  ) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
    )
    appendAudit('TASK_UPDATED', `tasks:${taskId}`, `Updated task specifications`)
  }

  function deleteTask(taskId: string): { ok: boolean; message: string } {
    const target = tasks.find((t) => t.id === taskId)
    if (!target) return { ok: false, message: 'Task not found' }
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    appendAudit('TASK_DELETED', `tasks:${target.code}`, `Deleted task ${target.title}`)
    return { ok: true, message: `Task ${target.code} deleted successfully.` }
  }

  function updateTaskStatus(taskId: string, status: TaskRecord['status']) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
    if (prismaStatus.connected) {
      void updateTaskStatusViaPrisma({ taskId, status })
    }
  }

  function assignTaskMembers(taskId: string, memberIds: string[]) {
    const target = tasks.find((t) => t.id === taskId)
    const activeMemberIds = new Set(
      members
        .filter((m) => m.tenantId === activeTenant.id && m.status === 'active' && !m.mustChangePassword)
        .map((m) => m.id)
    )
    const eligibleMemberIds = memberIds.filter((id) => activeMemberIds.has(id))
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, assignedMemberIds: eligibleMemberIds } : t
      )
    )
    appendAudit(
      'TASK_ASSIGNMENTS_UPDATED',
      `tasks:${target?.code ?? taskId}`,
      `Assigned ${eligibleMemberIds.length} active contributor(s) to task`
    )
    if (prismaStatus.connected && target) {
      void assignTaskMembersViaPrisma({
        tenantId: activeTenant.id,
        projectId: target.projectId,
        taskId,
        assignedMemberIds: eligibleMemberIds,
      })
    }
  }

  function addTaskAttachment(taskId: string, fileName: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, attachments: Array.from(new Set([...t.attachments, fileName])) }
          : t
      )
    )
    appendAudit(
      'TASK_ATTACHMENT_LINKED',
      `storage:task-attachments/${activeTenant.id}/${fileName}`,
      `Attached ${fileName} to task`
    )
  }

  function updateContractPolicy(next: ContractBillingPolicy) {
    setContractPolicy(next)
    appendAudit(
      'CONTRACT_POLICY_UPDATED',
      `contracts:${next.id}`,
      `Updated rounding (${next.roundingRule}) and effective-dated rate cards`
    )
  }

  function addContractRateVersion(
    rate: Omit<ContractRateVersion, 'id'>
  ): { ok: boolean; message: string } {
    const hasOverlap = contractPolicy.rateVersions.some((rv) => {
      const rvEnd = rv.effectiveTo ?? '9999-12-31'
      const newEnd = rate.effectiveTo ?? '9999-12-31'
      return rate.effectiveFrom <= rvEnd && newEnd >= rv.effectiveFrom
    })

    if (hasOverlap) {
      return {
        ok: false,
        message:
          'Effective-Dated Rate Overlap Rejected (F1-044): New rate period overlaps an existing rate card.',
      }
    }

    const newRate: ContractRateVersion = { ...rate, id: `rv-${Date.now()}` }
    setContractPolicy((prev) => ({
      ...prev,
      rateVersions: [...prev.rateVersions, newRate].sort((a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom)
      ),
    }))
    appendAudit(
      'CONTRACT_RATE_VERSION_ADDED',
      `contract_rate_versions:${newRate.label}`,
      `Added $${rate.hourlyRate}/hr effective ${rate.effectiveFrom}`
    )
    return { ok: true, message: `Added rate version "${rate.label}".` }
  }

  function setTimerTaskAndMode(projectId: string, taskId: string, workMode: WorkMode) {
    setTimer((prev) => ({
      ...prev,
      projectId,
      taskId,
      workMode,
    }))
  }

  function transitionTimer(nextState: SessionLifecycleState, note?: string) {
    setTimer((prev) => {
      const next = {
        ...prev,
        lifecycle: nextState,
        isRunning: nextState === 'running',
        sessionNote: note ?? prev.sessionNote,
        recoveredFromCrash: false,
      }
      try {
        localStorage.setItem(TIMER_RECOVERY_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore
      }
      return next
    })
  }

  function resetTimerClock() {
    setTimer((prev) => {
      const next = {
        ...prev,
        elapsedSeconds: 0,
        breakSeconds: 0,
        startedAtIso: new Date().toISOString(),
        recoveredFromCrash: false,
      }
      try {
        localStorage.setItem(TIMER_RECOVERY_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore
      }
      return next
    })
  }

  function toggleOfflineMode() {
    setTimer((prev) => {
      const nextOffline = !prev.isOfflineQueueActive
      return {
        ...prev,
        isOfflineQueueActive: nextOffline,
        queuedOfflineBatches: nextOffline ? [`offline-batch-${Date.now()}`] : [],
      }
    })
  }

  function hasTimeOverlap(workDate: string, startTime: string, endTime: string): boolean {
    return timesheetLines.some(
      (line) =>
        line.tenantId === activeTenant.id &&
        line.developerId === activeUser.id &&
        line.workDate === workDate &&
        startTime < line.endTime &&
        endTime > line.startTime
    )
  }

  function completeAndRecordSession(
    durationMinutes: number,
    startTime: string,
    endTime: string,
    workDate: string,
    breakMinutes = 0
  ): { ok: boolean; message: string } {
    if (activeUser.consentedPolicyVersion !== activeTenant.policyVersion) {
      return {
        ok: false,
        message: `Cannot record session: Acknowledgment of active policy ${activeTenant.policyVersion} is required (F1-030).`,
      }
    }

    if (hasTimeOverlap(workDate, startTime, endTime)) {
      return {
        ok: false,
        message: `Overlap Prevention Guard (F1-029): You already have a recorded segment overlapping ${startTime}–${endTime} on ${workDate}.`,
      }
    }

    const netClaimedMinutes = Math.max(0, durationMinutes - breakMinutes)
    const task = tasks.find((t) => t.id === timer.taskId) ?? tasks[0]
    if (!task) {
      return {
        ok: false,
        message: 'Create a project and task before recording a work session.',
      }
    }
    const targetProjectId = timer.projectId || task.projectId
    const rate = resolveEffectiveRate(workDate, contractPolicy.rateVersions)
    const isDeepWork =
      timer.workMode === 'thinking' ||
      timer.workMode === 'design' ||
      timer.workMode === 'research' ||
      timer.workMode === 'meeting'

    const newLine: TimesheetLineItem = {
      id: `tsl-${Date.now()}`,
      timesheetId: `ts-week-${activeTenant.id}`,
      timesheetStatus: 'draft',
      tenantId: activeTenant.id,
      projectId: targetProjectId,
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      developerId: activeUser.id,
      developerName: activeUser.name,
      workDate,
      startTime,
      endTime,
      workMode: timer.workMode,
      provenance: 'desktop_timer',
      elapsedMinutes: durationMinutes,
      claimedMinutes: netClaimedMinutes,
      observedMinutes: isDeepWork ? 0 : netClaimedMinutes,
      supportedMinutes: netClaimedMinutes,
      approvedBillableMinutes: 0,
      evidenceStatus: isDeepWork ? 'context_added' : 'observed',
      snapshotHourlyRate: rate.hourlyRate,
      rateLabel: rate.label,
      developerNote:
        timer.sessionNote ||
        `Completed ${netClaimedMinutes}m net (${breakMinutes}m break excluded) in ${timer.workMode} mode.`,
      disputeMessages: [],
      isLocked: false,
    }

    setTimesheetLines((prev) => [newLine, ...prev])
    resetTimerClock()
    appendAudit(
      'WORK_SESSION_RECORDED',
      `timesheet_lines:${newLine.id}`,
      `Recorded ${netClaimedMinutes}m net (${breakMinutes}m break excluded) in mode "${timer.workMode}" at $${rate.hourlyRate}/hr`
    )

    if (prismaStatus.connected) {
      void recordSessionViaPrisma({
        tenantId: activeTenant.id,
        userId: activeUser.id,
        projectId: timer.projectId,
        taskId: task.id,
        workDate,
        startTime,
        endTime,
        durationMinutes,
        breakMinutes,
        workMode: timer.workMode,
        provenance: 'desktop_timer',
        developerNote: newLine.developerNote,
        hourlyRate: rate.hourlyRate,
      })
    }

    const totalWeeklyClaimed =
      timesheetLines
        .filter((l) => l.tenantId === activeTenant.id && l.developerId === activeUser.id)
        .reduce((sum, l) => sum + l.claimedMinutes, 0) + netClaimedMinutes

    const capNotice =
      totalWeeklyClaimed > activeTenant.weeklyCapMinutes
        ? ` Warning: Weekly claimed time (${totalWeeklyClaimed}m) exceeds contract cap (${activeTenant.weeklyCapMinutes}m).`
        : ''

    return {
      ok: true,
      message: `Session recorded (${netClaimedMinutes}m net, ${breakMinutes}m break excluded) at $${rate.hourlyRate}/hr.${capNotice}`,
    }
  }

  function addManualTimeEntry(input: {
    projectId: string
    taskId: string
    workDate: string
    startTime: string
    endTime: string
    durationMinutes: number
    workMode: WorkMode
    manualReason: string
    developerNote: string
  }): { ok: boolean; message: string } {
    if (input.manualReason.trim().length < 10) {
      return {
        ok: false,
        message: 'Manual Time Entry (F1-028) requires an explicit audit reason (>= 10 characters).',
      }
    }

    if (hasTimeOverlap(input.workDate, input.startTime, input.endTime)) {
      return {
        ok: false,
        message: `Overlap Prevention Guard (F1-029): Manual entry (${input.startTime}–${input.endTime}) overlaps an existing segment on ${input.workDate}.`,
      }
    }

    const task = tasks.find((t) => t.id === input.taskId) ?? tasks[0]
    if (!task) {
      return {
        ok: false,
        message: 'Create a project and task before submitting manual time.',
      }
    }
    const rate = resolveEffectiveRate(input.workDate, contractPolicy.rateVersions)

    const newLine: TimesheetLineItem = {
      id: `tsl-manual-${Date.now()}`,
      timesheetId: `ts-week-${activeTenant.id}`,
      timesheetStatus: 'draft',
      tenantId: activeTenant.id,
      projectId: input.projectId,
      taskId: task.id,
      taskCode: task.code,
      taskTitle: task.title,
      developerId: activeUser.id,
      developerName: activeUser.name,
      workDate: input.workDate,
      startTime: input.startTime,
      endTime: input.endTime,
      workMode: input.workMode,
      provenance: 'manual_entry',
      elapsedMinutes: input.durationMinutes,
      claimedMinutes: input.durationMinutes,
      observedMinutes: 0,
      supportedMinutes: input.durationMinutes,
      approvedBillableMinutes: 0,
      evidenceStatus: 'needs_clarification',
      snapshotHourlyRate: rate.hourlyRate,
      rateLabel: rate.label,
      developerNote: input.developerNote,
      manualReason: input.manualReason,
      managerComment: 'Manual entry queued for manager verification (Rule R-07).',
      disputeMessages: [],
      isLocked: false,
    }

    setTimesheetLines((prev) => [newLine, ...prev])
    appendAudit(
      'MANUAL_TIME_ENTRY_ADDED',
      `timesheet_lines:${newLine.id}`,
      `Manual entry (${input.durationMinutes}m) added with reason: ${input.manualReason}`
    )

    if (prismaStatus.connected) {
      void recordSessionViaPrisma({
        tenantId: activeTenant.id,
        userId: activeUser.id,
        projectId: input.projectId,
        taskId: task.id,
        workDate: input.workDate,
        startTime: input.startTime,
        endTime: input.endTime,
        durationMinutes: input.durationMinutes,
        breakMinutes: 0,
        workMode: input.workMode,
        provenance: 'manual_entry',
        developerNote: input.developerNote,
        manualReason: input.manualReason,
        hourlyRate: rate.hourlyRate,
      })
    }

    return {
      ok: true,
      message: 'Manual time entry recorded with provenance "manual_entry" and routed for manager review.',
    }
  }

  function submitTimesheetPeriod(projectId: string): { ok: boolean; message: string } {
    const draftLines = timesheetLines.filter(
      (l) =>
        l.tenantId === activeTenant.id &&
        l.projectId === projectId &&
        (l.timesheetStatus === 'draft' || !l.timesheetStatus)
    )
    if (draftLines.length === 0) {
      return { ok: false, message: 'No draft lines awaiting submission for this project.' }
    }

    setTimesheetLines((prev) =>
      prev.map((l) =>
        l.tenantId === activeTenant.id &&
          l.projectId === projectId &&
          (l.timesheetStatus === 'draft' || !l.timesheetStatus)
          ? { ...l, timesheetStatus: 'submitted' }
          : l
      )
    )
    appendAudit(
      'TIMESHEET_SUBMITTED',
      `projects:${projectId}`,
      `Submitted ${draftLines.length} timesheet segment(s) for manager review (F1-040)`
    )

    const manager = tenantMembers.find((m) => m.role === 'project_manager')
    if (manager) {
      pushNotification(
        manager.id,
        'missing_timesheet',
        `Timesheet Submitted by ${activeUser.name}`,
        `${draftLines.length} segments ready for review.`
      )
    }

    if (prismaStatus.connected && draftLines[0]?.timesheetId) {
      void submitTimesheetViaPrisma({ timesheetId: draftLines[0].timesheetId })
    }

    return {
      ok: true,
      message: `Submitted ${draftLines.length} timesheet line(s) to Project Manager inbox.`,
    }
  }

  function respondToClarification(lineId: string, explanation: string) {
    setTimesheetLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
            ...line,
            developerNote: `${line.developerNote} | Clarification: ${explanation}`,
            supportedMinutes: line.claimedMinutes,
            evidenceStatus: 'context_added',
            disputeMessages: [
              ...line.disputeMessages,
              {
                author: activeUser.name,
                role: activeUser.role,
                text: explanation,
                timestamp: new Date().toLocaleTimeString(),
              },
            ],
          }
          : line
      )
    )
    appendAudit('DEVELOPER_CLARIFICATION_PROVIDED', `timesheet_lines:${lineId}`, explanation)

    const manager = tenantMembers.find((m) => m.role === 'project_manager')
    if (manager) {
      pushNotification(
        manager.id,
        'clarification_replied',
        `Clarification Replied by ${activeUser.name}`,
        explanation
      )
    }
  }

  function openDisputeOnLine(lineId: string, disputeReason: string) {
    setTimesheetLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
            ...line,
            evidenceStatus: 'disputed',
            disputeReason,
            disputeMessages: [
              ...line.disputeMessages,
              {
                author: activeUser.name,
                role: activeUser.role,
                text: `DISPUTE OPENED: ${disputeReason}`,
                timestamp: new Date().toLocaleTimeString(),
              },
            ],
          }
          : line
      )
    )
    appendAudit('DISPUTE_OPENED', `timesheet_lines:${lineId}`, disputeReason)
  }

  function reviewTimesheetLine(
    lineId: string,
    decision: 'approve' | 'ask_clarification' | 'adjust_with_reason' | 'reject',
    reason: string,
    adjustedMinutes?: number,
    lockLine?: boolean
  ): { ok: boolean; message: string } {
    if (reason.trim().length < 5) {
      return {
        ok: false,
        message: 'Manager review decision requires a traceable reason (>= 5 characters).',
      }
    }

    const target = timesheetLines.find((l) => l.id === lineId)
    if (!target) return { ok: false, message: 'Timesheet line not found.' }
    if (target.isLocked) {
      return {
        ok: false,
        message:
          'Approval Locking Guard (F1-047): Closed billing period lines are immutable. Issue a credit/adjustment entry instead.',
      }
    }

    const rawApproved =
      decision === 'approve'
        ? target.claimedMinutes
        : decision === 'adjust_with_reason'
          ? (adjustedMinutes ?? target.claimedMinutes)
          : 0
    const roundedApproved = applyTimeRounding(rawApproved, activeTenant.roundingRule)
    const nextStatus: EvidenceStatus =
      decision === 'approve' || decision === 'adjust_with_reason'
        ? 'approved'
        : decision === 'ask_clarification'
          ? 'needs_clarification'
          : 'disputed'

    setTimesheetLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
            ...line,
            approvedBillableMinutes: roundedApproved,
            evidenceStatus: nextStatus,
            managerComment: `${decision.toUpperCase()} by ${activeUser.name}: ${reason}`,
            isLocked: Boolean(lockLine && nextStatus === 'approved'),
            disputeMessages: [
              ...line.disputeMessages,
              {
                author: activeUser.name,
                role: activeUser.role,
                text: `[${decision.toUpperCase()}] ${reason}`,
                timestamp: new Date().toLocaleTimeString(),
              },
            ],
          }
          : line
      )
    )

    appendAudit(`MANAGER_REVIEW_${decision.toUpperCase()}`, `timesheet_lines:${lineId}`, reason)
    pushNotification(
      target.developerId,
      decision === 'ask_clarification'
        ? 'clarification_requested'
        : decision === 'adjust_with_reason'
          ? 'timesheet_adjusted'
          : 'timesheet_approved',
      `${target.taskCode} Review: ${decision.replace('_', ' ').toUpperCase()}`,
      reason
    )

    if (prismaStatus.connected && target.timesheetId) {
      void reviewTimesheetLineViaPrisma({
        tenantId: activeTenant.id,
        timesheetId: target.timesheetId,
        lineId,
        reviewerUserId: activeUser.id,
        decision,
        reason,
        approvedMinutes: roundedApproved,
        lockLine: Boolean(lockLine),
      })
    }

    return { ok: true, message: `Decision (${decision}) recorded with audit trail.` }
  }

  function approveUncontestedTimesheetLines(projectId?: string) {
    const tenantLines = timesheetLines.filter(
      (l) => l.tenantId === activeTenant.id && (!projectId || l.projectId === projectId)
    )
    const uncontested = tenantLines.filter(
      (l) =>
        !l.isLocked &&
        l.evidenceStatus !== 'approved' &&
        l.evidenceStatus !== 'disputed' &&
        l.evidenceStatus !== 'needs_clarification'
    )
    const contested = tenantLines.filter(
      (l) => l.evidenceStatus === 'disputed' || l.evidenceStatus === 'needs_clarification'
    )

    if (uncontested.length === 0) {
      return {
        ok: false,
        approvedCount: 0,
        heldCount: contested.length,
        message: 'No uncontested lines awaiting partial approval.',
      }
    }

    const uncontestedIds = new Set(uncontested.map((l) => l.id))
    const nextTimesheetStatus = contested.length > 0 ? 'partially_approved' : 'approved'

    setTimesheetLines((prev) =>
      prev.map((l) => {
        if (uncontestedIds.has(l.id)) {
          const rounded = applyTimeRounding(l.claimedMinutes, activeTenant.roundingRule)
          return {
            ...l,
            approvedBillableMinutes: rounded,
            evidenceStatus: 'approved',
            timesheetStatus: nextTimesheetStatus,
            managerComment: `Partial approval by ${activeUser.name}: uncontested period approved while ${contested.length} contested line(s) remain held (F3-034).`,
          }
        }
        if (l.tenantId === activeTenant.id && (!projectId || l.projectId === projectId)) {
          return { ...l, timesheetStatus: nextTimesheetStatus }
        }
        return l
      })
    )

    appendAudit(
      'PARTIAL_APPROVAL_EXECUTED',
      `timesheets:${projectId ?? activeTenant.id}`,
      `Approved ${uncontested.length} uncontested line(s); held ${contested.length} contested/disputed line(s) (F3-034).`
    )

    if (prismaStatus.connected && uncontested[0]?.timesheetId) {
      void partialApproveTimesheetViaPrisma({
        tenantId: activeTenant.id,
        timesheetId: uncontested[0].timesheetId,
        reviewerUserId: activeUser.id,
        uncontestedLineIds: Array.from(uncontestedIds),
        reason: 'Partial approval: uncontested hours approved while disputed lines remain open (F3-034).',
      })
    }

    return {
      ok: true,
      approvedCount: uncontested.length,
      heldCount: contested.length,
      message: `Partially approved ${uncontested.length} uncontested line(s); ${contested.length} contested line(s) preserved for dispute resolution.`,
    }
  }

  function resolveDisputeLineAdjust(
    lineId: string,
    approvedMinutes: number,
    resolutionNote: string
  ): { ok: boolean; createdCreditInvoiceId?: string; message: string } {
    const target = timesheetLines.find((l) => l.id === lineId)
    if (!target) return { ok: false, message: 'Timesheet line not found.' }

    const rounded = applyTimeRounding(approvedMinutes, activeTenant.roundingRule)

    if (target.isLocked) {
      // F1-047 & F3-032: Locked period cannot be mutated in place; issue an immutable
      // Credit / Adjustment Invoice Line in the open billing period.
      const deltaMinutes = rounded - target.approvedBillableMinutes
      const deltaAmount = Math.round(((deltaMinutes / 60) * target.snapshotHourlyRate) * 100) / 100
      const project = projects.find((p) => p.id === target.projectId)
      const creditId = `inv-adj-${Date.now()}`
      const adjInvoice: InvoiceDraftRecord = {
        id: creditId,
        tenantId: activeTenant.id,
        invoiceNumber: `ADJ-${String(invoices.length + 201)}`,
        projectId: target.projectId,
        projectName: project?.name ?? 'Project',
        clientName: project?.clientName ?? 'Client',
        currency: activeTenant.currency,
        periodLabel: `Post-Lock Dispute Adjustment (${target.taskCode})`,
        totalApprovedMinutes: deltaMinutes,
        subtotalAmount: deltaAmount,
        taxPercent: 0,
        taxAmount: 0,
        totalAmount: deltaAmount,
        status: 'credited_adjusted',
        createdAt: new Date().toISOString(),
        lines: [
          {
            lineId: target.id,
            workDate: new Date().toISOString().slice(0, 10),
            taskCode: target.taskCode,
            description: `Dispute Resolution Adjustment (${deltaMinutes >= 0 ? '+' : ''}${deltaMinutes}m): ${resolutionNote}`,
            approvedMinutes: deltaMinutes,
            hourlyRate: target.snapshotHourlyRate,
            amount: deltaAmount,
          },
        ],
      }

      setInvoices((prev) => [adjInvoice, ...prev])
      appendAudit(
        'POST_LOCK_DISPUTE_ADJUSTMENT_INVOICED',
        `invoice_drafts:${adjInvoice.invoiceNumber}`,
        `Issued post-lock dispute adjustment ${adjInvoice.invoiceNumber} (${deltaMinutes}m, ${deltaAmount.toFixed(2)}) for locked line ${target.taskCode}.`
      )
      return {
        ok: true,
        createdCreditInvoiceId: creditId,
        message: `Line was locked (F1-047); issued immutable adjustment memo ${adjInvoice.invoiceNumber} ($${deltaAmount.toFixed(2)}).`,
      }
    }

    setTimesheetLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
            ...l,
            approvedBillableMinutes: rounded,
            evidenceStatus: rounded > 0 ? 'approved' : 'disputed',
            managerComment: `Dispute resolved by ${activeUser.name}: ${resolutionNote}`,
          }
          : l
      )
    )
    appendAudit('DISPUTE_LINE_UPDATED', `timesheet_lines:${lineId}`, resolutionNote)
    return { ok: true, message: `Updated timesheet line to ${rounded}m approved.` }
  }

  function generateInvoiceFromApproved(
    projectId: string,
    taxPercent: number
  ): { ok: boolean; message: string } {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return { ok: false, message: 'Project not found.' }

    const eligibleLines = timesheetLines.filter(
      (l) =>
        l.tenantId === activeTenant.id &&
        l.projectId === projectId &&
        l.evidenceStatus === 'approved' &&
        l.approvedBillableMinutes > 0
    )

    if (eligibleLines.length === 0) {
      return { ok: false, message: 'No approved timesheet lines found for this project.' }
    }

    const invoiceLines = eligibleLines.map((l) => {
      const amount =
        Math.round(((l.approvedBillableMinutes / 60) * l.snapshotHourlyRate) * 100) / 100
      return {
        lineId: l.id,
        workDate: l.workDate,
        taskCode: l.taskCode,
        description: `${l.taskTitle} (${l.workMode})`,
        approvedMinutes: l.approvedBillableMinutes,
        hourlyRate: l.snapshotHourlyRate,
        amount,
      }
    })

    const subtotal = Math.round(invoiceLines.reduce((s, i) => s + i.amount, 0) * 100) / 100
    const taxAmount = Math.round(subtotal * (taxPercent / 100) * 100) / 100
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100
    const totalApprovedMinutes = invoiceLines.reduce((s, i) => s + i.approvedMinutes, 0)

    const newInvoice: InvoiceDraftRecord = {
      id: `inv-${Date.now()}`,
      tenantId: activeTenant.id,
      invoiceNumber: `INV-2026-${String(invoices.length + 101)}`,
      projectId: project.id,
      projectName: project.name,
      clientName: project.clientName,
      currency: activeTenant.currency,
      periodLabel: 'Nov 10 – Nov 16, 2026',
      totalApprovedMinutes,
      subtotalAmount: subtotal,
      taxPercent,
      taxAmount,
      totalAmount,
      status: 'draft',
      createdAt: new Date().toISOString(),
      lines: invoiceLines,
    }

    setInvoices((prev) => [newInvoice, ...prev])
    appendAudit(
      'INVOICE_DRAFT_GENERATED',
      `invoice_drafts:${newInvoice.invoiceNumber}`,
      `Generated invoice draft for ${project.clientName} (${totalApprovedMinutes}m approved, $${totalAmount.toFixed(2)})`
    )

    return {
      ok: true,
      message: `Generated Invoice Draft ${newInvoice.invoiceNumber} ($${totalAmount.toFixed(2)}).`,
    }
  }

  function lockInvoice(invoiceId: string) {
    const targetInv = invoices.find((i) => i.id === invoiceId)
    if (!targetInv) return

    const lineIds = targetInv.lines.map((l) => l.lineId)
    const lineIdSet = new Set(lineIds)

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'finalized_locked' } : inv
      )
    )
    setTimesheetLines((prev) =>
      prev.map((l) => (lineIdSet.has(l.id) ? { ...l, isLocked: true } : l))
    )
    appendAudit(
      'INVOICE_FINALIZED_AND_PERIOD_LOCKED',
      `invoice_drafts:${targetInv.invoiceNumber}`,
      `Locked invoice ${targetInv.invoiceNumber} and associated timesheet lines (F1-047)`
    )

    if (prismaStatus.connected) {
      void lockInvoiceViaPrisma({ invoiceId, lineIds })
    }
  }

  function issueCreditAdjustmentInvoice(
    lockedInvoiceId: string,
    creditAmount: number,
    reason: string
  ): { ok: boolean; message: string } {
    const orig = invoices.find((i) => i.id === lockedInvoiceId)
    if (!orig || orig.status !== 'finalized_locked') {
      return { ok: false, message: 'Credit adjustments apply only to finalized locked invoices.' }
    }
    if (creditAmount <= 0 || reason.trim().length < 5) {
      return { ok: false, message: 'Enter a positive credit amount and traceable audit reason.' }
    }

    const signedAmount = -Math.abs(Math.round(creditAmount * 100) / 100)
    const creditInv: InvoiceDraftRecord = {
      id: `inv-cr-${Date.now()}`,
      tenantId: activeTenant.id,
      invoiceNumber: `CR-${orig.invoiceNumber}`,
      projectId: orig.projectId,
      projectName: orig.projectName,
      clientName: orig.clientName,
      currency: orig.currency,
      periodLabel: `Credit Adjustment for ${orig.invoiceNumber}`,
      totalApprovedMinutes: 0,
      subtotalAmount: signedAmount,
      taxPercent: 0,
      taxAmount: 0,
      totalAmount: signedAmount,
      status: 'credited_adjusted',
      referenceCreditForInvoiceId: orig.id,
      createdAt: new Date().toISOString(),
      lines: [
        {
          lineId: `cr-line-${Date.now()}`,
          workDate: new Date().toISOString().slice(0, 10),
          taskCode: 'CREDIT',
          description: `Credit/Rebill Adjustment (${orig.invoiceNumber}): ${reason}`,
          approvedMinutes: 0,
          hourlyRate: 0,
          amount: signedAmount,
        },
      ],
    }

    setInvoices((prev) => [creditInv, ...prev])
    appendAudit(
      'CREDIT_ADJUSTMENT_ISSUED',
      `invoice_drafts:${creditInv.invoiceNumber}`,
      `Issued ${creditInv.invoiceNumber} (${signedAmount.toFixed(2)}) referencing ${orig.invoiceNumber}: ${reason}`
    )

    return {
      ok: true,
      message: `Issued immutable credit memo ${creditInv.invoiceNumber} (${signedAmount.toFixed(2)}).`,
    }
  }

  function markNotificationRead(notificationId: string) {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
      )
    )
    if (prismaStatus.connected) {
      void markNotificationReadViaPrisma({ notificationId })
    }
  }

  const tenantNotifications = notifications.filter(
    (n) => n.tenantId === activeTenant.id
  )
  const unreadNotificationCount = tenantNotifications.filter(
    (n) => !n.readAt && n.recipientUserId === activeUser.id
  ).length

  return (
    <Phase1StoreContext.Provider
      value={{
        tenants,
        accessibleTenants,
        activeTenant,
        activeEntitlement,
        setActiveTenantId,
        createTenantWorkspace,
        provisionWorkspaceSelfService,
        updateTenantSettings,
        publishPolicyVersion,
        members: tenantMembers,
        activeUser,
        isSuperAdminSession,
        authChecking,
        sessionUserEmail,
        sessionUserName,
        signOut,
        setActiveUserId,
        inviteMember,
        completeFirstTimePasswordChange,
        resendMemberInvite,
        toggleMemberStatus,
        deleteMember,
        acknowledgeCurrentPolicy,
        roles: roles.filter(
          (r) => r.tenantId === 'system' || r.tenantId === activeTenant.id
        ),
        permissionsCatalog,
        rbacSeedStatus,
        tenantOwnerPermissions,
        hasPermission,
        getUserPermissions,
        createCustomRole,
        updateCustomRole,
        deleteCustomRole,
        updateMemberRole,
        updateTenantOwnerPermissions,
        registerNewPermission,
        reseedPermissionsToDatabase,
        projects: projects.filter((p) => p.tenantId === activeTenant.id),
        createProject,
        tasks: tasks.filter((t) => t.tenantId === activeTenant.id),
        createTask,
        updateTask,
        deleteTask,
        updateTaskStatus,
        assignTaskMembers,
        addTaskAttachment,
        contractPolicy,
        updateContractPolicy,
        addContractRateVersion,
        timer,
        setTimerTaskAndMode,
        transitionTimer,
        toggleOfflineMode,
        resetTimerClock,
        completeAndRecordSession,
        addManualTimeEntry,
        timesheetLines: timesheetLines.filter((l) => l.tenantId === activeTenant.id),
        submitTimesheetPeriod,
        respondToClarification,
        openDisputeOnLine,
        reviewTimesheetLine,
        approveUncontestedTimesheetLines,
        resolveDisputeLineAdjust,
        invoices: invoices.filter((i) => i.tenantId === activeTenant.id),
        generateInvoiceFromApproved,
        lockInvoice,
        issueCreditAdjustmentInvoice,
        notifications: tenantNotifications,
        unreadNotificationCount,
        markNotificationRead,
        auditLogs: auditLogs.filter((a) => a.tenantId === activeTenant.id),
        prismaStatus,
        bootstrapLoaded,
        hasWorkspace,
        phase2Bootstrap,
        phase3Bootstrap,
        phase4Bootstrap,
        phase5Bootstrap,
        setTenantPlanTierState: (tenantId, planTier) => {
          setTenants((prev) =>
            prev.map((t) => (t.id === tenantId ? { ...t, planTier } : t))
          )
        },
        setTenantBrandingState: (tenantId, brandingConfig) => {
          setTenants((prev) =>
            prev.map((t) => (t.id === tenantId ? { ...t, brandingConfig } : t))
          )
        },
        refreshPrismaConnection,
      }}
    >
      {children}
    </Phase1StoreContext.Provider>
  )
}

export function usePhase1Store() {
  const ctx = useContext(Phase1StoreContext)
  if (!ctx) {
    throw new Error('usePhase1Store must be used inside Phase1StoreProvider')
  }
  return ctx
}
