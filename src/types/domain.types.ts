/**
 * DevProof (TikTrack) — Canonical Domain Types (Phase 0 Baseline)
 *
 * Governing Principle:
 * Explicitly separate recorded elapsed time, observed digital activity,
 * claimed work context, supporting evidence, and approved billable hours.
 */

export type UserRole =
  | 'super_admin'
  | 'tenant_owner'
  | 'project_manager'
  | 'developer'
  | 'finance'
  | 'client_reviewer'
  | 'auditor'

export type WorkMode =
  | 'coding'
  | 'debugging'
  | 'thinking'
  | 'research'
  | 'testing'
  | 'review'
  | 'meeting'
  | 'design'

export type SessionProvenance =
  | 'desktop_timer'
  | 'web_timer'
  | 'manual_entry'
  | 'superseded_duplicate'

export type SessionLifecycleState =
  | 'running'
  | 'paused'
  | 'on_break'
  | 'completed'
  | 'abandoned_recovered'

/**
 * Section 6.4: Evidence Statuses and Precise Interpretation
 * Never includes "fraud", "unproductive", or "cheating".
 */
export type EvidenceStatus =
  | 'declared'
  | 'observed'
  | 'context_added'
  | 'corroborated'
  | 'needs_clarification'
  | 'approved'
  | 'disputed'

export type AppCategory =
  | 'ide'
  | 'docs_browser'
  | 'terminal'
  | 'communication'
  | 'design'
  | 'other'
  | 'unobserved'
  | 'excluded_private'

export type EvidenceSourceType =
  | 'desktop'
  | 'vscode'
  | 'github'
  | 'manual'

export type EvidenceArtifactType =
  | 'github_commit'
  | 'github_pr'
  | 'github_review'
  | 'github_ci'
  | 'vscode_debug'
  | 'vscode_test'
  | 'vscode_workspace'
  | 'session_note'
  | 'design_doc'

export type ArtifactLinkType =
  | 'contemporaneous'
  | 'retrospective_outcome'
  | 'manual_attached'

export type RoundingRule =
  | 'none'
  | 'nearest_5m'
  | 'nearest_6m'
  | 'nearest_15m'

export type VerificationRuleCode =
  | 'R-01'
  | 'R-02'
  | 'R-03'
  | 'R-04'
  | 'R-05'
  | 'R-06'
  | 'R-07'
  | 'R-08'

/**
 * F1-041: Five Separate Time Concepts
 */
export interface FiveTimeMetrics {
  /** Raw wall-clock/monotonic duration minus unpaid breaks */
  elapsedMinutes: number
  /** Developer-submitted billable claim */
  claimedMinutes: number
  /** Duration with observed IDE/desktop tool metadata */
  observedMinutes: number
  /** Duration backed by observed signals OR declared deep-work/notes/artifacts */
  supportedMinutes: number
  /** Human-reviewed final billable minutes under contract terms */
  approvedBillableMinutes: number
}

/**
 * Section 11.5: Canonical Event Envelope
 */
export interface CanonicalEventEnvelope {
  event_id: string
  schema_version: number
  tenant_id: string
  user_id: string
  device_id: string
  session_id: string
  source: EvidenceSourceType
  event_type:
    | 'session_started'
    | 'session_paused'
    | 'session_resumed'
    | 'session_stopped'
    | 'work_mode_changed'
    | 'break_started'
    | 'break_ended'
    | 'activity_rollup_1m'
    | 'vscode_debug_session'
    | 'vscode_test_run'
    | 'idle_gap_reconciled'
    | 'manual_claimed'
  occurred_at_utc: string
  received_at_utc?: string
  local_sequence: number
  monotonic_elapsed_ms: number
  consent_policy_version: string
  metadata: Record<string, string | number | boolean | string[]>
  integrity: {
    agent_build: string
    batch_id: string
  }
}

/**
 * D-002 & F1-044: Contract Rate Version & Billing Policy
 */
export interface ContractRateVersion {
  id: string
  effectiveFrom: string // YYYY-MM-DD
  effectiveTo: string | null // YYYY-MM-DD or null for open-ended
  hourlyRate: number
  currency: string
  label: string
}

export interface ContractBillingPolicy {
  id: string
  tenantId: string
  projectName: string
  clientName: string
  roundingRule: RoundingRule
  paidBreakAllowanceMinutesPerDay: number
  weeklyCapMinutes: number
  deepWorkNoInputWindowMinutes: number
  idleClarificationThresholdMinutes: number
  rateVersions: ContractRateVersion[]
}

/**
 * D-003 & F1-030: Privacy Policy & Consent Record
 */
export interface TrackingPolicySpec {
  version: string
  effectiveDate: string
  collectSessionLifecycle: boolean
  collectCoarseAppCategory: boolean
  collectIdeWorkspaceMetadata: boolean
  collectGitWebhookMetadata: boolean
  neverCollectKeystrokes: true
  neverCollectClipboard: true
  neverCollectPrivateMessages: true
  neverCollectRawSourceCode: true
  neverCollectWebcamOrMic: true
  screenshotsDisabledByDefault: true
}

export interface EvidenceArtifact {
  id: string
  sourceType: EvidenceArtifactType
  externalId: string
  occurredAtUtc: string
  summaryTitle: string
  linkType: ArtifactLinkType
  linkConfidence: number
  linkRationale: string
}

export interface RawTimeSliceInput {
  id: string
  deviceId: string
  deviceName: string
  workDate: string // YYYY-MM-DD
  startMinuteOfDay: number // e.g. 540 for 09:00
  endMinuteOfDay: number // e.g. 630 for 10:30
  workMode: WorkMode
  provenance: SessionProvenance
  appCategory: AppCategory
  hasInputSignal: boolean
  isBreak?: boolean
  breakType?: 'paid' | 'unpaid'
  developerNote?: string
  clockDriftSeconds?: number
  artifacts: EvidenceArtifact[]
}

export interface CanonicalTimeSegment {
  id: string
  workDate: string
  startMinuteOfDay: number
  endMinuteOfDay: number
  durationMinutes: number
  workMode: WorkMode
  provenance: SessionProvenance
  appCategory: AppCategory
  hasInputSignal: boolean
  isBreak: boolean
  breakType?: 'paid' | 'unpaid'
  developerNote?: string
  evidenceStatus: EvidenceStatus
  metrics: FiveTimeMetrics
  appliedRate: number
  appliedRateLabel: string
  estimatedCost: number
  triggeredRules: TriggeredRuleEvaluation[]
  artifacts: EvidenceArtifact[]
  wasDeduplicatedOverlap: boolean
  contributingDevices: string[]
}

export interface TriggeredRuleEvaluation {
  ruleCode: VerificationRuleCode
  title: string
  triggerDescription: string
  suggestedAction: string
  prohibitedInference: string
  severity: 'info' | 'clarification' | 'warning'
}

export interface PilotScenarioFixture {
  id: string
  code: string
  title: string
  category: string
  taskCode: string
  taskTitle: string
  taskEstimateMinutes: number
  description: string
  expectedSafeBehavior: string
  prohibitedSurveillanceBehavior: string
  slices: RawTimeSliceInput[]
}

// -----------------------------------------------------------------------------
// Phase 3 Domain Types (F3-001..F3-035)
// -----------------------------------------------------------------------------

export interface VerificationRuleConfig {
  idleClarificationThresholdMinutes: number
  deepWorkNoInputWindowMinutes: number
  clockDriftThresholdSeconds: number
  estimateVarianceAlertPercent: number
  enabledRules: Record<VerificationRuleCode, boolean>
}

export interface VerificationRuleSetRecord {
  id: string
  tenantId: string
  versionNumber: number
  versionLabel: string
  effectiveFrom: string
  status: 'draft' | 'active' | 'superseded'
  rulesConfig: VerificationRuleConfig
  createdByName: string
  createdAt: string
}

export interface PolicySimulationDelta {
  segmentId: string
  label: string
  currentStatus: EvidenceStatus
  simulatedStatus: EvidenceStatus
  currentRules: VerificationRuleCode[]
  simulatedRules: VerificationRuleCode[]
  retroactivePayDeduction: 0
}

export interface PolicySimulationReport {
  draftVersionLabel: string
  totalEvaluatedSegments: number
  statusChangedCount: number
  clarificationCountBefore: number
  clarificationCountAfter: number
  corroboratedCountAfter: number
  retroactiveHistoricalMutations: 0
  automatedPayDeductions: 0
  deltas: PolicySimulationDelta[]
}

export interface WorkModeSuggestion {
  id: string
  workDate: string
  startMinuteOfDay: number
  endMinuteOfDay: number
  currentWorkMode: WorkMode
  suggestedWorkMode: WorkMode
  confidence: number
  rationale: string
  citedSignalIds: string[]
}

export type CorrelationNodeType =
  | 'session'
  | 'segment'
  | 'task'
  | 'ide_event'
  | 'artifact'
  | 'annotation'
  | 'review'

export type CorrelationEdgeType =
  | 'attributed_to'
  | 'corroborated_by'
  | 'contextualized_by'
  | 'retrospective_outcome_of'
  | 'variance_flagged'
  | 'outcome_associated'

export interface EvidenceCorrelationEdgeRecord {
  id: string
  tenantId: string
  projectId: string
  sourceNodeType: CorrelationNodeType
  sourceNodeId: string
  sourceLabel: string
  targetNodeType: CorrelationNodeType
  targetNodeId: string
  targetLabel: string
  edgeType: CorrelationEdgeType
  confidence: number
  rationale: string
}

export interface TaskEffortVarianceSummary {
  taskId: string
  taskCode: string
  taskTitle: string
  estimateMinutes: number
  claimedMinutes: number
  supportedMinutes: number
  approvedMinutes: number
  varianceMinutes: number
  variancePercent: number
  reasonCodes: string[]
  linkedDeliverableCount: number
  acceptanceCriteriaSummary: string
}

export interface UnusualPatternAlert {
  id: string
  ruleCode: VerificationRuleCode
  title: string
  explanation: string
  suggestedReviewAction: string
  prohibitedInference: string
  citedIds: string[]
  severity: 'info' | 'clarification' | 'warning'
}

export type AiTargetType =
  | 'daily_summary'
  | 'reviewer_digest'
  | 'gap_explanation'
  | 'task_mapping'
  | 'debug_investigation'
  | 'pattern_cluster'

export type AiGenerationMode = 'ai_guardrailed' | 'deterministic_template'

export type AiGenerationStatus = 'draft' | 'edited_approved' | 'discarded'

export interface AiGenerationRecord {
  id: string
  tenantId: string
  userId?: string
  targetType: AiTargetType
  targetId: string
  targetLabel: string
  generationMode: AiGenerationMode
  modelId: string
  promptVersion: string
  sanitizedPromptPayload: Record<string, unknown>
  citedEventIds: string[]
  citedArtifactIds: string[]
  draftMarkdown: string
  humanApprovedMarkdown?: string
  status: AiGenerationStatus
  tokensUsed: number
  approvedByName?: string
  approvedAt?: string
  createdAt: string
}

export type DisputeStatus =
  | 'open'
  | 'awaiting_developer'
  | 'awaiting_manager'
  | 'escalated'
  | 'resolved_accepted'
  | 'resolved_adjusted'
  | 'resolved_upheld'

export interface DisputeMessageRecord {
  id: string
  authorUserId: string
  authorName: string
  authorRole: UserRole
  messageType: 'clarification_request' | 'developer_appeal' | 'reviewer_note' | 'escalation' | 'resolution'
  messageMarkdown: string
  attachedArtifactIds: string[]
  beforeMinutes?: number
  afterMinutes?: number
  createdAt: string
}

export interface DisputeRecord {
  id: string
  tenantId: string
  timesheetId: string
  timesheetLineId: string
  taskCode: string
  taskTitle: string
  developerId: string
  developerName: string
  openedByUserId: string
  openedByName: string
  assignedReviewerId?: string
  assignedReviewerName?: string
  escalatedReviewerId?: string
  escalatedReviewerName?: string
  escalationReason?: string
  dueDate?: string
  requestedEvidenceType?: string
  status: DisputeStatus
  disputedMinutes: number
  adjustedApprovedMinutes?: number
  reason: string
  resolutionSummary?: string
  policyVersionCode: string
  creditInvoiceId?: string
  createdAt: string
  resolvedAt?: string
  messages: DisputeMessageRecord[]
}

// -----------------------------------------------------------------------------
// Phase 4 Domain Types (F4-001..F4-013)
// -----------------------------------------------------------------------------

export type SaasPlanTier = 'starter' | 'team' | 'agency' | 'enterprise'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'grace_period'

export type BillingProvider = 'stripe' | 'paddle' | 'manual'

export interface PlanCatalogSpec {
  planTier: SaasPlanTier
  displayName: string
  tagline: string
  maxSeats: number
  maxActiveProjects: number
  retentionDays: number
  monthlyEventQuota: number
  monthlyAiTokenQuota: number
  storageQuotaMb: number
  apiRateLimitPerMin: number
  githubIdeEnabled: boolean
  clientPortalEnabled: boolean
  aiAssistanceAvailable: boolean
  outboundWebhooksEnabled: boolean
  accountingConnectorsEnabled: boolean
  externalPmEnabled: boolean
  whiteLabelEnabled: boolean
  baseMonthlyPriceCents: number
  perSeatPriceCents: number
}

export interface SubscriptionAccountRecord {
  id: string
  tenantId: string
  planTier: SaasPlanTier
  billingProvider: BillingProvider
  providerCustomerId?: string
  providerSubscriptionId?: string
  status: SubscriptionStatus
  billingCycle: 'monthly' | 'annual'
  trialEndsAt?: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  seatLimitOverride?: number
}

export interface SaasSubscriptionInvoiceRecord {
  id: string
  tenantId: string
  subscriptionAccountId: string
  invoiceNumber: string
  billingPeriodLabel: string
  planTier: SaasPlanTier
  seatsBilled: number
  unitPriceCents: number
  subtotalCents: number
  taxCents: number
  totalCents: number
  currency: string
  status: 'draft' | 'open' | 'paid' | 'void'
  providerInvoiceId?: string
  issuedAt: string
  paidAt?: string
}

export interface UsageRecordSnapshot {
  id: string
  tenantId: string
  metricDate: string
  activeSeats: number
  activeProjects: number
  activityEventsCount: number
  storageBytes: number
  aiTokensUsed: number
  apiRequestsCount: number
  webhookDeliveriesCount: number
}

export interface QuotaMetricStatus {
  key: 'seats' | 'projects' | 'events' | 'ai_tokens' | 'storage_mb'
  label: string
  used: number
  limit: number
  percent: number
  state: 'healthy' | 'warning_80' | 'overage_graceful'
  gracefulBehavior: string
}

export interface QuotaEvaluationReport {
  planTier: SaasPlanTier
  coreTimeTrackingAllowed: true
  aiLlmAllowed: boolean
  highFreqTelemetryMode: 'full' | 'sampled_graceful'
  alerts: string[]
  metrics: QuotaMetricStatus[]
}

export interface WhiteLabelBrandingConfig {
  agencyBrandName: string
  logoText: string
  accentColorHex: string
  customDomain: string
  supportEmail: string
  portalWelcomeMessage: string
  hideDevProofWatermark: boolean
}

export type PublicApiScope =
  | 'projects:read'
  | 'tasks:read'
  | 'tasks:write'
  | 'timesheets:read'
  | 'invoices:read'
  | 'webhooks:manage'

export interface ApiKeyRecord {
  id: string
  tenantId: string
  name: string
  keyPrefix: string
  keyHashSha256: string
  scopes: PublicApiScope[]
  rateLimitPerMin: number
  lastUsedAt?: string
  expiresAt?: string
  revokedAt?: string
  createdAt: string
}

export type OutboundWebhookEventType =
  | 'timesheet.approved'
  | 'dispute.opened'
  | 'dispute.resolved'
  | 'invoice.finalized'
  | 'usage.threshold_reached'

export interface OutboundWebhookEndpointRecord {
  id: string
  tenantId: string
  name: string
  targetUrl: string
  signingSecretPrefix: string
  subscribedEvents: OutboundWebhookEventType[]
  isActive: boolean
  createdAt: string
}

export interface OutboundWebhookDeliveryRecord {
  id: string
  tenantId: string
  endpointId: string
  eventType: OutboundWebhookEventType
  eventId: string
  signatureHeader: string
  deliveryStatus: 'pending' | 'delivered' | 'retrying' | 'failed'
  httpStatus?: number
  attemptCount: number
  responseSnippet?: string
  createdAt: string
}

export type EcosystemConnectorCategory = 'calendar' | 'accounting' | 'external_pm'

export type EcosystemConnectorProvider =
  | 'google_calendar'
  | 'outlook_calendar'
  | 'xero'
  | 'quickbooks'
  | 'jira'
  | 'linear'
  | 'trello'
  | 'azure_devops'

export interface EcosystemConnectorRecord {
  id: string
  tenantId: string
  category: EcosystemConnectorCategory
  provider: EcosystemConnectorProvider
  displayName: string
  status: 'connected' | 'paused' | 'disconnected'
  syncConfig: Record<string, string | number | boolean>
  lastSyncedAt?: string
  createdAt: string
}

export interface CalendarMeetingEventRecord {
  id: string
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
  associatedSegmentId?: string
  syncPermissionScope: 'metadata_only' | 'title_and_duration'
}

export interface ProjectForecastSummary {
  projectId: string
  projectCode: string
  projectName: string
  clientName: string
  estimatedMinutes: number
  approvedMinutes: number
  claimedMinutes: number
  unreviewedExposureMinutes: number
  unreviewedExposureAmount: number
  approvedSpendAmount: number
  projectedRemainingCost: number
  estimateAccuracyPercent: number
  riskLevel: 'on_track' | 'watch' | 'over_estimate'
}

export interface PortableWorkReportRecord {
  id: string
  tenantId: string
  developerUserId: string
  developerName: string
  reportTitle: string
  periodStart: string
  periodEnd: string
  totalApprovedMinutes: number
  totalSupportedMinutes: number
  deliverablesCount: number
  payloadDigestSha256: string
  signatureHmacSha256: string
  reportPayload: Record<string, unknown>
  createdAt: string
}



// =============================================================================
// Phase 5 — Enterprise, Compliance & Operational Scale (F5-001 .. F5-011)
// =============================================================================

export type SsoProviderType = 'saml' | 'oidc'

export interface SsoProviderRecord {
  id: string
  tenantId: string
  providerType: SsoProviderType
  displayName: string
  domain: string
  entityIdOrIssuer: string
  ssoUrl: string
  certificateFingerprint?: string
  clientId?: string
  enforceSso: boolean
  jitDefaultRole: 'developer' | 'project_manager' | 'finance' | 'client_reviewer' | 'auditor'
  scimEnabled: boolean
  scimTokenPrefix?: string
  status: 'draft' | 'active' | 'disabled'
  createdAt: string
}

export interface ScimProvisioningEventRecord {
  id: string
  tenantId: string
  providerId?: string
  action: 'user_create' | 'user_update' | 'user_deactivate' | 'group_sync'
  externalUserId: string
  email: string
  targetRole: string
  status: 'applied' | 'rejected' | 'queued'
  correlationId: string
  detailMessage?: string
  occurredAtUtc: string
}

export interface PolicyChangeRequestRecord {
  id: string
  tenantId: string
  proposedVersionCode: string
  changeSummary: string
  scopeDiff: Record<string, unknown>
  expandsCollectionScope: boolean
  status: 'pending_second_approval' | 'approved_activated' | 'rejected' | 'cancelled'
  proposedBy: string
  proposedByName?: string
  approvedByFirst: string
  approvedByFirstName?: string
  approvedBySecond?: string
  approvedBySecondName?: string
  rejectionReason?: string
  effectiveFrom: string
  activatedPolicyVersionId?: string
  createdAt: string
  resolvedAt?: string
}

export type SensitiveAccessCategory =
  | 'audit_export'
  | 'policy_view'
  | 'policy_approval'
  | 'dispute_bundle'
  | 'retention_run'
  | 'legal_hold_change'
  | 'siem_export'
  | 'scim_sync'
  | 'residency_change'
  | 'dsar_request'

export interface SensitiveAccessLogRecord {
  id: string
  tenantId: string
  actorUserId?: string
  actorName?: string
  actionCategory: SensitiveAccessCategory
  resourceType: string
  resourceId: string
  ipAddressMasked: string
  correlationId: string
  metadata: Record<string, unknown>
  occurredAtUtc: string
}

export interface LegalHoldRecord {
  id: string
  tenantId: string
  scopeType: 'timesheet' | 'dispute' | 'project' | 'user' | 'tenant'
  targetId: string
  reason: string
  holdStatus: 'active' | 'released'
  placedBy?: string
  releasedBy?: string
  placedAt: string
  releasedAt?: string
}

export interface RetentionPolicyRecord {
  id: string
  tenantId: string
  name: string
  rawActivityDays: number
  rollupDays: number
  evidenceArtifactDays: number
  auditLogDays: number
  archiveStorageTier: 'supabase_cold' | 'cold_s3' | 'gcs_archive'
  isActive: boolean
  createdAt: string
}

export interface RetentionJobRecord {
  id: string
  tenantId: string
  policyId?: string
  jobType: 'purge_raw_events' | 'archive_rollups' | 'dsar_export' | 'dsar_erasure'
  status: 'queued' | 'running' | 'completed' | 'partial_legal_hold' | 'failed'
  scannedCount: number
  purgedCount: number
  skippedLegalHoldCount: number
  archivedBundleUri?: string
  executedAtUtc: string
}

export interface PrivacyRequestRecord {
  id: string
  tenantId: string
  requesterUserId: string
  requesterName?: string
  requestType: 'export' | 'correction' | 'erasure'
  status: 'pending' | 'in_review' | 'completed' | 'blocked_legal_hold'
  legalHoldBlocked: boolean
  exportDigestSha256?: string
  resolutionNote?: string
  createdAt: string
  resolvedAt?: string
}

export type ResidencyRegion = 'us-east-1' | 'eu-central-1' | 'uk-south-1' | 'ap-southeast-1'
export type FailoverRegion = 'us-west-2' | 'eu-west-1' | 'uk-west-1' | 'ap-southeast-2'
export type IsolationTier = 'shared_rls' | 'dedicated_schema' | 'dedicated_cluster'

export interface TenantResidencyConfigRecord {
  tenantId: string
  primaryRegion: ResidencyRegion
  failoverRegion: FailoverRegion
  dataResidencyLocked: boolean
  isolationTier: IsolationTier
  encryptionKeyMode: 'platform_kms' | 'byok_kms'
  kmsKeyArnMasked?: string
  dedicatedWorkerPool: boolean
  egressAllowlistCidrs: string[]
  updatedAt: string
}

export type SiemProvider = 'splunk' | 'datadog' | 'sentinel' | 'elastic' | 'syslog_tls'
export type SiemFormat = 'cef' | 'json_lines' | 'ocsf'

export interface SiemDestinationRecord {
  id: string
  tenantId: string
  name: string
  provider: SiemProvider
  endpointUrl: string
  authHeaderPrefix: string
  format: SiemFormat
  includeCategories: string[]
  isActive: boolean
  lastExportedAt?: string
  createdAt: string
}

export interface SiemExportBatchRecord {
  id: string
  tenantId: string
  destinationId: string
  eventCount: number
  payloadFormat: SiemFormat
  payloadDigestSha256: string
  deliveryStatus: 'queued' | 'delivered' | 'failed'
  httpStatus?: number
  sanitizedPreview: Record<string, unknown>
  createdAt: string
}

export type FleetPlatform = 'macos_universal' | 'windows_x64' | 'windows_arm64' | 'vscode_vsix'
export type FleetChannel = 'canary' | 'staged_25' | 'stable'

export interface FleetReleaseRecord {
  id: string
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
  isActive: boolean
  createdAt: string
}

export type WarehouseSink =
  | 'parquet_object_storage'
  | 'snowflake_external'
  | 'bigquery_load'
  | 'duckdb_cold'

export interface AnalyticsWarehouseExportRecord {
  id: string
  tenantId: string
  targetSink: WarehouseSink
  periodStart: string
  periodEnd: string
  rowCount: number
  compressedBytes: number
  objectPathUri: string
  checksumSha256: string
  status: 'queued' | 'exported' | 'verified'
  createdAt: string
}

export interface DrExerciseRecord {
  id: string
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
  conductedAt: string
}

export interface SecurityAssessmentRecord {
  id: string
  tenantId: string
  assessmentName: string
  assessorFirm: string
  assessmentType: 'penetration_test' | 'rls_isolation_audit' | 'sdlc_review' | 'soc2_readiness'
  status: 'scheduled' | 'in_progress' | 'remediating' | 'signed_off'
  criticalFindings: number
  highFindings: number
  remediatedFindings: number
  reportSha256?: string
  assessedAt: string
  signoffAt?: string
}

export type SupportedLocale = 'en-US' | 'en-GB' | 'de-DE' | 'fr-FR' | 'ja-JP'

export interface TenantAccessibilityConfigRecord {
  tenantId: string
  defaultLocale: SupportedLocale
  highContrastMode: boolean
  keyboardShortcutsEnabled: boolean
  wcagTargetLevel: 'AA' | 'AAA'
  updatedAt: string
}
