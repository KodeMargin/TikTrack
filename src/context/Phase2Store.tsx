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
  addPrivacyExclusionViaPrisma,
  createSessionAnnotationViaPrisma,
  ingestWebhookViaPrisma,
  reconcileGapViaPrisma,
  recordAuditViaPrisma,
  removePrivacyExclusionViaPrisma,
  toggleDeviceRevocationViaPrisma,
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

const Phase2StoreContext = createContext<Phase2StoreContextValue | null>(null)

export function Phase2StoreProvider({ children }: { children: ReactNode }) {
  const { activeTenant, activeUser, tasks, phase2Bootstrap } = usePhase1Store()

  const [syncedBootstrap, setSyncedBootstrap] = useState(phase2Bootstrap)
  const [allRollups, setAllRollups] = useState<ActivityRollupBucket[]>(
    () => phase2Bootstrap?.activityRollups ?? []
  )
  const [allArtifacts, setAllArtifacts] = useState<Phase2EvidenceArtifact[]>(
    () => phase2Bootstrap?.evidenceArtifacts ?? []
  )
  const [allAnnotations, setAllAnnotations] = useState<SessionAnnotationItem[]>(
    () => phase2Bootstrap?.sessionAnnotations ?? []
  )
  const [allIdeMappings, setAllIdeMappings] = useState<IdeWorkspaceMappingRecord[]>(
    () => phase2Bootstrap?.ideMappings ?? []
  )
  const [allIntegrations, setAllIntegrations] = useState<ConnectedIntegrationRecord[]>(
    () => phase2Bootstrap?.integrations ?? []
  )
  const [allWebhookReceipts, setAllWebhookReceipts] = useState<WebhookReceiptRecord[]>(
    () => phase2Bootstrap?.webhookReceipts ?? []
  )
  const [allDevices, setAllDevices] = useState<EnrolledDeviceRecord[]>(
    () => phase2Bootstrap?.devices ?? []
  )
  const [allExclusions, setAllExclusions] = useState<LocalPrivacyExclusionItem[]>(
    () => phase2Bootstrap?.privacyExclusions ?? []
  )
  const [privacyPauseActive, setPrivacyPauseActive] = useState(false)
  const [allPrivacyBatches, setAllPrivacyBatches] = useState<LocalPrivacyAuditBatch[]>(
    () => phase2Bootstrap?.privacyAuditBatches ?? []
  )

  if (phase2Bootstrap !== syncedBootstrap) {
    setSyncedBootstrap(phase2Bootstrap)
    setAllRollups(phase2Bootstrap?.activityRollups ?? [])
    setAllArtifacts(phase2Bootstrap?.evidenceArtifacts ?? [])
    setAllAnnotations(phase2Bootstrap?.sessionAnnotations ?? [])
    setAllIdeMappings(phase2Bootstrap?.ideMappings ?? [])
    setAllIntegrations(phase2Bootstrap?.integrations ?? [])
    setAllWebhookReceipts(phase2Bootstrap?.webhookReceipts ?? [])
    setAllDevices(phase2Bootstrap?.devices ?? [])
    setAllExclusions(phase2Bootstrap?.privacyExclusions ?? [])
    setAllPrivacyBatches(phase2Bootstrap?.privacyAuditBatches ?? [])
  }

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
    void reconcileGapViaPrisma({
      rollupId: bucketId,
      choice,
      note: note.trim() || `Reconciled as ${choice}`,
    })
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
    if (!targetTask && !input.tamperSignature) {
      return {
        accepted: false,
        deduplicated: false,
        deliveryAttemptCount: 1,
        message: 'Create a project and task in this workspace before linking verified webhook deliverables.',
      }
    }
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
    const target = allDevices.find((d) => d.id === deviceId)
    const nextRevoked = !(target?.revokedAt)
    setAllDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              revokedAt: nextRevoked ? new Date().toISOString() : null,
            }
          : d
      )
    )
    void toggleDeviceRevocationViaPrisma({ deviceId, revoked: nextRevoked })
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
    const tempId = `excl-${Date.now()}`
    const cleanReason = reason.trim() || 'Developer local privacy exclusion (F2-005)'
    const item: LocalPrivacyExclusionItem = {
      id: tempId,
      tenantId: activeTenant.id,
      userId: activeUser.id,
      pattern: pattern.trim(),
      exclusionType,
      reason: cleanReason,
      createdAt: new Date().toISOString(),
    }
    setAllExclusions((prev) => [item, ...prev])
    void addPrivacyExclusionViaPrisma({
      tenantId: activeTenant.id,
      userId: activeUser.id,
      exclusionPattern: pattern.trim(),
      exclusionType,
      reason: cleanReason,
    }).then((res) => {
      if (res?.ok && res.id) {
        setAllExclusions((prev) =>
          prev.map((e) => (e.id === tempId ? { ...e, id: res.id! } : e))
        )
      }
    })
  }

  function removePrivacyExclusion(id: string) {
    setAllExclusions((prev) => prev.filter((e) => e.id !== id))
    void removePrivacyExclusionViaPrisma({ id })
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

