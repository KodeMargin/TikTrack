import type {
  PlanCatalogSpec,
  QuotaEvaluationReport,
  QuotaMetricStatus,
  SaasPlanTier,
  SaasSubscriptionInvoiceRecord,
  UsageRecordSnapshot,
} from '../../types/domain.types.ts'

export const PHASE4_PLAN_CATALOG: Record<SaasPlanTier, PlanCatalogSpec> = {
  starter: {
    planTier: 'starter',
    displayName: 'Starter',
    tagline: 'Core evidence-backed time tracking & timesheets',
    maxSeats: 5,
    maxActiveProjects: 3,
    retentionDays: 90,
    monthlyEventQuota: 50_000,
    monthlyAiTokenQuota: 0,
    storageQuotaMb: 512,
    apiRateLimitPerMin: 30,
    githubIdeEnabled: false,
    clientPortalEnabled: false,
    aiAssistanceAvailable: false,
    outboundWebhooksEnabled: false,
    accountingConnectorsEnabled: false,
    externalPmEnabled: false,
    whiteLabelEnabled: false,
    baseMonthlyPriceCents: 0,
    perSeatPriceCents: 0,
  },
  team: {
    planTier: 'team',
    displayName: 'Team',
    tagline: 'GitHub/VS Code evidence correlation, rules & AI drafts',
    maxSeats: 25,
    maxActiveProjects: 25,
    retentionDays: 365,
    monthlyEventQuota: 500_000,
    monthlyAiTokenQuota: 150_000,
    storageQuotaMb: 5120,
    apiRateLimitPerMin: 120,
    githubIdeEnabled: true,
    clientPortalEnabled: false,
    aiAssistanceAvailable: true,
    outboundWebhooksEnabled: true,
    accountingConnectorsEnabled: false,
    externalPmEnabled: true,
    whiteLabelEnabled: false,
    baseMonthlyPriceCents: 4900,
    perSeatPriceCents: 1200,
  },
  agency: {
    planTier: 'agency',
    displayName: 'Agency',
    tagline: 'Client read-only portal, white-label & accounting exports',
    maxSeats: 100,
    maxActiveProjects: 100,
    retentionDays: 730,
    monthlyEventQuota: 2_500_000,
    monthlyAiTokenQuota: 750_000,
    storageQuotaMb: 25_600,
    apiRateLimitPerMin: 600,
    githubIdeEnabled: true,
    clientPortalEnabled: true,
    aiAssistanceAvailable: true,
    outboundWebhooksEnabled: true,
    accountingConnectorsEnabled: true,
    externalPmEnabled: true,
    whiteLabelEnabled: true,
    baseMonthlyPriceCents: 14900,
    perSeatPriceCents: 1800,
  },
  enterprise: {
    planTier: 'enterprise',
    displayName: 'Enterprise',
    tagline: 'Dedicated SLA, custom retention, SSO & governance controls',
    maxSeats: 10_000,
    maxActiveProjects: 10_000,
    retentionDays: 2555,
    monthlyEventQuota: 25_000_000,
    monthlyAiTokenQuota: 5_000_000,
    storageQuotaMb: 256_000,
    apiRateLimitPerMin: 2400,
    githubIdeEnabled: true,
    clientPortalEnabled: true,
    aiAssistanceAvailable: true,
    outboundWebhooksEnabled: true,
    accountingConnectorsEnabled: true,
    externalPmEnabled: true,
    whiteLabelEnabled: true,
    baseMonthlyPriceCents: 49900,
    perSeatPriceCents: 2400,
  },
}

function classifyMetric(
  key: QuotaMetricStatus['key'],
  label: string,
  used: number,
  limit: number,
  gracefulBehavior: string
): QuotaMetricStatus {
  const safeLimit = Math.max(limit, 0)
  const percent = safeLimit === 0 ? (used > 0 ? 100 : 0) : Math.round((used / safeLimit) * 100)
  const state: QuotaMetricStatus['state'] =
    percent >= 100 ? 'overage_graceful' : percent >= 80 ? 'warning_80' : 'healthy'
  return {
    key,
    label,
    used,
    limit: safeLimit,
    percent,
    state,
    gracefulBehavior,
  }
}

/**
 * F4-004: Graceful usage limit handling.
 * Core time tracking (`work_sessions`, `time_segments`) NEVER stops or drops data.
 * Only optional LLM drafting or high-frequency secondary telemetry sampling degrades
 * with advance admin alerts.
 */
export function evaluateUsageQuotas(
  planTier: SaasPlanTier,
  usage: UsageRecordSnapshot,
  seatLimitOverride?: number
): QuotaEvaluationReport {
  const spec = PHASE4_PLAN_CATALOG[planTier]
  const seatLimit = seatLimitOverride && seatLimitOverride > 0 ? seatLimitOverride : spec.maxSeats
  const storageMbUsed = Math.round((usage.storageBytes / (1024 * 1024)) * 10) / 10

  const metrics: QuotaMetricStatus[] = [
    classifyMetric(
      'seats',
      'Active Seats',
      usage.activeSeats,
      seatLimit,
      'Existing sessions keep recording; new seat invitations prompt plan upgrade.'
    ),
    classifyMetric(
      'projects',
      'Active Projects',
      usage.activeProjects,
      spec.maxActiveProjects,
      'Existing projects stay active; creating extra projects prompts upgrade.'
    ),
    classifyMetric(
      'events',
      'Monthly Activity Events',
      usage.activityEventsCount,
      spec.monthlyEventQuota,
      'Core sessions & time segments NEVER drop; secondary telemetry switches to 5m coarse rollup.'
    ),
    classifyMetric(
      'ai_tokens',
      'Monthly AI Tokens',
      usage.aiTokensUsed,
      spec.monthlyAiTokenQuota,
      'LLM drafts pause gracefully and fall back to zero-token deterministic templates.'
    ),
    classifyMetric(
      'storage_mb',
      'Evidence Storage (MB)',
      storageMbUsed,
      spec.storageQuotaMb,
      'Time ledger & approvals remain active; large optional attachment uploads warn admin.'
    ),
  ]

  const alerts: string[] = []
  for (const m of metrics) {
    if (m.state === 'overage_graceful') {
      alerts.push(
        `[Quota Reached: ${m.label}] ${m.used}/${m.limit} (${m.percent}%). ${m.gracefulBehavior}`
      )
    } else if (m.state === 'warning_80') {
      alerts.push(
        `[80% Warning: ${m.label}] ${m.used}/${m.limit} (${m.percent}%). Consider upgrading before cap.`
      )
    }
  }

  const eventsMetric = metrics.find((m) => m.key === 'events')
  const aiMetric = metrics.find((m) => m.key === 'ai_tokens')

  const aiLlmAllowed =
    spec.aiAssistanceAvailable &&
    spec.monthlyAiTokenQuota > 0 &&
    (aiMetric ? aiMetric.used < aiMetric.limit : true)

  const highFreqTelemetryMode: QuotaEvaluationReport['highFreqTelemetryMode'] =
    eventsMetric && eventsMetric.state === 'overage_graceful' ? 'sampled_graceful' : 'full'

  return {
    planTier,
    coreTimeTrackingAllowed: true,
    aiLlmAllowed,
    highFreqTelemetryMode,
    alerts,
    metrics,
  }
}

export function calculateSaasSubscriptionTotals(
  planTier: SaasPlanTier,
  seatsBilled: number,
  billingCycle: 'monthly' | 'annual'
): {
  baseCents: number
  seatCents: number
  subtotalCents: number
  discountCents: number
  totalCents: number
} {
  const spec = PHASE4_PLAN_CATALOG[planTier]
  const billableSeats = Math.max(1, seatsBilled)
  const baseCents = spec.baseMonthlyPriceCents
  const seatCents = spec.perSeatPriceCents * billableSeats
  const monthlySubtotal = baseCents + seatCents
  const multiplier = billingCycle === 'annual' ? 12 : 1
  const subtotalCents = monthlySubtotal * multiplier
  const discountCents = billingCycle === 'annual' ? Math.round(subtotalCents * 0.15) : 0
  const totalCents = Math.max(0, subtotalCents - discountCents)

  return {
    baseCents,
    seatCents,
    subtotalCents,
    discountCents,
    totalCents,
  }
}

export function buildSaasSubscriptionInvoiceDraft(input: {
  tenantId: string
  subscriptionAccountId: string
  planTier: SaasPlanTier
  seatsBilled: number
  billingCycle: 'monthly' | 'annual'
  currency: string
  sequenceNumber: number
}): SaasSubscriptionInvoiceRecord {
  const totals = calculateSaasSubscriptionTotals(
    input.planTier,
    input.seatsBilled,
    input.billingCycle
  )
  const periodLabel = new Date().toISOString().slice(0, 7)
  const spec = PHASE4_PLAN_CATALOG[input.planTier]

  return {
    id: `saas-inv-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: input.tenantId,
    subscriptionAccountId: input.subscriptionAccountId,
    invoiceNumber: `SAAS-${periodLabel.replace('-', '')}-${String(input.sequenceNumber).padStart(3, '0')}`,
    billingPeriodLabel:
      input.billingCycle === 'annual' ? `${periodLabel} (Annual)` : `${periodLabel} (Monthly)`,
    planTier: input.planTier,
    seatsBilled: Math.max(1, input.seatsBilled),
    unitPriceCents: spec.perSeatPriceCents,
    subtotalCents: totals.subtotalCents,
    taxCents: 0,
    totalCents: totals.totalCents,
    currency: input.currency || 'USD',
    status: 'paid',
    providerInvoiceId: `in_sim_${crypto.randomUUID().slice(0, 10)}`,
    issuedAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
  }
}

