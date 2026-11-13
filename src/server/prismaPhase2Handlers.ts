/**
 * DevProof (TikTrack) - Prisma ORM Phase 2 Handlers
 *
 * Persists Phase 2 workflows (Activity Batches, Idle Gap Reconciliation,
 * GitHub/GitLab Webhook Deduplication, Evidence Artifacts/Links & Session Annotations)
 * via Prisma ORM when DATABASE_URL is connected.
 */

import { prisma } from '../lib/prisma.ts'
import { isValidUuid } from './prismaPhase1Handlers.ts'

export async function handleIngestWebhookPrisma(body: {
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
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.projectId)) {
    return { ok: false, deduplicated: false, deliveryAttemptCount: 1 }
  }

  return prisma.$transaction(async (tx) => {
    const existingReceipt = await tx.webhookReceipt.findUnique({
      where: {
        provider_deliveryId: {
          provider: body.provider,
          deliveryId: body.deliveryId,
        },
      },
    })

    let deliveryAttemptCount = 1
    let deduplicated = false

    if (existingReceipt) {
      deduplicated = true
      const updated = await tx.webhookReceipt.update({
        where: { id: existingReceipt.id },
        data: {
          deliveryAttemptCount: { increment: 1 },
          status: 'duplicate_ignored',
          processedAtUtc: new Date(),
        },
      })
      deliveryAttemptCount = updated.deliveryAttemptCount
    } else {
      await tx.webhookReceipt.create({
        data: {
          tenantId: body.tenantId,
          provider: body.provider,
          deliveryId: body.deliveryId,
          eventType: body.eventType,
          signatureVerified: body.signatureVerified,
          payloadSha256: body.payloadSha256,
          deliveryAttemptCount: 1,
          status: body.signatureVerified ? 'processed' : 'rejected_signature',
          processedAtUtc: new Date(),
        },
      })
    }

    if (!body.signatureVerified) {
      return { ok: false, deduplicated, deliveryAttemptCount, error: 'Invalid HMAC signature' }
    }

    const artifact = await tx.evidenceArtifact.upsert({
      where: {
        tenantId_sourceType_externalId: {
          tenantId: body.tenantId,
          sourceType: body.sourceType,
          externalId: body.externalId,
        },
      },
      update: {
        summaryTitle: body.summaryTitle,
      },
      create: {
        tenantId: body.tenantId,
        projectId: body.projectId,
        sourceType: body.sourceType,
        captureMode: 'webhook',
        externalId: body.externalId,
        occurredAtUtc: new Date(),
        actorUserId: isValidUuid(body.actorUserId ?? undefined) ? body.actorUserId : null,
        summaryTitle: body.summaryTitle,
        metadata: body.metadata,
        reliabilityStatus: 'verified_webhook',
      },
    })

    if (body.taskId && isValidUuid(body.taskId)) {
      await tx.evidenceLink.upsert({
        where: {
          tenantId_taskId_artifactId: {
            tenantId: body.tenantId,
            taskId: body.taskId,
            artifactId: artifact.id,
          },
        },
        update: {},
        create: {
          tenantId: body.tenantId,
          projectId: body.projectId,
          taskId: body.taskId,
          artifactId: artifact.id,
          linkType: body.linkType,
          linkConfidence: body.linkType === 'contemporaneous' ? 0.95 : 0.85,
          linkRationale: body.linkRationale,
        },
      })
    }

    return {
      ok: true,
      deduplicated,
      deliveryAttemptCount,
      artifactId: artifact.id,
    }
  })
}

export async function handleCreateSessionAnnotationPrisma(body: {
  tenantId: string
  userId: string
  sessionId: string
  annotationType: string
  title: string
  contentMarkdown: string
  startMinuteOfDay?: number
  endMinuteOfDay?: number
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId) || !isValidUuid(body.sessionId)) {
    return { ok: false }
  }
  const created = await prisma.sessionAnnotation.create({
    data: {
      tenantId: body.tenantId,
      userId: body.userId,
      sessionId: body.sessionId,
      annotationType: body.annotationType,
      title: body.title,
      contentMarkdown: body.contentMarkdown,
      startMinuteOfDay: body.startMinuteOfDay ?? null,
      endMinuteOfDay: body.endMinuteOfDay ?? null,
    },
  })
  return { ok: true, annotationId: created.id }
}

export async function handleBootstrapPhase2Data() {
  const [
    dbRollups,
    dbArtifacts,
    dbAnnotations,
    dbIdeMappings,
    dbIntegrations,
    dbWebhookReceipts,
    dbDevices,
    dbExclusions,
    dbBatches,
  ] = await Promise.all([
    prisma.activityRollup.findMany({
      include: { session: true },
      orderBy: { bucketStartUtc: 'asc' },
      take: 200,
    }),
    prisma.evidenceArtifact.findMany({
      include: {
        actorUser: true,
        links: { include: { task: true } },
      },
      orderBy: { occurredAtUtc: 'desc' },
      take: 100,
    }),
    prisma.sessionAnnotation.findMany({
      include: { session: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.ideWorkspaceMapping.findMany({
      include: { task: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.connectedIntegration.findMany({
      include: { repositoryLinks: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.webhookReceipt.findMany({
      orderBy: { receivedAtUtc: 'desc' },
      take: 100,
    }),
    prisma.device.findMany({
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.privacyExclusion.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activityEventBatch.findMany({
      include: {
        device: true,
        events: { orderBy: { occurredAtUtc: 'asc' }, take: 25 },
      },
      orderBy: { receivedAtUtc: 'desc' },
      take: 50,
    }),
  ])

  const minuteOfDayUtc = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes()

  return {
    activityRollups: dbRollups.map((r) => {
      const startMin = minuteOfDayUtc(r.bucketStartUtc)
      return {
        id: r.id,
        tenantId: r.tenantId,
        userId: r.userId,
        projectId: r.session.projectId,
        taskId: r.session.taskId,
        workDate: r.bucketStartUtc.toISOString().slice(0, 10),
        startMinuteOfDay: startMin,
        endMinuteOfDay: startMin + r.bucketMinutes,
        durationMinutes: r.bucketMinutes,
        appCategory: r.appCategory,
        workMode: r.workMode,
        hasInputSignal: r.hasInputSignal,
        concurrentSources: r.concurrentSources,
        isObservationGap: r.isObservationGap,
        reconciliationChoice: r.reconciliationChoice ?? undefined,
        reconciliationNote: r.reconciliationNote ?? undefined,
        reconciledAtUtc: r.reconciledAtUtc ? r.reconciledAtUtc.toISOString() : undefined,
        displayCount: r.displayCount,
      }
    }),
    evidenceArtifacts: dbArtifacts.map((a) => {
      const link = a.links[0]
      return {
        id: a.id,
        tenantId: a.tenantId,
        projectId: a.projectId,
        taskId: link?.taskId ?? '',
        taskCode: link?.task.code ?? 'UNLINKED',
        workDate: a.occurredAtUtc.toISOString().slice(0, 10),
        minuteOfDay: minuteOfDayUtc(a.occurredAtUtc),
        sourceType: a.sourceType,
        captureMode: a.captureMode,
        externalId: a.externalId,
        occurredAtUtc: a.occurredAtUtc.toISOString(),
        actorName: a.actorUser?.fullName ?? 'Webhook',
        summaryTitle: a.summaryTitle,
        linkType: link?.linkType ?? 'contemporaneous',
        linkConfidence: link ? Number(link.linkConfidence) : 0.9,
        linkRationale: link?.linkRationale ?? '',
        confirmedByUser: link?.confirmedByUser ?? false,
        overriddenByUser: link?.overriddenByUser ?? false,
        reliabilityStatus: a.reliabilityStatus,
        metadata: (a.metadata ?? {}) as Record<string, string | number | boolean>,
      }
    }),
    sessionAnnotations: dbAnnotations.map((ann) => ({
      id: ann.id,
      tenantId: ann.tenantId,
      projectId: ann.session.projectId,
      taskId: ann.session.taskId,
      workDate: ann.createdAt.toISOString().slice(0, 10),
      startMinuteOfDay: ann.startMinuteOfDay ?? 0,
      endMinuteOfDay: ann.endMinuteOfDay ?? 0,
      authorName: ann.user.fullName,
      annotationType: ann.annotationType,
      title: ann.title,
      contentMarkdown: ann.contentMarkdown,
      createdAt: ann.createdAt.toISOString(),
    })),
    ideMappings: dbIdeMappings.map((m) => ({
      id: m.id,
      tenantId: m.tenantId,
      userId: m.userId,
      projectId: m.projectId,
      taskId: m.taskId,
      taskCode: m.task.code,
      ideType: m.ideType,
      workspaceIdentifier: m.workspaceIdentifier,
      repoFullName: m.repoFullName ?? '',
      branchName: m.branchName,
      suggestedTaskCode: m.suggestedTaskCode ?? m.task.code,
      confidenceScore: Number(m.confidenceScore),
      confirmedByUser: m.confirmedByUser,
      overriddenByUser: m.overriddenByUser,
      updatedAt: m.updatedAt.toISOString(),
    })),
    integrations: dbIntegrations.map((i) => ({
      id: i.id,
      tenantId: i.tenantId,
      provider: i.provider,
      displayName: i.displayName,
      installationId: i.installationId,
      status: i.status,
      scopeSummary: 'Least-privilege verified webhook / IDE metadata scope',
      reposOrWorkspaces: i.repositoryLinks.map((rl) => rl.repoFullName),
      retentionDays: i.retentionDaysOverride ?? 365,
      lastSyncedAt: (i.lastSyncedAt ?? i.updatedAt).toISOString(),
    })),
    webhookReceipts: dbWebhookReceipts.map((w) => ({
      id: w.id,
      tenantId: w.tenantId,
      provider: w.provider,
      deliveryId: w.deliveryId,
      eventType: w.eventType,
      signatureVerified: w.signatureVerified,
      payloadSha256: w.payloadSha256,
      deliveryAttemptCount: w.deliveryAttemptCount,
      status: w.status,
      summary: `${w.provider} ${w.eventType}`,
      receivedAtUtc: w.receivedAtUtc.toISOString(),
    })),
    devices: dbDevices.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      userId: d.userId,
      userName: d.user.fullName,
      deviceName: d.deviceName,
      osPlatform: d.osPlatform,
      agentVersion: d.agentVersion,
      updateChannel: d.updateChannel,
      lastClockDriftSeconds: d.lastClockDriftSeconds,
      clockAnomalyDetected: d.clockAnomalyDetected,
      multiDisplayPolicy: d.multiDisplayPolicy,
      revokedAt: d.revokedAt ? d.revokedAt.toISOString() : null,
      lastSeenAt: d.lastSeenAt.toISOString(),
    })),
    privacyExclusions: dbExclusions.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      userId: e.userId,
      pattern: e.exclusionPattern,
      exclusionType: e.exclusionType,
      reason: e.reason ?? '',
      createdAt: e.createdAt.toISOString(),
    })),
    privacyAuditBatches: dbBatches.map((b) => ({
      batchId: b.id,
      tenantId: b.tenantId,
      userId: b.userId,
      deviceId: b.deviceId,
      deviceName: b.device.deviceName,
      source: b.source,
      receivedAtUtc: b.receivedAtUtc.toISOString(),
      retentionExpiresInDays: 90,
      eventCount: b.eventCount,
      suppressedByDenylistCount: 0,
      blockedSurveillanceKeysCount: 0,
      rawPayloadJson: {
        batch_id: b.id,
        source: b.source,
        agent_build: b.agentBuild,
        events: b.events.map((ev) => ({
          event_type: ev.eventType,
          occurred_at_utc: ev.occurredAtUtc.toISOString(),
          metadata: ev.metadata,
        })),
      },
    })),
  }
}

export async function handleAddPrivacyExclusionPrisma(body: {
  tenantId: string
  userId: string
  exclusionPattern: string
  exclusionType: string
  reason: string
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) {
    return { ok: false }
  }
  const created = await prisma.privacyExclusion.upsert({
    where: {
      tenantId_userId_exclusionPattern: {
        tenantId: body.tenantId,
        userId: body.userId,
        exclusionPattern: body.exclusionPattern,
      },
    },
    update: { isActive: true, reason: body.reason },
    create: {
      tenantId: body.tenantId,
      userId: body.userId,
      exclusionPattern: body.exclusionPattern,
      exclusionType: body.exclusionType,
      reason: body.reason,
    },
  })
  return { ok: true, id: created.id }
}

export async function handleRemovePrivacyExclusionPrisma(body: { id: string }) {
  if (!isValidUuid(body.id)) return { ok: false }
  await prisma.privacyExclusion.delete({ where: { id: body.id } })
  return { ok: true }
}

export async function handleToggleDeviceRevocationPrisma(body: {
  deviceId: string
  revoked: boolean
}) {
  if (!isValidUuid(body.deviceId)) return { ok: false }
  await prisma.device.update({
    where: { id: body.deviceId },
    data: { revokedAt: body.revoked ? new Date() : null },
  })
  return { ok: true }
}

export async function handleReconcileGapPrisma(body: {
  rollupId: string
  choice: string
  note: string
}) {
  if (!isValidUuid(body.rollupId)) return { ok: false }
  await prisma.activityRollup.update({
    where: { id: body.rollupId },
    data: {
      reconciliationChoice: body.choice,
      reconciliationNote: body.note,
      reconciledAtUtc: new Date(),
    },
  })
  return { ok: true }
}

