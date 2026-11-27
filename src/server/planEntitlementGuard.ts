/**
 * DevProof (TikTrack) - Server-Side Plan Entitlement & Quota Guard
 *
 * Enforces SaaS subscription limits and feature flags directly against PostgreSQL
 * (`tenants.plan_tier`, `subscription_accounts`, `plan_entitlements`) so clients
 * cannot bypass seat/project quotas or paid feature gates.
 */

import { prisma } from '../lib/prisma.ts'
import { PHASE4_PLAN_CATALOG } from '../lib/phase4/saasBilling.ts'
import type { PlanCatalogSpec, SaasPlanTier } from '../types/domain.types.ts'
import { isValidUuid } from './prismaPhase1Handlers.ts'

export type GatedFeatureKey =
  | 'ai_assistance'
  | 'white_label'
  | 'outbound_webhooks'
  | 'accounting_connectors'
  | 'external_pm'
  | 'github_ide'
  | 'client_portal'

const FEATURE_META: Record<
  GatedFeatureKey,
  {
    flag: keyof Pick<
      PlanCatalogSpec,
      | 'aiAssistanceAvailable'
      | 'whiteLabelEnabled'
      | 'outboundWebhooksEnabled'
      | 'accountingConnectorsEnabled'
      | 'externalPmEnabled'
      | 'githubIdeEnabled'
      | 'clientPortalEnabled'
    >
    label: string
    requiredPlan: string
  }
> = {
  ai_assistance: {
    flag: 'aiAssistanceAvailable',
    label: 'AI Evidence Assistance',
    requiredPlan: 'Team',
  },
  white_label: {
    flag: 'whiteLabelEnabled',
    label: 'White-Label Workspace Branding',
    requiredPlan: 'Agency',
  },
  outbound_webhooks: {
    flag: 'outboundWebhooksEnabled',
    label: 'Outbound Webhooks',
    requiredPlan: 'Team',
  },
  accounting_connectors: {
    flag: 'accountingConnectorsEnabled',
    label: 'Accounting Connectors (Xero / QuickBooks)',
    requiredPlan: 'Agency',
  },
  external_pm: {
    flag: 'externalPmEnabled',
    label: 'External PM Connectors (Jira / Linear / Asana / Trello / ClickUp)',
    requiredPlan: 'Team',
  },
  github_ide: {
    flag: 'githubIdeEnabled',
    label: 'Git & Code Repository Integrations (GitHub / GitLab / Bitbucket)',
    requiredPlan: 'Team',
  },
  client_portal: {
    flag: 'clientPortalEnabled',
    label: 'Client Verification Portal',
    requiredPlan: 'Agency',
  },
}

function normalizePlanTier(raw: string | null | undefined): SaasPlanTier {
  if (raw === 'team' || raw === 'agency' || raw === 'enterprise') return raw
  return 'starter'
}

export async function getTenantPlanEntitlement(tenantId: string): Promise<{
  planTier: SaasPlanTier
  spec: PlanCatalogSpec
  effectiveMaxSeats: number
}> {
  if (!isValidUuid(tenantId)) {
    return {
      planTier: 'starter',
      spec: PHASE4_PLAN_CATALOG.starter,
      effectiveMaxSeats: PHASE4_PLAN_CATALOG.starter.maxSeats,
    }
  }

  const [tenant, sub] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planTier: true },
    }),
    prisma.subscriptionAccount
      .findUnique({
        where: { tenantId },
        select: { planTier: true, seatLimitOverride: true },
      })
      .catch(() => null),
  ])

  const planTier = normalizePlanTier(sub?.planTier || tenant?.planTier)
  const fallback = PHASE4_PLAN_CATALOG[planTier]

  const dbEntitlement = await prisma.planEntitlement
    .findUnique({ where: { planTier } })
    .catch(() => null)

  const spec: PlanCatalogSpec = dbEntitlement
    ? {
        ...fallback,
        maxSeats: dbEntitlement.maxSeats,
        maxActiveProjects: dbEntitlement.maxActiveProjects,
        retentionDays: dbEntitlement.retentionDays,
        monthlyEventQuota: dbEntitlement.monthlyEventQuota,
        monthlyAiTokenQuota: dbEntitlement.monthlyAiTokenQuota,
        storageQuotaMb: dbEntitlement.storageQuotaMb,
        apiRateLimitPerMin: dbEntitlement.apiRateLimitPerMin,
        githubIdeEnabled: dbEntitlement.githubIdeEnabled,
        clientPortalEnabled: dbEntitlement.clientPortalEnabled,
        aiAssistanceAvailable: dbEntitlement.aiAssistanceAvailable,
        outboundWebhooksEnabled: dbEntitlement.outboundWebhooksEnabled,
        accountingConnectorsEnabled: dbEntitlement.accountingConnectorsEnabled,
        externalPmEnabled: dbEntitlement.externalPmEnabled,
        whiteLabelEnabled: dbEntitlement.whiteLabelEnabled,
        baseMonthlyPriceCents: dbEntitlement.baseMonthlyPriceCents,
        perSeatPriceCents: dbEntitlement.perSeatPriceCents,
      }
    : fallback

  const effectiveMaxSeats =
    sub?.seatLimitOverride && sub.seatLimitOverride > 0
      ? sub.seatLimitOverride
      : spec.maxSeats

  return { planTier, spec, effectiveMaxSeats }
}

export async function checkSeatQuota(tenantId: string): Promise<{
  allowed: boolean
  planTier: SaasPlanTier
  used: number
  limit: number
  error?: string
}> {
  const { planTier, effectiveMaxSeats } = await getTenantPlanEntitlement(tenantId)
  if (!isValidUuid(tenantId)) {
    return { allowed: true, planTier, used: 0, limit: effectiveMaxSeats }
  }

  const used = await prisma.membership.count({
    where: {
      tenantId,
      status: { in: ['active', 'invited'] },
    },
  })

  if (used >= effectiveMaxSeats) {
    return {
      allowed: false,
      planTier,
      used,
      limit: effectiveMaxSeats,
      error: `Plan Entitlement Limit: ${planTier.toUpperCase()} plan allows up to ${effectiveMaxSeats} active/invited seats (currently ${used}). Upgrade your plan to add more team members.`,
    }
  }

  return { allowed: true, planTier, used, limit: effectiveMaxSeats }
}

export async function checkProjectQuota(tenantId: string): Promise<{
  allowed: boolean
  planTier: SaasPlanTier
  used: number
  limit: number
  error?: string
}> {
  const { planTier, spec } = await getTenantPlanEntitlement(tenantId)
  if (!isValidUuid(tenantId)) {
    return { allowed: true, planTier, used: 0, limit: spec.maxActiveProjects }
  }

  const used = await prisma.project.count({
    where: {
      tenantId,
      status: 'active',
    },
  })

  if (used >= spec.maxActiveProjects) {
    return {
      allowed: false,
      planTier,
      used,
      limit: spec.maxActiveProjects,
      error: `Plan Entitlement Limit: ${planTier.toUpperCase()} plan allows up to ${spec.maxActiveProjects} active projects (currently ${used}). Upgrade your plan to create more projects.`,
    }
  }

  return { allowed: true, planTier, used, limit: spec.maxActiveProjects }
}

export async function checkFeatureEntitlement(
  tenantId: string,
  feature: GatedFeatureKey
): Promise<{
  allowed: boolean
  planTier: SaasPlanTier
  requiredPlan: string
  error?: string
}> {
  const { planTier, spec } = await getTenantPlanEntitlement(tenantId)
  const meta = FEATURE_META[feature]
  const allowed = Boolean(spec[meta.flag])

  if (!allowed) {
    return {
      allowed: false,
      planTier,
      requiredPlan: meta.requiredPlan,
      error: `${meta.label} requires the ${meta.requiredPlan} plan or higher (currently on ${planTier.toUpperCase()}).`,
    }
  }

  return { allowed: true, planTier, requiredPlan: meta.requiredPlan }
}

export function getConnectorRequiredFeature(
  provider: string,
  category?: string
): GatedFeatureKey | null {
  const p = provider.toLowerCase().trim()
  const c = (category || '').toLowerCase().trim()

  if (c === 'accounting' || p === 'xero' || p === 'quickbooks') {
    return 'accounting_connectors'
  }
  if (
    c === 'pm' ||
    c === 'external_pm' ||
    c === 'project_management' ||
    p === 'jira' ||
    p === 'linear' ||
    p === 'asana' ||
    p === 'trello' ||
    p === 'clickup' ||
    p === 'monday'
  ) {
    return 'external_pm'
  }
  if (c === 'git' || p === 'github' || p === 'gitlab' || p === 'bitbucket') {
    return 'github_ide'
  }
  return null
}

export async function checkConnectorEntitlement(
  tenantId: string,
  provider: string,
  category?: string
): Promise<{
  allowed: boolean
  planTier: SaasPlanTier
  requiredPlan?: string
  error?: string
}> {
  const requiredFeature = getConnectorRequiredFeature(provider, category)
  if (!requiredFeature) {
    const { planTier } = await getTenantPlanEntitlement(tenantId)
    return { allowed: true, planTier }
  }
  return checkFeatureEntitlement(tenantId, requiredFeature)
}
