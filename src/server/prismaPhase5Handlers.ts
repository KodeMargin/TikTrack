/**
 * DevProof (TikTrack) — Prisma ORM Phase 5 Handlers
 *
 * Persists Phase 5 Enterprise, Compliance & Operational Scale workflows in
 * Supabase PostgreSQL:
 *  - SAML/OIDC SSO Providers & SCIM 2.0 Provisioning Events (F5-001)
 *  - Two-Person Policy Change Governance (F5-006)
 *  - Legal Holds, Retention Policies/Jobs, DSAR Privacy Requests & Access Logs (F5-002)
 *  - Data Residency & Tenant Isolation Configs (F5-003, F5-004)
 *  - SIEM Destinations & Sanitized Export Batches (F5-005)
 *  - Signed Desktop Fleet Releases & Warehouse Exports (F5-007, F5-008)
 *  - DR/Load Exercises, Security Assessments & Accessibility/Locale Configs (F5-009..F5-011)
 */

import { prisma } from '../lib/prisma.ts'
import { isValidUuid } from './prismaPhase1Handlers.ts'
import type {
  FailoverRegion,
  FleetChannel,
  FleetPlatform,
  IsolationTier,
  ResidencyRegion,
  SensitiveAccessCategory,
  SiemFormat,
  SiemProvider,
  SsoProviderType,
  SupportedLocale,
  WarehouseSink,
} from '../types/domain.types.ts'

export async function handleBootstrapPhase5Data() {
  try {
    const [
      dbSsoProviders,
      dbScimEvents,
      dbPolicyChangeRequests,
      dbSensitiveLogs,
      dbLegalHolds,
      dbRetentionPolicies,
      dbRetentionJobs,
      dbPrivacyRequests,
      dbResidencyConfigs,
      dbSiemDestinations,
      dbSiemBatches,
      dbFleetReleases,
      dbWarehouseExports,
      dbDrExercises,
      dbSecurityAssessments,
      dbAccessibilityConfigs,
    ] = await Promise.all([
      prisma.ssoProvider.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.scimProvisioningEvent.findMany({ orderBy: { occurredAtUtc: 'desc' }, take: 50 }),
      prisma.policyChangeRequest.findMany({
        include: { proposer: true, firstApprover: true, secondApprover: true },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      prisma.sensitiveAccessLog.findMany({
        include: { actorUser: true },
        orderBy: { occurredAtUtc: 'desc' },
        take: 80,
      }),
      prisma.legalHold.findMany({ orderBy: { placedAt: 'desc' }, take: 50 }),
      prisma.retentionPolicy.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.retentionJob.findMany({ orderBy: { executedAtUtc: 'desc' }, take: 50 }),
      prisma.privacyRequest.findMany({
        include: { requester: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.tenantResidencyConfig.findMany(),
      prisma.siemDestination.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.siemExportBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.fleetRelease.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
      prisma.analyticsWarehouseExport.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
      prisma.drExercise.findMany({ orderBy: { conductedAt: 'desc' }, take: 40 }),
      prisma.securityAssessment.findMany({ orderBy: { assessedAt: 'desc' }, take: 40 }),
      prisma.tenantAccessibilityConfig.findMany(),
    ])

    return {
      ssoProviders: dbSsoProviders.map((p) => ({
        id: p.id,
        tenantId: p.tenantId,
        providerType: p.providerType as SsoProviderType,
        displayName: p.displayName,
        domain: p.domain,
        entityIdOrIssuer: p.entityIdOrIssuer,
        ssoUrl: p.ssoUrl,
        certificateFingerprint: p.certificateFingerprint ?? undefined,
        clientId: p.clientId ?? undefined,
        enforceSso: p.enforceSso,
        jitDefaultRole: p.jitDefaultRole as
          | 'developer'
          | 'project_manager'
          | 'finance'
          | 'client_reviewer'
          | 'auditor',
        scimEnabled: p.scimEnabled,
        scimTokenPrefix: p.scimTokenPrefix ?? undefined,
        status: p.status as 'draft' | 'active' | 'disabled',
        createdAt: p.createdAt.toISOString(),
      })),
      scimEvents: dbScimEvents.map((e) => ({
        id: e.id,
        tenantId: e.tenantId,
        providerId: e.providerId ?? undefined,
        action: e.action as 'user_create' | 'user_update' | 'user_deactivate' | 'group_sync',
        externalUserId: e.externalUserId,
        email: e.email,
        targetRole: e.targetRole,
        status: e.status as 'applied' | 'rejected' | 'queued',
        correlationId: e.correlationId,
        detailMessage: e.detailMessage ?? undefined,
        occurredAtUtc: e.occurredAtUtc.toISOString(),
      })),
      policyChangeRequests: dbPolicyChangeRequests.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        proposedVersionCode: r.proposedVersionCode,
        changeSummary: r.changeSummary,
        scopeDiff: (r.scopeDiff ?? {}) as Record<string, unknown>,
        expandsCollectionScope: r.expandsCollectionScope,
        status: r.status as
          | 'pending_second_approval'
          | 'approved_activated'
          | 'rejected'
          | 'cancelled',
        proposedBy: r.proposedBy,
        proposedByName: r.proposer.fullName,
        approvedByFirst: r.approvedByFirst,
        approvedByFirstName: r.firstApprover.fullName,
        approvedBySecond: r.approvedBySecond ?? undefined,
        approvedBySecondName: r.secondApprover?.fullName ?? undefined,
        rejectionReason: r.rejectionReason ?? undefined,
        effectiveFrom: r.effectiveFrom.toISOString(),
        activatedPolicyVersionId: r.activatedPolicyVersionId ?? undefined,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : undefined,
      })),
      sensitiveAccessLogs: dbSensitiveLogs.map((l) => ({
        id: l.id,
        tenantId: l.tenantId,
        actorUserId: l.actorUserId ?? undefined,
        actorName: l.actorUser?.fullName ?? undefined,
        actionCategory: l.actionCategory as SensitiveAccessCategory,
        resourceType: l.resourceType,
        resourceId: l.resourceId,
        ipAddressMasked: l.ipAddressMasked,
        correlationId: l.correlationId,
        metadata: (l.metadata ?? {}) as Record<string, unknown>,
        occurredAtUtc: l.occurredAtUtc.toISOString(),
      })),
      legalHolds: dbLegalHolds.map((h) => ({
        id: h.id,
        tenantId: h.tenantId,
        scopeType: h.scopeType as 'timesheet' | 'dispute' | 'project' | 'user' | 'tenant',
        targetId: h.targetId,
        reason: h.reason,
        holdStatus: h.holdStatus as 'active' | 'released',
        placedBy: h.placedBy ?? undefined,
        releasedBy: h.releasedBy ?? undefined,
        placedAt: h.placedAt.toISOString(),
        releasedAt: h.releasedAt ? h.releasedAt.toISOString() : undefined,
      })),
      retentionPolicies: dbRetentionPolicies.map((rp) => ({
        id: rp.id,
        tenantId: rp.tenantId,
        name: rp.name,
        rawActivityDays: rp.rawActivityDays,
        rollupDays: rp.rollupDays,
        evidenceArtifactDays: rp.evidenceArtifactDays,
        auditLogDays: rp.auditLogDays,
        archiveStorageTier: rp.archiveStorageTier as 'supabase_cold' | 'cold_s3' | 'gcs_archive',
        isActive: rp.isActive,
        createdAt: rp.createdAt.toISOString(),
      })),
      retentionJobs: dbRetentionJobs.map((rj) => ({
        id: rj.id,
        tenantId: rj.tenantId,
        policyId: rj.policyId ?? undefined,
        jobType: rj.jobType as
          | 'purge_raw_events'
          | 'archive_rollups'
          | 'dsar_export'
          | 'dsar_erasure',
        status: rj.status as
          | 'queued'
          | 'running'
          | 'completed'
          | 'partial_legal_hold'
          | 'failed',
        scannedCount: rj.scannedCount,
        purgedCount: rj.purgedCount,
        skippedLegalHoldCount: rj.skippedLegalHoldCount,
        archivedBundleUri: rj.archivedBundleUri ?? undefined,
        executedAtUtc: rj.executedAtUtc.toISOString(),
      })),
      privacyRequests: dbPrivacyRequests.map((pr) => ({
        id: pr.id,
        tenantId: pr.tenantId,
        requesterUserId: pr.requesterUserId,
        requesterName: pr.requester.fullName,
        requestType: pr.requestType as 'export' | 'correction' | 'erasure',
        status: pr.status as 'pending' | 'in_review' | 'completed' | 'blocked_legal_hold',
        legalHoldBlocked: pr.legalHoldBlocked,
        exportDigestSha256: pr.exportDigestSha256 ?? undefined,
        resolutionNote: pr.resolutionNote ?? undefined,
        createdAt: pr.createdAt.toISOString(),
        resolvedAt: pr.resolvedAt ? pr.resolvedAt.toISOString() : undefined,
      })),
      residencyConfigs: dbResidencyConfigs.map((rc) => ({
        tenantId: rc.tenantId,
        primaryRegion: rc.primaryRegion as ResidencyRegion,
        failoverRegion: rc.failoverRegion as FailoverRegion,
        dataResidencyLocked: rc.dataResidencyLocked,
        isolationTier: rc.isolationTier as IsolationTier,
        encryptionKeyMode: rc.encryptionKeyMode as 'platform_kms' | 'byok_kms',
        kmsKeyArnMasked: rc.kmsKeyArnMasked ?? undefined,
        dedicatedWorkerPool: rc.dedicatedWorkerPool,
        egressAllowlistCidrs: rc.egressAllowlistCidrs,
        updatedAt: rc.updatedAt.toISOString(),
      })),
      siemDestinations: dbSiemDestinations.map((d) => ({
        id: d.id,
        tenantId: d.tenantId,
        name: d.name,
        provider: d.provider as SiemProvider,
        endpointUrl: d.endpointUrl,
        authHeaderPrefix: d.authHeaderPrefix,
        format: d.format as SiemFormat,
        includeCategories: d.includeCategories,
        isActive: d.isActive,
        lastExportedAt: d.lastExportedAt ? d.lastExportedAt.toISOString() : undefined,
        createdAt: d.createdAt.toISOString(),
      })),
      siemBatches: dbSiemBatches.map((b) => ({
        id: b.id,
        tenantId: b.tenantId,
        destinationId: b.destinationId,
        eventCount: b.eventCount,
        payloadFormat: b.payloadFormat as SiemFormat,
        payloadDigestSha256: b.payloadDigestSha256,
        deliveryStatus: b.deliveryStatus as 'queued' | 'delivered' | 'failed',
        httpStatus: b.httpStatus ?? undefined,
        sanitizedPreview: (b.sanitizedPreview ?? {}) as Record<string, unknown>,
        createdAt: b.createdAt.toISOString(),
      })),
      fleetReleases: dbFleetReleases.map((fr) => ({
        id: fr.id,
        tenantId: fr.tenantId,
        version: fr.version,
        platform: fr.platform as FleetPlatform,
        channel: fr.channel as FleetChannel,
        installerSha256: fr.installerSha256,
        codeSigningThumbprint: fr.codeSigningThumbprint,
        notarizationStatus: fr.notarizationStatus as 'notarized' | 'signed' | 'pending',
        minOsVersion: fr.minOsVersion,
        rolloutPercentage: fr.rolloutPercentage,
        releaseNotes: fr.releaseNotes,
        isActive: fr.isActive,
        createdAt: fr.createdAt.toISOString(),
      })),
      warehouseExports: dbWarehouseExports.map((we) => ({
        id: we.id,
        tenantId: we.tenantId,
        targetSink: we.targetSink as WarehouseSink,
        periodStart: we.periodStart.toISOString().slice(0, 10),
        periodEnd: we.periodEnd.toISOString().slice(0, 10),
        rowCount: we.rowCount,
        compressedBytes: Number(we.compressedBytes),
        objectPathUri: we.objectPathUri,
        checksumSha256: we.checksumSha256,
        status: we.status as 'queued' | 'exported' | 'verified',
        createdAt: we.createdAt.toISOString(),
      })),
      drExercises: dbDrExercises.map((dr) => ({
        id: dr.id,
        tenantId: dr.tenantId,
        exerciseType: dr.exerciseType as
          | 'backup_restore_drill'
          | 'region_failover_tabletop'
          | 'load_test_1000_devs'
          | 'pen_test_remediation',
        targetRpoMinutes: dr.targetRpoMinutes,
        measuredRpoMinutes: dr.measuredRpoMinutes,
        targetRtoMinutes: dr.targetRtoMinutes,
        measuredRtoMinutes: dr.measuredRtoMinutes,
        p95CrudMs: dr.p95CrudMs,
        simulatedConcurrentDevs: dr.simulatedConcurrentDevs,
        passed: dr.passed,
        findingsSummary: dr.findingsSummary,
        conductedAt: dr.conductedAt.toISOString(),
      })),
      securityAssessments: dbSecurityAssessments.map((sa) => ({
        id: sa.id,
        tenantId: sa.tenantId,
        assessmentName: sa.assessmentName,
        assessorFirm: sa.assessorFirm,
        assessmentType: sa.assessmentType as
          | 'penetration_test'
          | 'rls_isolation_audit'
          | 'sdlc_review'
          | 'soc2_readiness',
        status: sa.status as 'scheduled' | 'in_progress' | 'remediating' | 'signed_off',
        criticalFindings: sa.criticalFindings,
        highFindings: sa.highFindings,
        remediatedFindings: sa.remediatedFindings,
        reportSha256: sa.reportSha256 ?? undefined,
        assessedAt: sa.assessedAt.toISOString(),
        signoffAt: sa.signoffAt ? sa.signoffAt.toISOString() : undefined,
      })),
      accessibilityConfigs: dbAccessibilityConfigs.map((ac) => ({
        tenantId: ac.tenantId,
        defaultLocale: ac.defaultLocale as SupportedLocale,
        highContrastMode: ac.highContrastMode,
        keyboardShortcutsEnabled: ac.keyboardShortcutsEnabled,
        wcagTargetLevel: ac.wcagTargetLevel as 'AA' | 'AAA',
        updatedAt: ac.updatedAt.toISOString(),
      })),
    }
  } catch {
    return {
      ssoProviders: [],
      scimEvents: [],
      policyChangeRequests: [],
      sensitiveAccessLogs: [],
      legalHolds: [],
      retentionPolicies: [],
      retentionJobs: [],
      privacyRequests: [],
      residencyConfigs: [],
      siemDestinations: [],
      siemBatches: [],
      fleetReleases: [],
      warehouseExports: [],
      drExercises: [],
      securityAssessments: [],
      accessibilityConfigs: [],
    }
  }
}

export async function handleUpsertSsoProviderPrisma(input: {
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
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const createdBy = isValidUuid(input.createdBy) ? input.createdBy : undefined
  const provider = await prisma.ssoProvider.upsert({
    where: {
      tenantId_domain: {
        tenantId: input.tenantId,
        domain: input.domain.toLowerCase(),
      },
    },
    update: {
      providerType: input.providerType,
      displayName: input.displayName,
      entityIdOrIssuer: input.entityIdOrIssuer,
      ssoUrl: input.ssoUrl,
      certificateFingerprint: input.certificateFingerprint,
      clientId: input.clientId,
      enforceSso: input.enforceSso,
      jitDefaultRole: input.jitDefaultRole,
      scimEnabled: input.scimEnabled,
      ...(input.scimTokenPrefix ? { scimTokenPrefix: input.scimTokenPrefix } : {}),
      ...(input.scimTokenHashSha256 ? { scimTokenHashSha256: input.scimTokenHashSha256 } : {}),
      status: 'active',
    },
    create: {
      tenantId: input.tenantId,
      providerType: input.providerType,
      displayName: input.displayName,
      domain: input.domain.toLowerCase(),
      entityIdOrIssuer: input.entityIdOrIssuer,
      ssoUrl: input.ssoUrl,
      certificateFingerprint: input.certificateFingerprint,
      clientId: input.clientId,
      enforceSso: input.enforceSso,
      jitDefaultRole: input.jitDefaultRole,
      scimEnabled: input.scimEnabled,
      scimTokenPrefix: input.scimTokenPrefix,
      scimTokenHashSha256: input.scimTokenHashSha256,
      status: 'active',
      createdBy,
    },
  })
  return { ok: true, id: provider.id }
}

export async function handleRecordScimEventPrisma(input: {
  tenantId: string
  providerId?: string
  action: 'user_create' | 'user_update' | 'user_deactivate' | 'group_sync'
  externalUserId: string
  email: string
  targetRole: string
  correlationId: string
  detailMessage?: string
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const ev = await prisma.$transaction(async (tx) => {
    const created = await tx.scimProvisioningEvent.create({
      data: {
        tenantId: input.tenantId,
        providerId: isValidUuid(input.providerId) ? input.providerId : undefined,
        action: input.action,
        externalUserId: input.externalUserId,
        email: input.email.toLowerCase(),
        targetRole: input.targetRole,
        status: 'applied',
        correlationId: input.correlationId,
        detailMessage: input.detailMessage,
      },
    })
    await tx.sensitiveAccessLog.create({
      data: {
        tenantId: input.tenantId,
        actionCategory: 'scim_sync',
        resourceType: 'scim_provisioning_events',
        resourceId: created.id,
        correlationId: input.correlationId,
        metadata: { action: input.action, targetRole: input.targetRole },
      },
    })
    return created
  })
  return { ok: true, id: ev.id }
}

export async function handleProposePolicyChangePrisma(input: {
  tenantId: string
  proposedVersionCode: string
  changeSummary: string
  scopeDiff: Record<string, boolean | string | number>
  expandsCollectionScope: boolean
  proposedBy: string
  effectiveFrom: string
}) {
  if (!isValidUuid(input.tenantId) || !isValidUuid(input.proposedBy)) return { ok: false }
  const req = await prisma.policyChangeRequest.create({
    data: {
      tenantId: input.tenantId,
      proposedVersionCode: input.proposedVersionCode,
      changeSummary: input.changeSummary,
      scopeDiff: input.scopeDiff,
      expandsCollectionScope: input.expandsCollectionScope,
      status: 'pending_second_approval',
      proposedBy: input.proposedBy,
      approvedByFirst: input.proposedBy,
      effectiveFrom: new Date(input.effectiveFrom),
    },
  })
  return { ok: true, id: req.id }
}

export async function handleApprovePolicyChangeSecondPrisma(input: {
  tenantId: string
  requestId: string
  secondApproverId: string
  decision: 'approve' | 'reject'
  rejectionReason?: string
}) {
  if (
    !isValidUuid(input.tenantId) ||
    !isValidUuid(input.requestId) ||
    !isValidUuid(input.secondApproverId)
  ) {
    return { ok: false, error: 'Invalid UUID supplied.' }
  }

  const req = await prisma.policyChangeRequest.findFirst({
    where: { id: input.requestId, tenantId: input.tenantId },
  })
  if (!req) return { ok: false, error: 'Policy change request not found.' }
  if (req.proposedBy === input.secondApproverId || req.approvedByFirst === input.secondApproverId) {
    return {
      ok: false,
      error: 'Two-person governance violation: second approver must be a distinct administrator.',
    }
  }

  const now = new Date()
  if (input.decision === 'reject') {
    await prisma.policyChangeRequest.update({
      where: { id: req.id },
      data: {
        status: 'rejected',
        approvedBySecond: input.secondApproverId,
        rejectionReason: input.rejectionReason ?? 'Rejected during dual-control review.',
        resolvedAt: now,
      },
    })
    return { ok: true }
  }

  const effectiveFrom = req.effectiveFrom > now ? req.effectiveFrom : now
  const activatedId = await prisma.$transaction(async (tx) => {
    const pv = await tx.policyVersion.create({
      data: {
        tenantId: input.tenantId,
        versionCode: req.proposedVersionCode,
        effectiveFrom,
        captureScope: req.scopeDiff as object,
        summaryMarkdown: req.changeSummary,
        publishedBy: input.secondApproverId,
      },
    })
    await tx.policyChangeRequest.update({
      where: { id: req.id },
      data: {
        status: 'approved_activated',
        approvedBySecond: input.secondApproverId,
        activatedPolicyVersionId: pv.id,
        effectiveFrom,
        resolvedAt: now,
      },
    })
    await tx.sensitiveAccessLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.secondApproverId,
        actionCategory: 'policy_approval',
        resourceType: 'policy_change_requests',
        resourceId: req.id,
        correlationId: `pol-${req.id.slice(0, 8)}`,
        metadata: { versionCode: req.proposedVersionCode, effectiveFrom: effectiveFrom.toISOString() },
      },
    })
    return pv.id
  })

  return { ok: true, activatedPolicyVersionId: activatedId }
}

export async function handleCreateLegalHoldPrisma(input: {
  tenantId: string
  scopeType: 'timesheet' | 'dispute' | 'project' | 'user' | 'tenant'
  targetId: string
  reason: string
  placedBy?: string
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const placedBy = isValidUuid(input.placedBy) ? input.placedBy : undefined
  const hold = await prisma.$transaction(async (tx) => {
    const created = await tx.legalHold.create({
      data: {
        tenantId: input.tenantId,
        scopeType: input.scopeType,
        targetId: input.targetId,
        reason: input.reason,
        holdStatus: 'active',
        placedBy,
      },
    })
    await tx.sensitiveAccessLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: placedBy,
        actionCategory: 'legal_hold_change',
        resourceType: 'legal_holds',
        resourceId: created.id,
        correlationId: `hold-${created.id.slice(0, 8)}`,
        metadata: { scopeType: input.scopeType, action: 'placed' },
      },
    })
    return created
  })
  return { ok: true, id: hold.id }
}

export async function handleReleaseLegalHoldPrisma(input: {
  tenantId: string
  holdId: string
  releasedBy?: string
}) {
  if (!isValidUuid(input.tenantId) || !isValidUuid(input.holdId)) return { ok: false }
  const releasedBy = isValidUuid(input.releasedBy) ? input.releasedBy : undefined
  await prisma.legalHold.update({
    where: { id: input.holdId },
    data: {
      holdStatus: 'released',
      releasedBy,
      releasedAt: new Date(),
    },
  })
  return { ok: true }
}

export async function handleUpsertRetentionPolicyPrisma(input: {
  tenantId: string
  name: string
  rawActivityDays: number
  rollupDays: number
  evidenceArtifactDays: number
  auditLogDays: number
  archiveStorageTier: 'supabase_cold' | 'cold_s3' | 'gcs_archive'
  createdBy?: string
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const createdBy = isValidUuid(input.createdBy) ? input.createdBy : undefined
  const rp = await prisma.retentionPolicy.upsert({
    where: { tenantId_name: { tenantId: input.tenantId, name: input.name } },
    update: {
      rawActivityDays: input.rawActivityDays,
      rollupDays: input.rollupDays,
      evidenceArtifactDays: input.evidenceArtifactDays,
      auditLogDays: input.auditLogDays,
      archiveStorageTier: input.archiveStorageTier,
      isActive: true,
    },
    create: {
      tenantId: input.tenantId,
      name: input.name,
      rawActivityDays: input.rawActivityDays,
      rollupDays: input.rollupDays,
      evidenceArtifactDays: input.evidenceArtifactDays,
      auditLogDays: input.auditLogDays,
      archiveStorageTier: input.archiveStorageTier,
      isActive: true,
      createdBy,
    },
  })
  return { ok: true, id: rp.id }
}

export async function handleRecordRetentionJobPrisma(input: {
  tenantId: string
  policyId?: string
  jobType: 'purge_raw_events' | 'archive_rollups' | 'dsar_export' | 'dsar_erasure'
  status: 'completed' | 'partial_legal_hold'
  scannedCount: number
  purgedCount: number
  skippedLegalHoldCount: number
  archivedBundleUri?: string
  executedBy?: string
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const executedBy = isValidUuid(input.executedBy) ? input.executedBy : undefined
  const job = await prisma.retentionJob.create({
    data: {
      tenantId: input.tenantId,
      policyId: isValidUuid(input.policyId) ? input.policyId : undefined,
      jobType: input.jobType,
      status: input.status,
      scannedCount: input.scannedCount,
      purgedCount: input.purgedCount,
      skippedLegalHoldCount: input.skippedLegalHoldCount,
      archivedBundleUri: input.archivedBundleUri,
      executedBy,
    },
  })
  return { ok: true, id: job.id }
}

export async function handleCreatePrivacyRequestPrisma(input: {
  tenantId: string
  requesterUserId: string
  requestType: 'export' | 'correction' | 'erasure'
  status: 'pending' | 'completed' | 'blocked_legal_hold'
  legalHoldBlocked: boolean
  exportDigestSha256?: string
  resolutionNote?: string
}) {
  if (!isValidUuid(input.tenantId) || !isValidUuid(input.requesterUserId)) return { ok: false }
  const pr = await prisma.privacyRequest.create({
    data: {
      tenantId: input.tenantId,
      requesterUserId: input.requesterUserId,
      requestType: input.requestType,
      status: input.status,
      legalHoldBlocked: input.legalHoldBlocked,
      exportDigestSha256: input.exportDigestSha256,
      resolutionNote: input.resolutionNote,
      resolvedAt: input.status === 'completed' ? new Date() : undefined,
    },
  })
  return { ok: true, id: pr.id }
}

export async function handleUpsertResidencyConfigPrisma(input: {
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
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const updatedBy = isValidUuid(input.updatedBy) ? input.updatedBy : undefined
  await prisma.$transaction(async (tx) => {
    await tx.tenantResidencyConfig.upsert({
      where: { tenantId: input.tenantId },
      update: {
        primaryRegion: input.primaryRegion,
        failoverRegion: input.failoverRegion,
        dataResidencyLocked: input.dataResidencyLocked,
        isolationTier: input.isolationTier,
        encryptionKeyMode: input.encryptionKeyMode,
        kmsKeyArnMasked: input.kmsKeyArnMasked,
        dedicatedWorkerPool: input.dedicatedWorkerPool,
        egressAllowlistCidrs: input.egressAllowlistCidrs,
        updatedBy,
      },
      create: {
        tenantId: input.tenantId,
        primaryRegion: input.primaryRegion,
        failoverRegion: input.failoverRegion,
        dataResidencyLocked: input.dataResidencyLocked,
        isolationTier: input.isolationTier,
        encryptionKeyMode: input.encryptionKeyMode,
        kmsKeyArnMasked: input.kmsKeyArnMasked,
        dedicatedWorkerPool: input.dedicatedWorkerPool,
        egressAllowlistCidrs: input.egressAllowlistCidrs,
        updatedBy,
      },
    })
    await tx.sensitiveAccessLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: updatedBy,
        actionCategory: 'residency_change',
        resourceType: 'tenant_residency_configs',
        resourceId: input.tenantId,
        correlationId: `res-${Date.now()}`,
        metadata: {
          primaryRegion: input.primaryRegion,
          isolationTier: input.isolationTier,
          dataResidencyLocked: input.dataResidencyLocked,
        },
      },
    })
  })
  return { ok: true }
}

export async function handleCreateSiemDestinationPrisma(input: {
  tenantId: string
  name: string
  provider: SiemProvider
  endpointUrl: string
  authHeaderPrefix: string
  authTokenHashSha256: string
  format: SiemFormat
  includeCategories: string[]
  createdBy?: string
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const createdBy = isValidUuid(input.createdBy) ? input.createdBy : undefined
  const dest = await prisma.siemDestination.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      provider: input.provider,
      endpointUrl: input.endpointUrl,
      authHeaderPrefix: input.authHeaderPrefix,
      authTokenHashSha256: input.authTokenHashSha256,
      format: input.format,
      includeCategories: input.includeCategories,
      createdBy,
    },
  })
  return { ok: true, id: dest.id }
}

export async function handleRecordSiemBatchPrisma(input: {
  tenantId: string
  destinationId: string
  eventCount: number
  payloadFormat: SiemFormat
  payloadDigestSha256: string
  sanitizedPreview: Record<string, unknown>
}) {
  if (!isValidUuid(input.tenantId) || !isValidUuid(input.destinationId)) return { ok: false }
  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.siemExportBatch.create({
      data: {
        tenantId: input.tenantId,
        destinationId: input.destinationId,
        eventCount: input.eventCount,
        payloadFormat: input.payloadFormat,
        payloadDigestSha256: input.payloadDigestSha256,
        deliveryStatus: 'delivered',
        httpStatus: 200,
        sanitizedPreview: input.sanitizedPreview as object,
      },
    })
    await tx.siemDestination.update({
      where: { id: input.destinationId },
      data: { lastExportedAt: new Date() },
    })
    return created
  })
  return { ok: true, id: batch.id }
}

export async function handlePublishFleetReleasePrisma(input: {
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
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const publishedBy = isValidUuid(input.publishedBy) ? input.publishedBy : undefined
  const rel = await prisma.fleetRelease.create({
    data: {
      tenantId: input.tenantId,
      version: input.version,
      platform: input.platform,
      channel: input.channel,
      installerSha256: input.installerSha256,
      codeSigningThumbprint: input.codeSigningThumbprint,
      notarizationStatus: input.notarizationStatus,
      minOsVersion: input.minOsVersion,
      rolloutPercentage: input.rolloutPercentage,
      releaseNotes: input.releaseNotes,
      publishedBy,
    },
  })
  return { ok: true, id: rel.id }
}

export async function handleCreateWarehouseExportPrisma(input: {
  tenantId: string
  targetSink: WarehouseSink
  periodStart: string
  periodEnd: string
  rowCount: number
  compressedBytes: number
  objectPathUri: string
  checksumSha256: string
  triggeredBy?: string
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const triggeredBy = isValidUuid(input.triggeredBy) ? input.triggeredBy : undefined
  const exp = await prisma.analyticsWarehouseExport.create({
    data: {
      tenantId: input.tenantId,
      targetSink: input.targetSink,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      rowCount: input.rowCount,
      compressedBytes: BigInt(input.compressedBytes),
      objectPathUri: input.objectPathUri,
      checksumSha256: input.checksumSha256,
      status: 'exported',
      triggeredBy,
    },
  })
  return { ok: true, id: exp.id }
}

export async function handleRecordDrExercisePrisma(input: {
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
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const conductedBy = isValidUuid(input.conductedBy) ? input.conductedBy : undefined
  const dr = await prisma.drExercise.create({
    data: {
      tenantId: input.tenantId,
      exerciseType: input.exerciseType,
      targetRpoMinutes: input.targetRpoMinutes,
      measuredRpoMinutes: input.measuredRpoMinutes,
      targetRtoMinutes: input.targetRtoMinutes,
      measuredRtoMinutes: input.measuredRtoMinutes,
      p95CrudMs: input.p95CrudMs,
      simulatedConcurrentDevs: input.simulatedConcurrentDevs,
      passed: input.passed,
      findingsSummary: input.findingsSummary,
      conductedBy,
    },
  })
  return { ok: true, id: dr.id }
}

export async function handleUpsertSecurityAssessmentPrisma(input: {
  tenantId: string
  assessmentName: string
  assessorFirm: string
  assessmentType: 'penetration_test' | 'rls_isolation_audit' | 'sdlc_review' | 'soc2_readiness'
  status: 'scheduled' | 'in_progress' | 'remediating' | 'signed_off'
  criticalFindings: number
  highFindings: number
  remediatedFindings: number
  reportSha256?: string
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  const sa = await prisma.securityAssessment.create({
    data: {
      tenantId: input.tenantId,
      assessmentName: input.assessmentName,
      assessorFirm: input.assessorFirm,
      assessmentType: input.assessmentType,
      status: input.status,
      criticalFindings: input.criticalFindings,
      highFindings: input.highFindings,
      remediatedFindings: input.remediatedFindings,
      reportSha256: input.reportSha256,
      signoffAt: input.status === 'signed_off' ? new Date() : undefined,
    },
  })
  return { ok: true, id: sa.id }
}

export async function handleUpdateAccessibilityConfigPrisma(input: {
  tenantId: string
  defaultLocale: SupportedLocale
  highContrastMode: boolean
  keyboardShortcutsEnabled: boolean
  wcagTargetLevel: 'AA' | 'AAA'
}) {
  if (!isValidUuid(input.tenantId)) return { ok: false }
  await prisma.tenantAccessibilityConfig.upsert({
    where: { tenantId: input.tenantId },
    update: {
      defaultLocale: input.defaultLocale,
      highContrastMode: input.highContrastMode,
      keyboardShortcutsEnabled: input.keyboardShortcutsEnabled,
      wcagTargetLevel: input.wcagTargetLevel,
    },
    create: {
      tenantId: input.tenantId,
      defaultLocale: input.defaultLocale,
      highContrastMode: input.highContrastMode,
      keyboardShortcutsEnabled: input.keyboardShortcutsEnabled,
      wcagTargetLevel: input.wcagTargetLevel,
    },
  })
  return { ok: true }
}

