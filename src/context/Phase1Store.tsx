/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type {
  ContractBillingPolicy,
  ContractRateVersion,
  EvidenceStatus,
  RoundingRule,
  SessionLifecycleState,
  SessionProvenance,
  UserRole,
  WorkMode,
} from '@/types/domain.types'
import { applyTimeRounding, resolveEffectiveRate } from '@/lib/time-engine'
import {
  assignTaskMembersViaPrisma,
  createProjectViaPrisma,
  createTaskViaPrisma,
  createTenantViaPrisma,
  fetchPrismaBootstrap,
  inviteMemberViaPrisma,
  lockInvoiceViaPrisma,
  markNotificationReadViaPrisma,
  recordAuditViaPrisma,
  recordSessionViaPrisma,
  reviewTimesheetLineViaPrisma,
  submitTimesheetViaPrisma,
  updateMemberStatusViaPrisma,
  updateTaskStatusViaPrisma,
  updateTenantSettingsViaPrisma,
  type PrismaConnectionStatus,
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
  roundingRule: RoundingRule
  paidBreakMinutesPerDay: number
  weeklyCapMinutes: number
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

interface Phase1StoreContextValue {
  tenants: TenantWorkspace[]
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
  }) => { ok: boolean; message: string }
  updateTenantSettings: (patch: Partial<TenantWorkspace>) => void
  publishPolicyVersion: (versionCode: string, summaryMarkdown: string) => void
  members: WorkspaceMember[]
  activeUser: WorkspaceMember
  setActiveUserId: (id: string) => void
  inviteMember: (name: string, email: string, role: UserRole) => { ok: boolean; message: string }
  toggleMemberStatus: (memberId: string, nextStatus: WorkspaceMember['status']) => void
  acknowledgeCurrentPolicy: () => void
  projects: ProjectRecord[]
  createProject: (code: string, name: string, clientName: string, description: string) => { ok: boolean; message: string }
  tasks: TaskRecord[]
  createTask: (input: Omit<TaskRecord, 'id' | 'tenantId' | 'attachments'>) => void
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
  refreshPrismaConnection: () => Promise<void>
}

const INITIAL_TENANTS: TenantWorkspace[] = [
  {
    id: 'tenant-northstar',
    name: 'Northstar Labs',
    slug: 'northstar-labs',
    timezone: 'America/New_York',
    currency: 'USD',
    planTier: 'team',
    roundingRule: 'none',
    paidBreakMinutesPerDay: 15,
    weeklyCapMinutes: 2400,
    policyVersion: 'v1.0-2026-11',
    policyVersions: [
      {
        id: 'pv-1',
        versionCode: 'v1.0-2026-11',
        summaryMarkdown:
          'Privacy-first baseline: collects session lifecycle, declared work mode & opt-in IDE/Git metadata; hard-denies keystrokes, clipboard, and default screenshots.',
        effectiveFrom: '2026-11-01T00:00:00Z',
      },
    ],
  },
  {
    id: 'tenant-vertex',
    name: 'Vertex Cloud Agency',
    slug: 'vertex-agency',
    timezone: 'Europe/Berlin',
    currency: 'EUR',
    planTier: 'agency',
    roundingRule: 'nearest_5m',
    paidBreakMinutesPerDay: 15,
    weeklyCapMinutes: 2400,
    policyVersion: 'v1.0-2026-11',
    policyVersions: [
      {
        id: 'pv-2',
        versionCode: 'v1.0-2026-11',
        summaryMarkdown: 'GDPR-compliant European agency tracking baseline.',
        effectiveFrom: '2026-11-01T00:00:00Z',
      },
    ],
  },
]

const INITIAL_MEMBERS: WorkspaceMember[] = [
  {
    id: 'usr-aria',
    tenantId: 'tenant-northstar',
    name: 'Aria Chen',
    email: 'aria@northstar.dev',
    role: 'developer',
    status: 'active',
    mfaEnabled: true,
    consentedPolicyVersion: 'v1.0-2026-11',
    assignedProjectIds: ['proj-settle', 'proj-vault'],
  },
  {
    id: 'usr-marcus',
    tenantId: 'tenant-northstar',
    name: 'Marcus Vance',
    email: 'marcus@northstar.dev',
    role: 'project_manager',
    status: 'active',
    mfaEnabled: true,
    consentedPolicyVersion: 'v1.0-2026-11',
    assignedProjectIds: ['proj-settle', 'proj-vault'],
  },
  {
    id: 'usr-elena',
    tenantId: 'tenant-northstar',
    name: 'Elena Rostova',
    email: 'finance@northstar.dev',
    role: 'finance',
    status: 'active',
    mfaEnabled: true,
    consentedPolicyVersion: 'v1.0-2026-11',
    assignedProjectIds: ['proj-settle', 'proj-vault'],
  },
  {
    id: 'usr-devon',
    tenantId: 'tenant-northstar',
    name: 'Devon Brooks',
    email: 'owner@northstar.dev',
    role: 'tenant_owner',
    status: 'active',
    mfaEnabled: true,
    consentedPolicyVersion: 'v1.0-2026-11',
    assignedProjectIds: ['proj-settle', 'proj-vault'],
  },
  {
    id: 'usr-lukas',
    tenantId: 'tenant-vertex',
    name: 'Lukas Weber',
    email: 'lukas@vertex-agency.eu',
    role: 'tenant_owner',
    status: 'active',
    mfaEnabled: true,
    consentedPolicyVersion: 'v1.0-2026-11',
    assignedProjectIds: ['proj-vertex-1'],
  },
]

const INITIAL_PROJECTS: ProjectRecord[] = [
  {
    id: 'proj-settle',
    tenantId: 'tenant-northstar',
    code: 'SETTLE-CORE',
    name: 'Multi-Region Settlement Ledger',
    clientName: 'Acme FinTech Global',
    status: 'active',
    description: 'High-integrity PostgreSQL ledger, RLS policies, and webhook settlement pipeline.',
  },
  {
    id: 'proj-vault',
    tenantId: 'tenant-northstar',
    code: 'VAULT-SDK',
    name: 'Zero-Knowledge Tokenization SDK',
    clientName: 'Horizon Banking Group',
    status: 'active',
    description: 'Rust/Tauri local encryption queue and key-rotation client SDK.',
  },
  {
    id: 'proj-vertex-1',
    tenantId: 'tenant-vertex',
    code: 'EU-COMPLY',
    name: 'GDPR Retention & Audit Service',
    clientName: 'EuroBank AG',
    status: 'active',
    description: 'Isolated tenant project belonging to Vertex Cloud Agency.',
  },
]

const INITIAL_TASKS: TaskRecord[] = [
  {
    id: 'tsk-104',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settle',
    code: 'DEV-104',
    title: 'Design & Implement GiST Non-Overlap Time Ledger Constraint',
    acceptanceCriteria:
      '1. Exclude overlapping intervals per (tenant_id, user_id). 2. Pass pgTAP negative tests.',
    status: 'active',
    priority: 'high',
    estimateMinutes: 240,
    isBillable: true,
    defaultWorkMode: 'thinking',
    assignedMemberIds: ['usr-aria'],
    dueDate: '2026-11-16',
    attachments: ['ADR-003-GiST-Constraints.md', 'schema-diagram.svg'],
  },
  {
    id: 'tsk-104-sub1',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settle',
    parentTaskId: 'tsk-104',
    code: 'DEV-104.1',
    title: 'Write pgTAP Negative & Role-Boundary RLS Suite',
    acceptanceCriteria: 'Verify developer vs finance vs cross-tenant isolation in pgTAP.',
    status: 'active',
    priority: 'medium',
    estimateMinutes: 90,
    isBillable: true,
    defaultWorkMode: 'testing',
    assignedMemberIds: ['usr-aria'],
    dueDate: '2026-11-16',
    attachments: [],
  },
  {
    id: 'tsk-209',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settle',
    code: 'DEV-209',
    title: 'Investigate Queue Worker Visibility Timeout Race Condition',
    acceptanceCriteria:
      '1. Reproduce deadlock in local test runner. 2. Ensure idempotent batch acknowledgment.',
    status: 'review',
    priority: 'urgent',
    estimateMinutes: 180,
    isBillable: true,
    defaultWorkMode: 'debugging',
    assignedMemberIds: ['usr-aria', 'usr-marcus'],
    dueDate: '2026-11-14',
    attachments: ['deadlock-trace.log'],
  },
  {
    id: 'tsk-301',
    tenantId: 'tenant-northstar',
    projectId: 'proj-vault',
    code: 'VAULT-12',
    title: 'Implement AES-256-GCM Offline Event Buffer in Tauri Agent',
    acceptanceCriteria:
      '1. Persist unacknowledged batches across app restarts. 2. Deduplicate on reconnect.',
    status: 'backlog',
    priority: 'medium',
    estimateMinutes: 300,
    isBillable: true,
    defaultWorkMode: 'coding',
    assignedMemberIds: ['usr-aria'],
    dueDate: '2026-11-20',
    attachments: [],
  },
]

const INITIAL_CONTRACT_POLICY: ContractBillingPolicy = {
  id: 'cnt-acme-2026',
  tenantId: 'tenant-northstar',
  projectName: 'Multi-Region Settlement Ledger',
  clientName: 'Acme FinTech Global',
  roundingRule: 'none',
  paidBreakAllowanceMinutesPerDay: 15,
  weeklyCapMinutes: 2400,
  deepWorkNoInputWindowMinutes: 90,
  idleClarificationThresholdMinutes: 15,
  rateVersions: [
    {
      id: 'rv-1',
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-11-14',
      hourlyRate: 85,
      currency: 'USD',
      label: 'Q4 Standard Rate ($85/hr)',
    },
    {
      id: 'rv-2',
      effectiveFrom: '2026-11-15',
      effectiveTo: null,
      hourlyRate: 100,
      currency: 'USD',
      label: 'Senior Architecture Uplift ($100/hr)',
    },
  ],
}

const INITIAL_TIMESHEET_LINES: TimesheetLineItem[] = [
  {
    id: 'tsl-1',
    timesheetId: 'ts-nov10-settle',
    timesheetStatus: 'submitted',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settle',
    taskId: 'tsk-104',
    taskCode: 'DEV-104',
    taskTitle: 'Design & Implement GiST Non-Overlap Time Ledger Constraint',
    developerId: 'usr-aria',
    developerName: 'Aria Chen',
    workDate: '2026-11-10',
    startTime: '09:00',
    endTime: '10:30',
    workMode: 'thinking',
    provenance: 'desktop_timer',
    elapsedMinutes: 90,
    claimedMinutes: 90,
    observedMinutes: 0,
    supportedMinutes: 90,
    approvedBillableMinutes: 90,
    evidenceStatus: 'approved',
    snapshotHourlyRate: 85,
    rateLabel: 'Q4 Standard Rate ($85/hr)',
    developerNote:
      '90m declared architectural thinking: modeled PostgreSQL btree_gist exclusion constraints and composite FKs on whiteboard (Acceptance Scenario 1).',
    managerComment: 'Approved — ADR-003 architecture note clearly substantiates the 90m design block.',
    disputeMessages: [],
    isLocked: false,
  },
  {
    id: 'tsl-2',
    timesheetId: 'ts-nov10-settle',
    timesheetStatus: 'needs_clarification',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settle',
    taskId: 'tsk-209',
    taskCode: 'DEV-209',
    taskTitle: 'Investigate Queue Worker Visibility Timeout Race Condition',
    developerId: 'usr-aria',
    developerName: 'Aria Chen',
    workDate: '2026-11-11',
    startTime: '14:00',
    endTime: '15:30',
    workMode: 'debugging',
    provenance: 'desktop_timer',
    elapsedMinutes: 90,
    claimedMinutes: 90,
    observedMinutes: 65,
    supportedMinutes: 65,
    approvedBillableMinutes: 0,
    evidenceStatus: 'needs_clarification',
    snapshotHourlyRate: 85,
    rateLabel: 'Q4 Standard Rate ($85/hr)',
    developerNote: 'Stepped through queue consumer visibility timeout handling.',
    managerComment:
      'Clarification requested (Rule R-01): 25m unobserved interval between 14:40 and 15:05—was this log inspection or a break?',
    disputeMessages: [],
    isLocked: false,
  },
  {
    id: 'tsl-3',
    timesheetId: 'ts-nov10-settle',
    timesheetStatus: 'submitted',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settle',
    taskId: 'tsk-104',
    taskCode: 'DEV-104',
    taskTitle: 'Design & Implement GiST Non-Overlap Time Ledger Constraint',
    developerId: 'usr-aria',
    developerName: 'Aria Chen',
    workDate: '2026-11-15',
    startTime: '10:00',
    endTime: '12:00',
    workMode: 'coding',
    provenance: 'desktop_timer',
    elapsedMinutes: 120,
    claimedMinutes: 120,
    observedMinutes: 120,
    supportedMinutes: 120,
    approvedBillableMinutes: 120,
    evidenceStatus: 'approved',
    snapshotHourlyRate: 100,
    rateLabel: 'Senior Architecture Uplift ($100/hr)',
    developerNote:
      'Wrote 0003_time_ledger_and_sessions.sql and verified historical rate transition on Nov 15 ($100/hr — Acceptance Scenario 6).',
    managerComment: 'Approved under Nov 15 uplift rate card.',
    disputeMessages: [],
    isLocked: false,
  },
]

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    tenantId: 'tenant-northstar',
    recipientUserId: 'usr-aria',
    type: 'clarification_requested',
    title: 'Clarification Requested on DEV-209 (Nov 11)',
    body: 'Marcus Vance asked for context on the 25m unobserved interval (14:40–15:05).',
    readAt: null,
    createdAt: '2026-11-11T17:15:00Z',
  },
]

const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-1',
    tenantId: 'tenant-northstar',
    actorName: 'Devon Brooks',
    actorRole: 'tenant_owner',
    actionType: 'POLICY_PUBLISHED',
    targetEntity: 'policy_versions:v1.0-2026-11',
    reason: 'Published privacy-first tracking policy v1.0 with hard-deny on keystrokes and screenshots.',
    timestamp: '2026-11-01T08:00:00Z',
  },
  {
    id: 'aud-2',
    tenantId: 'tenant-northstar',
    actorName: 'Aria Chen',
    actorRole: 'developer',
    actionType: 'POLICY_CONSENT_ACKNOWLEDGED',
    targetEntity: 'policy_consents:usr-aria',
    reason: 'Developer acknowledged v1.0-2026-11 collection scope prior to starting timer.',
    timestamp: '2026-11-10T08:58:00Z',
  },
  {
    id: 'aud-3',
    tenantId: 'tenant-northstar',
    actorName: 'Marcus Vance',
    actorRole: 'project_manager',
    actionType: 'TIMESHEET_LINE_CLARIFICATION_REQUESTED',
    targetEntity: 'timesheet_lines:tsl-2',
    reason: 'Requested context on 25m unobserved interval instead of auto-rejecting (Acceptance Scenario 4).',
    timestamp: '2026-11-11T17:15:00Z',
  },
]

function loadRecoveredTimerState(): ActiveTimerState {
  const defaultState: ActiveTimerState = {
    isRunning: false,
    lifecycle: 'paused',
    projectId: 'proj-settle',
    taskId: 'tsk-104',
    workMode: 'thinking',
    startedAtIso: new Date().toISOString(),
    elapsedSeconds: 0,
    breakSeconds: 0,
    isOfflineQueueActive: false,
    queuedOfflineBatches: [],
    sessionNote: 'Reviewing pgTAP negative RLS test matrix for multi-tenant isolation.',
    recoveredFromCrash: false,
  }

  try {
    const raw = localStorage.getItem(TIMER_RECOVERY_STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw) as Partial<ActiveTimerState>
    if (parsed && typeof parsed.elapsedSeconds === 'number') {
      return {
        ...defaultState,
        ...parsed,
        recoveredFromCrash: Boolean(parsed.isRunning || parsed.elapsedSeconds > 0),
      }
    }
  } catch {
    // Ignore storage parse failure
  }
  return defaultState
}

const Phase1StoreContext = createContext<Phase1StoreContextValue | null>(null)

export function Phase1StoreProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<TenantWorkspace[]>(INITIAL_TENANTS)
  const [activeTenantId, setActiveTenantIdState] = useState<string>('tenant-northstar')
  const [members, setMembers] = useState<WorkspaceMember[]>(INITIAL_MEMBERS)
  const [activeUserId, setActiveUserId] = useState<string>('usr-aria')
  const [projects, setProjects] = useState<ProjectRecord[]>(INITIAL_PROJECTS)
  const [tasks, setTasks] = useState<TaskRecord[]>(INITIAL_TASKS)
  const [contractPolicy, setContractPolicy] =
    useState<ContractBillingPolicy>(INITIAL_CONTRACT_POLICY)
  const [timesheetLines, setTimesheetLines] =
    useState<TimesheetLineItem[]>(INITIAL_TIMESHEET_LINES)
  const [invoices, setInvoices] = useState<InvoiceDraftRecord[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS)
  const [prismaStatus, setPrismaStatus] = useState<PrismaConnectionStatus>({
    connected: false,
    configured: false,
    projectRef: null,
    message: 'Checking Prisma ORM -> Supabase connection...',
  })
  const [timer, setTimer] = useState<ActiveTimerState>(loadRecoveredTimerState)

  function applyBootstrapPayload(
    payload: NonNullable<Awaited<ReturnType<typeof fetchPrismaBootstrap>>>
  ) {
    setPrismaStatus(payload.status)

    if (payload.status.connected) {
      if (payload.tenants.length > 0) {
        setTenants(payload.tenants)
        setActiveTenantIdState(payload.tenants[0].id)
      }
      if (payload.members.length > 0) {
        setMembers(payload.members)
        setActiveUserId(payload.members[0].id)
      }
      if (payload.projects.length > 0) setProjects(payload.projects)
      if (payload.tasks.length > 0) setTasks(payload.tasks)
      if (payload.timesheetLines.length > 0) setTimesheetLines(payload.timesheetLines)
      if (payload.invoices.length > 0) setInvoices(payload.invoices)
      if (payload.notifications && payload.notifications.length > 0) {
        setNotifications(payload.notifications)
      }
      if (payload.auditLogs.length > 0) setAuditLogs(payload.auditLogs)
    }
  }

  async function refreshPrismaConnection() {
    const payload = await fetchPrismaBootstrap()
    if (!payload) return
    applyBootstrapPayload(payload)
  }

  useEffect(() => {
    let active = true
    void fetchPrismaBootstrap().then((payload) => {
      if (!active || !payload) return
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

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? tenants[0]
  const activeEntitlement = PLAN_ENTITLEMENTS[activeTenant.planTier]
  const tenantMembers = members.filter((m) => m.tenantId === activeTenant.id)
  const activeUser =
    tenantMembers.find((m) => m.id === activeUserId) ?? tenantMembers[0] ?? members[0]

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
    const firstMember = members.find((m) => m.tenantId === id)
    if (firstMember) setActiveUserId(firstMember.id)
  }

  function createTenantWorkspace(input: {
    name: string
    slug: string
    timezone: string
    currency: string
    ownerName: string
    ownerEmail: string
  }): { ok: boolean; message: string } {
    const cleanSlug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    if (tenants.some((t) => t.slug === cleanSlug)) {
      return { ok: false, message: `Workspace slug "${cleanSlug}" already exists.` }
    }

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

    const newOwner: WorkspaceMember = {
      id: newOwnerId,
      tenantId: newTenantId,
      name: input.ownerName,
      email: input.ownerEmail,
      role: 'tenant_owner',
      status: 'active',
      mfaEnabled: true,
      consentedPolicyVersion: 'v1.0-2026-11',
      assignedProjectIds: [],
    }

    setTenants((prev) => [...prev, newTenant])
    setMembers((prev) => [...prev, newOwner])
    setActiveTenantIdState(newTenantId)
    setActiveUserId(newOwnerId)

    if (prismaStatus.connected) {
      void createTenantViaPrisma(input)
    }

    return { ok: true, message: `Workspace "${input.name}" provisioned cleanly.` }
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

  function inviteMember(
    name: string,
    email: string,
    role: UserRole
  ): { ok: boolean; message: string } {
    const activeSeatCount = tenantMembers.filter((m) => m.status === 'active').length
    if (activeSeatCount >= activeEntitlement.maxSeats) {
      return {
        ok: false,
        message: `Plan Entitlement Limit (F1-006): ${activeTenant.planTier.toUpperCase()} plan allows up to ${activeEntitlement.maxSeats} active seats.`,
      }
    }

    const newMember: WorkspaceMember = {
      id: `usr-${Date.now()}`,
      tenantId: activeTenant.id,
      name,
      email,
      role,
      status: 'active',
      mfaEnabled: false,
      consentedPolicyVersion: activeTenant.policyVersion,
      assignedProjectIds: projects
        .filter((p) => p.tenantId === activeTenant.id)
        .map((p) => p.id),
    }
    setMembers((prev) => [...prev, newMember])
    appendAudit(
      'MEMBER_INVITED',
      `memberships:${email}`,
      `Invited ${name} (${email}) with role ${role}`
    )
    if (prismaStatus.connected) {
      void inviteMemberViaPrisma({ tenantId: activeTenant.id, name, email, role })
    }
    return { ok: true, message: `Invited ${name} (${role}) to ${activeTenant.name}.` }
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
    const newTask: TaskRecord = {
      ...input,
      id: `tsk-${Date.now()}`,
      tenantId: activeTenant.id,
      attachments: [],
    }
    setTasks((prev) => [...prev, newTask])
    appendAudit('TASK_CREATED', `tasks:${newTask.code}`, `Created task ${newTask.title}`)

    if (prismaStatus.connected) {
      void createTaskViaPrisma({
        ...input,
        tenantId: activeTenant.id,
      }).then((res) => {
        if (res?.ok && res.task) {
          setTasks((prev) => prev.map((t) => (t.id === newTask.id ? res.task! : t)))
        }
      })
    }
  }

  function updateTaskStatus(taskId: string, status: TaskRecord['status']) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
    if (prismaStatus.connected) {
      void updateTaskStatusViaPrisma({ taskId, status })
    }
  }

  function assignTaskMembers(taskId: string, memberIds: string[]) {
    const target = tasks.find((t) => t.id === taskId)
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, assignedMemberIds: memberIds } : t
      )
    )
    appendAudit(
      'TASK_ASSIGNMENTS_UPDATED',
      `tasks:${target?.code ?? taskId}`,
      `Assigned ${memberIds.length} contributor(s) to task`
    )
    if (prismaStatus.connected && target) {
      void assignTaskMembersViaPrisma({
        tenantId: activeTenant.id,
        projectId: target.projectId,
        taskId,
        assignedMemberIds: memberIds,
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
      projectId: timer.projectId,
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
        activeTenant,
        activeEntitlement,
        setActiveTenantId,
        createTenantWorkspace,
        updateTenantSettings,
        publishPolicyVersion,
        members: tenantMembers,
        activeUser,
        setActiveUserId,
        inviteMember,
        toggleMemberStatus,
        acknowledgeCurrentPolicy,
        projects: projects.filter((p) => p.tenantId === activeTenant.id),
        createProject,
        tasks: tasks.filter((t) => t.tenantId === activeTenant.id),
        createTask,
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
        invoices: invoices.filter((i) => i.tenantId === activeTenant.id),
        generateInvoiceFromApproved,
        lockInvoice,
        issueCreditAdjustmentInvoice,
        notifications: tenantNotifications,
        unreadNotificationCount,
        markNotificationRead,
        auditLogs: auditLogs.filter((a) => a.tenantId === activeTenant.id),
        prismaStatus,
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
