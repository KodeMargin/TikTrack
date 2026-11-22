/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  ApiKeyRecord,
  BillingProvider,
  CalendarMeetingEventRecord,
  EcosystemConnectorCategory,
  EcosystemConnectorProvider,
  EcosystemConnectorRecord,
  OutboundWebhookDeliveryRecord,
  OutboundWebhookEndpointRecord,
  OutboundWebhookEventType,
  PortableWorkReportRecord,
  ProjectForecastSummary,
  PublicApiScope,
  QuotaEvaluationReport,
  SaasPlanTier,
  SaasSubscriptionInvoiceRecord,
  SubscriptionAccountRecord,
  UsageRecordSnapshot,
  WhiteLabelBrandingConfig,
} from '@/types/domain.types'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store } from '@/context/Phase2Store'
import { usePhase3Store } from '@/context/Phase3Store'
import {
  buildSaasSubscriptionInvoiceDraft,
  calculateSaasSubscriptionTotals,
  evaluateUsageQuotas,
  PHASE4_PLAN_CATALOG,
} from '@/lib/phase4/saasBilling'
import {
  authorizePublicApiRequest,
  createSignedOutboundWebhookDelivery,
  generateScopedApiKey,
  sha256Hex,
} from '@/lib/phase4/publicApiAndWebhooks'
import {
  mapExternalPmIssueToTaskDraft,
  sanitizeCalendarMeetingEvent,
  type ExternalPmTicketDraft,
} from '@/lib/phase4/ecosystemConnectors'
import { computeProjectForecasts } from '@/lib/phase4/forecasting'
import { generateSignedPortableWorkReport } from '@/lib/phase4/portableReport'
import {
  checkoutSubscriptionViaPrisma,
  createApiKeyViaPrisma,
  createPortableReportViaPrisma,
  createWebhookEndpointViaPrisma,
  dispatchWebhookDeliveryViaPrisma,
  revokeApiKeyViaPrisma,
  syncCalendarMeetingViaPrisma,
  updateBrandingViaPrisma,
  upsertConnectorViaPrisma,
} from '@/lib/prismaApiClient'

export const DEFAULT_WHITE_LABEL_BRANDING: WhiteLabelBrandingConfig = {
  agencyBrandName: 'TikTrack Workspace',
  logoText: 'TT',
  accentColorHex: '#702fe3',
  customDomain: 'workspace.agency-example.dev',
  supportEmail: 'support@agency-example.dev',
  portalWelcomeMessage:
    'Verified project hours, deliverables, and approved work summaries.',
  hideDevProofWatermark: false,
}

interface Phase4StoreContextValue {
  subscription: SubscriptionAccountRecord
  saasInvoices: SaasSubscriptionInvoiceRecord[]
  usageSnapshot: UsageRecordSnapshot
  quotaReport: QuotaEvaluationReport
  whiteLabelBranding: WhiteLabelBrandingConfig
  apiKeys: ApiKeyRecord[]
  webhookEndpoints: OutboundWebhookEndpointRecord[]
  webhookDeliveries: OutboundWebhookDeliveryRecord[]
  connectors: EcosystemConnectorRecord[]
  calendarMeetings: CalendarMeetingEventRecord[]
  projectForecasts: ProjectForecastSummary[]
  portableReports: PortableWorkReportRecord[]
  checkoutSubscriptionPlan: (input: {
    planTier: SaasPlanTier
    billingProvider: BillingProvider
    billingCycle: 'monthly' | 'annual'
  }) => { ok: boolean; message: string }
  updateWhiteLabelBranding: (
    config: WhiteLabelBrandingConfig
  ) => { ok: boolean; message: string }
  createScopedApiKey: (input: {
    name: string
    scopes: PublicApiScope[]
    rateLimitPerMin: number
  }) => Promise<{ ok: boolean; plaintextKey?: string; message: string }>
  revokeApiKey: (keyId: string) => void
  testPublicApiEndpoint: (input: {
    bearerKey: string
    resource: 'projects' | 'tasks' | 'timesheets' | 'invoices'
  }) => Promise<{
    statusCode: number
    ok: boolean
    payload: unknown
  }>
  createWebhookEndpoint: (input: {
    name: string
    targetUrl: string
    subscribedEvents: OutboundWebhookEventType[]
  }) => Promise<{ ok: boolean; signingSecret?: string; message: string }>
  dispatchTestOutboundWebhook: (input: {
    endpointId: string
    eventType: OutboundWebhookEventType
    payloadData?: Record<string, unknown>
  }) => Promise<{ ok: boolean; signatureHeader?: string; message: string }>
  toggleEcosystemConnector: (input: {
    category: EcosystemConnectorCategory
    provider: EcosystemConnectorProvider
    displayName: string
    syncConfig?: Record<string, string | number | boolean>
  }) => { ok: boolean; message: string }
  syncCalendarMeeting: (input: {
    projectId: string
    taskId?: string
    rawTitle: string
    startedAtUtc: string
    endedAtUtc: string
    syncPermissionScope: 'metadata_only' | 'title_and_duration'
  }) => { ok: boolean; message: string }
  importExternalPmIssue: (issue: ExternalPmTicketDraft & { projectId: string }) => {
    ok: boolean
    message: string
  }
  generateDeveloperPortableReport: (input: {
    reportTitle: string
    periodStart: string
    periodEnd: string
  }) => Promise<{ ok: boolean; report?: PortableWorkReportRecord; message: string }>
}

const Phase4StoreContext = createContext<Phase4StoreContextValue | null>(null)

export function Phase4StoreProvider({ children }: { children: ReactNode }) {
  const {
    activeTenant,
    activeUser,
    members,
    projects,
    tasks,
    createTask,
    timesheetLines,
    invoices,
    prismaStatus,
    phase4Bootstrap,
    setTenantPlanTierState,
    setTenantBrandingState,
  } = usePhase1Store()

  const { evidenceArtifacts, privacyAuditBatches } = usePhase2Store()
  const { aiGenerations } = usePhase3Store()

  const [localSubs, setLocalSubs] = useState<SubscriptionAccountRecord[]>([])
  const [localSaasInvoices, setLocalSaasInvoices] = useState<SaasSubscriptionInvoiceRecord[]>([])
  const [localApiKeys, setLocalApiKeys] = useState<ApiKeyRecord[]>([])
  const [localRevokedKeyIds, setLocalRevokedKeyIds] = useState<string[]>([])
  const [localEndpoints, setLocalEndpoints] = useState<OutboundWebhookEndpointRecord[]>([])
  const [localEndpointSecrets, setLocalEndpointSecrets] = useState<Record<string, string>>({})
  const [localDeliveries, setLocalDeliveries] = useState<OutboundWebhookDeliveryRecord[]>([])
  const [localConnectors, setLocalConnectors] = useState<EcosystemConnectorRecord[]>([])
  const [localMeetings, setLocalMeetings] = useState<CalendarMeetingEventRecord[]>([])
  const [localPortableReports, setLocalPortableReports] = useState<PortableWorkReportRecord[]>([])
  const [apiCallBump, setApiCallBump] = useState(0)

  const subscription = useMemo<SubscriptionAccountRecord>(() => {
    const local = localSubs.find((s) => s.tenantId === activeTenant.id)
    if (local) return local
    const db = (phase4Bootstrap?.subscriptions ?? []).find(
      (s) => s.tenantId === activeTenant.id
    )
    if (db) return db
    const now = new Date()
    const end = new Date(now.getTime() + 30 * 86400 * 1000)
    return {
      id: `sub-${activeTenant.id || 'default'}`,
      tenantId: activeTenant.id,
      planTier: activeTenant.planTier,
      billingProvider: 'stripe',
      status: activeTenant.planTier === 'starter' ? 'trialing' : 'active',
      billingCycle: 'monthly',
      trialEndsAt: new Date(now.getTime() + 14 * 86400 * 1000).toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: end.toISOString(),
      cancelAtPeriodEnd: false,
    }
  }, [localSubs, phase4Bootstrap, activeTenant.id, activeTenant.planTier])

  const saasInvoices = useMemo(() => {
    const map = new Map<string, SaasSubscriptionInvoiceRecord>()
    for (const inv of phase4Bootstrap?.saasInvoices ?? []) {
      if (inv.tenantId === activeTenant.id) map.set(inv.id, inv)
    }
    for (const inv of localSaasInvoices) {
      if (inv.tenantId === activeTenant.id) map.set(inv.id, inv)
    }
    return Array.from(map.values()).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }, [phase4Bootstrap, localSaasInvoices, activeTenant.id])

  const apiKeys = useMemo(() => {
    const map = new Map<string, ApiKeyRecord>()
    for (const k of phase4Bootstrap?.apiKeys ?? []) {
      if (k.tenantId === activeTenant.id) map.set(k.id, k)
    }
    for (const k of localApiKeys) {
      if (k.tenantId === activeTenant.id) map.set(k.id, k)
    }
    return Array.from(map.values())
      .map((k) =>
        localRevokedKeyIds.includes(k.id) && !k.revokedAt
          ? { ...k, revokedAt: new Date().toISOString() }
          : k
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [phase4Bootstrap, localApiKeys, localRevokedKeyIds, activeTenant.id])

  const webhookEndpoints = useMemo(() => {
    const map = new Map<string, OutboundWebhookEndpointRecord>()
    for (const ep of phase4Bootstrap?.webhookEndpoints ?? []) {
      if (ep.tenantId === activeTenant.id) map.set(ep.id, ep)
    }
    for (const ep of localEndpoints) {
      if (ep.tenantId === activeTenant.id) map.set(ep.id, ep)
    }
    return Array.from(map.values())
  }, [phase4Bootstrap, localEndpoints, activeTenant.id])

  const webhookDeliveries = useMemo(() => {
    const map = new Map<string, OutboundWebhookDeliveryRecord>()
    for (const d of phase4Bootstrap?.webhookDeliveries ?? []) {
      if (d.tenantId === activeTenant.id) map.set(d.id, d)
    }
    for (const d of localDeliveries) {
      if (d.tenantId === activeTenant.id) map.set(d.id, d)
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [phase4Bootstrap, localDeliveries, activeTenant.id])

  const connectors = useMemo(() => {
    const map = new Map<string, EcosystemConnectorRecord>()
    for (const c of phase4Bootstrap?.connectors ?? []) {
      if (c.tenantId === activeTenant.id) map.set(c.provider, c)
    }
    for (const c of localConnectors) {
      if (c.tenantId === activeTenant.id) map.set(c.provider, c)
    }
    return Array.from(map.values())
  }, [phase4Bootstrap, localConnectors, activeTenant.id])

  const calendarMeetings = useMemo(() => {
    const map = new Map<string, CalendarMeetingEventRecord>()
    for (const m of phase4Bootstrap?.calendarMeetings ?? []) {
      if (m.tenantId === activeTenant.id) map.set(m.id, m)
    }
    for (const m of localMeetings) {
      if (m.tenantId === activeTenant.id) map.set(m.id, m)
    }
    return Array.from(map.values()).sort((a, b) =>
      b.startedAtUtc.localeCompare(a.startedAtUtc)
    )
  }, [phase4Bootstrap, localMeetings, activeTenant.id])

  const portableReports = useMemo(() => {
    const map = new Map<string, PortableWorkReportRecord>()
    for (const r of phase4Bootstrap?.portableReports ?? []) {
      if (r.tenantId === activeTenant.id) map.set(r.id, r)
    }
    for (const r of localPortableReports) {
      if (r.tenantId === activeTenant.id) map.set(r.id, r)
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [phase4Bootstrap, localPortableReports, activeTenant.id])

  const usageSnapshot = useMemo<UsageRecordSnapshot>(() => {
    const latestDbUsage = (phase4Bootstrap?.usageRecords ?? []).find(
      (u) => u.tenantId === activeTenant.id
    )
    const activeSeats = members.filter((m) => m.status === 'active').length
    const activeProjects = projects.filter((p) => p.status === 'active').length
    const aiTokens = aiGenerations.reduce((sum, g) => sum + g.tokensUsed, 0)
    const eventCount = Math.max(
      latestDbUsage?.activityEventsCount ?? 0,
      privacyAuditBatches.reduce((sum, b) => sum + b.eventCount, 0)
    )
    return {
      id: latestDbUsage?.id ?? `usage-${activeTenant.id || 'today'}`,
      tenantId: activeTenant.id,
      metricDate: new Date().toISOString().slice(0, 10),
      activeSeats,
      activeProjects,
      activityEventsCount: eventCount,
      storageBytes: latestDbUsage?.storageBytes ?? evidenceArtifacts.length * 48_000,
      aiTokensUsed: Math.max(latestDbUsage?.aiTokensUsed ?? 0, aiTokens),
      apiRequestsCount: (latestDbUsage?.apiRequestsCount ?? 0) + apiCallBump,
      webhookDeliveriesCount: Math.max(
        latestDbUsage?.webhookDeliveriesCount ?? 0,
        webhookDeliveries.length
      ),
    }
  }, [
    phase4Bootstrap,
    activeTenant.id,
    members,
    projects,
    aiGenerations,
    privacyAuditBatches,
    evidenceArtifacts.length,
    apiCallBump,
    webhookDeliveries.length,
  ])

  const quotaReport = useMemo(
    () =>
      evaluateUsageQuotas(
        subscription.planTier,
        usageSnapshot,
        subscription.seatLimitOverride
      ),
    [subscription.planTier, subscription.seatLimitOverride, usageSnapshot]
  )

  const whiteLabelBranding = useMemo<WhiteLabelBrandingConfig>(() => {
    const raw = (activeTenant.brandingConfig ?? {}) as Partial<WhiteLabelBrandingConfig>
    return {
      ...DEFAULT_WHITE_LABEL_BRANDING,
      agencyBrandName: raw.agencyBrandName || `${activeTenant.name || 'TikTrack'} Workspace`,
      logoText: raw.logoText || (activeTenant.name ? activeTenant.name.slice(0, 2).toUpperCase() : 'TT'),
      accentColorHex: raw.accentColorHex || DEFAULT_WHITE_LABEL_BRANDING.accentColorHex,
      customDomain: raw.customDomain || DEFAULT_WHITE_LABEL_BRANDING.customDomain,
      supportEmail: raw.supportEmail || DEFAULT_WHITE_LABEL_BRANDING.supportEmail,
      portalWelcomeMessage:
        raw.portalWelcomeMessage || DEFAULT_WHITE_LABEL_BRANDING.portalWelcomeMessage,
      hideDevProofWatermark: Boolean(raw.hideDevProofWatermark),
    }
  }, [activeTenant.brandingConfig, activeTenant.name])

  const projectForecasts = useMemo(
    () =>
      computeProjectForecasts({
        projects,
        tasks,
        timesheetLines,
      }),
    [projects, tasks, timesheetLines]
  )

  function checkoutSubscriptionPlan(input: {
    planTier: SaasPlanTier
    billingProvider: BillingProvider
    billingCycle: 'monthly' | 'annual'
  }): { ok: boolean; message: string } {
    const seatsBilled = Math.max(1, usageSnapshot.activeSeats)
    const totals = calculateSaasSubscriptionTotals(
      input.planTier,
      seatsBilled,
      input.billingCycle
    )
    const nextSub: SubscriptionAccountRecord = {
      ...subscription,
      planTier: input.planTier,
      billingProvider: input.billingProvider,
      billingCycle: input.billingCycle,
      status: 'active',
    }
    const saasInvoice = buildSaasSubscriptionInvoiceDraft({
      tenantId: activeTenant.id,
      subscriptionAccountId: nextSub.id,
      planTier: input.planTier,
      seatsBilled,
      billingCycle: input.billingCycle,
      currency: activeTenant.currency,
      sequenceNumber: saasInvoices.length + 1,
    })

    setLocalSubs((prev) => [
      nextSub,
      ...prev.filter((s) => s.tenantId !== activeTenant.id),
    ])
    setLocalSaasInvoices((prev) => [saasInvoice, ...prev])
    setTenantPlanTierState(activeTenant.id, input.planTier)

    if (prismaStatus.connected) {
      const spec = PHASE4_PLAN_CATALOG[input.planTier]
      void checkoutSubscriptionViaPrisma({
        tenantId: activeTenant.id,
        planTier: input.planTier,
        billingProvider: input.billingProvider,
        billingCycle: input.billingCycle,
        seatsBilled,
        unitPriceCents: spec.perSeatPriceCents,
        subtotalCents: totals.subtotalCents,
        totalCents: totals.totalCents,
        currency: activeTenant.currency,
        invoiceNumber: saasInvoice.invoiceNumber,
        billingPeriodLabel: saasInvoice.billingPeriodLabel,
        actorUserId: activeUser.id,
      })
    }

    return {
      ok: true,
      message: `Switched plan to ${input.planTier.toUpperCase()} (${input.billingCycle}) via ${input.billingProvider}. Receipt ${saasInvoice.invoiceNumber} issued.`,
    }
  }

  function updateWhiteLabelBranding(config: WhiteLabelBrandingConfig): {
    ok: boolean
    message: string
  } {
    const spec = PHASE4_PLAN_CATALOG[subscription.planTier]
    if (!spec.whiteLabelEnabled) {
      return {
        ok: false,
        message: `Custom workspace branding requires the Agency or Enterprise plan (currently on ${subscription.planTier}).`,
      }
    }
    setTenantBrandingState(activeTenant.id, config as unknown as Record<string, unknown>)
    if (prismaStatus.connected) {
      void updateBrandingViaPrisma({
        tenantId: activeTenant.id,
        brandingConfig: config,
        actorUserId: activeUser.id,
      })
    }
    return {
      ok: true,
      message: `Workspace branding saved for "${config.agencyBrandName}".`,
    }
  }

  async function createScopedApiKey(input: {
    name: string
    scopes: PublicApiScope[]
    rateLimitPerMin: number
  }) {
    if (!input.name.trim() || input.scopes.length === 0) {
      return { ok: false, message: 'Provide a key name and at least one scope.' }
    }
    const { plaintextKey, record } = await generateScopedApiKey({
      tenantId: activeTenant.id,
      name: input.name,
      scopes: input.scopes,
      rateLimitPerMin: input.rateLimitPerMin,
    })

    let persistedId = record.id
    if (prismaStatus.connected) {
      const res = await createApiKeyViaPrisma({
        tenantId: activeTenant.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
        keyHashSha256: record.keyHashSha256,
        scopes: record.scopes,
        rateLimitPerMin: record.rateLimitPerMin,
        createdBy: activeUser.id,
      })
      if (res?.id) persistedId = res.id
    }

    setLocalApiKeys((prev) => [{ ...record, id: persistedId }, ...prev])
    return {
      ok: true,
      plaintextKey,
      message: `API key "${record.name}" created (${record.keyPrefix}...). Copy the key now — it will not be shown again.`,
    }
  }

  function revokeApiKey(keyId: string) {
    setLocalRevokedKeyIds((prev) => [...prev, keyId])
    if (prismaStatus.connected) {
      void revokeApiKeyViaPrisma({ tenantId: activeTenant.id, keyId })
    }
  }

  async function testPublicApiEndpoint(input: {
    bearerKey: string
    resource: 'projects' | 'tasks' | 'timesheets' | 'invoices'
  }) {
    const requiredScope: PublicApiScope =
      input.resource === 'tasks'
        ? 'tasks:read'
        : input.resource === 'timesheets'
          ? 'timesheets:read'
          : input.resource === 'invoices'
            ? 'invoices:read'
            : 'projects:read'

    const authRes = await authorizePublicApiRequest({
      authorizationHeader: `Bearer ${input.bearerKey.trim()}`,
      requiredScope,
      keys: apiKeys,
    })

    if (!authRes.authorized) {
      return {
        statusCode: authRes.statusCode,
        ok: false,
        payload: {
          ok: false,
          error: { code: authRes.errorCode, message: authRes.message },
        },
      }
    }

    setApiCallBump((n) => n + 1)
    const data =
      input.resource === 'projects'
        ? projects.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          clientName: p.clientName,
          status: p.status,
        }))
        : input.resource === 'tasks'
          ? tasks.map((t) => ({
            id: t.id,
            code: t.code,
            title: t.title,
            status: t.status,
            estimateMinutes: t.estimateMinutes,
            isBillable: t.isBillable,
          }))
          : input.resource === 'timesheets'
            ? timesheetLines.map((l) => ({
              id: l.id,
              workDate: l.workDate,
              taskCode: l.taskCode,
              claimedMinutes: l.claimedMinutes,
              approvedBillableMinutes: l.approvedBillableMinutes,
              evidenceStatus: l.evidenceStatus,
            }))
            : invoices.map((inv) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              clientName: inv.clientName,
              totalAmount: inv.totalAmount,
              currency: inv.currency,
              status: inv.status,
            }))

    return {
      statusCode: 200,
      ok: true,
      payload: {
        ok: true,
        apiKeyPrefix: authRes.apiKey.keyPrefix,
        scope: requiredScope,
        count: data.length,
        data,
      },
    }
  }

  async function createWebhookEndpoint(input: {
    name: string
    targetUrl: string
    subscribedEvents: OutboundWebhookEventType[]
  }) {
    if (!input.name.trim() || !input.targetUrl.startsWith('http')) {
      return { ok: false, message: 'Provide a valid endpoint name and https:// URL.' }
    }
    const secret = `whsec_dp_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
    const prefix = secret.slice(0, 14)
    const secretHash = await sha256Hex(secret)

    let endpointId = `whep-${crypto.randomUUID().slice(0, 8)}`
    if (prismaStatus.connected) {
      const res = await createWebhookEndpointViaPrisma({
        tenantId: activeTenant.id,
        name: input.name.trim(),
        targetUrl: input.targetUrl.trim(),
        signingSecretPrefix: prefix,
        signingSecretHash: secretHash,
        subscribedEvents: input.subscribedEvents,
        createdBy: activeUser.id,
      })
      if (res?.id) endpointId = res.id
    }

    const endpoint: OutboundWebhookEndpointRecord = {
      id: endpointId,
      tenantId: activeTenant.id,
      name: input.name.trim(),
      targetUrl: input.targetUrl.trim(),
      signingSecretPrefix: prefix,
      subscribedEvents: input.subscribedEvents,
      isActive: true,
      createdAt: new Date().toISOString(),
    }
    setLocalEndpoints((prev) => [endpoint, ...prev])
    setLocalEndpointSecrets((prev) => ({ ...prev, [endpoint.id]: secret }))

    return {
      ok: true,
      signingSecret: secret,
      message: `Webhook "${endpoint.name}" added. Copy the signing secret now.`,
    }
  }

  async function dispatchTestOutboundWebhook(input: {
    endpointId: string
    eventType: OutboundWebhookEventType
    payloadData?: Record<string, unknown>
  }) {
    const endpoint = webhookEndpoints.find((e) => e.id === input.endpointId)
    if (!endpoint) {
      return { ok: false, message: 'Webhook endpoint not found.' }
    }
    const secret = localEndpointSecrets[endpoint.id] ?? endpoint.signingSecretPrefix
    const signed = await createSignedOutboundWebhookDelivery({
      tenantId: activeTenant.id,
      endpoint,
      signingSecret: secret,
      eventType: input.eventType,
      payloadData: input.payloadData ?? {
        tenantName: activeTenant.name,
        triggeredBy: activeUser.name,
        sample: true,
      },
    })

    setLocalDeliveries((prev) => [signed.delivery, ...prev])
    if (prismaStatus.connected) {
      void dispatchWebhookDeliveryViaPrisma({
        tenantId: activeTenant.id,
        endpointId: endpoint.id,
        eventType: input.eventType,
        eventId: signed.delivery.eventId,
        payload: signed.envelope,
        signatureHeader: signed.signatureHeader,
        responseSnippet: signed.delivery.responseSnippet ?? '202 Accepted',
      })
    }

    return {
      ok: true,
      signatureHeader: signed.signatureHeader,
      message: `Test event (${input.eventType}) delivered to ${endpoint.targetUrl}.`,
    }
  }

  function toggleEcosystemConnector(input: {
    category: EcosystemConnectorCategory
    provider: EcosystemConnectorProvider
    displayName: string
    syncConfig?: Record<string, string | number | boolean>
  }): { ok: boolean; message: string } {
    const existing = connectors.find((c) => c.provider === input.provider)
    const nextStatus = existing?.status === 'connected' ? 'disconnected' : 'connected'
    const nextRecord: EcosystemConnectorRecord = {
      id: existing?.id ?? `conn-${input.provider}`,
      tenantId: activeTenant.id,
      category: input.category,
      provider: input.provider,
      displayName: input.displayName,
      status: nextStatus,
      syncConfig: input.syncConfig ?? existing?.syncConfig ?? { permissionScope: 'metadata_only' },
      lastSyncedAt: nextStatus === 'connected' ? new Date().toISOString() : existing?.lastSyncedAt,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }

    setLocalConnectors((prev) => [
      nextRecord,
      ...prev.filter((c) => c.provider !== input.provider),
    ])

    if (prismaStatus.connected) {
      void upsertConnectorViaPrisma({
        tenantId: activeTenant.id,
        category: input.category,
        provider: input.provider,
        displayName: input.displayName,
        status: nextStatus,
        syncConfig: nextRecord.syncConfig,
        connectedBy: activeUser.id,
      })
    }

    return {
      ok: true,
      message: `${input.displayName} ${nextStatus === 'connected' ? 'connected' : 'disconnected'}.`,
    }
  }

  function syncCalendarMeeting(input: {
    projectId: string
    taskId?: string
    rawTitle: string
    startedAtUtc: string
    endedAtUtc: string
    syncPermissionScope: 'metadata_only' | 'title_and_duration'
  }): { ok: boolean; message: string } {
    const calConn = connectors.find((c) => c.category === 'calendar' && c.status === 'connected')
    const sanitized = sanitizeCalendarMeetingEvent({
      tenantId: activeTenant.id,
      userId: activeUser.id,
      connectorId: calConn?.id,
      projectId: input.projectId,
      taskId: input.taskId,
      externalEventId: `cal-evt-${crypto.randomUUID().slice(0, 8)}`,
      rawTitle: input.rawTitle,
      startedAtUtc: input.startedAtUtc,
      endedAtUtc: input.endedAtUtc,
      syncPermissionScope: input.syncPermissionScope,
    })

    setLocalMeetings((prev) => [sanitized, ...prev])
    if (prismaStatus.connected) {
      void syncCalendarMeetingViaPrisma({
        tenantId: activeTenant.id,
        userId: activeUser.id,
        projectId: sanitized.projectId,
        taskId: sanitized.taskId,
        connectorId: sanitized.connectorId,
        externalEventId: sanitized.externalEventId,
        meetingTitleSanitized: sanitized.meetingTitleSanitized,
        startedAtUtc: sanitized.startedAtUtc,
        endedAtUtc: sanitized.endedAtUtc,
        durationMinutes: sanitized.durationMinutes,
        syncPermissionScope: sanitized.syncPermissionScope,
      })
    }

    return {
      ok: true,
      message: `Logged calendar meeting "${sanitized.meetingTitleSanitized}" (${sanitized.durationMinutes} min).`,
    }
  }

  function importExternalPmIssue(
    issue: ExternalPmTicketDraft & { projectId: string }
  ): { ok: boolean; message: string } {
    if (!issue.projectId) {
      return {
        ok: false,
        message: 'Create a project in Projects & Tasks before importing external tasks.',
      }
    }
    const mapped = mapExternalPmIssueToTaskDraft(issue)
    createTask({
      projectId: issue.projectId,
      code: mapped.code,
      title: mapped.title,
      acceptanceCriteria: mapped.acceptanceCriteria,
      status: 'active',
      priority: mapped.priority,
      estimateMinutes: mapped.estimateMinutes,
      isBillable: true,
      defaultWorkMode: mapped.defaultWorkMode,
      assignedMemberIds: [activeUser.id],
      dueDate: new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10),
    })
    return {
      ok: true,
      message: `Imported ${issue.provider.toUpperCase()} task ${mapped.code} into Projects & Tasks.`,
    }
  }

  async function generateDeveloperPortableReport(input: {
    reportTitle: string
    periodStart: string
    periodEnd: string
  }) {
    const report = await generateSignedPortableWorkReport({
      tenantId: activeTenant.id,
      tenantName: activeTenant.name,
      developerUserId: activeUser.id,
      developerName: activeUser.name,
      reportTitle: input.reportTitle.trim() || `${activeUser.name} - Verified Work Report`,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lines: timesheetLines,
      deliverables: evidenceArtifacts.map((a) => ({
        id: a.id,
        sourceType: a.sourceType,
        externalId: a.externalId,
        summaryTitle: a.summaryTitle,
        occurredAtUtc: a.occurredAtUtc,
      })),
    })

    setLocalPortableReports((prev) => [report, ...prev])
    if (prismaStatus.connected) {
      void createPortableReportViaPrisma({
        tenantId: activeTenant.id,
        developerUserId: activeUser.id,
        reportTitle: report.reportTitle,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        totalApprovedMinutes: report.totalApprovedMinutes,
        totalSupportedMinutes: report.totalSupportedMinutes,
        deliverablesCount: report.deliverablesCount,
        payloadDigestSha256: report.payloadDigestSha256,
        signatureHmacSha256: report.signatureHmacSha256,
        reportPayload: report.reportPayload,
      })
    }

    return {
      ok: true,
      report,
      message: `Signed work report generated (${report.payloadDigestSha256.slice(0, 12)}...).`,
    }
  }

  return (
    <Phase4StoreContext.Provider
      value={{
        subscription,
        saasInvoices,
        usageSnapshot,
        quotaReport,
        whiteLabelBranding,
        apiKeys,
        webhookEndpoints,
        webhookDeliveries,
        connectors,
        calendarMeetings,
        projectForecasts,
        portableReports,
        checkoutSubscriptionPlan,
        updateWhiteLabelBranding,
        createScopedApiKey,
        revokeApiKey,
        testPublicApiEndpoint,
        createWebhookEndpoint,
        dispatchTestOutboundWebhook,
        toggleEcosystemConnector,
        syncCalendarMeeting,
        importExternalPmIssue,
        generateDeveloperPortableReport,
      }}
    >
      {children}
    </Phase4StoreContext.Provider>
  )
}

export function usePhase4Store() {
  const ctx = useContext(Phase4StoreContext)
  if (!ctx) {
    throw new Error('usePhase4Store must be used inside Phase4StoreProvider')
  }
  return ctx
}
