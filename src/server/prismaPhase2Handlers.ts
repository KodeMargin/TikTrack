/**
 * DevProof (TikTrack) — Prisma ORM Phase 2 Handlers
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

