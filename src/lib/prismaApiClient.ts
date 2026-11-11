/**
 * DevProof (TikTrack) — Browser-to-Prisma API Client
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
} from '@/types/domain.types'
import type {
  AuditLogEntry,
  InvoiceDraftRecord,
  NotificationItem,
  ProjectRecord,
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

export interface PrismaBootstrapPayload {
  status: PrismaConnectionStatus
  tenants: TenantWorkspace[]
  members: WorkspaceMember[]
  projects: ProjectRecord[]
  tasks: TaskRecord[]
  timesheetLines: TimesheetLineItem[]
  contracts?: ContractBillingPolicy[]
  invoices: InvoiceDraftRecord[]
  notifications: NotificationItem[]
  auditLogs: AuditLogEntry[]
  phase2?: PrismaPhase2BootstrapPayload
  phase3?: PrismaPhase3BootstrapPayload
  phase4?: PrismaPhase4BootstrapPayload
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
}) => postJson<{ ok: boolean; tenantId?: string; ownerId?: string }>('/api/prisma/tenants', input)

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
}) => postJson<{ ok: boolean; userId?: string }>('/api/prisma/members', input)

export const updateMemberStatusViaPrisma = (input: {
  tenantId: string
  userId: string
  status: string
}) => postJson<{ ok: boolean }>('/api/prisma/members/status', input, 'PATCH')

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

export const createTaskViaPrisma = (input: {
  tenantId: string
  projectId: string
  parentTaskId?: string
  code: string
  title: string
  acceptanceCriteria: string
  status: TaskRecord['status']
  priority: TaskRecord['priority']
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
