/**
 * DevProof (TikTrack) - Prisma ORM Phase 3 Handlers
 *
 * Persists Phase 3 workflows:
 *  - Versioned Verification Rule Sets & Segment Rule Evaluations (F3-001..F3-010)
 *  - Evidence Correlation Graph Edges (F3-004, F3-008)
 *  - Guardrailed AI Generations & Tenant AI Opt-Out Toggle (F3-020..F3-027)
 *  - Structured Disputes, Independent Escalation, Partial Approval & Credit Notes (F3-030..F3-035)
 */

import { prisma } from '../lib/prisma.ts'
import { isValidUuid } from './prismaPhase1Handlers.ts'
import type { VerificationRuleConfig } from '../types/domain.types.ts'

export async function handleBootstrapPhase3Data() {
  try {
    const [dbRuleSets, dbCorrelationEdges, dbAiGenerations, dbDisputes] =
      await Promise.all([
        prisma.verificationRuleSet.findMany({
          include: { createdByUser: true },
          orderBy: { versionNumber: 'desc' },
          take: 50,
        }),
        prisma.evidenceCorrelationEdge.findMany({
          orderBy: { createdAt: 'desc' },
          take: 250,
        }),
        prisma.aiGeneration.findMany({
          include: { authorUser: true, approver: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        prisma.dispute.findMany({
          include: {
            timesheet: { include: { user: true } },
            timesheetLine: true,
            openedBy: true,
            assignedReviewer: true,
            escalatedReviewer: true,
            messages: {
              include: { author: true },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ])

    return {
      ruleSets: dbRuleSets.map((rs) => ({
        id: rs.id,
        tenantId: rs.tenantId,
        versionNumber: rs.versionNumber,
        versionLabel: rs.versionLabel,
        effectiveFrom: rs.effectiveFrom.toISOString(),
        status: rs.status as 'draft' | 'active' | 'superseded',
        rulesConfig: rs.rulesConfig as unknown as VerificationRuleConfig,
        createdByName: rs.createdByUser?.fullName ?? 'System Admin',
        createdAt: rs.createdAt.toISOString(),
      })),
      correlationEdges: dbCorrelationEdges.map((e) => ({
        id: e.id,
        tenantId: e.tenantId,
        projectId: e.projectId,
        sourceNodeType: e.sourceNodeType,
        sourceNodeId: e.sourceNodeId,
        sourceLabel: e.sourceNodeId,
        targetNodeType: e.targetNodeType,
        targetNodeId: e.targetNodeId,
        targetLabel: e.targetNodeId,
        edgeType: e.edgeType,
        confidence: Number(e.confidence),
        rationale: e.rationale,
      })),
      aiGenerations: dbAiGenerations.map((g) => ({
        id: g.id,
        tenantId: g.tenantId,
        userId: g.userId ?? undefined,
        targetType: g.targetType,
        targetId: g.targetId,
        targetLabel: g.targetId,
        generationMode: g.generationMode,
        modelId: g.modelId,
        promptVersion: g.promptVersion,
        sanitizedPromptPayload: (g.sanitizedPromptPayload ?? {}) as Record<string, unknown>,
        citedEventIds: g.citedEventIds,
        citedArtifactIds: g.citedArtifactIds,
        draftMarkdown: g.draftMarkdown,
        humanApprovedMarkdown: g.humanApprovedMarkdown ?? undefined,
        status: g.status,
        tokensUsed: g.tokensUsed,
        approvedByName: g.approver?.fullName ?? undefined,
        approvedAt: g.approvedAt ? g.approvedAt.toISOString() : undefined,
        createdAt: g.createdAt.toISOString(),
      })),
      disputes: dbDisputes.map((d) => ({
        id: d.id,
        tenantId: d.tenantId,
        timesheetId: d.timesheetId,
        timesheetLineId: d.timesheetLineId,
        taskCode: 'TASK',
        taskTitle: d.timesheetLine.developerNote || 'Timesheet Line',
        developerId: d.timesheet.userId,
        developerName: d.timesheet.user.fullName,
        openedByUserId: d.openedByUserId,
        openedByName: d.openedBy.fullName,
        assignedReviewerId: d.assignedReviewerId ?? undefined,
        assignedReviewerName: d.assignedReviewer?.fullName ?? undefined,
        escalatedReviewerId: d.escalatedReviewerId ?? undefined,
        escalatedReviewerName: d.escalatedReviewer?.fullName ?? undefined,
        escalationReason: d.escalationReason ?? undefined,
        dueDate: d.dueDate ? d.dueDate.toISOString().slice(0, 10) : undefined,
        requestedEvidenceType: d.requestedEvidenceType ?? undefined,
        status: d.status,
        disputedMinutes: Number(d.disputedMinutes),
        adjustedApprovedMinutes: d.adjustedApprovedMinutes
          ? Number(d.adjustedApprovedMinutes)
          : undefined,
        reason: d.reason,
        resolutionSummary: d.resolutionSummary ?? d.resolutionNote ?? undefined,
        policyVersionCode: 'v1.0-2026-11',
        creditInvoiceId: d.creditInvoiceId ?? undefined,
        createdAt: d.createdAt.toISOString(),
        resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : undefined,
        messages: d.messages.map((m) => ({
          id: m.id,
          authorUserId: m.authorUserId,
          authorName: m.author.fullName,
          authorRole: 'developer',
          messageType: m.messageType,
          messageMarkdown: m.messageMarkdown,
          attachedArtifactIds: m.attachedArtifactIds,
          beforeMinutes: m.beforeMinutes ? Number(m.beforeMinutes) : undefined,
          afterMinutes: m.afterMinutes ? Number(m.afterMinutes) : undefined,
          createdAt: m.createdAt.toISOString(),
        })),
      })),
    }
  } catch {
    return {
      ruleSets: [],
      correlationEdges: [],
      aiGenerations: [],
      disputes: [],
    }
  }
}

export async function handleToggleTenantAiPrisma(body: {
  tenantId: string
  aiEnabled: boolean
  actorUserId?: string
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false }
  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: body.tenantId },
      data: { aiEnabled: body.aiEnabled },
    })
    await tx.auditEntry.create({
      data: {
        tenantId: body.tenantId,
        actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
        actionType: 'TENANT_AI_SETTING_CHANGED',
        targetEntity: `tenants:${body.tenantId}`,
        reason: `Set ai_enabled = ${String(body.aiEnabled)} (F3-027)`,
      },
    })
  })
  return { ok: true }
}

export async function handlePublishRuleSetPrisma(body: {
  tenantId: string
  versionNumber: number
  versionLabel: string
  rulesConfig: Record<string, unknown>
  simulationSummary?: Record<string, unknown>
  createdBy?: string
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false }
  const created = await prisma.$transaction(async (tx) => {
    await tx.verificationRuleSet.updateMany({
      where: { tenantId: body.tenantId, status: 'active' },
      data: { status: 'superseded' },
    })
    const ruleSet = await tx.verificationRuleSet.create({
      data: {
        tenantId: body.tenantId,
        versionNumber: body.versionNumber,
        versionLabel: body.versionLabel,
        status: 'active',
        rulesConfig: body.rulesConfig as object,
        simulationSummary: (body.simulationSummary ?? null) as object,
        createdBy: isValidUuid(body.createdBy) ? body.createdBy : null,
      },
    })
    await tx.auditEntry.create({
      data: {
        tenantId: body.tenantId,
        actorUserId: isValidUuid(body.createdBy) ? body.createdBy : null,
        actionType: 'VERIFICATION_RULE_SET_PUBLISHED',
        targetEntity: `verification_rule_sets:v${body.versionNumber}`,
        targetId: ruleSet.id,
        reason: `Published rule set ${body.versionLabel} (no retroactive historical changes).`,
      },
    })
    return ruleSet
  })
  return { ok: true, id: created.id }
}

export async function handleCreateAiGenerationPrisma(body: {
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
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false }
  const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } })
  if (!tenant) return { ok: false, error: 'Tenant not found' }

  if (body.generationMode === 'ai_guardrailed' && !tenant.aiEnabled) {
    return {
      ok: false,
      error: 'Tenant has AI assistance disabled (F3-027).',
    }
  }

  const created = await prisma.aiGeneration.create({
    data: {
      tenantId: body.tenantId,
      userId: isValidUuid(body.userId) ? body.userId : null,
      targetType: body.targetType,
      targetId: body.targetId,
      generationMode: body.generationMode,
      modelId: body.modelId,
      promptVersion: body.promptVersion,
      sanitizedPromptPayload: body.sanitizedPromptPayload as object,
      citedEventIds: body.citedEventIds,
      citedArtifactIds: body.citedArtifactIds,
      draftMarkdown: body.draftMarkdown,
      status: 'draft',
      tokensUsed: body.tokensUsed,
    },
  })
  return { ok: true, id: created.id }
}

export async function handleDecideAiGenerationPrisma(body: {
  generationId: string
  status: 'edited_approved' | 'discarded'
  humanApprovedMarkdown?: string
  approvedByUserId?: string
}) {
  if (!isValidUuid(body.generationId)) return { ok: false }
  await prisma.aiGeneration.update({
    where: { id: body.generationId },
    data: {
      status: body.status,
      ...(body.status === 'edited_approved'
        ? {
          humanApprovedMarkdown: body.humanApprovedMarkdown ?? null,
          approvedByUserId: isValidUuid(body.approvedByUserId) ? body.approvedByUserId : null,
          approvedAt: new Date(),
        }
        : {}),
    },
  })
  return { ok: true }
}

export async function handlePartialApproveTimesheetPrisma(body: {
  tenantId: string
  timesheetId: string
  reviewerUserId: string
  uncontestedLineIds: string[]
  reason: string
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.reviewerUserId)) {
    return { ok: false }
  }
  const validLines = body.uncontestedLineIds.filter(isValidUuid)
  if (validLines.length === 0) return { ok: false }

  await prisma.$transaction(async (tx) => {
    for (const lineId of validLines) {
      const line = await tx.timesheetLine.findUnique({ where: { id: lineId } })
      if (!line || line.isLocked) continue
      await tx.timesheetLine.update({
        where: { id: lineId },
        data: {
          approvedBillableMinutes: line.claimedMinutes,
          lineStatus: 'approved',
          reviewerComment: body.reason,
        },
      })
      await tx.reviewDecision.create({
        data: {
          tenantId: body.tenantId,
          timesheetId: line.timesheetId,
          timesheetLineId: lineId,
          reviewerUserId: body.reviewerUserId,
          decisionType: 'approve',
          reason: body.reason,
          previousApprovedMinutes: line.approvedBillableMinutes,
          newApprovedMinutes: line.claimedMinutes,
        },
      })
    }

    if (isValidUuid(body.timesheetId)) {
      await tx.timesheet.update({
        where: { id: body.timesheetId },
        data: { status: 'partially_approved' },
      })
    }
  })

  return { ok: true }
}

export async function handleOpenDisputePrisma(body: {
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
}) {
  if (
    !isValidUuid(body.tenantId) ||
    !isValidUuid(body.timesheetId) ||
    !isValidUuid(body.timesheetLineId) ||
    !isValidUuid(body.openedByUserId)
  ) {
    return { ok: false }
  }

  const created = await prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.create({
      data: {
        tenantId: body.tenantId,
        timesheetId: body.timesheetId,
        timesheetLineId: body.timesheetLineId,
        openedByUserId: body.openedByUserId,
        assignedReviewerId: isValidUuid(body.assignedReviewerId) ? body.assignedReviewerId : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        requestedEvidenceType: body.requestedEvidenceType ?? null,
        disputedMinutes: body.disputedMinutes,
        reason: body.reason,
        status: body.messageType === 'clarification_request' ? 'awaiting_developer' : 'open',
      },
    })

    await tx.disputeMessage.create({
      data: {
        tenantId: body.tenantId,
        disputeId: dispute.id,
        authorUserId: body.openedByUserId,
        messageType: body.messageType ?? 'developer_appeal',
        messageMarkdown: body.reason,
        attachedArtifactIds: (body.attachedArtifactIds ?? []).filter(isValidUuid),
      },
    })

    await tx.timesheetLine.update({
      where: { id: body.timesheetLineId },
      data: { lineStatus: 'disputed' },
    })

    return dispute
  })

  return { ok: true, id: created.id }
}

export async function handleDisputeActionPrisma(body: {
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
}) {
  if (
    !isValidUuid(body.tenantId) ||
    !isValidUuid(body.disputeId) ||
    !isValidUuid(body.actorUserId)
  ) {
    return { ok: false }
  }

  const existing = await prisma.dispute.findUnique({ where: { id: body.disputeId } })
  if (!existing) return { ok: false, error: 'Dispute not found' }

  if (body.action === 'escalate') {
    if (
      !isValidUuid(body.escalatedReviewerId) ||
      body.escalatedReviewerId === existing.assignedReviewerId ||
      body.escalatedReviewerId === existing.openedByUserId
    ) {
      return {
        ok: false,
        error: 'Independent second review requires a distinct reviewer (F3-033).',
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: body.disputeId },
        data: {
          status: 'escalated',
          escalatedReviewerId: body.escalatedReviewerId,
          escalationReason: body.messageMarkdown ?? 'Escalated for independent second review',
        },
      })
      await tx.disputeMessage.create({
        data: {
          tenantId: body.tenantId,
          disputeId: body.disputeId,
          authorUserId: body.actorUserId,
          messageType: 'escalation',
          messageMarkdown: body.messageMarkdown ?? 'Escalated for independent second review',
        },
      })
    })
    return { ok: true }
  }

  if (body.action === 'reply') {
    const nextStatus =
      existing.openedByUserId === body.actorUserId ? 'awaiting_manager' : 'awaiting_developer'
    await prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: body.disputeId },
        data: { status: nextStatus },
      })
      await tx.disputeMessage.create({
        data: {
          tenantId: body.tenantId,
          disputeId: body.disputeId,
          authorUserId: body.actorUserId,
          messageType:
            existing.openedByUserId === body.actorUserId ? 'developer_appeal' : 'reviewer_note',
          messageMarkdown: body.messageMarkdown ?? '',
          attachedArtifactIds: (body.attachedArtifactIds ?? []).filter(isValidUuid),
        },
      })
    })
    return { ok: true }
  }

  // resolve
  await prisma.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: body.disputeId },
      data: {
        status: body.resolutionStatus ?? 'resolved_accepted',
        resolutionSummary: body.resolutionSummary ?? '',
        resolutionNote: body.resolutionSummary ?? '',
        adjustedApprovedMinutes: body.adjustedApprovedMinutes ?? null,
        resolvedAt: new Date(),
      },
    })
    await tx.disputeMessage.create({
      data: {
        tenantId: body.tenantId,
        disputeId: body.disputeId,
        authorUserId: body.actorUserId,
        messageType: 'resolution',
        messageMarkdown: body.resolutionSummary ?? 'Dispute resolved',
        afterMinutes: body.adjustedApprovedMinutes ?? null,
      },
    })
    await tx.auditEntry.create({
      data: {
        tenantId: body.tenantId,
        actorUserId: body.actorUserId,
        actionType: 'DISPUTE_RESOLVED',
        targetEntity: `disputes:${body.disputeId}`,
        targetId: body.disputeId,
        reason: body.resolutionSummary ?? 'Dispute resolved',
      },
    })
  })

  return { ok: true }
}

