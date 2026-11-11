/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppCategory,
  ArtifactLinkType,
  EvidenceSourceType,
  WorkMode,
} from '@/types/domain.types'
import { usePhase1Store } from '@/context/Phase1Store'
import {
  createSessionAnnotationViaPrisma,
  ingestWebhookViaPrisma,
  recordAuditViaPrisma,
} from '@/lib/prismaApiClient'

export type Phase2ArtifactSourceType =
  | 'github_commit'
  | 'github_pr'
  | 'github_review'
  | 'github_ci'
  | 'gitlab_mr'
  | 'vscode_debug'
  | 'vscode_test'
  | 'vscode_workspace'
  | 'terminal_command_category'
  | 'session_note'
  | 'external_ticket'

export type IdleReconciliationChoice =
  | 'thinking'
  | 'reading'
  | 'meeting'
  | 'break'
  | 'away'
  | 'other'

export interface ActivityRollupBucket {
  id: string
  tenantId: string
  userId: string
  projectId: string
  taskId: string
  workDate: string
  startMinuteOfDay: number
  endMinuteOfDay: number
  durationMinutes: number
  appCategory: AppCategory
  workMode: WorkMode
  hasInputSignal: boolean
  concurrentSources: EvidenceSourceType[]
  isObservationGap: boolean
  reconciliationChoice?: IdleReconciliationChoice
  reconciliationNote?: string
  reconciledAtUtc?: string
  displayCount: number
}

export interface Phase2EvidenceArtifact {
  id: string
  tenantId: string
  projectId: string
  taskId: string
  taskCode: string
  workDate: string
  minuteOfDay: number
  sourceType: Phase2ArtifactSourceType
  captureMode: 'webhook' | 'ide_extension' | 'desktop_agent' | 'manual_declaration'
  externalId: string
  occurredAtUtc: string
  actorName: string
  summaryTitle: string
  linkType: ArtifactLinkType
  linkConfidence: number
  linkRationale: string
  confirmedByUser: boolean
  overriddenByUser: boolean
  reliabilityStatus: 'verified_webhook' | 'signed_agent_batch' | 'developer_declared'
  metadata: Record<string, string | number | boolean>
}

export interface SessionAnnotationItem {
  id: string
  tenantId: string
  projectId: string
  taskId: string
  workDate: string
  startMinuteOfDay: number
  endMinuteOfDay: number
  authorName: string
  annotationType:
    | 'thinking_note'
    | 'research_outcome'
    | 'investigation_log'
    | 'idle_reconciliation'
    | 'pair_programming'
  title: string
  contentMarkdown: string
  createdAt: string
}

export interface IdeWorkspaceMappingRecord {
  id: string
  tenantId: string
  userId: string
  projectId: string
  taskId: string
  taskCode: string
  ideType: 'vscode' | 'jetbrains' | 'cursor' | 'zed'
  workspaceIdentifier: string
  repoFullName: string
  branchName: string
  suggestedTaskCode: string
  confidenceScore: number
  confirmedByUser: boolean
  overriddenByUser: boolean
  updatedAt: string
}

export interface ConnectedIntegrationRecord {
  id: string
  tenantId: string
  provider: 'github' | 'gitlab' | 'vscode' | 'jetbrains' | 'terminal' | 'jira' | 'linear'
  displayName: string
  installationId: string
  status: 'connected' | 'disconnected' | 'error'
  scopeSummary: string
  reposOrWorkspaces: string[]
  retentionDays: number
  lastSyncedAt: string
}

export interface WebhookReceiptRecord {
  id: string
  tenantId: string
  provider: 'github' | 'gitlab' | 'jira' | 'linear'
  deliveryId: string
  eventType: string
  signatureVerified: boolean
  payloadSha256: string
  deliveryAttemptCount: number
  status: 'processed' | 'duplicate_ignored' | 'rejected_signature'
  createdArtifactId?: string
  summary: string
  receivedAtUtc: string
}

export interface EnrolledDeviceRecord {
  id: string
  tenantId: string
  userId: string
  userName: string
  deviceName: string
  osPlatform: 'macos' | 'windows' | 'linux'
  agentVersion: string
  updateChannel: 'stable' | 'beta' | 'enterprise_pinned'
  lastClockDriftSeconds: number
  clockAnomalyDetected: boolean
  multiDisplayPolicy: 'coarse_metadata_only'
  revokedAt: string | null
  lastSeenAt: string
}

export interface LocalPrivacyExclusionItem {
  id: string
  tenantId: string
  userId: string
  pattern: string
  exclusionType: 'app_identifier' | 'domain_pattern' | 'workspace_path'
  reason: string
  createdAt: string
}

export interface LocalPrivacyAuditBatch {
  batchId: string
  tenantId: string
  userId: string
  deviceId: string
  deviceName: string
  source: 'desktop' | 'vscode' | 'terminal'
  receivedAtUtc: string
  retentionExpiresInDays: number
  eventCount: number
  suppressedByDenylistCount: number
  blockedSurveillanceKeysCount: number
  rawPayloadJson: Record<string, unknown>
}

interface Phase2StoreContextValue {
  activityRollups: ActivityRollupBucket[]
  reconcileObservationGap: (
    bucketId: string,
    choice: IdleReconciliationChoice,
    note: string
  ) => void
  evidenceArtifacts: Phase2EvidenceArtifact[]
  relinkEvidenceArtifact: (
    artifactId: string,
    newTaskId: string,
    nextLinkType: ArtifactLinkType,
    rationale: string
  ) => void
  confirmEvidenceArtifactLink: (artifactId: string) => void
  sessionAnnotations: SessionAnnotationItem[]
  addSessionAnnotation: (input: {
    projectId: string
    taskId: string
    workDate: string
    startMinuteOfDay: number
    endMinuteOfDay: number
    annotationType: SessionAnnotationItem['annotationType']
    title: string
    contentMarkdown: string
  }) => void
  ideMappings: IdeWorkspaceMappingRecord[]
  confirmOrOverrideIdeMapping: (mappingId: string, nextTaskId: string) => void
  emitSimulatedIdeTelemetry: (
    kind: 'vscode_debug' | 'vscode_test' | 'terminal_category' | 'concurrent_ide_desktop',
    taskId: string
  ) => { ok: boolean; message: string }
  integrations: ConnectedIntegrationRecord[]
  toggleIntegrationConnection: (integrationId: string) => void
  webhookReceipts: WebhookReceiptRecord[]
  simulateWebhookDelivery: (input: {
    provider: 'github' | 'gitlab'
    deliveryId: string
    eventType: 'push' | 'pull_request' | 'pull_request_review' | 'check_suite'
    taskId: string
    externalId: string
    summaryTitle: string
    isRetrospective: boolean
    tamperSignature?: boolean
  }) => {
    accepted: boolean
    deduplicated: boolean
    deliveryAttemptCount: number
    message: string
  }
  devices: EnrolledDeviceRecord[]
  updateDeviceChannel: (
    deviceId: string,
    channel: EnrolledDeviceRecord['updateChannel']
  ) => void
  simulateDeviceClockAnomaly: (deviceId: string, driftSeconds: number) => void
  toggleDeviceRevocation: (deviceId: string) => void
  privacyExclusions: LocalPrivacyExclusionItem[]
  privacyPauseActive: boolean
  togglePrivacyPause: () => void
  addPrivacyExclusion: (
    pattern: string,
    exclusionType: LocalPrivacyExclusionItem['exclusionType'],
    reason: string
  ) => void
  removePrivacyExclusion: (id: string) => void
  privacyAuditBatches: LocalPrivacyAuditBatch[]
}

const INITIAL_ACTIVITY_ROLLUPS: ActivityRollupBucket[] = [
  {
    id: 'rollup-1',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-101',
    workDate: '2026-11-10',
    startMinuteOfDay: 540, // 09:00
    endMinuteOfDay: 570, // 09:30
    durationMinutes: 30,
    appCategory: 'docs_browser',
    workMode: 'thinking',
    hasInputSignal: false,
    concurrentSources: ['desktop'],
    isObservationGap: false,
    reconciliationChoice: 'thinking',
    reconciliationNote: 'Declared 90m Deep-Work Architecture window: whiteboarding GiST exclusion constraints',
    displayCount: 2,
  },
  {
    id: 'rollup-2',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-101',
    workDate: '2026-11-10',
    startMinuteOfDay: 570, // 09:30
    endMinuteOfDay: 630, // 10:30
    durationMinutes: 60,
    appCategory: 'ide',
    workMode: 'thinking',
    hasInputSignal: true,
    concurrentSources: ['desktop', 'vscode'],
    isObservationGap: false,
    displayCount: 2,
  },
  {
    id: 'rollup-3',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-102',
    workDate: '2026-11-11',
    startMinuteOfDay: 600, // 10:00
    endMinuteOfDay: 690, // 11:30
    durationMinutes: 90,
    appCategory: 'ide',
    workMode: 'debugging',
    hasInputSignal: true,
    concurrentSources: ['desktop', 'vscode'],
    isObservationGap: false,
    displayCount: 2,
  },
  {
    id: 'rollup-4',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-102',
    workDate: '2026-11-11',
    startMinuteOfDay: 690, // 11:30
    endMinuteOfDay: 715, // 11:55 (25m unobserved gap in standard mode -> F2-003/F2-004)
    durationMinutes: 25,
    appCategory: 'unobserved',
    workMode: 'debugging',
    hasInputSignal: false,
    concurrentSources: ['desktop'],
    isObservationGap: true,
    displayCount: 2,
  },
  {
    id: 'rollup-5',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-102',
    workDate: '2026-11-11',
    startMinuteOfDay: 715, // 11:55
    endMinuteOfDay: 780, // 13:00
    durationMinutes: 65,
    appCategory: 'terminal',
    workMode: 'testing',
    hasInputSignal: true,
    concurrentSources: ['desktop', 'vscode'],
    isObservationGap: false,
    displayCount: 2,
  },
  {
    id: 'rollup-6',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-103',
    workDate: '2026-11-16',
    startMinuteOfDay: 840, // 14:00
    endMinuteOfDay: 900, // 15:00
    durationMinutes: 60,
    appCategory: 'docs_browser',
    workMode: 'research',
    hasInputSignal: true,
    concurrentSources: ['desktop'],
    isObservationGap: false,
    displayCount: 1,
  },
]

const INITIAL_EVIDENCE_ARTIFACTS: Phase2EvidenceArtifact[] = [
  {
    id: 'art-debug-1',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settlement',
    taskId: 'task-102',
    taskCode: 'DEV-102',
    workDate: '2026-11-11',
    minuteOfDay: 645, // 10:45
    sourceType: 'vscode_debug',
    captureMode: 'ide_extension',
    externalId: 'dbg-session-9941',
    occurredAtUtc: '2026-11-11T10:45:00Z',
    actorName: 'Aria Chen',
    summaryTitle: 'VS Code Debugger (pwa-node): 19 breakpoints hit in webhook queue consumer',
    linkType: 'contemporaneous',
    linkConfidence: 0.96,
    linkRationale: 'Active branch fix/DEV-102-webhook-retry matched task DEV-102 during debugging session',
    confirmedByUser: true,
    overriddenByUser: false,
    reliabilityStatus: 'signed_agent_batch',
    metadata: {
      debug_type: 'pwa-node',
      breakpoints_hit: 19,
      duration_seconds: 3420,
      zero_commit_session: true,
    },
  },
  {
    id: 'art-test-1',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settlement',
    taskId: 'task-102',
    taskCode: 'DEV-102',
    workDate: '2026-11-11',
    minuteOfDay: 740, // 12:20
    sourceType: 'vscode_test',
    captureMode: 'ide_extension',
    externalId: 'test-run-4410',
    occurredAtUtc: '2026-11-11T12:20:00Z',
    actorName: 'Aria Chen',
    summaryTitle: 'Vitest Suite: 28 passed, 2 failed (reproduced dead-letter race condition)',
    linkType: 'contemporaneous',
    linkConfidence: 0.94,
    linkRationale: 'Local test runner executed inside workspace mapped to DEV-102',
    confirmedByUser: true,
    overriddenByUser: false,
    reliabilityStatus: 'signed_agent_batch',
    metadata: {
      runner: 'vitest',
      passed: 28,
      failed: 2,
      duration_ms: 4820,
    },
  },
  {
    id: 'art-commit-1',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settlement',
    taskId: 'task-101',
    taskCode: 'DEV-101',
    workDate: '2026-11-10',
    minuteOfDay: 620, // 10:20
    sourceType: 'github_commit',
    captureMode: 'webhook',
    externalId: 'sha-7c9b2e1',
    occurredAtUtc: '2026-11-10T10:20:00Z',
    actorName: 'Aria Chen',
    summaryTitle: 'feat(DEV-101): add btree_gist non-overlapping tstzrange constraint on time_segments',
    linkType: 'contemporaneous',
    linkConfidence: 0.98,
    linkRationale: 'Commit message & branch feat/DEV-101-gist-exclusion reference DEV-101',
    confirmedByUser: true,
    overriddenByUser: false,
    reliabilityStatus: 'verified_webhook',
    metadata: {
      repo: 'northstar/settlement-core',
      branch: 'feat/DEV-101-gist-exclusion',
      files_changed: 4,
    },
  },
  {
    id: 'art-pr-retro-1',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settlement',
    taskId: 'task-102',
    taskCode: 'DEV-102',
    workDate: '2026-11-11',
    minuteOfDay: 775, // 12:55
    sourceType: 'github_pr',
    captureMode: 'webhook',
    externalId: 'pr-148',
    occurredAtUtc: '2026-11-12T09:15:00Z',
    actorName: 'Aria Chen',
    summaryTitle: 'PR #148: fix(DEV-102): idempotent retry lock for webhook queue worker (pushed next morning)',
    linkType: 'retrospective_outcome',
    linkConfidence: 0.89,
    linkRationale: 'Pushed the morning after 4h zero-commit investigation; linked as retrospective outcome without altering Nov 11 claimed hours (Section 5.5 & R-05)',
    confirmedByUser: true,
    overriddenByUser: false,
    reliabilityStatus: 'verified_webhook',
    metadata: {
      repo: 'northstar/settlement-core',
      pr_number: 148,
      state: 'merged',
      ci_status: 'passing',
    },
  },
  {
    id: 'art-ci-1',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settlement',
    taskId: 'task-101',
    taskCode: 'DEV-101',
    workDate: '2026-11-10',
    minuteOfDay: 628,
    sourceType: 'github_ci',
    captureMode: 'webhook',
    externalId: 'gh-run-88210',
    occurredAtUtc: '2026-11-10T10:28:00Z',
    actorName: 'GitHub Actions',
    summaryTitle: 'CI Check Suite: pgTAP RLS & GiST Exclusion Tests (14/14 passing)',
    linkType: 'contemporaneous',
    linkConfidence: 0.95,
    linkRationale: 'Triggered by commit sha-7c9b2e1 on branch feat/DEV-101-gist-exclusion',
    confirmedByUser: true,
    overriddenByUser: false,
    reliabilityStatus: 'verified_webhook',
    metadata: {
      workflow: 'supabase-db-tests.yml',
      conclusion: 'success',
      duration_seconds: 47,
    },
  },
]

const INITIAL_ANNOTATIONS: SessionAnnotationItem[] = [
  {
    id: 'ann-1',
    tenantId: 'tenant-northstar',
    projectId: 'proj-settlement',
    taskId: 'task-101',
    workDate: '2026-11-10',
    startMinuteOfDay: 540,
    endMinuteOfDay: 600,
    authorName: 'Aria Chen',
    annotationType: 'thinking_note',
    title: 'PostgreSQL GiST Exclusion & Composite Tenant FK Design',
    contentMarkdown:
      'Evaluated `tstzrange` vs `int8range` for canonical `time_segments`. Chose `EXCLUDE USING gist (tenant_id WITH =, user_id WITH =, segment_range WITH &&) WHERE (provenance <> \'superseded_duplicate\')` so overlapping dual-device timers never double-bill.',
    createdAt: '2026-11-10T10:05:00Z',
  },
  {
    id: 'ann-2',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-102',
    workDate: '2026-11-11',
    startMinuteOfDay: 600,
    endMinuteOfDay: 780,
    authorName: 'Aria Chen',
    annotationType: 'investigation_log',
    title: 'Zero-Commit Root Cause Investigation: Webhook Worker Visibility Timeout',
    contentMarkdown:
      'Spent 3h reproducing intermittent duplicate delivery under network jitter. Identified that `pgmq.read` visibility timeout was 15s while downstream RPC took 18s under cold start. Prepared fix for PR #148.',
    createdAt: '2026-11-11T12:50:00Z',
  } as SessionAnnotationItem,
]

const INITIAL_IDE_MAPPINGS: IdeWorkspaceMappingRecord[] = [
  {
    id: 'map-1',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-101',
    taskCode: 'DEV-101',
    ideType: 'vscode',
    workspaceIdentifier: 'vscode://settlement-core',
    repoFullName: 'northstar/settlement-core',
    branchName: 'feat/DEV-101-gist-exclusion',
    suggestedTaskCode: 'DEV-101',
    confidenceScore: 0.96,
    confirmedByUser: true,
    overriddenByUser: false,
    updatedAt: '2026-11-10T09:02:00Z',
  },
  {
    id: 'map-2',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-102',
    taskCode: 'DEV-102',
    ideType: 'vscode',
    workspaceIdentifier: 'vscode://settlement-core',
    repoFullName: 'northstar/settlement-core',
    branchName: 'fix/DEV-102-webhook-retry',
    suggestedTaskCode: 'DEV-102',
    confidenceScore: 0.94,
    confirmedByUser: true,
    overriddenByUser: false,
    updatedAt: '2026-11-11T10:01:00Z',
  },
  {
    id: 'map-3',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    projectId: 'proj-settlement',
    taskId: 'task-103',
    taskCode: 'DEV-103',
    ideType: 'jetbrains',
    workspaceIdentifier: 'jetbrains://rustrover/desktop-agent',
    repoFullName: 'northstar/devproof-agent',
    branchName: 'chore/tray-clock-drift',
    suggestedTaskCode: 'DEV-103',
    confidenceScore: 0.78,
    confirmedByUser: false,
    overriddenByUser: false,
    updatedAt: '2026-11-11T14:10:00Z',
  },
]

const INITIAL_INTEGRATIONS: ConnectedIntegrationRecord[] = [
  {
    id: 'int-github',
    tenantId: 'tenant-northstar',
    provider: 'github',
    displayName: 'GitHub App (Least-Privilege Repo Scope — F2-020)',
    installationId: 'gh-inst-884120',
    status: 'connected',
    scopeSummary: 'Read-only metadata: push, pull_request, pull_request_review, check_suite (Zero source code)',
    reposOrWorkspaces: ['northstar/settlement-core', 'northstar/devproof-agent'],
    retentionDays: 365,
    lastSyncedAt: '2026-11-11T14:30:00Z',
  },
  {
    id: 'int-vscode',
    tenantId: 'tenant-northstar',
    provider: 'vscode',
    displayName: 'VS Code Extension v0.2.0 (F2-010..F2-013)',
    installationId: 'vscode-ext-aria-m4',
    status: 'connected',
    scopeSummary: 'Workspace/branch ID, 1m edit/save counts, debugger lifecycle & test pass/fail counts',
    reposOrWorkspaces: ['vscode://settlement-core'],
    retentionDays: 90,
    lastSyncedAt: '2026-11-11T14:35:00Z',
  },
  {
    id: 'int-gitlab',
    tenantId: 'tenant-northstar',
    provider: 'gitlab',
    displayName: 'GitLab Webhook Connector (F2-025)',
    installationId: 'gl-hook-3019',
    status: 'connected',
    scopeSummary: 'Merge requests, commits, pipeline status & review events',
    reposOrWorkspaces: ['northstar-eu/compliance-exporter'],
    retentionDays: 365,
    lastSyncedAt: '2026-11-11T11:00:00Z',
  },
  {
    id: 'int-terminal',
    tenantId: 'tenant-northstar',
    provider: 'terminal',
    displayName: 'Terminal Metadata Category Opt-In (F2-016)',
    installationId: 'term-optin-aria',
    status: 'disconnected',
    scopeSummary: 'Explicit opt-in only: records command category (build/test/git); never collects args, secrets, or stdout',
    reposOrWorkspaces: ['zsh / iTerm2'],
    retentionDays: 30,
    lastSyncedAt: '2026-11-09T18:00:00Z',
  },
  {
    id: 'int-linear',
    tenantId: 'tenant-northstar',
    provider: 'linear',
    displayName: 'Linear & Jira Task Connector (F2-026)',
    installationId: 'lin-sync-552',
    status: 'connected',
    scopeSummary: 'Two-way task code & status mapping (DEV-101..DEV-103) with conflict rules',
    reposOrWorkspaces: ['Northstar Engineering Team'],
    retentionDays: 365,
    lastSyncedAt: '2026-11-11T14:00:00Z',
  },
]

const INITIAL_WEBHOOK_RECEIPTS: WebhookReceiptRecord[] = [
  {
    id: 'wh-1',
    tenantId: 'tenant-northstar',
    provider: 'github',
    deliveryId: 'gh-del-772a901-commit',
    eventType: 'push',
    signatureVerified: true,
    payloadSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    deliveryAttemptCount: 1,
    status: 'processed',
    createdArtifactId: 'art-commit-1',
    summary: 'Push to feat/DEV-101-gist-exclusion (sha-7c9b2e1)',
    receivedAtUtc: '2026-11-10T10:20:01Z',
  },
  {
    id: 'wh-2',
    tenantId: 'tenant-northstar',
    provider: 'github',
    deliveryId: 'gh-del-991b402-pr148',
    eventType: 'pull_request',
    signatureVerified: true,
    payloadSha256: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    deliveryAttemptCount: 3,
    status: 'duplicate_ignored',
    createdArtifactId: 'art-pr-retro-1',
    summary: 'PR #148 opened & replayed 3x -> deduplicated into 1 canonical artifact (art-pr-retro-1)',
    receivedAtUtc: '2026-11-12T09:15:02Z',
  },
]

const INITIAL_DEVICES: EnrolledDeviceRecord[] = [
  {
    id: 'dev-m4-pro',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    userName: 'Aria Chen',
    deviceName: 'Aria MacBook Pro 16" (M4 Max)',
    osPlatform: 'macos',
    agentVersion: '0.2.0',
    updateChannel: 'stable',
    lastClockDriftSeconds: 2,
    clockAnomalyDetected: false,
    multiDisplayPolicy: 'coarse_metadata_only',
    revokedAt: null,
    lastSeenAt: '2026-11-11T14:36:00Z',
  },
  {
    id: 'dev-linux-thinkpad',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    userName: 'Aria Chen',
    deviceName: 'Aria Linux Secondary ThinkPad X1',
    osPlatform: 'linux',
    agentVersion: '0.2.0-beta.1',
    updateChannel: 'beta',
    lastClockDriftSeconds: 148,
    clockAnomalyDetected: true,
    multiDisplayPolicy: 'coarse_metadata_only',
    revokedAt: null,
    lastSeenAt: '2026-11-11T11:20:00Z',
  },
]

const INITIAL_PRIVACY_EXCLUSIONS: LocalPrivacyExclusionItem[] = [
  {
    id: 'excl-1',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    pattern: '1Password',
    exclusionType: 'app_identifier',
    reason: 'Password manager & credential vault suppressed locally before queuing',
    createdAt: '2026-11-01T09:00:00Z',
  },
  {
    id: 'excl-2',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    pattern: 'Signal',
    exclusionType: 'app_identifier',
    reason: 'Personal encrypted messenger excluded',
    createdAt: '2026-11-01T09:00:00Z',
  },
  {
    id: 'excl-3',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    pattern: '*.myhealth-portal.org',
    exclusionType: 'domain_pattern',
    reason: 'Personal medical portal never leaves workstation',
    createdAt: '2026-11-03T14:00:00Z',
  },
]

const INITIAL_PRIVACY_BATCHES: LocalPrivacyAuditBatch[] = [
  {
    batchId: 'batch-desktop-901',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    deviceId: 'dev-m4-pro',
    deviceName: 'Aria MacBook Pro 16" (M4 Max)',
    source: 'desktop',
    receivedAtUtc: '2026-11-11T11:30:00Z',
    retentionExpiresInDays: 89,
    eventCount: 6,
    suppressedByDenylistCount: 2,
    blockedSurveillanceKeysCount: 0,
    rawPayloadJson: {
      batch_id: 'batch-desktop-901',
      schema_version: 1,
      source: 'desktop',
      consent_policy_version: 'v1.0-2026-11',
      multi_display_policy: 'coarse_metadata_only',
      suppressed_local_apps: ['1Password', 'Signal'],
      events: [
        {
          event_type: 'activity_rollup_5m',
          occurred_at_utc: '2026-11-11T11:00:00Z',
          monotonic_elapsed_ms: 3600000,
          metadata: {
            app_category: 'ide',
            work_mode: 'debugging',
            has_input_signal: true,
            display_count: 2,
            screenshots_captured: 0,
          },
        },
        {
          event_type: 'idle_gap_detected',
          occurred_at_utc: '2026-11-11T11:30:00Z',
          monotonic_elapsed_ms: 5400000,
          metadata: {
            app_category: 'unobserved',
            unobserved_minutes: 25,
            classification: 'unobserved_gap_never_fraud',
          },
        },
      ],
    },
  },
  {
    batchId: 'batch-vscode-902',
    tenantId: 'tenant-northstar',
    userId: 'usr-aria',
    deviceId: 'dev-m4-pro',
    deviceName: 'Aria MacBook Pro 16" (M4 Max)',
    source: 'vscode',
    receivedAtUtc: '2026-11-11T12:25:00Z',
    retentionExpiresInDays: 89,
    eventCount: 3,
    suppressedByDenylistCount: 0,
    blockedSurveillanceKeysCount: 0,
    rawPayloadJson: {
      batch_id: 'batch-vscode-902',
      schema_version: 1,
      source: 'vscode',
      consent_policy_version: 'v1.0-2026-11',
      workspace_identifier: 'vscode://settlement-core',
      branch_name: 'fix/DEV-102-webhook-retry',
      mapped_task_code: 'DEV-102',
      events: [
        {
          event_type: 'vscode_edit_save_bucket',
          occurred_at_utc: '2026-11-11T10:30:00Z',
          metadata: {
            files_touched_count: 4,
            language_ids: ['typescript', 'sql'],
            save_count: 11,
            raw_source_code_included: false,
          },
        },
        {
          event_type: 'vscode_debug_session',
          occurred_at_utc: '2026-11-11T10:45:00Z',
          metadata: {
            debug_type: 'pwa-node',
            breakpoints_hit: 19,
            duration_seconds: 3420,
          },
        },
        {
          event_type: 'vscode_test_run',
          occurred_at_utc: '2026-11-11T12:20:00Z',
          metadata: {
            runner: 'vitest',
            passed: 28,
            failed: 2,
            duration_ms: 4820,
          },
        },
      ],
    },
  },
]

const Phase2StoreContext = createContext<Phase2StoreContextValue | null>(null)

export function Phase2StoreProvider({ children }: { children: ReactNode }) {
  const { activeTenant, activeUser, tasks } = usePhase1Store()

  const [allRollups, setAllRollups] = useState<ActivityRollupBucket[]>(INITIAL_ACTIVITY_ROLLUPS)
  const [allArtifacts, setAllArtifacts] = useState<Phase2EvidenceArtifact[]>(
    INITIAL_EVIDENCE_ARTIFACTS
  )
  const [allAnnotations, setAllAnnotations] =
    useState<SessionAnnotationItem[]>(INITIAL_ANNOTATIONS)
  const [allIdeMappings, setAllIdeMappings] =
    useState<IdeWorkspaceMappingRecord[]>(INITIAL_IDE_MAPPINGS)
  const [allIntegrations, setAllIntegrations] =
    useState<ConnectedIntegrationRecord[]>(INITIAL_INTEGRATIONS)
  const [allWebhookReceipts, setAllWebhookReceipts] =
    useState<WebhookReceiptRecord[]>(INITIAL_WEBHOOK_RECEIPTS)
  const [allDevices, setAllDevices] = useState<EnrolledDeviceRecord[]>(INITIAL_DEVICES)
  const [allExclusions, setAllExclusions] =
    useState<LocalPrivacyExclusionItem[]>(INITIAL_PRIVACY_EXCLUSIONS)
  const [privacyPauseActive, setPrivacyPauseActive] = useState(false)
  const [allPrivacyBatches, setAllPrivacyBatches] =
    useState<LocalPrivacyAuditBatch[]>(INITIAL_PRIVACY_BATCHES)

  const activityRollups = allRollups.filter((r) => r.tenantId === activeTenant.id)
  const evidenceArtifacts = allArtifacts.filter((a) => a.tenantId === activeTenant.id)
  const sessionAnnotations = allAnnotations.filter((a) => a.tenantId === activeTenant.id)
  const ideMappings = allIdeMappings.filter((m) => m.tenantId === activeTenant.id)
  const integrations = allIntegrations.filter((i) => i.tenantId === activeTenant.id)
  const webhookReceipts = allWebhookReceipts.filter((w) => w.tenantId === activeTenant.id)
  const devices = allDevices.filter((d) => d.tenantId === activeTenant.id)
  const privacyExclusions = allExclusions.filter((e) => e.tenantId === activeTenant.id)
  const privacyAuditBatches = allPrivacyBatches.filter((b) => b.tenantId === activeTenant.id)

  function reconcileObservationGap(
    bucketId: string,
    choice: IdleReconciliationChoice,
    note: string
  ) {
    const nowIso = new Date().toISOString()
    setAllRollups((prev) =>
      prev.map((b) => {
        if (b.id !== bucketId) return b
        const nextMode: WorkMode =
          choice === 'thinking'
            ? 'thinking'
            : choice === 'reading'
              ? 'research'
              : choice === 'meeting'
                ? 'meeting'
                : b.workMode
        return {
          ...b,
          workMode: nextMode,
          reconciliationChoice: choice,
          reconciliationNote:
            note.trim() || `Developer reconciled ${b.durationMinutes}m unobserved gap as ${choice}`,
          reconciledAtUtc: nowIso,
        }
      })
    )
    void recordAuditViaPrisma({
      tenantId: activeTenant.id,
      actorUserId: activeUser.id,
      actionType: 'IDLE_GAP_RECONCILED',
      targetEntity: `activity_rollups:${bucketId}`,
      reason: `Reconciled unobserved interval as "${choice}": ${note}`,
    })
  }

  function relinkEvidenceArtifact(
    artifactId: string,
    newTaskId: string,
    nextLinkType: ArtifactLinkType,
    rationale: string
  ) {
    const targetTask = tasks.find((t) => t.id === newTaskId)
    setAllArtifacts((prev) =>
      prev.map((art) =>
        art.id === artifactId
          ? {
              ...art,
              taskId: newTaskId,
              taskCode: targetTask?.code ?? art.taskCode,
              linkType: nextLinkType,
              linkConfidence: 1.0,
              linkRationale:
                rationale.trim() ||
                `Explicitly re-linked by ${activeUser.name} to ${targetTask?.code ?? newTaskId}`,
              confirmedByUser: true,
              overriddenByUser: true,
            }
          : art
      )
    )
  }

  function confirmEvidenceArtifactLink(artifactId: string) {
    setAllArtifacts((prev) =>
      prev.map((art) =>
        art.id === artifactId
          ? { ...art, confirmedByUser: true, linkConfidence: Math.max(art.linkConfidence, 0.98) }
          : art
      )
    )
  }

  function addSessionAnnotation(input: {
    projectId: string
    taskId: string
    workDate: string
    startMinuteOfDay: number
    endMinuteOfDay: number
    annotationType: SessionAnnotationItem['annotationType']
    title: string
    contentMarkdown: string
  }) {
    const newItem: SessionAnnotationItem = {
      id: `ann-${Date.now()}`,
      tenantId: activeTenant.id,
      projectId: input.projectId,
      taskId: input.taskId,
      workDate: input.workDate,
      startMinuteOfDay: input.startMinuteOfDay,
      endMinuteOfDay: input.endMinuteOfDay,
      authorName: activeUser.name,
      annotationType: input.annotationType,
      title: input.title.trim(),
      contentMarkdown: input.contentMarkdown.trim(),
      createdAt: new Date().toISOString(),
    }
    setAllAnnotations((prev) => [newItem, ...prev])
    void createSessionAnnotationViaPrisma({
      tenantId: activeTenant.id,
      userId: activeUser.id,
      sessionId: 'session-live',
      annotationType: input.annotationType,
      title: input.title,
      contentMarkdown: input.contentMarkdown,
      startMinuteOfDay: input.startMinuteOfDay,
      endMinuteOfDay: input.endMinuteOfDay,
    })
  }

  function confirmOrOverrideIdeMapping(mappingId: string, nextTaskId: string) {
    const targetTask = tasks.find((t) => t.id === nextTaskId)
    if (!targetTask) return
    setAllIdeMappings((prev) =>
      prev.map((m) =>
        m.id === mappingId
          ? {
              ...m,
              taskId: targetTask.id,
              taskCode: targetTask.code,
              confidenceScore: 1.0,
              confirmedByUser: true,
              overriddenByUser: m.suggestedTaskCode !== targetTask.code,
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    )
  }

  function emitSimulatedIdeTelemetry(
    kind: 'vscode_debug' | 'vscode_test' | 'terminal_category' | 'concurrent_ide_desktop',
    taskId: string
  ): { ok: boolean; message: string } {
    const vscodeInt = integrations.find((i) => i.provider === 'vscode')
    if (kind !== 'terminal_category' && vscodeInt?.status === 'disconnected') {
      return {
        ok: false,
        message:
          'VS Code Extension integration is currently disconnected (Section 5.5). Reconnect it first to emit IDE telemetry.',
      }
    }
    const termInt = integrations.find((i) => i.provider === 'terminal')
    if (kind === 'terminal_category' && termInt?.status === 'disconnected') {
      return {
        ok: false,
        message:
          'Terminal Metadata Integration (F2-016) is opt-in and currently disabled. Enable it in Integrations first.',
      }
    }

    const targetTask = tasks.find((t) => t.id === taskId) ?? tasks[0]
    if (!targetTask) {
      return { ok: false, message: 'No active task selected.' }
    }

    const nowIso = new Date().toISOString()

    if (kind === 'concurrent_ide_desktop') {
      // Section 5.5: IDE and desktop signals concurrent during the same 10m remain 10m of elapsed time
      const bucketId = `rollup-conc-${Date.now()}`
      setAllRollups((prev) => [
        ...prev,
        {
          id: bucketId,
          tenantId: activeTenant.id,
          userId: activeUser.id,
          projectId: targetTask.projectId,
          taskId: targetTask.id,
          workDate: '2026-11-11',
          startMinuteOfDay: 780, // 13:00
          endMinuteOfDay: 790, // 13:10 (10m)
          durationMinutes: 10,
          appCategory: 'ide',
          workMode: 'coding',
          hasInputSignal: true,
          concurrentSources: ['desktop', 'vscode'],
          isObservationGap: false,
          displayCount: 2,
        },
      ])
      return {
        ok: true,
        message:
          'Merged concurrent Desktop Agent + VS Code Extension signals (13:00–13:10) into a single 10m canonical bucket (never 20m — Section 5.5).',
      }
    }

    const newArtifact: Phase2EvidenceArtifact =
      kind === 'vscode_debug'
        ? {
            id: `art-dbg-${Date.now()}`,
            tenantId: activeTenant.id,
            projectId: targetTask.projectId,
            taskId: targetTask.id,
            taskCode: targetTask.code,
            workDate: '2026-11-11',
            minuteOfDay: 760,
            sourceType: 'vscode_debug',
            captureMode: 'ide_extension',
            externalId: `dbg-${Date.now().toString().slice(-4)}`,
            occurredAtUtc: nowIso,
            actorName: activeUser.name,
            summaryTitle: `VS Code Debug Session (lldb/node): 12 breakpoints hit on ${targetTask.code}`,
            linkType: 'contemporaneous',
            linkConfidence: 0.96,
            linkRationale: `Corroborates zero-commit debugging session on ${targetTask.code} (F2-012)`,
            confirmedByUser: true,
            overriddenByUser: false,
            reliabilityStatus: 'signed_agent_batch',
            metadata: { debug_type: 'pwa-node', breakpoints_hit: 12, duration_seconds: 1800 },
          }
        : kind === 'vscode_test'
          ? {
              id: `art-tst-${Date.now()}`,
              tenantId: activeTenant.id,
              projectId: targetTask.projectId,
              taskId: targetTask.id,
              taskCode: targetTask.code,
              workDate: '2026-11-11',
              minuteOfDay: 770,
              sourceType: 'vscode_test',
              captureMode: 'ide_extension',
              externalId: `tst-${Date.now().toString().slice(-4)}`,
              occurredAtUtc: nowIso,
              actorName: activeUser.name,
              summaryTitle: `Local Test Execution (Vitest): 34 passed, 0 failed (${targetTask.code})`,
              linkType: 'contemporaneous',
              linkConfidence: 0.95,
              linkRationale: `Captured local test runner completion in workspace mapped to ${targetTask.code} (F2-013)`,
              confirmedByUser: true,
              overriddenByUser: false,
              reliabilityStatus: 'signed_agent_batch',
              metadata: { runner: 'vitest', passed: 34, failed: 0, duration_ms: 3190 },
            }
          : {
              id: `art-term-${Date.now()}`,
              tenantId: activeTenant.id,
              projectId: targetTask.projectId,
              taskId: targetTask.id,
              taskCode: targetTask.code,
              workDate: '2026-11-11',
              minuteOfDay: 775,
              sourceType: 'terminal_command_category',
              captureMode: 'desktop_agent',
              externalId: `term-${Date.now().toString().slice(-4)}`,
              occurredAtUtc: nowIso,
              actorName: activeUser.name,
              summaryTitle: `Opt-In Terminal Category: [database / test] (0 arguments or stdout collected — F2-016)`,
              linkType: 'contemporaneous',
              linkConfidence: 0.88,
              linkRationale: `Explicit opt-in coarse terminal category during ${targetTask.code}`,
              confirmedByUser: true,
              overriddenByUser: false,
              reliabilityStatus: 'signed_agent_batch',
              metadata: { category: 'test', args_redacted: true, stdout_collected: false },
            }

    setAllArtifacts((prev) => [newArtifact, ...prev])

    const batchId = `batch-${kind}-${Date.now().toString().slice(-4)}`
    setAllPrivacyBatches((prev) => [
      {
        batchId,
        tenantId: activeTenant.id,
        userId: activeUser.id,
        deviceId: 'dev-m4-pro',
        deviceName: 'Aria MacBook Pro 16" (M4 Max)',
        source: kind === 'terminal_category' ? 'terminal' : 'vscode',
        receivedAtUtc: nowIso,
        retentionExpiresInDays: 90,
        eventCount: 1,
        suppressedByDenylistCount: 0,
        blockedSurveillanceKeysCount: 0,
        rawPayloadJson: {
          batch_id: batchId,
          schema_version: 1,
          source: kind === 'terminal_category' ? 'terminal' : 'vscode',
          consent_policy_version: activeTenant.policyVersion,
          events: [
            {
              event_id: newArtifact.externalId,
              event_type: newArtifact.sourceType,
              occurred_at_utc: nowIso,
              metadata: newArtifact.metadata,
            },
          ],
        },
      },
      ...prev,
    ])

    return {
      ok: true,
      message: `Recorded ${newArtifact.summaryTitle} and logged raw envelope in Local Privacy Audit View.`,
    }
  }

  function toggleIntegrationConnection(integrationId: string) {
    setAllIntegrations((prev) =>
      prev.map((int) =>
        int.id === integrationId
          ? {
              ...int,
              status: int.status === 'connected' ? 'disconnected' : 'connected',
              lastSyncedAt: new Date().toISOString(),
            }
          : int
      )
    )
  }

  function simulateWebhookDelivery(input: {
    provider: 'github' | 'gitlab'
    deliveryId: string
    eventType: 'push' | 'pull_request' | 'pull_request_review' | 'check_suite'
    taskId: string
    externalId: string
    summaryTitle: string
    isRetrospective: boolean
    tamperSignature?: boolean
  }) {
    const targetTask = tasks.find((t) => t.id === input.taskId) ?? tasks[0]
    const cleanDeliveryId = input.deliveryId.trim() || `gh-del-${Date.now()}`
    const signatureVerified = !input.tamperSignature

    if (!signatureVerified) {
      const rejectedReceipt: WebhookReceiptRecord = {
        id: `wh-rej-${Date.now()}`,
        tenantId: activeTenant.id,
        provider: input.provider,
        deliveryId: cleanDeliveryId,
        eventType: input.eventType,
        signatureVerified: false,
        payloadSha256: 'invalid_hmac_signature_rejected_by_edge_function',
        deliveryAttemptCount: 1,
        status: 'rejected_signature',
        summary: `Rejected ${input.provider} webhook (${cleanDeliveryId}): X-Hub-Signature-256 mismatch`,
        receivedAtUtc: new Date().toISOString(),
      }
      setAllWebhookReceipts((prev) => [rejectedReceipt, ...prev])
      return {
        accepted: false,
        deduplicated: false,
        deliveryAttemptCount: 1,
        message: 'Rejected: HMAC-SHA256 signature verification failed (HTTP 401).',
      }
    }

    const existingReceipt = allWebhookReceipts.find(
      (r) => r.provider === input.provider && r.deliveryId === cleanDeliveryId
    )

    if (existingReceipt) {
      const nextCount = existingReceipt.deliveryAttemptCount + 1
      setAllWebhookReceipts((prev) =>
        prev.map((r) =>
          r.id === existingReceipt.id
            ? {
                ...r,
                deliveryAttemptCount: nextCount,
                status: 'duplicate_ignored',
                summary: `Replayed ${nextCount}x (${cleanDeliveryId}) — deduplicated to 1 canonical artifact (${existingReceipt.createdArtifactId})`,
              }
            : r
        )
      )
      return {
        accepted: true,
        deduplicated: true,
        deliveryAttemptCount: nextCount,
        message: `Idempotent Replay Verified (Section 5.5): Delivery "${cleanDeliveryId}" received ${nextCount} times -> 0 duplicate artifacts created.`,
      }
    }

    const sourceType: Phase2ArtifactSourceType =
      input.provider === 'gitlab'
        ? 'gitlab_mr'
        : input.eventType === 'push'
          ? 'github_commit'
          : input.eventType === 'pull_request'
            ? 'github_pr'
            : input.eventType === 'pull_request_review'
              ? 'github_review'
              : 'github_ci'

    const linkType: ArtifactLinkType = input.isRetrospective
      ? 'retrospective_outcome'
      : 'contemporaneous'

    // Check if an artifact with same externalId already exists in tenant
    const existingArt = allArtifacts.find(
      (a) =>
        a.tenantId === activeTenant.id &&
        a.sourceType === sourceType &&
        a.externalId === input.externalId
    )

    const artifactId = existingArt?.id ?? `art-wh-${Date.now()}`
    if (!existingArt && targetTask) {
      const newArtifact: Phase2EvidenceArtifact = {
        id: artifactId,
        tenantId: activeTenant.id,
        projectId: targetTask.projectId,
        taskId: targetTask.id,
        taskCode: targetTask.code,
        workDate: '2026-11-11',
        minuteOfDay: 765,
        sourceType,
        captureMode: 'webhook',
        externalId: input.externalId,
        occurredAtUtc: new Date().toISOString(),
        actorName: activeUser.name,
        summaryTitle: input.summaryTitle,
        linkType,
        linkConfidence: input.isRetrospective ? 0.88 : 0.97,
        linkRationale: input.isRetrospective
          ? `Linked as retrospective deliverable outcome to ${targetTask.code} without inflating earlier session hours (Section 5.5 & R-05)`
          : `Matched ${targetTask.code} in verified ${input.provider} ${input.eventType} webhook`,
        confirmedByUser: true,
        overriddenByUser: false,
        reliabilityStatus: 'verified_webhook',
        metadata: {
          delivery_id: cleanDeliveryId,
          event_type: input.eventType,
          retrospective: input.isRetrospective,
        },
      }
      setAllArtifacts((prev) => [newArtifact, ...prev])
    }

    const newReceipt: WebhookReceiptRecord = {
      id: `wh-${Date.now()}`,
      tenantId: activeTenant.id,
      provider: input.provider,
      deliveryId: cleanDeliveryId,
      eventType: input.eventType,
      signatureVerified: true,
      payloadSha256: 'sha256_verified_' + cleanDeliveryId,
      deliveryAttemptCount: 1,
      status: 'processed',
      createdArtifactId: artifactId,
      summary: `${input.summaryTitle} -> created canonical artifact (${artifactId})`,
      receivedAtUtc: new Date().toISOString(),
    }
    setAllWebhookReceipts((prev) => [newReceipt, ...prev])

    if (targetTask) {
      void ingestWebhookViaPrisma({
        tenantId: activeTenant.id,
        projectId: targetTask.projectId,
        taskId: targetTask.id,
        provider: input.provider,
        deliveryId: cleanDeliveryId,
        eventType: input.eventType,
        signatureVerified: true,
        payloadSha256: newReceipt.payloadSha256,
        sourceType,
        externalId: input.externalId,
        summaryTitle: input.summaryTitle,
        metadata: { retrospective: input.isRetrospective },
        linkType,
        linkRationale: `Webhook ${cleanDeliveryId}`,
        actorUserId: activeUser.id,
      })
    }

    return {
      accepted: true,
      deduplicated: Boolean(existingArt),
      deliveryAttemptCount: 1,
      message: `Webhook "${cleanDeliveryId}" HMAC-verified & linked to ${targetTask?.code ?? 'task'} as ${linkType}.`,
    }
  }

  function updateDeviceChannel(
    deviceId: string,
    channel: EnrolledDeviceRecord['updateChannel']
  ) {
    setAllDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, updateChannel: channel } : d))
    )
  }

  function simulateDeviceClockAnomaly(deviceId: string, driftSeconds: number) {
    setAllDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              lastClockDriftSeconds: driftSeconds,
              clockAnomalyDetected: Math.abs(driftSeconds) > 120,
              lastSeenAt: new Date().toISOString(),
            }
          : d
      )
    )
  }

  function toggleDeviceRevocation(deviceId: string) {
    setAllDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              revokedAt: d.revokedAt ? null : new Date().toISOString(),
            }
          : d
      )
    )
  }

  function togglePrivacyPause() {
    setPrivacyPauseActive((prev) => !prev)
  }

  function addPrivacyExclusion(
    pattern: string,
    exclusionType: LocalPrivacyExclusionItem['exclusionType'],
    reason: string
  ) {
    if (!pattern.trim()) return
    const item: LocalPrivacyExclusionItem = {
      id: `excl-${Date.now()}`,
      tenantId: activeTenant.id,
      userId: activeUser.id,
      pattern: pattern.trim(),
      exclusionType,
      reason: reason.trim() || 'Developer local privacy exclusion (F2-005)',
      createdAt: new Date().toISOString(),
    }
    setAllExclusions((prev) => [item, ...prev])
  }

  function removePrivacyExclusion(id: string) {
    setAllExclusions((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <Phase2StoreContext.Provider
      value={{
        activityRollups,
        reconcileObservationGap,
        evidenceArtifacts,
        relinkEvidenceArtifact,
        confirmEvidenceArtifactLink,
        sessionAnnotations,
        addSessionAnnotation,
        ideMappings,
        confirmOrOverrideIdeMapping,
        emitSimulatedIdeTelemetry,
        integrations,
        toggleIntegrationConnection,
        webhookReceipts,
        simulateWebhookDelivery,
        devices,
        updateDeviceChannel,
        simulateDeviceClockAnomaly,
        toggleDeviceRevocation,
        privacyExclusions,
        privacyPauseActive,
        togglePrivacyPause,
        addPrivacyExclusion,
        removePrivacyExclusion,
        privacyAuditBatches,
      }}
    >
      {children}
    </Phase2StoreContext.Provider>
  )
}

export function usePhase2Store(): Phase2StoreContextValue {
  const ctx = useContext(Phase2StoreContext)
  if (!ctx) {
    throw new Error('usePhase2Store must be used inside Phase2StoreProvider')
  }
  return ctx
}

