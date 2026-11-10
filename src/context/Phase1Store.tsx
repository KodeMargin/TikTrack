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
  EvidenceStatus,
  RoundingRule,
  SessionLifecycleState,
  SessionProvenance,
  UserRole,
  WorkMode,
} from '@/types/domain.types'
import { applyTimeRounding, resolveEffectiveRate } from '@/lib/time-engine'
import {
  createProjectViaPrisma,
  createTaskViaPrisma,
  fetchPrismaBootstrap,
  recordAuditViaPrisma,
  updateTaskStatusViaPrisma,
  type PrismaConnectionStatus,
} from '@/lib/prismaApiClient'

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
  tenantId: string
  projectId: string
  taskId: string
  taskCode: string
  taskTitle: string
  developerId: string
  developerName: string
  workDate: string
  startTime: string // HH:MM
  endTime: string // HH:MM
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
  startedAt: string
  elapsedMinutes: number
  isOfflineQueueActive: boolean
  queuedOfflineBatches: string[]
  sessionNote: string
}

interface Phase1StoreContextValue {
  tenants: TenantWorkspace[]
  activeTenant: TenantWorkspace
  setActiveTenantId: (id: string) => void
  updateTenantSettings: (patch: Partial<TenantWorkspace>) => void
  members: WorkspaceMember[]
  activeUser: WorkspaceMember
  setActiveUserId: (id: string) => void
  inviteMember: (name: string, email: string, role: UserRole) => void
  toggleMemberStatus: (memberId: string, nextStatus: WorkspaceMember['status']) => void
  acknowledgeCurrentPolicy: () => void
  projects: ProjectRecord[]
  createProject: (code: string, name: string, clientName: string, description: string) => void
  tasks: TaskRecord[]
  createTask: (input: Omit<TaskRecord, 'id' | 'tenantId' | 'attachments'>) => void
  updateTaskStatus: (taskId: string, status: TaskRecord['status']) => void
  contractPolicy: ContractBillingPolicy
  updateContractPolicy: (next: ContractBillingPolicy) => void
  timer: ActiveTimerState
  setTimerTaskAndMode: (projectId: string, taskId: string, mode: WorkMode) => void
  transitionTimer: (nextState: SessionLifecycleState, note?: string) => void
  toggleOfflineMode: () => void
  completeAndRecordSession: (durationMinutes: number, startTime: string, endTime: string, workDate: string) => { ok: boolean; message: string }
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
    assignedMemberIds: ['usr-aria'],
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
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS)
  const [prismaStatus, setPrismaStatus] = useState<PrismaConnectionStatus>({
    connected: false,
    configured: false,
    projectRef: 'tvmsmhipyjhxgqqngznb',
    message: 'Checking Prisma ORM -> Supabase connection...',
  })

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
      if (payload.projects.length > 0) {
        setProjects(payload.projects)
      }
      if (payload.tasks.length > 0) {
        setTasks(payload.tasks)
      }
      if (payload.timesheetLines.length > 0) {
        setTimesheetLines(payload.timesheetLines)
      }
      if (payload.invoices.length > 0) {
        setInvoices(payload.invoices)
      }
      if (payload.auditLogs.length > 0) {
        setAuditLogs(payload.auditLogs)
      }
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

  const [timer, setTimer] = useState<ActiveTimerState>({
    isRunning: true,
    lifecycle: 'running',
    projectId: 'proj-settle',
    taskId: 'tsk-104',
    workMode: 'thinking',
    startedAt: '11:00',
    elapsedMinutes: 45,
    isOfflineQueueActive: false,
    queuedOfflineBatches: [],
    sessionNote: 'Reviewing pgTAP negative RLS test matrix for multi-tenant isolation.',
  })

  const activeTenant =
    tenants.find((t) => t.id === activeTenantId) ?? tenants[0]

  const tenantMembers = members.filter((m) => m.tenantId === activeTenant.id)
  const activeUser =
    tenantMembers.find((m) => m.id === activeUserId) ??
    tenantMembers[0] ??
    members[0]

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

  function setActiveTenantId(id: string) {
    setActiveTenantIdState(id)
    const firstMember = members.find((m) => m.tenantId === id)
    if (firstMember) {
      setActiveUserId(firstMember.id)
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
  }

  function inviteMember(name: string, email: string, role: UserRole) {
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
  ) {
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
        const createdProject = res.project
        if (res.ok && createdProject) {
          setProjects((prev) =>
            prev.map((p) => (p.id === newProj.id ? createdProject : p))
          )
        }
      })
    }
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
        const createdTask = res.task
        if (res.ok && createdTask) {
          setTasks((prev) =>
            prev.map((t) => (t.id === newTask.id ? createdTask : t))
          )
        }
      })
    }
  }

  function updateTaskStatus(taskId: string, status: TaskRecord['status']) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status } : t))
    )
    if (prismaStatus.connected) {
      void updateTaskStatusViaPrisma({ taskId, status })
    }
  }

  function updateContractPolicy(next: ContractBillingPolicy) {
    setContractPolicy(next)
    appendAudit(
      'CONTRACT_POLICY_UPDATED',
      `contracts:${next.id}`,
      `Updated rounding (${next.roundingRule}) and effective-dated rate cards`
    )
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
    setTimer((prev) => ({
      ...prev,
      lifecycle: nextState,
      isRunning: nextState === 'running',
      sessionNote: note ?? prev.sessionNote,
    }))
  }

  function toggleOfflineMode() {
    setTimer((prev) => {
      const nextOffline = !prev.isOfflineQueueActive
      return {
        ...prev,
        isOfflineQueueActive: nextOffline,
        queuedOfflineBatches: nextOffline
          ? [`offline-batch-${Date.now()}`]
          : [],
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
    workDate: string
  ): { ok: boolean; message: string } {
    if (!activeUser.consentedPolicyVersion) {
      return {
        ok: false,
        message: 'Cannot record session: Active tracking policy consent required (F1-030).',
      }
    }

    // F1-029 & Acceptance Scenario 3: Prevent overlapping billable time by same user
    if (hasTimeOverlap(workDate, startTime, endTime)) {
      return {
        ok: false,
        message: `Overlap Prevention Guard (F1-029): You already have a recorded segment overlapping ${startTime}–${endTime} on ${workDate}. The same real-time minute cannot be billed twice.`,
      }
    }

    const task = tasks.find((t) => t.id === timer.taskId) ?? tasks[0]
    const rate = resolveEffectiveRate(workDate, contractPolicy.rateVersions)
    const isDeepWork =
      timer.workMode === 'thinking' ||
      timer.workMode === 'design' ||
      timer.workMode === 'research' ||
      timer.workMode === 'meeting'

    const newLine: TimesheetLineItem = {
      id: `tsl-${Date.now()}`,
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
      claimedMinutes: durationMinutes,
      observedMinutes: isDeepWork ? 0 : durationMinutes,
      supportedMinutes: durationMinutes,
      approvedBillableMinutes: 0,
      evidenceStatus: isDeepWork ? 'context_added' : 'observed',
      snapshotHourlyRate: rate.hourlyRate,
      rateLabel: rate.label,
      developerNote:
        timer.sessionNote ||
        `Completed ${durationMinutes}m ${timer.workMode} session on ${task.code}.`,
      disputeMessages: [],
      isLocked: false,
    }

    setTimesheetLines((prev) => [newLine, ...prev])
    appendAudit(
      'WORK_SESSION_RECORDED',
      `timesheet_lines:${newLine.id}`,
      `Recorded ${durationMinutes}m (${startTime}–${endTime}) in mode "${timer.workMode}" at historical rate $${rate.hourlyRate}/hr`
    )

    return {
      ok: true,
      message: `Session recorded (${durationMinutes}m in ${timer.workMode} mode at $${rate.hourlyRate}/hr).`,
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
        message:
          'Manual Time Entry (F1-028) requires an explicit audit reason of at least 10 characters.',
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

    return {
      ok: true,
      message: 'Manual time entry recorded with provenance "manual_entry" and routed for manager review.',
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
    appendAudit(
      'DEVELOPER_CLARIFICATION_PROVIDED',
      `timesheet_lines:${lineId}`,
      explanation
    )
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
    if (!target) {
      return { ok: false, message: 'Timesheet line not found.' }
    }
    if (target.isLocked) {
      return {
        ok: false,
        message:
          'Approval Locking Guard (F1-047): Closed billing period lines are immutable. Issue a credit/adjustment entry instead.',
      }
    }

    setTimesheetLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line
        const rawApproved =
          decision === 'approve'
            ? line.claimedMinutes
            : decision === 'adjust_with_reason'
              ? (adjustedMinutes ?? line.claimedMinutes)
              : 0

        const roundedApproved = applyTimeRounding(
          rawApproved,
          activeTenant.roundingRule
        )

        const nextStatus: EvidenceStatus =
          decision === 'approve' || decision === 'adjust_with_reason'
            ? 'approved'
            : decision === 'ask_clarification'
              ? 'needs_clarification'
              : 'disputed'

        return {
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
      })
    )

    appendAudit(
      `MANAGER_REVIEW_${decision.toUpperCase()}`,
      `timesheet_lines:${lineId}`,
      reason
    )
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
      return {
        ok: false,
        message: 'No approved timesheet lines found for this project.',
      }
    }

    const invoiceLines = eligibleLines.map((l) => {
      const amount =
        Math.round(((l.approvedBillableMinutes / 60) * l.snapshotHourlyRate) * 100) /
        100
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

    const subtotal =
      Math.round(invoiceLines.reduce((s, i) => s + i.amount, 0) * 100) / 100
    const taxAmount = Math.round(subtotal * (taxPercent / 100) * 100) / 100
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100
    const totalApprovedMinutes = invoiceLines.reduce(
      (s, i) => s + i.approvedMinutes,
      0
    )

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

    const lineIds = new Set(targetInv.lines.map((l) => l.lineId))
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'finalized_locked' } : inv
      )
    )
    setTimesheetLines((prev) =>
      prev.map((l) => (lineIds.has(l.id) ? { ...l, isLocked: true } : l))
    )
    appendAudit(
      'INVOICE_FINALIZED_AND_PERIOD_LOCKED',
      `invoice_drafts:${targetInv.invoiceNumber}`,
      `Locked invoice ${targetInv.invoiceNumber} and associated timesheet lines (F1-047)`
    )
  }

  return (
    <Phase1StoreContext.Provider
      value={{
        tenants,
        activeTenant,
        setActiveTenantId,
        updateTenantSettings,
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
        contractPolicy,
        updateContractPolicy,
        timer,
        setTimerTaskAndMode,
        transitionTimer,
        toggleOfflineMode,
        completeAndRecordSession,
        addManualTimeEntry,
        timesheetLines: timesheetLines.filter((l) => l.tenantId === activeTenant.id),
        respondToClarification,
        openDisputeOnLine,
        reviewTimesheetLine,
        invoices: invoices.filter((i) => i.tenantId === activeTenant.id),
        generateInvoiceFromApproved,
        lockInvoice,
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
