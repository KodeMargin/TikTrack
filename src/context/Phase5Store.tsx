/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  AnalyticsWarehouseExportRecord,
  DrExerciseRecord,
  FailoverRegion,
  FleetChannel,
  FleetPlatform,
  FleetReleaseRecord,
  IsolationTier,
  LegalHoldRecord,
  PolicyChangeRequestRecord,
  PrivacyRequestRecord,
  ResidencyRegion,
  RetentionJobRecord,
  RetentionPolicyRecord,
  ScimProvisioningEventRecord,
  SecurityAssessmentRecord,
  SensitiveAccessLogRecord,
  SiemDestinationRecord,
  SiemExportBatchRecord,
  SiemFormat,
  SiemProvider,
  SsoProviderRecord,
  SsoProviderType,
  SupportedLocale,
  TenantAccessibilityConfigRecord,
  TenantResidencyConfigRecord,
  WarehouseSink,
} from '@/types/domain.types'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store } from '@/context/Phase2Store'
import { useTheme } from '@/context/ThemeContext'
import {
  evaluateTwoPersonPolicyApproval,
  generateScimBearerToken,
  validateSsoProviderConfig,
} from '@/lib/phase5/ssoAndGovernance'
import {
  evaluateDsarErasureAllowed,
  formatSanitizedSiemBatch,
  planRetentionSweepWithLegalHolds,
  validateResidencyTransfer,
  type RetentionCandidateEvent,
} from '@/lib/phase5/retentionAndSiem'
import {
  buildWarehouseExportManifest,
  computeSecurityAssessmentScore,
  evaluateDrAndLoadReadiness,
  processQueueBatchWithDlq,
  type QueueMessageEnvelope,
  type QueueWorkerBatchResult,
} from '@/lib/phase5/fleetAndWarehouse'
import { sha256Hex } from '@/lib/phase4/publicApiAndWebhooks'
import {
  createLegalHoldViaPrisma,
  createPrivacyRequestViaPrisma,
  createSiemDestinationViaPrisma,
  createWarehouseExportViaPrisma,
  decidePolicyChangeSecondViaPrisma,
  proposePolicyChangeViaPrisma,
  publishFleetReleaseViaPrisma,
  recordAuditViaPrisma,
  recordDrExerciseViaPrisma,
  recordRetentionJobViaPrisma,
  recordScimEventViaPrisma,
  recordSiemBatchViaPrisma,
  releaseLegalHoldViaPrisma,
  updateAccessibilityConfigViaPrisma,
  upsertResidencyConfigViaPrisma,
  upsertRetentionPolicyViaPrisma,
  upsertSecurityAssessmentViaPrisma,
  upsertSsoProviderViaPrisma,
} from '@/lib/prismaApiClient'

interface Phase5StoreContextValue {
  ssoProviders: SsoProviderRecord[]
  scimEvents: ScimProvisioningEventRecord[]
  policyChangeRequests: PolicyChangeRequestRecord[]
  sensitiveAccessLogs: SensitiveAccessLogRecord[]
  legalHolds: LegalHoldRecord[]
  retentionPolicies: RetentionPolicyRecord[]
  retentionJobs: RetentionJobRecord[]
  privacyRequests: PrivacyRequestRecord[]
  residencyConfig: TenantResidencyConfigRecord
  siemDestinations: SiemDestinationRecord[]
  siemBatches: SiemExportBatchRecord[]
  fleetReleases: FleetReleaseRecord[]
  warehouseExports: AnalyticsWarehouseExportRecord[]
  drExercises: DrExerciseRecord[]
  securityAssessments: SecurityAssessmentRecord[]
  securityScore: ReturnType<typeof computeSecurityAssessmentScore>
  accessibilityConfig: TenantAccessibilityConfigRecord
  lastWorkerBatch: QueueWorkerBatchResult | null

  configureSsoProvider: (input: {
    providerType: SsoProviderType
    displayName: string
    domain: string
    entityIdOrIssuer: string
    ssoUrl: string
    certificateFingerprint?: string
    clientId?: string
    enforceSso: boolean
    jitDefaultRole: SsoProviderRecord['jitDefaultRole']
    scimEnabled: boolean
  }) => Promise<{ ok: boolean; scimBearerToken?: string; message: string }>

  simulateScimProvisioning: (input: {
    providerId?: string
    action: ScimProvisioningEventRecord['action']
    externalUserId: string
    email: string
    targetRole: string
  }) => { ok: boolean; message: string }

  proposePolicyChange: (input: {
    proposedVersionCode: string
    changeSummary: string
    expandsCollectionScope: boolean
    scopeDiff: Record<string, boolean | string | number>
  }) => { ok: boolean; message: string }

  decidePolicyChangeSecond: (input: {
    requestId: string
    secondApproverUserId: string
    decision: 'approve' | 'reject'
    rejectionReason?: string
  }) => { ok: boolean; message: string }

  placeLegalHold: (input: {
    scopeType: LegalHoldRecord['scopeType']
    targetId: string
    reason: string
  }) => { ok: boolean; message: string }

  releaseLegalHold: (holdId: string) => void

  saveRetentionPolicy: (input: {
    name: string
    rawActivityDays: number
    rollupDays: number
    evidenceArtifactDays: number
    auditLogDays: number
    archiveStorageTier: RetentionPolicyRecord['archiveStorageTier']
  }) => { ok: boolean; message: string }

  runRetentionSweep: () => { ok: boolean; message: string }

  submitPrivacyRequest: (input: {
    requestType: PrivacyRequestRecord['requestType']
    requesterUserId: string
  }) => Promise<{ ok: boolean; message: string }>

  saveResidencyConfig: (input: {
    primaryRegion: ResidencyRegion
    failoverRegion: FailoverRegion
    dataResidencyLocked: boolean
    isolationTier: IsolationTier
    encryptionKeyMode: 'platform_kms' | 'byok_kms'
    kmsKeyArnMasked?: string
    dedicatedWorkerPool: boolean
    egressAllowlistCidrs: string[]
  }) => { ok: boolean; message: string }

  testResidencyTransfer: (targetRegion: ResidencyRegion) => { allowed: boolean; message: string }

  createSiemDestination: (input: {
    name: string
    provider: SiemProvider
    endpointUrl: string
    authToken: string
    format: SiemFormat
    includeCategories: string[]
  }) => Promise<{ ok: boolean; message: string }>

  dispatchSiemExportBatch: (destinationId: string) => Promise<{ ok: boolean; message: string }>

  publishFleetRelease: (input: {
    version: string
    platform: FleetPlatform
    channel: FleetChannel
    notarizationStatus: FleetReleaseRecord['notarizationStatus']
    rolloutPercentage: number
    releaseNotes: string
  }) => Promise<{ ok: boolean; message: string }>

  triggerWarehouseExport: (input: {
    targetSink: WarehouseSink
    periodStart: string
    periodEnd: string
    rowCount: number
  }) => Promise<{ ok: boolean; message: string }>

  runDetachableQueueWorkerBatch: (simulateFault?: boolean) => QueueWorkerBatchResult

  recordDrExercise: (input: {
    exerciseType: DrExerciseRecord['exerciseType']
    targetRpoMinutes: number
    measuredRpoMinutes: number
    targetRtoMinutes: number
    measuredRtoMinutes: number
    p95CrudMs: number
    simulatedConcurrentDevs: number
    findingsSummary: string
  }) => { ok: boolean; passed: boolean; message: string }

  addSecurityAssessment: (input: {
    assessmentName: string
    assessorFirm: string
    assessmentType: SecurityAssessmentRecord['assessmentType']
    status: SecurityAssessmentRecord['status']
    criticalFindings: number
    highFindings: number
    remediatedFindings: number
  }) => Promise<{ ok: boolean; message: string }>

  saveAccessibilityConfig: (input: {
    defaultLocale: SupportedLocale
    highContrastMode: boolean
    keyboardShortcutsEnabled: boolean
    wcagTargetLevel: 'AA' | 'AAA'
  }) => void
}

const Phase5StoreContext = createContext<Phase5StoreContextValue | null>(null)

export function Phase5StoreProvider({ children }: { children: ReactNode }) {
  const {
    activeTenant,
    activeUser,
    members,
    timesheetLines,
    auditLogs,
    phase5Bootstrap,
  } = usePhase1Store()
  const { activityRollups } = usePhase2Store()
  const { setHighContrast, setLocale } = useTheme()

  const [localSsoProviders, setLocalSsoProviders] = useState<SsoProviderRecord[]>([])
  const [localScimEvents, setLocalScimEvents] = useState<ScimProvisioningEventRecord[]>([])
  const [localPolicyRequests, setLocalPolicyRequests] = useState<PolicyChangeRequestRecord[]>([])
  const [localSensitiveLogs, setLocalSensitiveLogs] = useState<SensitiveAccessLogRecord[]>([])
  const [localLegalHolds, setLocalLegalHolds] = useState<LegalHoldRecord[]>([])
  const [localRetentionPolicies, setLocalRetentionPolicies] = useState<RetentionPolicyRecord[]>([])
  const [localRetentionJobs, setLocalRetentionJobs] = useState<RetentionJobRecord[]>([])
  const [localPrivacyRequests, setLocalPrivacyRequests] = useState<PrivacyRequestRecord[]>([])
  const [localResidencyByTenant, setLocalResidencyByTenant] = useState<
    Record<string, TenantResidencyConfigRecord>
  >({})
  const [localSiemDestinations, setLocalSiemDestinations] = useState<SiemDestinationRecord[]>([])
  const [localSiemBatches, setLocalSiemBatches] = useState<SiemExportBatchRecord[]>([])
  const [localFleetReleases, setLocalFleetReleases] = useState<FleetReleaseRecord[]>([])
  const [localWarehouseExports, setLocalWarehouseExports] = useState<
    AnalyticsWarehouseExportRecord[]
  >([])
  const [localDrExercises, setLocalDrExercises] = useState<DrExerciseRecord[]>([])
  const [localSecurityAssessments, setLocalSecurityAssessments] = useState<
    SecurityAssessmentRecord[]
  >([])
  const [localA11yByTenant, setLocalA11yByTenant] = useState<
    Record<string, TenantAccessibilityConfigRecord>
  >({})
  const [lastWorkerBatch, setLastWorkerBatch] = useState<QueueWorkerBatchResult | null>(null)

  const ssoProviders = useMemo(() => {
    const map = new Map<string, SsoProviderRecord>()
    for (const p of phase5Bootstrap?.ssoProviders ?? []) {
      if (p.tenantId === activeTenant.id) map.set(p.domain, p)
    }
    for (const p of localSsoProviders) {
      if (p.tenantId === activeTenant.id) map.set(p.domain, p)
    }
    return Array.from(map.values())
  }, [phase5Bootstrap, localSsoProviders, activeTenant.id])

  const scimEvents = useMemo(() => {
    const map = new Map<string, ScimProvisioningEventRecord>()
    for (const e of phase5Bootstrap?.scimEvents ?? []) {
      if (e.tenantId === activeTenant.id) map.set(e.id, e)
    }
    for (const e of localScimEvents) {
      if (e.tenantId === activeTenant.id) map.set(e.id, e)
    }
    return Array.from(map.values()).sort((a, b) =>
      b.occurredAtUtc.localeCompare(a.occurredAtUtc)
    )
  }, [phase5Bootstrap, localScimEvents, activeTenant.id])

  const policyChangeRequests = useMemo(() => {
    const map = new Map<string, PolicyChangeRequestRecord>()
    for (const r of phase5Bootstrap?.policyChangeRequests ?? []) {
      if (r.tenantId === activeTenant.id) map.set(r.id, r)
    }
    for (const r of localPolicyRequests) {
      if (r.tenantId === activeTenant.id) map.set(r.id, r)
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [phase5Bootstrap, localPolicyRequests, activeTenant.id])

  const sensitiveAccessLogs = useMemo(() => {
    const map = new Map<string, SensitiveAccessLogRecord>()
    for (const l of phase5Bootstrap?.sensitiveAccessLogs ?? []) {
      if (l.tenantId === activeTenant.id) map.set(l.id, l)
    }
    for (const l of localSensitiveLogs) {
      if (l.tenantId === activeTenant.id) map.set(l.id, l)
    }
    return Array.from(map.values()).sort((a, b) =>
      b.occurredAtUtc.localeCompare(a.occurredAtUtc)
    )
  }, [phase5Bootstrap, localSensitiveLogs, activeTenant.id])

  const legalHolds = useMemo(() => {
    const map = new Map<string, LegalHoldRecord>()
    for (const h of phase5Bootstrap?.legalHolds ?? []) {
      if (h.tenantId === activeTenant.id) map.set(h.id, h)
    }
    for (const h of localLegalHolds) {
      if (h.tenantId === activeTenant.id) map.set(h.id, h)
    }
    return Array.from(map.values()).sort((a, b) => b.placedAt.localeCompare(a.placedAt))
  }, [phase5Bootstrap, localLegalHolds, activeTenant.id])

  const retentionPolicies = useMemo(() => {
    const map = new Map<string, RetentionPolicyRecord>()
    for (const rp of phase5Bootstrap?.retentionPolicies ?? []) {
      if (rp.tenantId === activeTenant.id) map.set(rp.name, rp)
    }
    for (const rp of localRetentionPolicies) {
      if (rp.tenantId === activeTenant.id) map.set(rp.name, rp)
    }
    return Array.from(map.values())
  }, [phase5Bootstrap, localRetentionPolicies, activeTenant.id])

  const retentionJobs = useMemo(() => {
    const map = new Map<string, RetentionJobRecord>()
    for (const rj of phase5Bootstrap?.retentionJobs ?? []) {
      if (rj.tenantId === activeTenant.id) map.set(rj.id, rj)
    }
    for (const rj of localRetentionJobs) {
      if (rj.tenantId === activeTenant.id) map.set(rj.id, rj)
    }
    return Array.from(map.values()).sort((a, b) =>
      b.executedAtUtc.localeCompare(a.executedAtUtc)
    )
  }, [phase5Bootstrap, localRetentionJobs, activeTenant.id])

  const privacyRequests = useMemo(() => {
    const map = new Map<string, PrivacyRequestRecord>()
    for (const pr of phase5Bootstrap?.privacyRequests ?? []) {
      if (pr.tenantId === activeTenant.id) map.set(pr.id, pr)
    }
    for (const pr of localPrivacyRequests) {
      if (pr.tenantId === activeTenant.id) map.set(pr.id, pr)
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [phase5Bootstrap, localPrivacyRequests, activeTenant.id])

  const residencyConfig = useMemo<TenantResidencyConfigRecord>(() => {
    if (localResidencyByTenant[activeTenant.id]) return localResidencyByTenant[activeTenant.id]
    const dbMatch = (phase5Bootstrap?.residencyConfigs ?? []).find(
      (r) => r.tenantId === activeTenant.id
    )
    if (dbMatch) return dbMatch
    return {
      tenantId: activeTenant.id,
      primaryRegion: 'us-east-1',
      failoverRegion: 'us-west-2',
      dataResidencyLocked: false,
      isolationTier: 'shared_rls',
      encryptionKeyMode: 'platform_kms',
      dedicatedWorkerPool: false,
      egressAllowlistCidrs: [],
      updatedAt: new Date().toISOString(),
    }
  }, [localResidencyByTenant, phase5Bootstrap, activeTenant.id])

  const siemDestinations = useMemo(() => {
    const map = new Map<string, SiemDestinationRecord>()
    for (const d of phase5Bootstrap?.siemDestinations ?? []) {
      if (d.tenantId === activeTenant.id) map.set(d.id, d)
    }
    for (const d of localSiemDestinations) {
      if (d.tenantId === activeTenant.id) map.set(d.id, d)
    }
    return Array.from(map.values())
  }, [phase5Bootstrap, localSiemDestinations, activeTenant.id])

  const siemBatches = useMemo(() => {
    const map = new Map<string, SiemExportBatchRecord>()
    for (const b of phase5Bootstrap?.siemBatches ?? []) {
      if (b.tenantId === activeTenant.id) map.set(b.id, b)
    }
    for (const b of localSiemBatches) {
      if (b.tenantId === activeTenant.id) map.set(b.id, b)
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [phase5Bootstrap, localSiemBatches, activeTenant.id])

  const fleetReleases = useMemo(() => {
    const map = new Map<string, FleetReleaseRecord>()
    for (const f of phase5Bootstrap?.fleetReleases ?? []) {
      if (f.tenantId === activeTenant.id) map.set(`${f.platform}:${f.version}`, f)
    }
    for (const f of localFleetReleases) {
      if (f.tenantId === activeTenant.id) map.set(`${f.platform}:${f.version}`, f)
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [phase5Bootstrap, localFleetReleases, activeTenant.id])

  const warehouseExports = useMemo(() => {
    const map = new Map<string, AnalyticsWarehouseExportRecord>()
    for (const w of phase5Bootstrap?.warehouseExports ?? []) {
      if (w.tenantId === activeTenant.id) map.set(w.id, w)
    }
    for (const w of localWarehouseExports) {
      if (w.tenantId === activeTenant.id) map.set(w.id, w)
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [phase5Bootstrap, localWarehouseExports, activeTenant.id])

  const drExercises = useMemo(() => {
    const map = new Map<string, DrExerciseRecord>()
    for (const d of phase5Bootstrap?.drExercises ?? []) {
      if (d.tenantId === activeTenant.id) map.set(d.id, d)
    }
    for (const d of localDrExercises) {
      if (d.tenantId === activeTenant.id) map.set(d.id, d)
    }
    return Array.from(map.values()).sort((a, b) => b.conductedAt.localeCompare(a.conductedAt))
  }, [phase5Bootstrap, localDrExercises, activeTenant.id])

  const securityAssessments = useMemo(() => {
    const map = new Map<string, SecurityAssessmentRecord>()
    for (const s of phase5Bootstrap?.securityAssessments ?? []) {
      if (s.tenantId === activeTenant.id) map.set(s.id, s)
    }
    for (const s of localSecurityAssessments) {
      if (s.tenantId === activeTenant.id) map.set(s.id, s)
    }
    return Array.from(map.values()).sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))
  }, [phase5Bootstrap, localSecurityAssessments, activeTenant.id])

  const securityScore = useMemo(
    () => computeSecurityAssessmentScore(securityAssessments),
    [securityAssessments]
  )

  const accessibilityConfig = useMemo<TenantAccessibilityConfigRecord>(() => {
    if (localA11yByTenant[activeTenant.id]) return localA11yByTenant[activeTenant.id]
    const dbMatch = (phase5Bootstrap?.accessibilityConfigs ?? []).find(
      (a) => a.tenantId === activeTenant.id
    )
    if (dbMatch) return dbMatch
    return {
      tenantId: activeTenant.id,
      defaultLocale: 'en-US',
      highContrastMode: false,
      keyboardShortcutsEnabled: true,
      wcagTargetLevel: 'AA',
      updatedAt: new Date().toISOString(),
    }
  }, [localA11yByTenant, phase5Bootstrap, activeTenant.id])

  function appendSensitiveLog(
    actionCategory: SensitiveAccessLogRecord['actionCategory'],
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown> = {}
  ) {
    const entry: SensitiveAccessLogRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      actorUserId: activeUser.id,
      actorName: activeUser.name,
      actionCategory,
      resourceType,
      resourceId,
      ipAddressMasked: '192.0.2.0/24',
      correlationId: `cor-${crypto.randomUUID().slice(0, 8)}`,
      metadata,
      occurredAtUtc: new Date().toISOString(),
    }
    setLocalSensitiveLogs((prev) => [entry, ...prev])
  }

  async function configureSsoProvider(input: {
    providerType: SsoProviderType
    displayName: string
    domain: string
    entityIdOrIssuer: string
    ssoUrl: string
    certificateFingerprint?: string
    clientId?: string
    enforceSso: boolean
    jitDefaultRole: SsoProviderRecord['jitDefaultRole']
    scimEnabled: boolean
  }) {
    const check = validateSsoProviderConfig(input)
    if (!check.valid) {
      return { ok: false, message: check.errors[0] }
    }

    let scimTokenPrefix: string | undefined
    let scimTokenHashSha256: string | undefined
    let scimBearerToken: string | undefined

    if (input.scimEnabled) {
      const token = await generateScimBearerToken()
      scimTokenPrefix = token.tokenPrefix
      scimTokenHashSha256 = token.tokenHashSha256
      scimBearerToken = token.plaintextToken
    }

    const rec: SsoProviderRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      providerType: input.providerType,
      displayName: input.displayName.trim(),
      domain: input.domain.trim().toLowerCase(),
      entityIdOrIssuer: input.entityIdOrIssuer.trim(),
      ssoUrl: input.ssoUrl.trim(),
      certificateFingerprint: input.certificateFingerprint?.trim() || undefined,
      clientId: input.clientId?.trim() || undefined,
      enforceSso: input.enforceSso,
      jitDefaultRole: input.jitDefaultRole,
      scimEnabled: input.scimEnabled,
      scimTokenPrefix,
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    setLocalSsoProviders((prev) => [rec, ...prev.filter((p) => p.domain !== rec.domain)])
    appendSensitiveLog('scim_sync', 'sso_providers', rec.id, { domain: rec.domain })
    void recordAuditViaPrisma({
      tenantId: activeTenant.id,
      actorUserId: activeUser.id,
      actionType: 'SSO_PROVIDER_CONFIGURED',
      targetEntity: `sso_providers:${rec.domain}`,
      reason: `Configured ${rec.providerType.toUpperCase()} SSO`,
    })

    void upsertSsoProviderViaPrisma({
      tenantId: activeTenant.id,
      ...input,
      scimTokenPrefix,
      scimTokenHashSha256,
      createdBy: activeUser.id,
    })

    return {
      ok: true,
      scimBearerToken,
      message: `${rec.displayName} (${rec.providerType.toUpperCase()}) activated for ${rec.domain}.`,
    }
  }

  function simulateScimProvisioning(input: {
    providerId?: string
    action: ScimProvisioningEventRecord['action']
    externalUserId: string
    email: string
    targetRole: string
  }) {
    const correlationId = `scim-${crypto.randomUUID().slice(0, 8)}`
    const ev: ScimProvisioningEventRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      providerId: input.providerId,
      action: input.action,
      externalUserId: input.externalUserId.trim(),
      email: input.email.trim().toLowerCase(),
      targetRole: input.targetRole,
      status: 'applied',
      correlationId,
      detailMessage: `SCIM 2.0 ${input.action} applied for ${input.email}`,
      occurredAtUtc: new Date().toISOString(),
    }
    setLocalScimEvents((prev) => [ev, ...prev])
    appendSensitiveLog('scim_sync', 'scim_provisioning_events', ev.id, { action: ev.action })

    void recordScimEventViaPrisma({
      tenantId: activeTenant.id,
      providerId: input.providerId,
      action: input.action,
      externalUserId: ev.externalUserId,
      email: ev.email,
      targetRole: input.targetRole,
      correlationId,
      detailMessage: ev.detailMessage,
    })

    return { ok: true, message: `SCIM ${input.action} applied (${correlationId}).` }
  }

  function proposePolicyChange(input: {
    proposedVersionCode: string
    changeSummary: string
    expandsCollectionScope: boolean
    scopeDiff: Record<string, boolean | string | number>
  }) {
    const effectiveFrom = new Date().toISOString()
    const req: PolicyChangeRequestRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      proposedVersionCode: input.proposedVersionCode.trim(),
      changeSummary: input.changeSummary.trim(),
      scopeDiff: input.scopeDiff,
      expandsCollectionScope: input.expandsCollectionScope,
      status: 'pending_second_approval',
      proposedBy: activeUser.id,
      proposedByName: activeUser.name,
      approvedByFirst: activeUser.id,
      approvedByFirstName: activeUser.name,
      effectiveFrom,
      createdAt: effectiveFrom,
    }
    setLocalPolicyRequests((prev) => [req, ...prev])
    appendSensitiveLog('policy_approval', 'policy_change_requests', req.id, {
      stage: 'proposed_first_signature',
      version: req.proposedVersionCode,
    })

    void proposePolicyChangeViaPrisma({
      tenantId: activeTenant.id,
      proposedVersionCode: req.proposedVersionCode,
      changeSummary: req.changeSummary,
      scopeDiff: input.scopeDiff,
      expandsCollectionScope: input.expandsCollectionScope,
      proposedBy: activeUser.id,
      effectiveFrom,
    })

    return {
      ok: true,
      message: `Proposal ${req.proposedVersionCode} logged with 1st signature (${activeUser.name}). Awaiting distinct 2nd admin approval.`,
    }
  }

  function decidePolicyChangeSecond(input: {
    requestId: string
    secondApproverUserId: string
    decision: 'approve' | 'reject'
    rejectionReason?: string
  }) {
    const req = policyChangeRequests.find((r) => r.id === input.requestId)
    if (!req) return { ok: false, message: 'Policy change request not found.' }
    const secondUser = members.find((m) => m.id === input.secondApproverUserId)
    if (!secondUser) return { ok: false, message: 'Second approver member not found.' }

    if (input.decision === 'approve') {
      const check = evaluateTwoPersonPolicyApproval({
        request: req,
        secondApproverUserId: secondUser.id,
        secondApproverRole: secondUser.role,
      })
      if (!check.allowed) {
        return { ok: false, message: check.reason ?? 'Two-person approval failed.' }
      }

      const resolvedAt = check.nonRetroactiveEffectiveFrom
      setLocalPolicyRequests((prev) =>
        prev.map((r) =>
          r.id === req.id
            ? {
                ...r,
                status: 'approved_activated',
                approvedBySecond: secondUser.id,
                approvedBySecondName: secondUser.name,
                effectiveFrom: resolvedAt,
                resolvedAt,
              }
            : r
        )
      )
      appendSensitiveLog('policy_approval', 'policy_change_requests', req.id, {
        stage: 'second_approved_activated',
        secondApprover: secondUser.name,
        nonRetroactiveEffectiveFrom: resolvedAt,
      })
      void recordAuditViaPrisma({
        tenantId: activeTenant.id,
        actorUserId: secondUser.id,
        actionType: 'TWO_PERSON_POLICY_ACTIVATED',
        targetEntity: `policy_versions:${req.proposedVersionCode}`,
        reason: `Co-approved by ${req.approvedByFirstName ?? 'Admin 1'} + ${secondUser.name} (non-retroactive)`,
      })
    } else {
      if (secondUser.id === req.proposedBy || secondUser.id === req.approvedByFirst) {
        return {
          ok: false,
          message: 'Two-person control: a distinct administrator must sign the rejection.',
        }
      }
      const resolvedAt = new Date().toISOString()
      setLocalPolicyRequests((prev) =>
        prev.map((r) =>
          r.id === req.id
            ? {
                ...r,
                status: 'rejected',
                approvedBySecond: secondUser.id,
                approvedBySecondName: secondUser.name,
                rejectionReason: input.rejectionReason ?? 'Rejected in dual-control review.',
                resolvedAt,
              }
            : r
        )
      )
    }

    void decidePolicyChangeSecondViaPrisma({
      tenantId: activeTenant.id,
      requestId: req.id,
      secondApproverId: secondUser.id,
      decision: input.decision,
      rejectionReason: input.rejectionReason,
    })

    return {
      ok: true,
      message:
        input.decision === 'approve'
          ? `Policy ${req.proposedVersionCode} co-approved by ${secondUser.name} and activated prospectively.`
          : `Policy ${req.proposedVersionCode} rejected by ${secondUser.name}.`,
    }
  }

  function placeLegalHold(input: {
    scopeType: LegalHoldRecord['scopeType']
    targetId: string
    reason: string
  }) {
    if (input.reason.trim().length < 5) {
      return { ok: false, message: 'Legal hold reason must be at least 5 characters.' }
    }
    const hold: LegalHoldRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      scopeType: input.scopeType,
      targetId: input.targetId.trim() || activeTenant.id,
      reason: input.reason.trim(),
      holdStatus: 'active',
      placedBy: activeUser.id,
      placedAt: new Date().toISOString(),
    }
    setLocalLegalHolds((prev) => [hold, ...prev])
    appendSensitiveLog('legal_hold_change', 'legal_holds', hold.id, {
      scopeType: hold.scopeType,
      action: 'placed',
    })
    void createLegalHoldViaPrisma({
      tenantId: activeTenant.id,
      scopeType: hold.scopeType,
      targetId: hold.targetId,
      reason: hold.reason,
      placedBy: activeUser.id,
    })
    return { ok: true, message: `Active legal hold placed (${hold.scopeType}).` }
  }

  function releaseLegalHold(holdId: string) {
    const now = new Date().toISOString()
    setLocalLegalHolds((prev) =>
      prev.map((h) =>
        h.id === holdId
          ? { ...h, holdStatus: 'released', releasedBy: activeUser.id, releasedAt: now }
          : h
      )
    )
    appendSensitiveLog('legal_hold_change', 'legal_holds', holdId, { action: 'released' })
    void releaseLegalHoldViaPrisma({
      tenantId: activeTenant.id,
      holdId,
      releasedBy: activeUser.id,
    })
  }

  function saveRetentionPolicy(input: {
    name: string
    rawActivityDays: number
    rollupDays: number
    evidenceArtifactDays: number
    auditLogDays: number
    archiveStorageTier: RetentionPolicyRecord['archiveStorageTier']
  }) {
    const policy: RetentionPolicyRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      name: input.name.trim(),
      rawActivityDays: input.rawActivityDays,
      rollupDays: input.rollupDays,
      evidenceArtifactDays: input.evidenceArtifactDays,
      auditLogDays: input.auditLogDays,
      archiveStorageTier: input.archiveStorageTier,
      isActive: true,
      createdAt: new Date().toISOString(),
    }
    setLocalRetentionPolicies((prev) => [policy, ...prev.filter((p) => p.name !== policy.name)])
    void upsertRetentionPolicyViaPrisma({
      tenantId: activeTenant.id,
      ...input,
      createdBy: activeUser.id,
    })
    return { ok: true, message: `Retention policy '${policy.name}' saved.` }
  }

  function runRetentionSweep() {
    const activePolicy: RetentionPolicyRecord = retentionPolicies[0] ?? {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      name: 'Default 90d Raw Retention',
      rawActivityDays: 90,
      rollupDays: 365,
      evidenceArtifactDays: 730,
      auditLogDays: 2555,
      archiveStorageTier: 'supabase_cold',
      isActive: true,
      createdAt: new Date().toISOString(),
    }

    const oldTimestamp = new Date(Date.now() - (activePolicy.rawActivityDays + 15) * 86_400_000).toISOString()
    const candidates: RetentionCandidateEvent[] =
      activityRollups.length > 0
        ? activityRollups.map((r) => ({
            eventId: r.id,
            userId: activeUser.id,
            occurredAtUtc: oldTimestamp,
          }))
        : [
            {
              eventId: crypto.randomUUID(),
              userId: activeUser.id,
              occurredAtUtc: oldTimestamp,
            },
          ]

    const plan = planRetentionSweepWithLegalHolds({
      tenantId: activeTenant.id,
      policy: activePolicy,
      legalHolds,
      candidates,
    })

    const job: RetentionJobRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      policyId: activePolicy.id,
      jobType: 'purge_raw_events',
      status: plan.jobStatus,
      scannedCount: plan.scannedCount,
      purgedCount: plan.eligiblePurgeIds.length,
      skippedLegalHoldCount: plan.skippedLegalHoldIds.length,
      archivedBundleUri: `cold://devproof-archive/${activeTenant.id}/${Date.now()}.ndjson.gz`,
      executedAtUtc: new Date().toISOString(),
    }
    setLocalRetentionJobs((prev) => [job, ...prev])
    appendSensitiveLog('retention_run', 'retention_jobs', job.id, {
      scannedCount: job.scannedCount,
      purgedCount: job.purgedCount,
      skippedLegalHoldCount: job.skippedLegalHoldCount,
      status: job.status,
    })

    void recordRetentionJobViaPrisma({
      tenantId: activeTenant.id,
      policyId: activePolicy.id,
      jobType: 'purge_raw_events',
      status: job.status === 'partial_legal_hold' ? 'partial_legal_hold' : 'completed',
      scannedCount: job.scannedCount,
      purgedCount: job.purgedCount,
      skippedLegalHoldCount: job.skippedLegalHoldCount,
      archivedBundleUri: job.archivedBundleUri,
      executedBy: activeUser.id,
    })

    return {
      ok: true,
      message:
        job.skippedLegalHoldCount > 0
          ? `Retention sweep paused/skipped ${job.skippedLegalHoldCount} records under active legal hold.`
          : `Retention sweep completed: ${job.purgedCount} expired records archived & purged.`,
    }
  }

  async function submitPrivacyRequest(input: {
    requestType: PrivacyRequestRecord['requestType']
    requesterUserId: string
  }) {
    const requester = members.find((m) => m.id === input.requesterUserId) ?? activeUser
    let status: PrivacyRequestRecord['status'] = 'completed'
    let legalHoldBlocked = false
    let resolutionNote = 'DSAR package generated and hashed.'
    let exportDigestSha256: string | undefined

    if (input.requestType === 'erasure') {
      const check = evaluateDsarErasureAllowed({
        tenantId: activeTenant.id,
        userId: requester.id,
        legalHolds,
      })
      if (!check.allowed) {
        status = 'blocked_legal_hold'
        legalHoldBlocked = true
        resolutionNote = check.blockingHoldReason ?? 'Blocked by active legal hold.'
      } else {
        resolutionNote = 'Erasure queued outside active legal holds; immutable invoice snapshots preserved.'
      }
    } else if (input.requestType === 'export') {
      exportDigestSha256 = await sha256Hex(
        JSON.stringify({
          tenantId: activeTenant.id,
          userId: requester.id,
          generatedAt: new Date().toISOString(),
        })
      )
    }

    const req: PrivacyRequestRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      requesterUserId: requester.id,
      requesterName: requester.name,
      requestType: input.requestType,
      status,
      legalHoldBlocked,
      exportDigestSha256,
      resolutionNote,
      createdAt: new Date().toISOString(),
      resolvedAt: status === 'completed' ? new Date().toISOString() : undefined,
    }
    setLocalPrivacyRequests((prev) => [req, ...prev])
    appendSensitiveLog('dsar_request', 'privacy_requests', req.id, {
      requestType: req.requestType,
      status: req.status,
    })

    void createPrivacyRequestViaPrisma({
      tenantId: activeTenant.id,
      requesterUserId: requester.id,
      requestType: req.requestType,
      status: req.status === 'blocked_legal_hold' ? 'blocked_legal_hold' : 'completed',
      legalHoldBlocked,
      exportDigestSha256,
      resolutionNote,
    })

    return { ok: true, message: resolutionNote }
  }

  function saveResidencyConfig(input: {
    primaryRegion: ResidencyRegion
    failoverRegion: FailoverRegion
    dataResidencyLocked: boolean
    isolationTier: IsolationTier
    encryptionKeyMode: 'platform_kms' | 'byok_kms'
    kmsKeyArnMasked?: string
    dedicatedWorkerPool: boolean
    egressAllowlistCidrs: string[]
  }) {
    const next: TenantResidencyConfigRecord = {
      tenantId: activeTenant.id,
      ...input,
      updatedAt: new Date().toISOString(),
    }
    setLocalResidencyByTenant((prev) => ({ ...prev, [activeTenant.id]: next }))
    appendSensitiveLog('residency_change', 'tenant_residency_configs', activeTenant.id, {
      primaryRegion: next.primaryRegion,
      isolationTier: next.isolationTier,
      dataResidencyLocked: next.dataResidencyLocked,
    })
    void upsertResidencyConfigViaPrisma({
      tenantId: activeTenant.id,
      ...input,
      updatedBy: activeUser.id,
    })
    return {
      ok: true,
      message: `Residency pinned to ${next.primaryRegion} (${next.isolationTier}).`,
    }
  }

  function testResidencyTransfer(targetRegion: ResidencyRegion) {
    const res = validateResidencyTransfer({ config: residencyConfig, targetRegion })
    return {
      allowed: res.allowed,
      message: res.allowed
        ? `Transfer to ${targetRegion} permitted under current residency policy.`
        : (res.reason ?? 'Transfer denied.'),
    }
  }

  async function createSiemDestination(input: {
    name: string
    provider: SiemProvider
    endpointUrl: string
    authToken: string
    format: SiemFormat
    includeCategories: string[]
  }) {
    const authTokenHashSha256 = await sha256Hex(input.authToken || crypto.randomUUID())
    const dest: SiemDestinationRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      name: input.name.trim(),
      provider: input.provider,
      endpointUrl: input.endpointUrl.trim(),
      authHeaderPrefix: 'Bearer',
      format: input.format,
      includeCategories: input.includeCategories,
      isActive: true,
      createdAt: new Date().toISOString(),
    }
    setLocalSiemDestinations((prev) => [dest, ...prev])
    void createSiemDestinationViaPrisma({
      tenantId: activeTenant.id,
      name: dest.name,
      provider: dest.provider,
      endpointUrl: dest.endpointUrl,
      authHeaderPrefix: dest.authHeaderPrefix,
      authTokenHashSha256,
      format: dest.format,
      includeCategories: dest.includeCategories,
      createdBy: activeUser.id,
    })
    return { ok: true, message: `SIEM destination '${dest.name}' configured (${dest.format.toUpperCase()}).` }
  }

  async function dispatchSiemExportBatch(destinationId: string) {
    const dest = siemDestinations.find((d) => d.id === destinationId)
    if (!dest) return { ok: false, message: 'SIEM destination not found.' }

    const sourceEvents =
      sensitiveAccessLogs.length > 0
        ? sensitiveAccessLogs.slice(0, 15).map((l) => ({
            eventId: l.id,
            category: l.actionCategory,
            resourceType: l.resourceType,
            resourceId: l.resourceId,
            correlationId: l.correlationId,
            occurredAtUtc: l.occurredAtUtc,
            metadata: l.metadata,
          }))
        : auditLogs.slice(0, 10).map((a) => ({
            eventId: a.id,
            category: a.actionType,
            resourceType: a.targetEntity,
            resourceId: a.id,
            correlationId: `aud-${a.id.slice(0, 8)}`,
            occurredAtUtc: a.timestamp,
            metadata: { actorRole: a.actorRole },
          }))

    const formatted = await formatSanitizedSiemBatch({
      format: dest.format,
      events: sourceEvents,
    })

    const batch: SiemExportBatchRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      destinationId: dest.id,
      eventCount: formatted.sanitizedCount,
      payloadFormat: dest.format,
      payloadDigestSha256: formatted.payloadDigestSha256,
      deliveryStatus: 'delivered',
      httpStatus: 200,
      sanitizedPreview: formatted.preview,
      createdAt: new Date().toISOString(),
    }
    setLocalSiemBatches((prev) => [batch, ...prev])
    appendSensitiveLog('siem_export', 'siem_export_batches', batch.id, {
      destination: dest.name,
      eventCount: batch.eventCount,
    })
    void recordSiemBatchViaPrisma({
      tenantId: activeTenant.id,
      destinationId: dest.id,
      eventCount: batch.eventCount,
      payloadFormat: dest.format,
      payloadDigestSha256: batch.payloadDigestSha256,
      sanitizedPreview: batch.sanitizedPreview,
    })
    return {
      ok: true,
      message: `Exported ${batch.eventCount} sanitized security events to ${dest.name} (${dest.format.toUpperCase()}).`,
    }
  }

  async function publishFleetRelease(input: {
    version: string
    platform: FleetPlatform
    channel: FleetChannel
    notarizationStatus: FleetReleaseRecord['notarizationStatus']
    rolloutPercentage: number
    releaseNotes: string
  }) {
    const installerSha256 = await sha256Hex(`${input.platform}:${input.version}:${Date.now()}`)
    const codeSigningThumbprint = `CERT-${installerSha256.slice(0, 16).toUpperCase()}`
    const rel: FleetReleaseRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      version: input.version.trim(),
      platform: input.platform,
      channel: input.channel,
      installerSha256,
      codeSigningThumbprint,
      notarizationStatus: input.notarizationStatus,
      minOsVersion: input.platform.startsWith('macos') ? 'macOS 14+' : 'Windows 11+',
      rolloutPercentage: input.rolloutPercentage,
      releaseNotes: input.releaseNotes.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    }
    setLocalFleetReleases((prev) => [rel, ...prev])
    void publishFleetReleaseViaPrisma({
      ...rel,
      publishedBy: activeUser.id,
    })
    return { ok: true, message: `Published signed release ${rel.version} (${rel.platform}).` }
  }

  async function triggerWarehouseExport(input: {
    targetSink: WarehouseSink
    periodStart: string
    periodEnd: string
    rowCount: number
  }) {
    const rows = Math.max(input.rowCount, timesheetLines.length + activityRollups.length)
    const manifest = await buildWarehouseExportManifest({
      tenantId: activeTenant.id,
      targetSink: input.targetSink,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      rowCount: rows,
    })
    const exp: AnalyticsWarehouseExportRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      targetSink: input.targetSink,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      rowCount: rows,
      compressedBytes: manifest.compressedBytes,
      objectPathUri: manifest.objectPathUri,
      checksumSha256: manifest.checksumSha256,
      status: 'exported',
      createdAt: new Date().toISOString(),
    }
    setLocalWarehouseExports((prev) => [exp, ...prev])
    void createWarehouseExportViaPrisma({
      ...exp,
      triggeredBy: activeUser.id,
    })
    return {
      ok: true,
      message: `Exported ${exp.rowCount} aggregated rows to ${exp.objectPathUri}.`,
    }
  }

  function runDetachableQueueWorkerBatch(simulateFault = false) {
    const batch: QueueMessageEnvelope[] = [
      { id: 'msg-1', queueName: 'ingestion_normalization_queue', attemptCount: 0, maxAttempts: 3, latencyMs: 38 },
      { id: 'msg-2', queueName: 'webhook_processing_queue', attemptCount: 0, maxAttempts: 3, latencyMs: 64 },
      { id: 'msg-3', queueName: 'correlation_rules_queue', attemptCount: 1, maxAttempts: 3, latencyMs: 112 },
      {
        id: 'msg-4',
        queueName: 'ai_summary_queue',
        attemptCount: simulateFault ? 2 : 0,
        maxAttempts: 3,
        shouldFail: simulateFault,
        latencyMs: 95,
      },
    ]
    const result = processQueueBatchWithDlq(batch)
    setLastWorkerBatch(result)
    return result
  }

  function recordDrExercise(input: {
    exerciseType: DrExerciseRecord['exerciseType']
    targetRpoMinutes: number
    measuredRpoMinutes: number
    targetRtoMinutes: number
    measuredRtoMinutes: number
    p95CrudMs: number
    simulatedConcurrentDevs: number
    findingsSummary: string
  }) {
    const draft: DrExerciseRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      ...input,
      passed: false,
      conductedAt: new Date().toISOString(),
    }
    const evalRes = evaluateDrAndLoadReadiness(draft)
    draft.passed = evalRes.overallPass
    setLocalDrExercises((prev) => [draft, ...prev])
    void recordDrExerciseViaPrisma({
      tenantId: activeTenant.id,
      ...input,
      passed: draft.passed,
      conductedBy: activeUser.id,
    })
    return {
      ok: true,
      passed: draft.passed,
      message: draft.passed
        ? `DR / Load drill PASSED (RPO ${draft.measuredRpoMinutes}m, RTO ${draft.measuredRtoMinutes}m, p95 ${draft.p95CrudMs}ms).`
        : `DR / Load drill FAILED SLA target (p95 ${draft.p95CrudMs}ms or RPO/RTO exceeded).`,
    }
  }

  async function addSecurityAssessment(input: {
    assessmentName: string
    assessorFirm: string
    assessmentType: SecurityAssessmentRecord['assessmentType']
    status: SecurityAssessmentRecord['status']
    criticalFindings: number
    highFindings: number
    remediatedFindings: number
  }) {
    const reportSha256 = await sha256Hex(`${input.assessmentName}:${input.assessorFirm}:${Date.now()}`)
    const rec: SecurityAssessmentRecord = {
      id: crypto.randomUUID(),
      tenantId: activeTenant.id,
      ...input,
      reportSha256,
      assessedAt: new Date().toISOString(),
      signoffAt: input.status === 'signed_off' ? new Date().toISOString() : undefined,
    }
    setLocalSecurityAssessments((prev) => [rec, ...prev])
    void upsertSecurityAssessmentViaPrisma({
      tenantId: activeTenant.id,
      ...input,
      reportSha256,
    })
    return { ok: true, message: `Recorded assessment '${rec.assessmentName}'.` }
  }

  function saveAccessibilityConfig(input: {
    defaultLocale: SupportedLocale
    highContrastMode: boolean
    keyboardShortcutsEnabled: boolean
    wcagTargetLevel: 'AA' | 'AAA'
  }) {
    const next: TenantAccessibilityConfigRecord = {
      tenantId: activeTenant.id,
      ...input,
      updatedAt: new Date().toISOString(),
    }
    setLocalA11yByTenant((prev) => ({ ...prev, [activeTenant.id]: next }))
    setHighContrast(input.highContrastMode)
    setLocale(input.defaultLocale)
    void updateAccessibilityConfigViaPrisma({
      tenantId: activeTenant.id,
      ...input,
    })
  }

  return (
    <Phase5StoreContext.Provider
      value={{
        ssoProviders,
        scimEvents,
        policyChangeRequests,
        sensitiveAccessLogs,
        legalHolds,
        retentionPolicies,
        retentionJobs,
        privacyRequests,
        residencyConfig,
        siemDestinations,
        siemBatches,
        fleetReleases,
        warehouseExports,
        drExercises,
        securityAssessments,
        securityScore,
        accessibilityConfig,
        lastWorkerBatch,
        configureSsoProvider,
        simulateScimProvisioning,
        proposePolicyChange,
        decidePolicyChangeSecond,
        placeLegalHold,
        releaseLegalHold,
        saveRetentionPolicy,
        runRetentionSweep,
        submitPrivacyRequest,
        saveResidencyConfig,
        testResidencyTransfer,
        createSiemDestination,
        dispatchSiemExportBatch,
        publishFleetRelease,
        triggerWarehouseExport,
        runDetachableQueueWorkerBatch,
        recordDrExercise,
        addSecurityAssessment,
        saveAccessibilityConfig,
      }}
    >
      {children}
    </Phase5StoreContext.Provider>
  )
}

export function usePhase5Store(): Phase5StoreContextValue {
  const ctx = useContext(Phase5StoreContext)
  if (!ctx) {
    throw new Error('usePhase5Store must be used inside Phase5StoreProvider')
  }
  return ctx
}
