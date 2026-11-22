/**
 * DevProof (TikTrack) - Prisma ORM Phase 4 Handlers
 *
 * Persists Phase 4 workflows in Supabase PostgreSQL:
 *  - SaaS Subscriptions & Separate SaaS Invoices (F4-001, F4-003)
 *  - Seat & Usage Metering Snapshots (F4-002, F4-004)
 *  - Agency White-Label Branding Config (F4-012)
 *  - Scoped Public API Keys & Outbound Signed Webhooks (F4-006, F4-007)
 *  - Ecosystem Connectors & Calendar Meeting Metadata (F4-008..F4-010)
 *  - Developer Portable Work Reports (F4-013)
 */

import { prisma } from '../lib/prisma.ts'
import { isValidUuid } from './prismaPhase1Handlers.ts'
import { sanitizeSyncConfigForClient } from './integrations/integrationSecrets.ts'
import type {
  BillingProvider,
  EcosystemConnectorCategory,
  EcosystemConnectorProvider,
  OutboundWebhookEventType,
  PublicApiScope,
  SaasPlanTier,
  SubscriptionStatus,
  WhiteLabelBrandingConfig,
} from '../types/domain.types.ts'

export async function handleBootstrapPhase4Data() {
  try {
    const [
      dbSubscriptions,
      dbSaasInvoices,
      dbUsageRecords,
      dbApiKeys,
      dbWebhookEndpoints,
      dbWebhookDeliveries,
      dbConnectors,
      dbCalendarMeetings,
      dbPortableReports,
    ] = await Promise.all([
      prisma.subscriptionAccount.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.saasSubscriptionInvoice.findMany({
        orderBy: { issuedAt: 'desc' },
        take: 100,
      }),
      prisma.usageRecord.findMany({
        orderBy: { metricDate: 'desc' },
        take: 60,
      }),
      prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.outboundWebhookEndpoint.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.outboundWebhookDelivery.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.ecosystemConnector.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.calendarMeetingEvent.findMany({
        orderBy: { startedAtUtc: 'desc' },
        take: 60,
      }),
      prisma.portableWorkReport.findMany({
        include: { developer: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    return {
      subscriptions: dbSubscriptions.map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        planTier: s.planTier as SaasPlanTier,
        billingProvider: s.billingProvider as BillingProvider,
        providerCustomerId: s.providerCustomerId ?? undefined,
        providerSubscriptionId: s.providerSubscriptionId ?? undefined,
        status: s.status as SubscriptionStatus,
        billingCycle: s.billingCycle as 'monthly' | 'annual',
        trialEndsAt: s.trialEndsAt ? s.trialEndsAt.toISOString() : undefined,
        currentPeriodStart: s.currentPeriodStart.toISOString(),
        currentPeriodEnd: s.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        seatLimitOverride: s.seatLimitOverride ?? undefined,
      })),
      saasInvoices: dbSaasInvoices.map((inv) => ({
        id: inv.id,
        tenantId: inv.tenantId,
        subscriptionAccountId: inv.subscriptionAccountId,
        invoiceNumber: inv.invoiceNumber,
        billingPeriodLabel: inv.billingPeriodLabel,
        planTier: inv.planTier as SaasPlanTier,
        seatsBilled: inv.seatsBilled,
        unitPriceCents: inv.unitPriceCents,
        subtotalCents: inv.subtotalCents,
        taxCents: inv.taxCents,
        totalCents: inv.totalCents,
        currency: inv.currency,
        status: inv.status as 'draft' | 'open' | 'paid' | 'void',
        providerInvoiceId: inv.providerInvoiceId ?? undefined,
        issuedAt: inv.issuedAt.toISOString(),
        paidAt: inv.paidAt ? inv.paidAt.toISOString() : undefined,
      })),
      usageRecords: dbUsageRecords.map((u) => ({
        id: u.id,
        tenantId: u.tenantId,
        metricDate: u.metricDate.toISOString().slice(0, 10),
        activeSeats: u.activeSeats,
        activeProjects: u.activeProjects,
        activityEventsCount: Number(u.activityEventsCount),
        storageBytes: Number(u.storageBytes),
        aiTokensUsed: Number(u.aiTokensUsed),
        apiRequestsCount: Number(u.apiRequestsCount),
        webhookDeliveriesCount: Number(u.webhookDeliveriesCount),
      })),
      apiKeys: dbApiKeys.map((k) => ({
        id: k.id,
        tenantId: k.tenantId,
        name: k.name,
        keyPrefix: k.keyPrefix,
        keyHashSha256: k.keyHashSha256,
        scopes: k.scopes as PublicApiScope[],
        rateLimitPerMin: k.rateLimitPerMin,
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : undefined,
        expiresAt: k.expiresAt ? k.expiresAt.toISOString() : undefined,
        revokedAt: k.revokedAt ? k.revokedAt.toISOString() : undefined,
        createdAt: k.createdAt.toISOString(),
      })),
      webhookEndpoints: dbWebhookEndpoints.map((ep) => ({
        id: ep.id,
        tenantId: ep.tenantId,
        name: ep.name,
        targetUrl: ep.targetUrl,
        signingSecretPrefix: ep.signingSecretPrefix,
        subscribedEvents: ep.subscribedEvents as OutboundWebhookEventType[],
        isActive: ep.isActive,
        createdAt: ep.createdAt.toISOString(),
      })),
      webhookDeliveries: dbWebhookDeliveries.map((d) => ({
        id: d.id,
        tenantId: d.tenantId,
        endpointId: d.endpointId,
        eventType: d.eventType as OutboundWebhookEventType,
        eventId: d.eventId,
        signatureHeader: d.signatureHeader,
        deliveryStatus: d.deliveryStatus as 'pending' | 'delivered' | 'retrying' | 'failed',
        httpStatus: d.httpStatus ?? undefined,
        attemptCount: d.attemptCount,
        responseSnippet: d.responseSnippet ?? undefined,
        createdAt: d.createdAt.toISOString(),
      })),
      connectors: dbConnectors.map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        category: c.category as EcosystemConnectorCategory,
        provider: c.provider as EcosystemConnectorProvider,
        displayName: c.displayName,
        status: c.status as 'connected' | 'paused' | 'disconnected',
        syncConfig: sanitizeSyncConfigForClient(c.syncConfig),
        lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : undefined,
        createdAt: c.createdAt.toISOString(),
      })),
      calendarMeetings: dbCalendarMeetings.map((m) => ({
        id: m.id,
        tenantId: m.tenantId,
        userId: m.userId,
        projectId: m.projectId ?? undefined,
        taskId: m.taskId ?? undefined,
        connectorId: m.connectorId ?? undefined,
        externalEventId: m.externalEventId,
        meetingTitleSanitized: m.meetingTitleSanitized,
        startedAtUtc: m.startedAtUtc.toISOString(),
        endedAtUtc: m.endedAtUtc.toISOString(),
        durationMinutes: m.durationMinutes,
        associatedSegmentId: m.associatedSegmentId ?? undefined,
        syncPermissionScope: m.syncPermissionScope as 'metadata_only' | 'title_and_duration',
      })),
      portableReports: dbPortableReports.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        developerUserId: r.developerUserId,
        developerName: r.developer.fullName,
        reportTitle: r.reportTitle,
        periodStart: r.periodStart.toISOString().slice(0, 10),
        periodEnd: r.periodEnd.toISOString().slice(0, 10),
        totalApprovedMinutes: Number(r.totalApprovedMinutes),
        totalSupportedMinutes: Number(r.totalSupportedMinutes),
        deliverablesCount: r.deliverablesCount,
        payloadDigestSha256: r.payloadDigestSha256,
        signatureHmacSha256: r.signatureHmacSha256,
        reportPayload: (r.reportPayload ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  } catch {
    return {
      subscriptions: [],
      saasInvoices: [],
      usageRecords: [],
      apiKeys: [],
      webhookEndpoints: [],
      webhookDeliveries: [],
      connectors: [],
      calendarMeetings: [],
      portableReports: [],
    }
  }
}

export async function handleCheckoutSubscriptionPrisma(body: {
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
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false }

  const result = await prisma.$transaction(async (tx) => {
    const sub = await tx.subscriptionAccount.upsert({
      where: { tenantId: body.tenantId },
      update: {
        planTier: body.planTier,
        billingProvider: body.billingProvider,
        billingCycle: body.billingCycle,
        status: 'active',
        updatedAt: new Date(),
      },
      create: {
        tenantId: body.tenantId,
        planTier: body.planTier,
        billingProvider: body.billingProvider,
        billingCycle: body.billingCycle,
        status: 'active',
        providerCustomerId: `cus_${body.tenantId.slice(0, 8)}`,
        providerSubscriptionId: `sub_${body.tenantId.slice(0, 8)}`,
      },
    })

    await tx.tenant.update({
      where: { id: body.tenantId },
      data: { planTier: body.planTier },
    })

    const saasInvoice = await tx.saasSubscriptionInvoice.create({
      data: {
        tenantId: body.tenantId,
        subscriptionAccountId: sub.id,
        invoiceNumber: body.invoiceNumber,
        billingPeriodLabel: body.billingPeriodLabel,
        planTier: body.planTier,
        seatsBilled: body.seatsBilled,
        unitPriceCents: body.unitPriceCents,
        subtotalCents: body.subtotalCents,
        taxCents: 0,
        totalCents: body.totalCents,
        currency: body.currency,
        status: 'paid',
        paidAt: new Date(),
      },
    })

    await tx.auditEntry.create({
      data: {
        tenantId: body.tenantId,
        actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
        actionType: 'SAAS_SUBSCRIPTION_UPDATED',
        targetEntity: `subscription_accounts:${sub.id}`,
        reason: `Upgraded/synced ${body.billingProvider} subscription to ${body.planTier} (${body.billingCycle}).`,
      },
    })

    return { subId: sub.id, invoiceId: saasInvoice.id }
  })

  return { ok: true, ...result }
}

export async function handleUpdateBrandingPrisma(body: {
  tenantId: string
  brandingConfig: WhiteLabelBrandingConfig
  actorUserId?: string
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false }
  await prisma.$transaction(async (tx) => {
    await tx.tenantSettings.update({
      where: { tenantId: body.tenantId },
      data: { brandingConfig: body.brandingConfig as unknown as object },
    })
    await tx.auditEntry.create({
      data: {
        tenantId: body.tenantId,
        actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
        actionType: 'WHITE_LABEL_BRANDING_UPDATED',
        targetEntity: `tenant_settings:${body.tenantId}`,
        reason: `Updated agency portal branding for "${body.brandingConfig.agencyBrandName}".`,
      },
    })
  })
  return { ok: true }
}

export async function handleCreateApiKeyPrisma(body: {
  tenantId: string
  name: string
  keyPrefix: string
  keyHashSha256: string
  scopes: PublicApiScope[]
  rateLimitPerMin: number
  createdBy?: string
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false }
  const created = await prisma.apiKey.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      keyPrefix: body.keyPrefix,
      keyHashSha256: body.keyHashSha256,
      scopes: body.scopes,
      rateLimitPerMin: body.rateLimitPerMin,
      createdBy: isValidUuid(body.createdBy) ? body.createdBy : null,
    },
  })
  return { ok: true, id: created.id }
}

export async function handleRevokeApiKeyPrisma(body: {
  tenantId: string
  keyId: string
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.keyId)) return { ok: false }
  await prisma.apiKey.updateMany({
    where: { id: body.keyId, tenantId: body.tenantId },
    data: { revokedAt: new Date() },
  })
  return { ok: true }
}

export async function handleCreateWebhookEndpointPrisma(body: {
  tenantId: string
  name: string
  targetUrl: string
  signingSecretPrefix: string
  signingSecretHash: string
  subscribedEvents: OutboundWebhookEventType[]
  createdBy?: string
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false }
  const created = await prisma.outboundWebhookEndpoint.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      targetUrl: body.targetUrl,
      signingSecretPrefix: body.signingSecretPrefix,
      signingSecretHash: body.signingSecretHash,
      subscribedEvents: body.subscribedEvents,
      createdBy: isValidUuid(body.createdBy) ? body.createdBy : null,
    },
  })
  return { ok: true, id: created.id }
}

export async function handleDispatchWebhookDeliveryPrisma(body: {
  tenantId: string
  endpointId: string
  eventType: OutboundWebhookEventType
  eventId: string
  payload: Record<string, unknown>
  signatureHeader: string
  responseSnippet: string
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.endpointId)) return { ok: false }
  const created = await prisma.outboundWebhookDelivery.create({
    data: {
      tenantId: body.tenantId,
      endpointId: body.endpointId,
      eventType: body.eventType,
      eventId: isValidUuid(body.eventId) ? body.eventId : crypto.randomUUID(),
      payload: body.payload as object,
      signatureHeader: body.signatureHeader,
      deliveryStatus: 'delivered',
      httpStatus: 202,
      attemptCount: 1,
      lastAttemptAt: new Date(),
      responseSnippet: body.responseSnippet,
    },
  })
  return { ok: true, id: created.id }
}

export async function handleUpsertConnectorPrisma(body: {
  tenantId: string
  category: EcosystemConnectorCategory
  provider: EcosystemConnectorProvider
  displayName: string
  status: 'connected' | 'paused' | 'disconnected'
  syncConfig: Record<string, string | number | boolean>
  connectedBy?: string
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false }
  const connector = await prisma.ecosystemConnector.upsert({
    where: {
      tenantId_provider: {
        tenantId: body.tenantId,
        provider: body.provider,
      },
    },
    update: {
      status: body.status,
      displayName: body.displayName,
      syncConfig: body.syncConfig as object,
      lastSyncedAt: body.status === 'connected' ? new Date() : undefined,
      updatedAt: new Date(),
    },
    create: {
      tenantId: body.tenantId,
      category: body.category,
      provider: body.provider,
      displayName: body.displayName,
      status: body.status,
      syncConfig: body.syncConfig as object,
      lastSyncedAt: new Date(),
      connectedBy: isValidUuid(body.connectedBy) ? body.connectedBy : null,
    },
  })
  return { ok: true, id: connector.id }
}

export async function handleSyncCalendarMeetingPrisma(body: {
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
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) return { ok: false }
  const created = await prisma.calendarMeetingEvent.upsert({
    where: {
      tenantId_userId_externalEventId: {
        tenantId: body.tenantId,
        userId: body.userId,
        externalEventId: body.externalEventId,
      },
    },
    update: {
      meetingTitleSanitized: body.meetingTitleSanitized,
      durationMinutes: body.durationMinutes,
    },
    create: {
      tenantId: body.tenantId,
      userId: body.userId,
      projectId: isValidUuid(body.projectId) ? body.projectId : null,
      taskId: isValidUuid(body.taskId) ? body.taskId : null,
      connectorId: isValidUuid(body.connectorId) ? body.connectorId : null,
      externalEventId: body.externalEventId,
      meetingTitleSanitized: body.meetingTitleSanitized,
      startedAtUtc: new Date(body.startedAtUtc),
      endedAtUtc: new Date(body.endedAtUtc),
      durationMinutes: body.durationMinutes,
      syncPermissionScope: body.syncPermissionScope,
    },
  })
  return { ok: true, id: created.id }
}

export async function handleCreatePortableReportPrisma(body: {
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
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.developerUserId)) return { ok: false }
  const created = await prisma.portableWorkReport.create({
    data: {
      tenantId: body.tenantId,
      developerUserId: body.developerUserId,
      reportTitle: body.reportTitle,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      totalApprovedMinutes: body.totalApprovedMinutes,
      totalSupportedMinutes: body.totalSupportedMinutes,
      deliverablesCount: body.deliverablesCount,
      payloadDigestSha256: body.payloadDigestSha256,
      signatureHmacSha256: body.signatureHmacSha256,
      reportPayload: body.reportPayload as object,
    },
  })
  return { ok: true, id: created.id }
}

