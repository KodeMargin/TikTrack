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

