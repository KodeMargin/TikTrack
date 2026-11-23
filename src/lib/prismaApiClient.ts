/**
 * DevProof (TikTrack) - Browser-to-Prisma API Client
 *
 * Communicates with the Vite server Prisma middleware (`/api/prisma/*`) so the
 * React frontend persists Phase 1 data through Prisma ORM without exposing DATABASE_URL.
 */

import type {
  AiGenerationRecord,
  ApiKeyRecord,
  BillingProvider,
  CalendarMeetingEventRecord,
  ContractBillingPolicy,
  DisputeRecord,
  EcosystemConnectorCategory,
  EcosystemConnectorProvider,
  EcosystemConnectorRecord,
  EvidenceCorrelationEdgeRecord,
  OutboundWebhookDeliveryRecord,
  OutboundWebhookEndpointRecord,
  OutboundWebhookEventType,
  PortableWorkReportRecord,
  PublicApiScope,
  SaasPlanTier,
  SaasSubscriptionInvoiceRecord,
  SubscriptionAccountRecord,
  UsageRecordSnapshot,
  VerificationRuleSetRecord,
  WhiteLabelBrandingConfig,
  CustomRole,
  GranularPermissionDef,
  PermissionModule,
  PermissionModuleId,
} from '@/types/domain.types'
import type {
  AuditLogEntry,
  InvoiceDraftRecord,
  NotificationItem,
  ProjectMemberRecord,
  ProjectRecord,
  SprintRecord,
  TaskNoteRecord,
  TaskRecord,
  TenantWorkspace,
  TimesheetLineItem,
  WorkspaceMember,
} from '@/context/Phase1Store'
import type {
  ActivityRollupBucket,
  ConnectedIntegrationRecord,
  EnrolledDeviceRecord,
  IdeWorkspaceMappingRecord,
  LocalPrivacyAuditBatch,
  LocalPrivacyExclusionItem,
  Phase2EvidenceArtifact,
  SessionAnnotationItem,
  WebhookReceiptRecord,
} from '@/context/Phase2Store'

export interface PrismaPhase2BootstrapPayload {
  activityRollups: ActivityRollupBucket[]
  evidenceArtifacts: Phase2EvidenceArtifact[]
  sessionAnnotations: SessionAnnotationItem[]
  ideMappings: IdeWorkspaceMappingRecord[]
  integrations: ConnectedIntegrationRecord[]
  webhookReceipts: WebhookReceiptRecord[]
  devices: EnrolledDeviceRecord[]
  privacyExclusions: LocalPrivacyExclusionItem[]
  privacyAuditBatches: LocalPrivacyAuditBatch[]
}

export interface PrismaConnectionStatus {
  connected: boolean
  configured: boolean
  projectRef: string | null
  message: string
}

export interface PrismaPhase3BootstrapPayload {
  ruleSets: VerificationRuleSetRecord[]
  correlationEdges: EvidenceCorrelationEdgeRecord[]
  aiGenerations: AiGenerationRecord[]
  disputes: DisputeRecord[]
}

export interface PrismaPhase4BootstrapPayload {
  subscriptions: SubscriptionAccountRecord[]
  saasInvoices: SaasSubscriptionInvoiceRecord[]
  usageRecords: UsageRecordSnapshot[]
  apiKeys: ApiKeyRecord[]
  webhookEndpoints: OutboundWebhookEndpointRecord[]
  webhookDeliveries: OutboundWebhookDeliveryRecord[]
  connectors: EcosystemConnectorRecord[]
  calendarMeetings: CalendarMeetingEventRecord[]
  portableReports: PortableWorkReportRecord[]
}

export interface PrismaRbacBootstrapPayload {
  seedStatus: {
    seeded: boolean
    firstTime: boolean
    checksum: string
    moduleCount: number
    permissionCount: number
    systemRoleCount: number
  }
  modules: PermissionModule[]
  permissions: GranularPermissionDef[]
  roles: CustomRole[]
  tenantOwnerPermissions: Record<string, string[]>
  memberGrantsByMembershipId: Record<string, string[]>
}

export interface PrismaBootstrapPayload {
  status: PrismaConnectionStatus
  tenants: TenantWorkspace[]
  members: WorkspaceMember[]
  projects: ProjectRecord[]
  sprints?: SprintRecord[]
  tasks: TaskRecord[]
  timesheetLines: TimesheetLineItem[]
  contracts?: ContractBillingPolicy[]
  invoices: InvoiceDraftRecord[]
  notifications: NotificationItem[]
  auditLogs: AuditLogEntry[]
  phase2?: PrismaPhase2BootstrapPayload
  phase3?: PrismaPhase3BootstrapPayload
  phase4?: PrismaPhase4BootstrapPayload
  rbac?: PrismaRbacBootstrapPayload
}

async function postJson<T>(url: string, body: unknown, method = 'POST'): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchPrismaBootstrap(): Promise<PrismaBootstrapPayload | null> {
  try {
    const res = await fetch('/api/prisma/bootstrap')
    if (!res.ok) return null
    return (await res.json()) as PrismaBootstrapPayload
  } catch {
    return null
  }
}

export const createTenantViaPrisma = (input: {
  name: string
  slug: string
  timezone: string
  currency: string
  ownerName: string
  ownerEmail: string
  skipOwnerInvite?: boolean
}) => postJson<{ ok: boolean; tenantId?: string; ownerId?: string; slug?: string }>('/api/prisma/tenants', input)

export const updateTenantSettingsViaPrisma = (input: {
  tenantId: string
  roundingRule?: string
  paidBreakMinutesPerDay?: number
  weeklyCapMinutes?: number
}) => postJson<{ ok: boolean }>('/api/prisma/tenant/settings', input, 'PATCH')

export const inviteMemberViaPrisma = (input: {
  tenantId: string
  name: string
  email: string
  role: string
  temporaryPassword?: string
  customPermissions?: string[]
}) =>
  postJson<{
    ok: boolean
    userId?: string
    temporaryPassword?: string
    emailSent?: boolean
    emailMessage?: string
    error?: string
  }>('/api/prisma/members', input)

export const resendMemberInviteViaPrisma = (input: {
  tenantId: string
  userId: string
  temporaryPassword?: string
}) =>
  postJson<{
    ok: boolean
    emailSent?: boolean
    temporaryPassword?: string
    message?: string
    error?: string
  }>('/api/prisma/members/resend-invite', input)

export const updateMemberStatusViaPrisma = (input: {
  tenantId: string
  userId: string
  status: string
}) => postJson<{ ok: boolean }>('/api/prisma/members/status', input, 'PATCH')

export const deleteMemberViaPrisma = (input: {
  tenantId: string
  userId: string
}) =>
  postJson<{
    ok: boolean
    message?: string
    error?: string
  }>('/api/prisma/members', input, 'DELETE')

export const createProjectViaPrisma = (input: {
  tenantId: string
  code: string
  name: string
  clientName: string
  description: string
  actorUserId?: string
}) =>
  postJson<{ ok: boolean; project?: ProjectRecord; error?: string }>(
    '/api/prisma/projects',
    input
  )

export const updateProjectViaPrisma = (input: {
  projectId: string
  tenantId?: string
  actorUserId?: string
  code?: string
  name?: string
  clientName?: string
  description?: string
  status?: ProjectRecord['status']
  boardConfig?: ProjectRecord['boardConfig']
}) =>
  postJson<{ ok: boolean; project?: ProjectRecord; error?: string }>(
    '/api/prisma/projects',
    input,
    'PATCH'
  )

export const deleteProjectViaPrisma = (input: {
  projectId: string
  tenantId?: string
  actorUserId?: string
}) =>
  postJson<{ ok: boolean; archivedOnly?: boolean; message?: string; error?: string }>(
    '/api/prisma/projects',
    input,
    'DELETE'
  )

export const upsertProjectMemberViaPrisma = (input: {
  tenantId: string
  projectId: string
  userId: string
  projectRole: string
}) =>
  postJson<{ ok: boolean; member?: ProjectMemberRecord; error?: string }>(
    '/api/prisma/projects/members',
    input,
    'POST'
  )

export const removeProjectMemberViaPrisma = (input: {
  tenantId: string
  projectId: string
  userId: string
}) =>
  postJson<{ ok: boolean }>(
    '/api/prisma/projects/members',
    input,
    'DELETE'
  )

export const createSprintViaPrisma = (input: {
  tenantId: string
  projectId: string
  name: string
  goal?: string
  status?: SprintRecord['status']
  startDate?: string | null
  endDate?: string | null
}) =>
  postJson<{ ok: boolean; sprint?: SprintRecord; error?: string }>(
    '/api/prisma/sprints',
    input,
    'POST'
  )

export const updateSprintViaPrisma = (input: {
  sprintId: string
  name?: string
  goal?: string
  status?: SprintRecord['status']
  startDate?: string | null
  endDate?: string | null
  moveIncompleteToSprintId?: string | null
}) =>
  postJson<{ ok: boolean; sprint?: SprintRecord; error?: string }>(
    '/api/prisma/sprints',
    input,
    'PATCH'
  )

export const deleteSprintViaPrisma = (input: { sprintId: string }) =>
  postJson<{ ok: boolean }>('/api/prisma/sprints', input, 'DELETE')

export const createTaskViaPrisma = (input: {
  tenantId: string
  projectId: string
  parentTaskId?: string
  sprintId?: string | null
  code: string
  title: string
  description?: string
  acceptanceCriteria: string
  issueType?: TaskRecord['issueType']
  status: TaskRecord['status']
  priority: TaskRecord['priority']
  labels?: string[]
  storyPoints?: number | null
  boardOrder?: number
  estimateMinutes: number
  isBillable: boolean
  defaultWorkMode: TaskRecord['defaultWorkMode']
  dueDate: string
  assignedMemberIds: string[]
}) =>
  postJson<{ ok: boolean; task?: TaskRecord; error?: string }>(
    '/api/prisma/tasks',
    input
  )

export const updateTaskViaPrisma = (input: {
  taskId: string
  title?: string
  description?: string
  acceptanceCriteria?: string
  issueType?: TaskRecord['issueType']
  status?: TaskRecord['status']
  priority?: TaskRecord['priority']
  labels?: string[]
  storyPoints?: number | null
  boardOrder?: number
  estimateMinutes?: number
  isBillable?: boolean
  defaultWorkMode?: TaskRecord['defaultWorkMode']
  dueDate?: string | null
  parentTaskId?: string | null
  sprintId?: string | null
}) =>
  postJson<{ ok: boolean; updatedAt?: string; error?: string }>(
    '/api/prisma/tasks/update',
    input,
    'PATCH'
  )

export const reorderTasksViaPrisma = (input: {
  items: {
    taskId: string
    status?: TaskRecord['status']
    boardOrder: number
    sprintId?: string | null
  }[]
}) => postJson<{ ok: boolean }>('/api/prisma/tasks/reorder', input, 'PATCH')

export const deleteTaskViaPrisma = (input: { taskId: string }) =>
  postJson<{ ok: boolean; error?: string }>('/api/prisma/tasks', input, 'DELETE')

export const addTaskNoteViaPrisma = (input: {
  tenantId: string
  projectId: string
  taskId: string
  authorId: string
  contentMarkdown: string
  attachmentPaths?: string[]
}) =>
  postJson<{ ok: boolean; note?: TaskNoteRecord; error?: string }>(
    '/api/prisma/tasks/notes',
    input,
    'POST'
  )

export const deleteTaskNoteViaPrisma = (input: { noteId: string }) =>
  postJson<{ ok: boolean }>('/api/prisma/tasks/notes', input, 'DELETE')

export const updateTaskStatusViaPrisma = (input: {
  taskId: string
  status: TaskRecord['status']
}) => postJson<{ ok: boolean; error?: string }>('/api/prisma/tasks/status', input, 'PATCH')

export const assignTaskMembersViaPrisma = (input: {
  tenantId: string
  projectId: string
  taskId: string
  assignedMemberIds: string[]
}) => postJson<{ ok: boolean }>('/api/prisma/tasks/assign', input, 'PATCH')

export const recordSessionViaPrisma = (input: {
  tenantId: string
  userId: string
  projectId: string
  taskId: string
  workDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  breakMinutes: number
  workMode: string
  provenance: 'desktop_timer' | 'web_timer' | 'manual_entry'
  developerNote: string
  manualReason?: string
  hourlyRate: number
}) =>
  postJson<{ ok: boolean; lineId?: string; timesheetId?: string; error?: string }>(
    '/api/prisma/sessions/record',
    input
  )

export const submitTimesheetViaPrisma = (input: {
  timesheetId: string
  summaryNote?: string
}) => postJson<{ ok: boolean }>('/api/prisma/timesheets/submit', input)

export const reviewTimesheetLineViaPrisma = (input: {
  tenantId: string
  timesheetId: string
  lineId: string
  reviewerUserId: string
  decision: 'approve' | 'ask_clarification' | 'adjust_with_reason' | 'reject'
  reason: string
  approvedMinutes: number
  lockLine: boolean
}) => postJson<{ ok: boolean }>('/api/prisma/timesheets/review', input)

export const lockInvoiceViaPrisma = (input: {
  invoiceId: string
  lineIds: string[]
}) => postJson<{ ok: boolean }>('/api/prisma/invoices/lock', input)

export const markNotificationReadViaPrisma = (input: { notificationId: string }) =>
  postJson<{ ok: boolean }>('/api/prisma/notifications/read', input, 'PATCH')

export const recordAuditViaPrisma = (input: {
  tenantId: string
  actorUserId?: string
  actionType: string
  targetEntity: string
  reason: string
}) => postJson<{ ok: boolean }>('/api/prisma/audit', input)

export const ingestWebhookViaPrisma = (input: {
  tenantId: string
  projectId: string
  taskId?: string | null
  provider: 'github' | 'gitlab' | 'jira' | 'linear'
  deliveryId: string
  eventType: string
  signatureVerified: boolean
  payloadSha256: string
  sourceType: string
  externalId: string
  summaryTitle: string
  metadata: Record<string, string | number | boolean>
  linkType: 'contemporaneous' | 'retrospective_outcome' | 'manual_attached'
  linkRationale: string
  actorUserId?: string | null
}) =>
  postJson<{
    ok: boolean
    deduplicated?: boolean
    deliveryAttemptCount?: number
    artifactId?: string
  }>('/api/prisma/phase2/webhook', input)

export const createSessionAnnotationViaPrisma = (input: {
  tenantId: string
  userId: string
  sessionId: string
  annotationType: string
  title: string
  contentMarkdown: string
  startMinuteOfDay?: number
  endMinuteOfDay?: number
}) => postJson<{ ok: boolean; annotationId?: string }>('/api/prisma/phase2/annotation', input)

export const addPrivacyExclusionViaPrisma = (input: {
  tenantId: string
  userId: string
  exclusionPattern: string
  exclusionType: string
  reason: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase2/exclusions', input)

export const removePrivacyExclusionViaPrisma = (input: { id: string }) =>
  postJson<{ ok: boolean }>('/api/prisma/phase2/exclusions', input, 'DELETE')

export const toggleDeviceRevocationViaPrisma = (input: {
  deviceId: string
  revoked: boolean
}) => postJson<{ ok: boolean }>('/api/prisma/phase2/devices/revoke', input, 'PATCH')

export const reconcileGapViaPrisma = (input: {
  rollupId: string
  choice: string
  note: string
}) => postJson<{ ok: boolean }>('/api/prisma/phase2/reconcile-gap', input, 'PATCH')

export const toggleTenantAiViaPrisma = (input: {
  tenantId: string
  aiEnabled: boolean
  actorUserId?: string
}) => postJson<{ ok: boolean }>('/api/prisma/phase3/tenant-ai', input, 'PATCH')

export const publishRuleSetViaPrisma = (input: {
  tenantId: string
  versionNumber: number
  versionLabel: string
  rulesConfig: Record<string, unknown>
  simulationSummary?: Record<string, unknown>
  createdBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase3/rule-sets', input)

export async function fetchGeminiStatusViaApi(): Promise<{
  configured: boolean
  model: string
}> {
  try {
    const res = await fetch('/api/prisma/phase3/ai-status')
    if (!res.ok) return { configured: false, model: 'gemini-2.5-flash' }
    return (await res.json()) as { configured: boolean; model: string }
  } catch {
    return { configured: false, model: 'gemini-2.5-flash' }
  }
}

export const generateGeminiDraftViaApi = (input: {
  targetType:
    | 'daily_summary'
    | 'reviewer_digest'
    | 'gap_explanation'
    | 'task_mapping'
    | 'debug_investigation'
    | 'pattern_cluster'
  targetLabel: string
  sanitizedPayload: Record<string, unknown>
  citedIds: string[]
}) =>
  postJson<{
    ok: boolean
    configured: boolean
    modelId: string
    draftMarkdown?: string
    tokensUsed?: number
    error?: string
  }>('/api/prisma/phase3/ai-draft-gemini', input)

export const createAiGenerationViaPrisma = (input: {
  tenantId: string
  userId?: string
  targetType: string
  targetId: string
  generationMode: 'ai_guardrailed' | 'deterministic_template'
  modelId: string
  promptVersion: string
  sanitizedPromptPayload: Record<string, unknown>
  citedEventIds: string[]
  citedArtifactIds: string[]
  draftMarkdown: string
  tokensUsed: number
}) => postJson<{ ok: boolean; id?: string; error?: string }>('/api/prisma/phase3/ai-generate', input)

export const decideAiGenerationViaPrisma = (input: {
  generationId: string
  status: 'edited_approved' | 'discarded'
  humanApprovedMarkdown?: string
  approvedByUserId?: string
}) => postJson<{ ok: boolean }>('/api/prisma/phase3/ai-decision', input, 'PATCH')

export const partialApproveTimesheetViaPrisma = (input: {
  tenantId: string
  timesheetId: string
  reviewerUserId: string
  uncontestedLineIds: string[]
  reason: string
}) => postJson<{ ok: boolean }>('/api/prisma/phase3/timesheets/partial-approve', input)

export const openDisputeViaPrisma = (input: {
  tenantId: string
  timesheetId: string
  timesheetLineId: string
  openedByUserId: string
  assignedReviewerId?: string
  dueDate?: string
  requestedEvidenceType?: string
  disputedMinutes: number
  reason: string
  messageType?: 'clarification_request' | 'developer_appeal'
  attachedArtifactIds?: string[]
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase3/disputes', input)

export const performDisputeActionViaPrisma = (input: {
  action: 'reply' | 'escalate' | 'resolve'
  tenantId: string
  disputeId: string
  actorUserId: string
  messageMarkdown?: string
  attachedArtifactIds?: string[]
  escalatedReviewerId?: string
  resolutionStatus?: 'resolved_accepted' | 'resolved_adjusted' | 'resolved_upheld'
  adjustedApprovedMinutes?: number
  resolutionSummary?: string
}) => postJson<{ ok: boolean; error?: string }>('/api/prisma/phase3/disputes/action', input)

export const checkoutSubscriptionViaPrisma = (input: {
  tenantId: string
  planTier: SaasPlanTier
  billingProvider: BillingProvider
  billingCycle: 'monthly' | 'annual'
  seatsBilled: number
  unitPriceCents: number
  subtotalCents: number
  totalCents: number
  currency: string
  invoiceNumber: string
  billingPeriodLabel: string
  actorUserId?: string
}) =>
  postJson<{ ok: boolean; subId?: string; invoiceId?: string }>(
    '/api/prisma/phase4/subscription/checkout',
    input
  )

export const updateBrandingViaPrisma = (input: {
  tenantId: string
  brandingConfig: WhiteLabelBrandingConfig
  actorUserId?: string
}) => postJson<{ ok: boolean }>('/api/prisma/phase4/branding', input, 'PATCH')

export const createApiKeyViaPrisma = (input: {
  tenantId: string
  name: string
  keyPrefix: string
  keyHashSha256: string
  scopes: PublicApiScope[]
  rateLimitPerMin: number
  createdBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase4/api-keys', input)

export const revokeApiKeyViaPrisma = (input: { tenantId: string; keyId: string }) =>
  postJson<{ ok: boolean }>('/api/prisma/phase4/api-keys/revoke', input)

export const createWebhookEndpointViaPrisma = (input: {
  tenantId: string
  name: string
  targetUrl: string
  signingSecretPrefix: string
  signingSecretHash: string
  subscribedEvents: OutboundWebhookEventType[]
  createdBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase4/webhooks', input)

export const dispatchWebhookDeliveryViaPrisma = (input: {
  tenantId: string
  endpointId: string
  eventType: OutboundWebhookEventType
  eventId: string
  payload: Record<string, unknown>
  signatureHeader: string
  responseSnippet: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase4/webhooks/deliver', input)

export const upsertConnectorViaPrisma = (input: {
  tenantId: string
  category: EcosystemConnectorCategory
  provider: EcosystemConnectorProvider
  displayName: string
  status: 'connected' | 'paused' | 'disconnected'
  syncConfig: Record<string, string | number | boolean>
  connectedBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase4/connectors', input)

export const syncCalendarMeetingViaPrisma = (input: {
  tenantId: string
  userId: string
  projectId?: string
  taskId?: string
  connectorId?: string
  externalEventId: string
  meetingTitleSanitized: string
  startedAtUtc: string
  endedAtUtc: string
  durationMinutes: number
  syncPermissionScope: 'metadata_only' | 'title_and_duration'
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase4/calendar-sync', input)

export const createPortableReportViaPrisma = (input: {
  tenantId: string
  developerUserId: string
  reportTitle: string
  periodStart: string
  periodEnd: string
  totalApprovedMinutes: number
  totalSupportedMinutes: number
  deliverablesCount: number
  payloadDigestSha256: string
  signatureHmacSha256: string
  reportPayload: Record<string, unknown>
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase4/portable-reports', input)

// -----------------------------------------------------------------------------
// Granular RBAC (Permissions Seed, Custom Roles, Member Grants & Owner Policy)
// -----------------------------------------------------------------------------

export const runPermissionsSeedViaPrisma = () =>
  postJson<{
    ok: boolean
    seeded: boolean
    firstTime: boolean
    checksum: string
    moduleCount: number
    permissionCount: number
    systemRoleCount: number
  }>('/api/prisma/rbac/seed', {})

export const createCustomRoleViaPrisma = (input: {
  tenantId: string
  name: string
  code: string
  description: string
  permissions: string[]
  createdBy?: string
}) =>
  postJson<{ ok: boolean; role?: CustomRole; error?: string }>(
    '/api/prisma/rbac/roles',
    input,
    'POST'
  )

export const updateCustomRoleViaPrisma = (input: {
  roleId: string
  tenantId: string
  name?: string
  description?: string
  permissions?: string[]
}) =>
  postJson<{ ok: boolean; error?: string }>(
    '/api/prisma/rbac/roles',
    input,
    'PATCH'
  )

export const deleteCustomRoleViaPrisma = (input: {
  roleId: string
  tenantId: string
}) =>
  postJson<{ ok: boolean; error?: string }>(
    '/api/prisma/rbac/roles',
    input,
    'DELETE'
  )

export const updateMemberRoleViaPrisma = (input: {
  tenantId: string
  userId: string
  role: string
  customPermissions?: string[]
  grantedBy?: string
}) =>
  postJson<{ ok: boolean; error?: string }>(
    '/api/prisma/rbac/member-role',
    input,
    'PATCH'
  )

export const updateTenantOwnerPermissionsViaPrisma = (input: {
  tenantId: string
  permissions: string[]
  updatedBy?: string
}) =>
  postJson<{ ok: boolean; error?: string }>(
    '/api/prisma/rbac/tenant-owner-permissions',
    input,
    'PUT'
  )

export const registerPermissionViaPrisma = (input: {
  key: string
  module: PermissionModuleId
  label: string
  description: string
  isSuperAdminOnly?: boolean
}) =>
  postJson<{ ok: boolean; permission?: GranularPermissionDef; error?: string }>(
    '/api/prisma/rbac/permissions',
    input,
    'POST'
  )

// -----------------------------------------------------------------------------
// Real External Integrations (Git, PM, Chat, Live Webhooks, Calendar OAuth, Public REST API)
// -----------------------------------------------------------------------------

export interface RealExternalTaskItem {
  id: string
  provider: string
  externalKey: string
  title: string
  status: string
  estimateMinutes: number
  priority: 'low' | 'medium' | 'high' | 'urgent'
  url?: string
  projectOrRepo?: string
}

export interface RealCalendarEventItem {
  id: string
  title: string
  startedAtUtc: string
  endedAtUtc: string
  durationMinutes: number
}

export async function connectRealIntegrationViaPrisma(input: {
  tenantId: string
  provider: string
  credentials: Record<string, string>
  connectedBy?: string
}): Promise<{ ok: boolean; connector?: EcosystemConnectorRecord; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/prisma/integrations/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as {
      ok: boolean
      connector?: EcosystemConnectorRecord
      message?: string
      error?: string
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function disconnectRealIntegrationViaPrisma(input: {
  tenantId: string
  provider: string
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/prisma/integrations/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; message?: string; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function fetchRealIntegrationItemsViaPrisma(input: {
  tenantId: string
  provider: string
}): Promise<{ ok: boolean; items: RealExternalTaskItem[]; error?: string }> {
  try {
    const res = await fetch('/api/prisma/integrations/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; items: RealExternalTaskItem[]; error?: string }
  } catch (err) {
    return { ok: false, items: [], error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function sendChatTestAlertViaPrisma(input: {
  tenantId: string
  provider: 'slack' | 'discord' | 'ms_teams'
  message?: string
}): Promise<{ ok: boolean; httpStatus?: number; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/prisma/integrations/chat-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as {
      ok: boolean
      httpStatus?: number
      message?: string
      error?: string
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function dispatchRealOutboundWebhookViaPrisma(input: {
  tenantId: string
  endpointId: string
  eventType: string
  eventId?: string
  payload: Record<string, unknown>
  signingSecret?: string
}): Promise<{
  ok: boolean
  id?: string
  httpStatus?: number
  deliveryStatus?: 'delivered' | 'failed'
  signatureHeader?: string
  responseSnippet?: string
  message?: string
  error?: string
}> {
  try {
    const res = await fetch('/api/prisma/integrations/webhook-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as {
      ok: boolean
      id?: string
      httpStatus?: number
      deliveryStatus?: 'delivered' | 'failed'
      signatureHeader?: string
      responseSnippet?: string
      message?: string
      error?: string
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function fetchCalendarOAuthStatusViaPrisma(): Promise<{
  googleConfigured: boolean
  microsoftConfigured: boolean
}> {
  try {
    const res = await fetch('/api/prisma/integrations/oauth-status')
    if (!res.ok) return { googleConfigured: false, microsoftConfigured: false }
    return (await res.json()) as { googleConfigured: boolean; microsoftConfigured: boolean }
  } catch {
    return { googleConfigured: false, microsoftConfigured: false }
  }
}

export async function fetchRealCalendarEventsViaPrisma(input: {
  tenantId: string
  provider: 'google_calendar' | 'outlook_calendar'
}): Promise<{ ok: boolean; events: RealCalendarEventItem[]; error?: string }> {
  try {
    const res = await fetch('/api/prisma/integrations/calendar-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; events: RealCalendarEventItem[]; error?: string }
  } catch (err) {
    return { ok: false, events: [], error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function callRealPublicApiV1(input: {
  bearerKey: string
  resource: 'projects' | 'tasks' | 'timesheets' | 'invoices'
}): Promise<{ statusCode: number; ok: boolean; payload: unknown }> {
  try {
    const res = await fetch(`/api/prisma/v1/${input.resource}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.bearerKey.trim()}`,
      },
    })
    const payload = await res.json().catch(() => ({ ok: false, error: 'Invalid JSON response' }))
    return { statusCode: res.status, ok: res.ok, payload }
  } catch (err) {
    return {
      statusCode: 0,
      ok: false,
      payload: { ok: false, error: err instanceof Error ? err.message : 'Network error' },
    }
  }
}

// =============================================================================
// Reporting & Analytics API Client
// =============================================================================

export interface PlatformTenantReportRowClient {
  tenantId: string
  tenantName: string
  tenantSlug: string
  status: string
  planTier: string
  currency: string
  timezone: string
  createdAt: string
  subscriptionStatus: string
  billingCycle: string
  billingProvider: string
  activeSeats: number
  maxSeats: number
  seatUtilizationPct: number
  estimatedMrrUsd: number
  saasInvoicesCount: number
  saasPaidTotalUsd: number
  saasOpenTotalUsd: number
  activeProjects: number
  maxActiveProjects: number
  monthlyEventsUsed: number
  monthlyEventQuota: number
  aiTokensUsed: number
  monthlyAiTokenQuota: number
  storageMbUsed: number
  storageQuotaMb: number
  elapsedHours: number
  claimedHours: number
  observedHours: number
  supportedHours: number
  approvedBillableHours: number
  approvalRatePct: number
  approvedBillableValue: number
  openDisputesCount: number
  totalDisputesCount: number
  evidenceArtifactsCount: number
  activeDevicesCount: number
  clockAnomalyDevicesCount: number
  policyConsentPct: number
}

export interface SavedReportClientItem {
  id: string
  tenantId: string
  createdBy: string | null
  name: string
  description: string
  reportType: string
  visibility: string
  configJson: Record<string, unknown>
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export async function fetchPlatformReportsViaPrisma(input: {
  actorRole: string
}): Promise<{ ok: boolean; generatedAtUtc?: string; tenants: PlatformTenantReportRowClient[]; error?: string }> {
  try {
    const res = await fetch('/api/prisma/reports/platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as {
      ok: boolean
      generatedAtUtc?: string
      tenants: PlatformTenantReportRowClient[]
      error?: string
    }
  } catch (err) {
    return { ok: false, tenants: [], error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function listSavedReportsViaPrisma(input: {
  tenantId: string
  actorRole: string
  actorTenantId?: string
}): Promise<{ ok: boolean; reports: SavedReportClientItem[]; error?: string }> {
  try {
    const res = await fetch('/api/prisma/reports/saved/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; reports: SavedReportClientItem[]; error?: string }
  } catch (err) {
    return { ok: false, reports: [], error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function createSavedReportViaPrisma(input: {
  tenantId: string
  actorRole: string
  actorTenantId?: string
  createdBy?: string | null
  name: string
  description?: string
  reportType: string
  visibility?: string
  configJson: Record<string, unknown>
  isPinned?: boolean
}): Promise<{ ok: boolean; report?: SavedReportClientItem; error?: string }> {
  try {
    const res = await fetch('/api/prisma/reports/saved/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; report?: SavedReportClientItem; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function deleteSavedReportViaPrisma(input: {
  id: string
  tenantId: string
  actorRole: string
  actorTenantId?: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/prisma/reports/saved', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function generateReportAiBriefViaPrisma(input: {
  reportTitle: string
  scopeLabel: string
  dateRangeLabel: string
  kpis: Array<{ label: string; value: string; delta?: string }>
  highlights: Record<string, unknown>
}): Promise<{
  ok: boolean
  modelId?: string
  mode?: string
  briefMarkdown?: string
  tokensUsed?: number
  error?: string
}> {
  try {
    const res = await fetch('/api/prisma/reports/ai-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as {
      ok: boolean
      modelId?: string
      mode?: string
      briefMarkdown?: string
      tokensUsed?: number
      error?: string
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
