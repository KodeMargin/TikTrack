/**
 * DevProof (TikTrack) - Server-Side Reporting & Analytics Handlers (Prisma + PostgreSQL)
 *
 * Security & Isolation:
 *   - Platform Reports (P1-P3) strictly require `super_admin` authority.
 *   - Tenant Operational Reports (R1-R8) strictly enforce tenant isolation:
 *     non-super-admin callers may ONLY query their own active `tenantId`.
 *   - Saved Reports persist in PostgreSQL (`saved_reports` from migration 0018)
 *     with automatic idempotent DDL bootstrap.
 */

import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../lib/prisma.ts'
import { isValidUuid } from './prismaPhase1Handlers.ts'
import { generateGeminiSummaryDraft } from './geminiService.ts'

let reportingTablesEnsured = false

async function ensureReportingTablesExist(): Promise<void> {
  if (reportingTablesEnsured) return
  const candidates = [
    path.resolve(
      import.meta.dirname,
      '../../supabase/migrations/0018_reporting_and_analytics.sql'
    ),
    path.resolve(
      process.cwd(),
      'supabase/migrations/0018_reporting_and_analytics.sql'
    ),
  ]
  const migrationPath = candidates.find((p) => fs.existsSync(p))
  if (!migrationPath) {
    reportingTablesEnsured = true
    return
  }

  const sql = fs.readFileSync(migrationPath, 'utf8')
  const stripped = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  const statements = stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt)
    } catch {
      // Ignore if RLS/index already exists
    }
  }
  reportingTablesEnsured = true
}

export interface PlatformTenantReportRow {
  tenantId: string
  tenantName: string
  tenantSlug: string
  status: string
  planTier: string
  currency: string
  timezone: string
  createdAt: string
  // P1: SaaS Subscription & Revenue
  subscriptionStatus: string
  billingCycle: string
  billingProvider: string
  activeSeats: number
  maxSeats: number
  seatUtilizationPct: number
  estimatedMrrUsd: number
  saasInvoicesCount: number
  saasPaidTotalUsd: number
  saasOpenTotalUsd: number
  // P2: Health & Quotas
  activeProjects: number
  maxActiveProjects: number
  monthlyEventsUsed: number
  monthlyEventQuota: number
  aiTokensUsed: number
  monthlyAiTokenQuota: number
  storageMbUsed: number
  storageQuotaMb: number
  // P3: Cross-Tenant Operational Rollup
  elapsedHours: number
  claimedHours: number
  observedHours: number
  supportedHours: number
  approvedBillableHours: number
  approvalRatePct: number
  approvedBillableValue: number
  openDisputesCount: number
  totalDisputesCount: number
  evidenceArtifactsCount: number
  activeDevicesCount: number
  clockAnomalyDevicesCount: number
  policyConsentPct: number
}

export interface PlatformReportsPayload {
  ok: boolean
  generatedAtUtc: string
  tenants: PlatformTenantReportRow[]
  error?: string
}

const DEFAULT_PLAN_PRICING: Record<
  string,
  { baseMonthly: number; perSeat: number; maxSeats: number; maxProjects: number; eventQuota: number; aiQuota: number; storageMb: number }
> = {
  starter: { baseMonthly: 0, perSeat: 0, maxSeats: 5, maxProjects: 3, eventQuota: 50000, aiQuota: 0, storageMb: 512 },
  team: { baseMonthly: 49, perSeat: 12, maxSeats: 25, maxProjects: 25, eventQuota: 500000, aiQuota: 250000, storageMb: 5120 },
  agency: { baseMonthly: 149, perSeat: 18, maxSeats: 100, maxProjects: 100, eventQuota: 2500000, aiQuota: 1000000, storageMb: 25600 },
  enterprise: { baseMonthly: 499, perSeat: 25, maxSeats: 10000, maxProjects: 10000, eventQuota: 25000000, aiQuota: 10000000, storageMb: 256000 },
}

export async function handleFetchPlatformReportsPrisma(input: {
  actorRole: string
}): Promise<{ statusCode: number; payload: PlatformReportsPayload }> {
  if (input.actorRole !== 'super_admin') {
    return {
      statusCode: 403,
      payload: {
        ok: false,
        generatedAtUtc: new Date().toISOString(),
        tenants: [],
        error: 'Forbidden: Platform cross-tenant reports require Super Admin privileges.',
      },
    }
  }

  const [
    tenants,
    entitlements,
    subscriptions,
    saasInvoices,
    memberships,
    projects,
    usageRecords,
    timesheetLines,
    disputes,
    artifacts,
    devices,
    consents,
  ] = await Promise.all([
    prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.planEntitlement.findMany().catch(() => []),
    prisma.subscriptionAccount.findMany().catch(() => []),
    prisma.saasSubscriptionInvoice.findMany().catch(() => []),
    prisma.membership.findMany({ where: { status: { in: ['active', 'invited'] } } }),
    prisma.project.findMany(),
    prisma.usageRecord.findMany({ orderBy: { metricDate: 'desc' } }).catch(() => []),
    prisma.timesheetLine.findMany({
      select: {
        tenantId: true,
        elapsedMinutes: true,
        claimedMinutes: true,
        observedMinutes: true,
        supportedMinutes: true,
        approvedBillableMinutes: true,
        snapshotHourlyRate: true,
      },
    }),
    prisma.dispute.findMany({ select: { tenantId: true, status: true } }),
    prisma.evidenceArtifact.findMany({ select: { tenantId: true } }).catch(() => []),
    prisma.device.findMany({ select: { tenantId: true, revokedAt: true, clockAnomalyDetected: true } }).catch(() => []),
    prisma.policyConsent.findMany({ select: { tenantId: true, userId: true } }).catch(() => []),
  ])

  const entMap = new Map(entitlements.map((e) => [e.planTier, e]))
  const subMap = new Map(subscriptions.map((s) => [s.tenantId, s]))

  const rows: PlatformTenantReportRow[] = tenants.map((t) => {
    const sub = subMap.get(t.id)
    const tier = sub?.planTier || t.planTier || 'starter'
    const ent = entMap.get(tier)
    const fallbackPlan = DEFAULT_PLAN_PRICING[tier] ?? DEFAULT_PLAN_PRICING.starter

    const tenantMembers = memberships.filter((m) => m.tenantId === t.id && m.status === 'active')
    const activeSeats = tenantMembers.length
    const maxSeats = sub?.seatLimitOverride ?? ent?.maxSeats ?? fallbackPlan.maxSeats

    const baseMonthly = ent ? ent.baseMonthlyPriceCents / 100 : fallbackPlan.baseMonthly
    const perSeat = ent ? ent.perSeatPriceCents / 100 : fallbackPlan.perSeat
    const estimatedMrrUsd = Number((baseMonthly + activeSeats * perSeat).toFixed(2))

    const tSaasInv = saasInvoices.filter((inv) => inv.tenantId === t.id)
    const saasPaidTotalUsd = Number(
      (tSaasInv.filter((i) => i.status === 'paid').reduce((s, i) => s + i.totalCents, 0) / 100).toFixed(2)
    )
    const saasOpenTotalUsd = Number(
      (tSaasInv.filter((i) => i.status !== 'paid' && i.status !== 'void').reduce((s, i) => s + i.totalCents, 0) / 100).toFixed(2)
    )

    const activeProjects = projects.filter((p) => p.tenantId === t.id && p.status === 'active').length
    const maxActiveProjects = ent?.maxActiveProjects ?? fallbackPlan.maxProjects

    const latestUsage = usageRecords.find((u) => u.tenantId === t.id)
    const monthlyEventsUsed = latestUsage ? Number(latestUsage.activityEventsCount) : 0
    const monthlyEventQuota = ent?.monthlyEventQuota ?? fallbackPlan.eventQuota
    const aiTokensUsed = latestUsage ? Number(latestUsage.aiTokensUsed) : 0
    const monthlyAiTokenQuota = ent?.monthlyAiTokenQuota ?? fallbackPlan.aiQuota
    const storageMbUsed = latestUsage ? Number((Number(latestUsage.storageBytes) / (1024 * 1024)).toFixed(2)) : 0
    const storageQuotaMb = ent?.storageQuotaMb ?? fallbackPlan.storageMb

    const tLines = timesheetLines.filter((l) => l.tenantId === t.id)
    const elapsedMins = tLines.reduce((s, l) => s + Number(l.elapsedMinutes), 0)
    const claimedMins = tLines.reduce((s, l) => s + Number(l.claimedMinutes), 0)
    const observedMins = tLines.reduce((s, l) => s + Number(l.observedMinutes), 0)
    const supportedMins = tLines.reduce((s, l) => s + Number(l.supportedMinutes), 0)
    const approvedMins = tLines.reduce((s, l) => s + Number(l.approvedBillableMinutes), 0)
    const approvedBillableValue = Number(
      tLines
        .reduce((s, l) => s + (Number(l.approvedBillableMinutes) / 60) * Number(l.snapshotHourlyRate), 0)
        .toFixed(2)
    )

    const tDisputes = disputes.filter((d) => d.tenantId === t.id)
    const openDisputesCount = tDisputes.filter(
      (d) => !d.status.startsWith('resolved') && d.status !== 'closed'
    ).length

    const evidenceArtifactsCount = artifacts.filter((a) => a.tenantId === t.id).length
    const tDevices = devices.filter((d) => d.tenantId === t.id && !d.revokedAt)
    const clockAnomalyDevicesCount = tDevices.filter((d) => d.clockAnomalyDetected).length

    const consentedUsers = new Set(consents.filter((c) => c.tenantId === t.id).map((c) => c.userId))
    const policyConsentPct =
      activeSeats > 0 ? Math.min(1, consentedUsers.size / activeSeats) : 1

    return {
      tenantId: t.id,
      tenantName: t.name,
      tenantSlug: t.slug,
      status: t.status,
      planTier: tier,
      currency: t.defaultCurrency,
      timezone: t.defaultTimezone,
      createdAt: t.createdAt.toISOString(),
      subscriptionStatus: sub?.status || 'active',
      billingCycle: sub?.billingCycle || 'monthly',
      billingProvider: sub?.billingProvider || 'stripe',
      activeSeats,
      maxSeats,
      seatUtilizationPct: maxSeats > 0 ? Math.min(1, activeSeats / maxSeats) : 0,
      estimatedMrrUsd,
      saasInvoicesCount: tSaasInv.length,
      saasPaidTotalUsd,
      saasOpenTotalUsd,
      activeProjects,
      maxActiveProjects,
      monthlyEventsUsed,
      monthlyEventQuota,
      aiTokensUsed,
      monthlyAiTokenQuota,
      storageMbUsed,
      storageQuotaMb,
      elapsedHours: Number((elapsedMins / 60).toFixed(2)),
      claimedHours: Number((claimedMins / 60).toFixed(2)),
      observedHours: Number((observedMins / 60).toFixed(2)),
      supportedHours: Number((supportedMins / 60).toFixed(2)),
      approvedBillableHours: Number((approvedMins / 60).toFixed(2)),
      approvalRatePct: claimedMins > 0 ? Math.min(1, approvedMins / claimedMins) : 0,
      approvedBillableValue,
      openDisputesCount,
      totalDisputesCount: tDisputes.length,
      evidenceArtifactsCount,
      activeDevicesCount: tDevices.length,
      clockAnomalyDevicesCount,
      policyConsentPct,
    }
  })

  return {
    statusCode: 200,
    payload: {
      ok: true,
      generatedAtUtc: new Date().toISOString(),
      tenants: rows,
    },
  }
}

export interface SavedReportDto {
  id: string
  tenantId: string
  createdBy: string | null
  name: string
  description: string
  reportType: string
  visibility: string
  configJson: Record<string, unknown>
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export async function handleListSavedReportsPrisma(input: {
  tenantId: string
  actorRole: string
  actorTenantId?: string
}): Promise<{ statusCode: number; payload: { ok: boolean; reports: SavedReportDto[]; error?: string } }> {
  if (!isValidUuid(input.tenantId)) {
    return { statusCode: 400, payload: { ok: false, reports: [], error: 'Invalid tenantId.' } }
  }
  if (input.actorRole !== 'super_admin' && input.actorTenantId && input.actorTenantId !== input.tenantId) {
    return {
      statusCode: 403,
      payload: { ok: false, reports: [], error: 'Forbidden: Cross-tenant report access denied.' },
    }
  }

  await ensureReportingTablesExist()
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      tenant_id: string
      created_by: string | null
      name: string
      description: string
      report_type: string
      visibility: string
      config_json: Record<string, unknown>
      is_pinned: boolean
      created_at: Date
      updated_at: Date
    }>
  >(
    `SELECT id, tenant_id, created_by, name, description, report_type, visibility, config_json, is_pinned, created_at, updated_at
     FROM public.saved_reports
     WHERE tenant_id = $1::uuid
     ORDER BY is_pinned DESC, created_at DESC`,
    input.tenantId
  )

  return {
    statusCode: 200,
    payload: {
      ok: true,
      reports: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        createdBy: r.created_by,
        name: r.name,
        description: r.description,
        reportType: r.report_type,
        visibility: r.visibility,
        configJson: r.config_json ?? {},
        isPinned: Boolean(r.is_pinned),
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      })),
    },
  }
}

export async function handleCreateSavedReportPrisma(input: {
  tenantId: string
  actorRole: string
  actorTenantId?: string
  createdBy?: string | null
  name: string
  description?: string
  reportType: string
  visibility?: string
  configJson: Record<string, unknown>
  isPinned?: boolean
}): Promise<{ statusCode: number; payload: { ok: boolean; report?: SavedReportDto; error?: string } }> {
  if (!isValidUuid(input.tenantId)) {
    return { statusCode: 400, payload: { ok: false, error: 'Invalid tenantId.' } }
  }
  if (input.actorRole !== 'super_admin' && input.actorTenantId && input.actorTenantId !== input.tenantId) {
    return {
      statusCode: 403,
      payload: { ok: false, error: 'Forbidden: Cannot save report into another tenant.' },
    }
  }
  const trimmedName = (input.name || '').trim()
  if (!trimmedName) {
    return { statusCode: 400, payload: { ok: false, error: 'Report name is required.' } }
  }

  await ensureReportingTablesExist()
  const createdByUuid = input.createdBy && isValidUuid(input.createdBy) ? input.createdBy : null

  const inserted = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      tenant_id: string
      created_by: string | null
      name: string
      description: string
      report_type: string
      visibility: string
      config_json: Record<string, unknown>
      is_pinned: boolean
      created_at: Date
      updated_at: Date
    }>
  >(
    `INSERT INTO public.saved_reports (tenant_id, created_by, name, description, report_type, visibility, config_json, is_pinned)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id, tenant_id, created_by, name, description, report_type, visibility, config_json, is_pinned, created_at, updated_at`,
    input.tenantId,
    createdByUuid,
    trimmedName,
    (input.description || '').trim(),
    input.reportType || 'custom_pivot',
    input.visibility || 'workspace',
    JSON.stringify(input.configJson ?? {}),
    Boolean(input.isPinned)
  )

  const row = inserted[0]
  return {
    statusCode: 201,
    payload: {
      ok: true,
      report: {
        id: row.id,
        tenantId: row.tenant_id,
        createdBy: row.created_by,
        name: row.name,
        description: row.description,
        reportType: row.report_type,
        visibility: row.visibility,
        configJson: row.config_json ?? {},
        isPinned: Boolean(row.is_pinned),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      },
    },
  }
}

export async function handleDeleteSavedReportPrisma(input: {
  id: string
  tenantId: string
  actorRole: string
  actorTenantId?: string
}): Promise<{ statusCode: number; payload: { ok: boolean; error?: string } }> {
  if (!isValidUuid(input.id) || !isValidUuid(input.tenantId)) {
    return { statusCode: 400, payload: { ok: false, error: 'Invalid report or tenant ID.' } }
  }
  if (input.actorRole !== 'super_admin' && input.actorTenantId && input.actorTenantId !== input.tenantId) {
    return { statusCode: 403, payload: { ok: false, error: 'Forbidden.' } }
  }

  await ensureReportingTablesExist()
  await prisma.$executeRawUnsafe(
    `DELETE FROM public.saved_reports WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    input.id,
    input.tenantId
  )
  return { statusCode: 200, payload: { ok: true } }
}

export async function handleGenerateReportAiBriefPrisma(input: {
  reportTitle: string
  scopeLabel: string
  dateRangeLabel: string
  kpis: Array<{ label: string; value: string; delta?: string }>
  highlights: Record<string, unknown>
}) {
  const res = await generateGeminiSummaryDraft({
    targetType: 'report_executive_brief',
    targetLabel: `${input.reportTitle} (${input.scopeLabel} • ${input.dateRangeLabel})`,
    sanitizedPayload: {
      reportTitle: input.reportTitle,
      scope: input.scopeLabel,
      period: input.dateRangeLabel,
      kpis: input.kpis,
      aggregatedHighlights: input.highlights,
    },
    citedIds: [],
  })

  if (res.ok && res.draftMarkdown) {
    return {
      statusCode: 200,
      payload: {
        ok: true,
        modelId: res.modelId,
        mode: 'gemini_live',
        briefMarkdown: res.draftMarkdown,
        tokensUsed: res.tokensUsed ?? 0,
      },
    }
  }

  // Deterministic non-LLM executive summary fallback when GEMINI_API_KEY is not configured
  const kpiBullets = input.kpis
    .slice(0, 5)
    .map((k) => `- **${k.label}:** ${k.value}${k.delta ? ` (${k.delta})` : ''}`)
    .join('\n')

  return {
    statusCode: 200,
    payload: {
      ok: true,
      modelId: 'deterministic-analytics-summarizer-v1',
      mode: 'deterministic_fallback',
      briefMarkdown: [
        `**${input.reportTitle} - Executive Snapshot (${input.dateRangeLabel})**`,
        kpiBullets,
        `- **Governance Note:** Metrics reflect verified ledger records and aggregated signals only; human review governs all billing and commercial decisions.`,
      ].join('\n'),
      tokensUsed: 0,
    },
  }
}
