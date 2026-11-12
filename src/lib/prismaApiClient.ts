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
  SsoProviderRecord,
  SsoProviderType,
  ScimProvisioningEventRecord,
  PolicyChangeRequestRecord,
  SensitiveAccessLogRecord,
  LegalHoldRecord,
  RetentionPolicyRecord,
  RetentionJobRecord,
  PrivacyRequestRecord,
  TenantResidencyConfigRecord,
  ResidencyRegion,
  FailoverRegion,
  IsolationTier,
  SiemDestinationRecord,
  SiemExportBatchRecord,
  SiemProvider,
  SiemFormat,
  FleetReleaseRecord,
  FleetPlatform,
  FleetChannel,
  AnalyticsWarehouseExportRecord,
  WarehouseSink,
  DrExerciseRecord,
  SecurityAssessmentRecord,
  TenantAccessibilityConfigRecord,
  SupportedLocale,
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

export interface PrismaPhase5BootstrapPayload {
  ssoProviders: SsoProviderRecord[]
  scimEvents: ScimProvisioningEventRecord[]
  policyChangeRequests: PolicyChangeRequestRecord[]
  sensitiveAccessLogs: SensitiveAccessLogRecord[]
  legalHolds: LegalHoldRecord[]
  retentionPolicies: RetentionPolicyRecord[]
  retentionJobs: RetentionJobRecord[]
  privacyRequests: PrivacyRequestRecord[]
  residencyConfigs: TenantResidencyConfigRecord[]
  siemDestinations: SiemDestinationRecord[]
  siemBatches: SiemExportBatchRecord[]
  fleetReleases: FleetReleaseRecord[]
  warehouseExports: AnalyticsWarehouseExportRecord[]
  drExercises: DrExerciseRecord[]
  securityAssessments: SecurityAssessmentRecord[]
  accessibilityConfigs: TenantAccessibilityConfigRecord[]
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
  phase5?: PrismaPhase5BootstrapPayload
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
  temporaryPassword?: string
}) =>
  postJson<{
    ok: boolean
    userId?: string
    emailSent?: boolean
    emailMessage?: string
    error?: string
  }>('/api/prisma/members', input)

export const resendMemberInviteViaPrisma = (input: {
  tenantId: string
  userId: string
}) =>
  postJson<{
    ok: boolean
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


export const upsertSsoProviderViaPrisma = (input: {
  tenantId: string
  providerType: SsoProviderType
  displayName: string
  domain: string
  entityIdOrIssuer: string
  ssoUrl: string
  certificateFingerprint?: string
  clientId?: string
  enforceSso: boolean
  jitDefaultRole: string
  scimEnabled: boolean
  scimTokenPrefix?: string
  scimTokenHashSha256?: string
  createdBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/sso', input)

export const recordScimEventViaPrisma = (input: {
  tenantId: string
  providerId?: string
  action: 'user_create' | 'user_update' | 'user_deactivate' | 'group_sync'
  externalUserId: string
  email: string
  targetRole: string
  correlationId: string
  detailMessage?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/scim', input)

export const proposePolicyChangeViaPrisma = (input: {
  tenantId: string
  proposedVersionCode: string
  changeSummary: string
  scopeDiff: Record<string, boolean | string | number>
  expandsCollectionScope: boolean
  proposedBy: string
  effectiveFrom: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/policy-changes', input)

export const decidePolicyChangeSecondViaPrisma = (input: {
  tenantId: string
  requestId: string
  secondApproverId: string
  decision: 'approve' | 'reject'
  rejectionReason?: string
}) =>
  postJson<{ ok: boolean; activatedPolicyVersionId?: string; error?: string }>(
    '/api/prisma/phase5/policy-changes/decide',
    input
  )

export const createLegalHoldViaPrisma = (input: {
  tenantId: string
  scopeType: 'timesheet' | 'dispute' | 'project' | 'user' | 'tenant'
  targetId: string
  reason: string
  placedBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/legal-holds', input)

export const releaseLegalHoldViaPrisma = (input: {
  tenantId: string
  holdId: string
  releasedBy?: string
}) => postJson<{ ok: boolean }>('/api/prisma/phase5/legal-holds/release', input)

export const upsertRetentionPolicyViaPrisma = (input: {
  tenantId: string
  name: string
  rawActivityDays: number
  rollupDays: number
  evidenceArtifactDays: number
  auditLogDays: number
  archiveStorageTier: 'supabase_cold' | 'cold_s3' | 'gcs_archive'
  createdBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/retention-policies', input)

export const recordRetentionJobViaPrisma = (input: {
  tenantId: string
  policyId?: string
  jobType: 'purge_raw_events' | 'archive_rollups' | 'dsar_export' | 'dsar_erasure'
  status: 'completed' | 'partial_legal_hold'
  scannedCount: number
  purgedCount: number
  skippedLegalHoldCount: number
  archivedBundleUri?: string
  executedBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/retention-jobs', input)

export const createPrivacyRequestViaPrisma = (input: {
  tenantId: string
  requesterUserId: string
  requestType: 'export' | 'correction' | 'erasure'
  status: 'pending' | 'completed' | 'blocked_legal_hold'
  legalHoldBlocked: boolean
  exportDigestSha256?: string
  resolutionNote?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/privacy-requests', input)

export const upsertResidencyConfigViaPrisma = (input: {
  tenantId: string
  primaryRegion: ResidencyRegion
  failoverRegion: FailoverRegion
  dataResidencyLocked: boolean
  isolationTier: IsolationTier
  encryptionKeyMode: 'platform_kms' | 'byok_kms'
  kmsKeyArnMasked?: string
  dedicatedWorkerPool: boolean
  egressAllowlistCidrs: string[]
  updatedBy?: string
}) => postJson<{ ok: boolean }>('/api/prisma/phase5/residency', input, 'PATCH')

export const createSiemDestinationViaPrisma = (input: {
  tenantId: string
  name: string
  provider: SiemProvider
  endpointUrl: string
  authHeaderPrefix: string
  authTokenHashSha256: string
  format: SiemFormat
  includeCategories: string[]
  createdBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/siem', input)

export const recordSiemBatchViaPrisma = (input: {
  tenantId: string
  destinationId: string
  eventCount: number
  payloadFormat: SiemFormat
  payloadDigestSha256: string
  sanitizedPreview: Record<string, unknown>
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/siem/export', input)

export const publishFleetReleaseViaPrisma = (input: {
  tenantId: string
  version: string
  platform: FleetPlatform
  channel: FleetChannel
  installerSha256: string
  codeSigningThumbprint: string
  notarizationStatus: 'notarized' | 'signed' | 'pending'
  minOsVersion: string
  rolloutPercentage: number
  releaseNotes: string
  publishedBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/fleet-releases', input)

export const createWarehouseExportViaPrisma = (input: {
  tenantId: string
  targetSink: WarehouseSink
  periodStart: string
  periodEnd: string
  rowCount: number
  compressedBytes: number
  objectPathUri: string
  checksumSha256: string
  triggeredBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/warehouse-exports', input)

export const recordDrExerciseViaPrisma = (input: {
  tenantId: string
  exerciseType:
    | 'backup_restore_drill'
    | 'region_failover_tabletop'
    | 'load_test_1000_devs'
    | 'pen_test_remediation'
  targetRpoMinutes: number
  measuredRpoMinutes: number
  targetRtoMinutes: number
  measuredRtoMinutes: number
  p95CrudMs: number
  simulatedConcurrentDevs: number
  passed: boolean
  findingsSummary: string
  conductedBy?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/dr-exercises', input)

export const upsertSecurityAssessmentViaPrisma = (input: {
  tenantId: string
  assessmentName: string
  assessorFirm: string
  assessmentType: 'penetration_test' | 'rls_isolation_audit' | 'sdlc_review' | 'soc2_readiness'
  status: 'scheduled' | 'in_progress' | 'remediating' | 'signed_off'
  criticalFindings: number
  highFindings: number
  remediatedFindings: number
  reportSha256?: string
}) => postJson<{ ok: boolean; id?: string }>('/api/prisma/phase5/security-assessments', input)

export const updateAccessibilityConfigViaPrisma = (input: {
  tenantId: string
  defaultLocale: SupportedLocale
  highContrastMode: boolean
  keyboardShortcutsEnabled: boolean
  wcagTargetLevel: 'AA' | 'AAA'
}) => postJson<{ ok: boolean }>('/api/prisma/phase5/accessibility', input, 'PATCH')
