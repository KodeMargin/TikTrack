/**
 * DevProof (TikTrack) - Unified Reporting & Analytics Computation Engine
 *
 * Pure, deterministic analytics engine covering:
 *   - Platform Reports (Super Admin Only): P1 SaaS Revenue, P2 Tenant Health, P3 Cross-Tenant Operations
 *   - Tenant Operational Reports: R1 Executive Summary, R2 Time & Utilization, R3 Deep-Work & Work-Modes,
 *     R4 Financial & Profitability, R5 Billing/Invoicing & Payroll, R6 Project & Sprint Delivery,
 *     R7 Evidence/Verification & Governance, R8 Custom Pivot Report Builder
 *
 * Every report also compiles into a clean `ReportDocument` for structured PDF & Excel exports.
 */

import type {
  AppCategory,
  CalendarMeetingEventRecord,
  DisputeRecord,
  EvidenceSourceType,
  EvidenceStatus,
  ProjectForecastSummary,
  SessionProvenance,
  UserRole,
  WorkMode,
} from '../../../types/domain.types.ts'
import {
  formatReportCellValue,
  type ReportColumnDef,
  type ReportDocument,
  type ReportKpiItem,
} from '../export/reportDocument.types.ts'

export interface PlatformTenantReportRowInput {
  tenantId: string
  tenantName: string
  tenantSlug: string
  status: string
  planTier: string
  currency: string
  timezone: string
  createdAt: string
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
  activeProjects: number
  maxActiveProjects: number
  monthlyEventsUsed: number
  monthlyEventQuota: number
  aiTokensUsed: number
  monthlyAiTokenQuota: number
  storageMbUsed: number
  storageQuotaMb: number
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

// Structural input shapes (decoupled from React .tsx context modules for pure Node/browser execution)
export interface ReportTenantInput {
  id: string
  name: string
  slug: string
  timezone: string
  currency: string
  planTier: string
  weeklyCapMinutes: number
  policyVersion: string
}

export interface ReportMemberInput {
  id: string
  name: string
  email: string
  role: UserRole
  status: string
  consentedPolicyVersion: string | null
}

export interface ReportProjectInput {
  id: string
  code: string
  name: string
  clientName: string
  status: string
}

export interface ReportSprintInput {
  id: string
  projectId: string
  name: string
  status: string
}

export interface ReportTaskInput {
  id: string
  projectId: string
  parentTaskId?: string
  sprintId?: string | null
  code: string
  title: string
  issueType?: string
  status: string
  priority: string
  storyPoints?: number | null
  estimateMinutes: number
  isBillable: boolean
  assignedMemberIds: string[]
  dueDate: string
}

export interface ReportTimesheetLineInput {
  id: string
  timesheetStatus?: string
  projectId: string
  taskId: string
  taskCode: string
  taskTitle: string
  developerId: string
  developerName: string
  workDate: string
  workMode: WorkMode
  provenance: SessionProvenance
  elapsedMinutes: number
  claimedMinutes: number
  observedMinutes: number
  supportedMinutes: number
  approvedBillableMinutes: number
  evidenceStatus: EvidenceStatus
  snapshotHourlyRate: number
}

export interface ReportInvoiceInput {
  id: string
  invoiceNumber: string
  projectId: string
  projectName: string
  clientName: string
  currency: string
  periodLabel: string
  totalApprovedMinutes: number
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
  status: string
  lines: Array<{ lineId: string }>
}

export interface ReportDevPayConfigInput {
  memberId: string
  payModel: 'hourly' | 'monthly_retainer' | 'fixed_milestone'
  hourlyRate: number
  monthlyRetainerAmount: number
}

export interface ReportTaskPayConfigInput {
  taskId: string
  payType: 'fixed_bounty' | 'hourly_rate'
  amount: number
}

export interface ReportDevPayoutInput {
  memberId: string
  memberName: string
  periodLabel: string
  approvedMinutes: number
  grossAmount: number
  taxWithheldAmount: number
  netAmount: number
  status: string
  payoutMethod: string
  referenceCode: string
}

export interface ReportActivityRollupInput {
  userId: string
  projectId: string
  workDate: string
  durationMinutes: number
  appCategory: AppCategory
  workMode: WorkMode
  concurrentSources: EvidenceSourceType[]
  isObservationGap: boolean
  reconciliationChoice?: string
}

export interface ReportEvidenceArtifactInput {
  projectId: string
  workDate: string
  sourceType: string
  confirmedByUser: boolean
}

export interface ReportDeviceInput {
  revokedAt?: string | null
  clockAnomalyDetected: boolean
}

export type ReportId =
  | 'platform-revenue'
  | 'platform-health'
  | 'platform-operations'
  | 'executive-summary'
  | 'time-utilization'
  | 'deep-work'
  | 'financial-profitability'
  | 'billing-payroll'
  | 'project-delivery'
  | 'evidence-governance'
  | 'custom-pivot'

export type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'this_month' | 'custom'

export interface ReportFilterState {
  preset: DateRangePreset
  dateFrom: string // YYYY-MM-DD or ''
  dateTo: string   // YYYY-MM-DD or ''
  projectId: string // 'all' or project uuid
  developerId: string // 'all' or member uuid
  workMode: string // 'all' or WorkMode
  evidenceStatus: string // 'all' or EvidenceStatus
  billableFilter: 'all' | 'billable' | 'non_billable'
}

export interface ReportAccessContext {
  isSuperAdmin: boolean
  isInSuperAdminPortal: boolean
  canViewTeam: boolean
  canViewFinancials: boolean
  canExportPdf: boolean
  canExportExcel: boolean
  canCreateSaved: boolean
  canAiInsights: boolean
  isClientReviewer: boolean
  hideClientBillingRates: boolean
  activeUserId: string
  activeUserName: string
  activeUserRole: string
}

export interface TenantAnalyticsDataset {
  tenant: ReportTenantInput
  members: ReportMemberInput[]
  projects: ReportProjectInput[]
  sprints: ReportSprintInput[]
  tasks: ReportTaskInput[]
  timesheetLines: ReportTimesheetLineInput[]
  invoices: ReportInvoiceInput[]
  developerPaymentConfigs: ReportDevPayConfigInput[]
  taskPaymentConfigs: ReportTaskPayConfigInput[]
  developerPayouts: ReportDevPayoutInput[]
  activityRollups: ReportActivityRollupInput[]
  evidenceArtifacts: ReportEvidenceArtifactInput[]
  devices: ReportDeviceInput[]
  disputes: DisputeRecord[]
  calendarMeetings: CalendarMeetingEventRecord[]
  projectForecasts: ProjectForecastSummary[]
  brandColorHex?: string
}

export type PivotDimension =
  | 'project'
  | 'client'
  | 'developer'
  | 'task'
  | 'workMode'
  | 'evidenceStatus'
  | 'workDate'
  | 'provenance'

export type PivotMetricKey =
  | 'elapsedHours'
  | 'claimedHours'
  | 'observedHours'
  | 'supportedHours'
  | 'approvedHours'
  | 'approvalRate'
  | 'billableAmount'
  | 'internalCost'
  | 'grossProfit'
  | 'entryCount'

export interface CustomPivotConfig {
  groupByPrimary: PivotDimension
  groupBySecondary: PivotDimension | 'none'
  selectedMetrics: PivotMetricKey[]
  chartType: 'bar' | 'stacked' | 'line' | 'table_only'
}

const DEFAULT_FALLBACK_DEV_RATE = 45

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function minsToHours(mins: number): number {
  return round2(mins / 60)
}

function formatDateIso(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

export function resolveDateRangeBounds(
  filters: ReportFilterState,
  referenceDateIso?: string
): { from: string; to: string; label: string } {
  const today = referenceDateIso ? new Date(referenceDateIso) : new Date()
  const todayStr = formatDateIso(today)

  if (filters.preset === 'all') {
    return { from: '', to: '', label: 'All Recorded Dates' }
  }
  if (filters.preset === 'custom') {
    const f = filters.dateFrom || ''
    const t = filters.dateTo || ''
    if (!f && !t) return { from: '', to: '', label: 'All Recorded Dates' }
    return { from: f, to: t, label: `${f || 'Start'} to ${t || 'Present'}` }
  }
  if (filters.preset === 'this_month') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    const f = formatDateIso(first)
    return { from: f, to: todayStr, label: `This Month (${f} – ${todayStr})` }
  }

  const daysBack = filters.preset === '7d' ? 7 : filters.preset === '30d' ? 30 : 90
  const start = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000)
  const f = formatDateIso(start)
  return { from: f, to: todayStr, label: `Last ${daysBack} Days (${f} – ${todayStr})` }
}

/**
 * Estimates the internal developer payout cost for a timesheet line using
 * configured DeveloperPaymentConfig or TaskPaymentConfig.
 */
export function computeInternalCostForLine(
  line: ReportTimesheetLineInput,
  devConfigs: ReportDevPayConfigInput[],
  taskConfigs: ReportTaskPayConfigInput[]
): number {
  const billableMinutes =
    line.approvedBillableMinutes > 0 ? line.approvedBillableMinutes : line.claimedMinutes
  const hours = billableMinutes / 60

  const taskCfg = taskConfigs.find((tc) => tc.taskId === line.taskId)
  if (taskCfg && taskCfg.payType === 'hourly_rate' && taskCfg.amount > 0) {
    return round2(hours * taskCfg.amount)
  }

  const devCfg = devConfigs.find((dc) => dc.memberId === line.developerId)
  if (devCfg) {
    if (devCfg.payModel === 'hourly' && devCfg.hourlyRate > 0) {
      return round2(hours * devCfg.hourlyRate)
    }
    if (devCfg.payModel === 'monthly_retainer' && devCfg.monthlyRetainerAmount > 0) {
      // Standard 160 working hours/month amortized rate for profitability reporting
      return round2(hours * (devCfg.monthlyRetainerAmount / 160))
    }
  }

  // Fallback internal rate heuristic if developer pay config isn't entered yet
  const inferredRate =
    line.snapshotHourlyRate > 0
      ? Math.min(DEFAULT_FALLBACK_DEV_RATE, line.snapshotHourlyRate * 0.45)
      : DEFAULT_FALLBACK_DEV_RATE
  return round2(hours * inferredRate)
}

/**
 * Applies RBAC scoping and active user filters to timesheet lines.
 * Enforces:
 *   - Developer without `report:view_team` only ever sees own lines.
 *   - Client Reviewer only ever sees approved billable lines.
 */
export function filterScopedTimesheetLines(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext
): ReportTimesheetLineInput[] {
  const bounds = resolveDateRangeBounds(filters)
  const taskMap = new Map(dataset.tasks.map((t) => [t.id, t]))

  return dataset.timesheetLines.filter((line) => {
    // Hard RBAC boundaries
    if (!access.canViewTeam && !access.isSuperAdmin) {
      if (line.developerId !== access.activeUserId) return false
    }
    if (access.isClientReviewer && !access.isSuperAdmin) {
      if (line.evidenceStatus !== 'approved') return false
    }

    // Date bounds
    if (bounds.from && line.workDate < bounds.from) return false
    if (bounds.to && line.workDate > bounds.to) return false

    // Dimension filters
    if (filters.projectId !== 'all' && line.projectId !== filters.projectId) return false
    if (filters.developerId !== 'all' && line.developerId !== filters.developerId) return false
    if (filters.workMode !== 'all' && line.workMode !== filters.workMode) return false
    if (filters.evidenceStatus !== 'all' && line.evidenceStatus !== filters.evidenceStatus) {
      return false
    }

    if (filters.billableFilter !== 'all') {
      const task = taskMap.get(line.taskId)
      const isBillable = task ? task.isBillable : true
      if (filters.billableFilter === 'billable' && !isBillable) return false
      if (filters.billableFilter === 'non_billable' && isBillable) return false
    }

    return true
  })
}

export function buildAppliedFiltersMeta(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState
): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  if (filters.projectId !== 'all') {
    const p = dataset.projects.find((pr) => pr.id === filters.projectId)
    out.push({ label: 'Project', value: p ? `${p.code} - ${p.name}` : filters.projectId })
  }
  if (filters.developerId !== 'all') {
    const m = dataset.members.find((mb) => mb.id === filters.developerId)
    out.push({ label: 'Member', value: m ? m.name : filters.developerId })
  }
  if (filters.workMode !== 'all') {
    out.push({ label: 'Work Mode', value: filters.workMode })
  }
  if (filters.evidenceStatus !== 'all') {
    out.push({ label: 'Evidence Status', value: filters.evidenceStatus.replace(/_/g, ' ') })
  }
  if (filters.billableFilter !== 'all') {
    out.push({
      label: 'Billability',
      value: filters.billableFilter === 'billable' ? 'Billable Only' : 'Non-Billable Only',
    })
  }
  return out
}

const GOVERNANCE_FOOTNOTE =
  'Governing Principle: Recorded time, observed signals, declared context, supporting evidence, and approved billable hours are reported separately. Low keyboard activity is never treated as proof of inactivity.'

// =============================================================================
// PLATFORM REPORTS (P1, P2, P3) - SUPER ADMIN ONLY
// =============================================================================

export function buildPlatformRevenueDocument(
  rows: PlatformTenantReportRowInput[],
  access: ReportAccessContext
): ReportDocument {
  const totalMrr = round2(rows.reduce((s, r) => s + r.estimatedMrrUsd, 0))
  const totalArr = round2(totalMrr * 12)
  const totalSeats = rows.reduce((s, r) => s + r.activeSeats, 0)
  const totalPaid = round2(rows.reduce((s, r) => s + r.saasPaidTotalUsd, 0))
  const totalOpen = round2(rows.reduce((s, r) => s + r.saasOpenTotalUsd, 0))

  // Plan tier rollup
  const tierGroups = new Map<string, { tier: string; tenants: number; seats: number; mrr: number }>()
  for (const r of rows) {
    const cur = tierGroups.get(r.planTier) ?? { tier: r.planTier, tenants: 0, seats: 0, mrr: 0 }
    cur.tenants += 1
    cur.seats += r.activeSeats
    cur.mrr = round2(cur.mrr + r.estimatedMrrUsd)
    tierGroups.set(r.planTier, cur)
  }

  return {
    reportCode: 'P1-PLATFORM-REVENUE',
    title: 'Platform SaaS Revenue & Subscriptions Report',
    subtitle: 'Per-tenant subscription plans, active seats, estimated MRR/ARR, and SaaS billing collection',
    scopeLabel: 'Platform-Wide (All Tenants)',
    tenantSlug: 'all-tenants',
    dateRangeLabel: `As of ${new Date().toISOString().slice(0, 10)}`,
    appliedFilters: [{ label: 'Access Scope', value: 'Super Admin Portal' }],
    currency: 'USD',
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    kpis: [
      { label: 'Active Workspaces', value: String(rows.length), subtext: `${totalSeats} active seats`, tone: 'brand' },
      { label: 'Estimated MRR', value: `USD ${totalMrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: `ARR: USD ${totalArr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, tone: 'positive' },
      { label: 'Collected SaaS Billing', value: `USD ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: 'Paid platform invoices', tone: 'neutral' },
      { label: 'Open SaaS Receivables', value: `USD ${totalOpen.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: 'Pending platform invoices', tone: totalOpen > 0 ? 'warning' : 'positive' },
    ],
    sections: [
      {
        sheetName: 'Tenant Subscriptions',
        title: 'Tenant-by-Tenant Subscription & Revenue Breakdown',
        description: 'Each registered tenant workspace listed individually with its active subscription plan and MRR.',
        columns: [
          { key: 'tenantName', header: 'Tenant Workspace', width: 26 },
          { key: 'tenantSlug', header: 'Slug', width: 18 },
          { key: 'planTier', header: 'Plan Tier', width: 14 },
          { key: 'subscriptionStatus', header: 'Sub Status', width: 14 },
          { key: 'billingCycle', header: 'Cycle', width: 12 },
          { key: 'activeSeats', header: 'Active Seats', format: 'integer', sumInTotals: true, width: 14 },
          { key: 'estimatedMrrUsd', header: 'Est. MRR (USD)', format: 'currency', sumInTotals: true, width: 18 },
          { key: 'saasPaidTotalUsd', header: 'Paid SaaS (USD)', format: 'currency', sumInTotals: true, width: 18 },
          { key: 'saasOpenTotalUsd', header: 'Open SaaS (USD)', format: 'currency', sumInTotals: true, width: 18 },
        ],
        rows: rows.map((r) => ({
          tenantName: r.tenantName,
          tenantSlug: r.tenantSlug,
          planTier: r.planTier.toUpperCase(),
          subscriptionStatus: r.subscriptionStatus,
          billingCycle: r.billingCycle,
          activeSeats: r.activeSeats,
          estimatedMrrUsd: r.estimatedMrrUsd,
          saasPaidTotalUsd: r.saasPaidTotalUsd,
          saasOpenTotalUsd: r.saasOpenTotalUsd,
        })),
        totalsRow: {
          tenantName: 'Platform Total',
          tenantSlug: `${rows.length} tenants`,
          planTier: '',
          subscriptionStatus: '',
          billingCycle: '',
          activeSeats: totalSeats,
          estimatedMrrUsd: totalMrr,
          saasPaidTotalUsd: totalPaid,
          saasOpenTotalUsd: totalOpen,
        },
      },
      {
        sheetName: 'By Plan Tier',
        title: 'Revenue Distribution by Subscription Tier',
        columns: [
          { key: 'tier', header: 'Plan Tier', width: 18 },
          { key: 'tenants', header: 'Workspaces', format: 'integer', sumInTotals: true, width: 16 },
          { key: 'seats', header: 'Total Seats', format: 'integer', sumInTotals: true, width: 16 },
          { key: 'mrr', header: 'Monthly Recurring Revenue', format: 'currency', sumInTotals: true, width: 24 },
          { key: 'share', header: 'Revenue Share', format: 'percent', width: 16 },
        ],
        rows: Array.from(tierGroups.values()).map((g) => ({
          tier: g.tier.toUpperCase(),
          tenants: g.tenants,
          seats: g.seats,
          mrr: g.mrr,
          share: totalMrr > 0 ? g.mrr / totalMrr : 0,
        })),
        totalsRow: {
          tier: 'Total',
          tenants: rows.length,
          seats: totalSeats,
          mrr: totalMrr,
          share: 1,
        },
      },
    ],
    footnotes: [
      'Platform SaaS subscription revenue is strictly separated from tenant client-work invoices.',
      'Estimated MRR combines tier base price plus active billed seats from PlanEntitlement records.',
    ],
  }
}

export function buildPlatformHealthDocument(
  rows: PlatformTenantReportRowInput[],
  access: ReportAccessContext
): ReportDocument {
  const totalProjects = rows.reduce((s, r) => s + r.activeProjects, 0)
  const totalEvents = rows.reduce((s, r) => s + r.monthlyEventsUsed, 0)
  const totalAiTokens = rows.reduce((s, r) => s + r.aiTokensUsed, 0)
  const nearCapCount = rows.filter((r) => r.seatUtilizationPct >= 0.85).length

  return {
    reportCode: 'P2-TENANT-HEALTH',
    title: 'Tenant Health & Quota Utilization Report',
    subtitle: 'Per-tenant seat capacity, active projects, telemetry event quotas, AI token consumption, and storage',
    scopeLabel: 'Platform-Wide (All Tenants)',
    tenantSlug: 'all-tenants',
    dateRangeLabel: `As of ${new Date().toISOString().slice(0, 10)}`,
    appliedFilters: [{ label: 'Access Scope', value: 'Super Admin Portal' }],
    currency: 'USD',
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    kpis: [
      { label: 'Monitored Tenants', value: String(rows.length), subtext: `${nearCapCount} near seat limit (≥85%)`, tone: nearCapCount > 0 ? 'warning' : 'positive' },
      { label: 'Active Projects', value: totalProjects.toLocaleString('en-US'), subtext: 'Across all workspaces', tone: 'brand' },
      { label: 'Telemetry Events', value: totalEvents.toLocaleString('en-US'), subtext: 'Latest metered period', tone: 'neutral' },
      { label: 'AI Tokens Consumed', value: totalAiTokens.toLocaleString('en-US'), subtext: 'Guardrailed AI drafts', tone: 'neutral' },
    ],
    sections: [
      {
        sheetName: 'Tenant Quotas',
        title: 'Per-Tenant Quota Consumption & Capacity',
        columns: [
          { key: 'tenantName', header: 'Tenant Workspace', width: 24 },
          { key: 'planTier', header: 'Plan', width: 12 },
          { key: 'status', header: 'Status', width: 12 },
          { key: 'seatsRatio', header: 'Seats Used / Max', width: 16, align: 'center' },
          { key: 'seatUtil', header: 'Seat Util %', format: 'percent', width: 14 },
          { key: 'projectsRatio', header: 'Projects / Max', width: 16, align: 'center' },
          { key: 'monthlyEventsUsed', header: 'Events Used', format: 'integer', sumInTotals: true, width: 16 },
          { key: 'aiTokensUsed', header: 'AI Tokens', format: 'integer', sumInTotals: true, width: 15 },
          { key: 'storageMbUsed', header: 'Storage (MB)', format: 'decimal', sumInTotals: true, width: 15 },
        ],
        rows: rows.map((r) => ({
          tenantName: r.tenantName,
          planTier: r.planTier.toUpperCase(),
          status: r.status,
          seatsRatio: `${r.activeSeats} / ${r.maxSeats}`,
          seatUtil: r.seatUtilizationPct,
          projectsRatio: `${r.activeProjects} / ${r.maxActiveProjects}`,
          monthlyEventsUsed: r.monthlyEventsUsed,
          aiTokensUsed: r.aiTokensUsed,
          storageMbUsed: r.storageMbUsed,
        })),
        totalsRow: {
          tenantName: 'Platform Totals',
          planTier: '',
          status: '',
          seatsRatio: '',
          seatUtil: rows.length > 0 ? rows.reduce((s, r) => s + r.seatUtilizationPct, 0) / rows.length : 0,
          projectsRatio: `${totalProjects} active`,
          monthlyEventsUsed: totalEvents,
          aiTokensUsed: totalAiTokens,
          storageMbUsed: round2(rows.reduce((s, r) => s + r.storageMbUsed, 0)),
        },
      },
    ],
    footnotes: [
      'Tenants exceeding 85% seat or event quota are flagged for proactive plan upgrade outreach.',
    ],
  }
}

export function buildPlatformOperationsDocument(
  rows: PlatformTenantReportRowInput[],
  access: ReportAccessContext
): ReportDocument {
  const totalClaimed = round2(rows.reduce((s, r) => s + r.claimedHours, 0))
  const totalApproved = round2(rows.reduce((s, r) => s + r.approvedBillableHours, 0))
  const totalDisputes = rows.reduce((s, r) => s + r.openDisputesCount, 0)
  const totalArtifacts = rows.reduce((s, r) => s + r.evidenceArtifactsCount, 0)

  return {
    reportCode: 'P3-CROSS-TENANT-OPS',
    title: 'Cross-Tenant Operational & Governance Overview',
    subtitle: 'Separate per-tenant summary of claimed vs. approved hours, evidence volume, open disputes, and policy consent',
    scopeLabel: 'Platform-Wide (All Tenants)',
    tenantSlug: 'all-tenants',
    dateRangeLabel: `As of ${new Date().toISOString().slice(0, 10)}`,
    appliedFilters: [{ label: 'Access Scope', value: 'Super Admin Portal' }],
    currency: 'USD',
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    kpis: [
      { label: 'Total Claimed Hours', value: `${totalClaimed.toFixed(2)} h`, subtext: `Across ${rows.length} tenants`, tone: 'brand' },
      { label: 'Total Approved Hours', value: `${totalApproved.toFixed(2)} h`, subtext: `${totalClaimed > 0 ? ((totalApproved / totalClaimed) * 100).toFixed(1) : '0.0'}% approval rate`, tone: 'positive' },
      { label: 'Open Disputes', value: String(totalDisputes), subtext: 'Awaiting workspace resolution', tone: totalDisputes > 0 ? 'warning' : 'positive' },
      { label: 'Corroborated Artifacts', value: totalArtifacts.toLocaleString('en-US'), subtext: 'Git / IDE / CI evidence links', tone: 'neutral' },
    ],
    sections: [
      {
        sheetName: 'Tenant Operations',
        title: 'Per-Tenant Work Ledger, Evidence & Governance Metrics',
        columns: [
          { key: 'tenantName', header: 'Tenant Workspace', width: 24 },
          { key: 'currency', header: 'Curr.', width: 9, align: 'center' },
          { key: 'claimedHours', header: 'Claimed (h)', format: 'hours', sumInTotals: true, width: 14 },
          { key: 'supportedHours', header: 'Supported (h)', format: 'hours', sumInTotals: true, width: 15 },
          { key: 'approvedBillableHours', header: 'Approved (h)', format: 'hours', sumInTotals: true, width: 15 },
          { key: 'approvalRatePct', header: 'Approval %', format: 'percent', width: 13 },
          { key: 'evidenceArtifactsCount', header: 'Artifacts', format: 'integer', sumInTotals: true, width: 12 },
          { key: 'openDisputesCount', header: 'Open Disputes', format: 'integer', sumInTotals: true, width: 14 },
          { key: 'policyConsentPct', header: 'Consent %', format: 'percent', width: 13 },
        ],
        rows: rows.map((r) => ({
          tenantName: r.tenantName,
          currency: r.currency,
          claimedHours: r.claimedHours,
          supportedHours: r.supportedHours,
          approvedBillableHours: r.approvedBillableHours,
          approvalRatePct: r.approvalRatePct,
          evidenceArtifactsCount: r.evidenceArtifactsCount,
          openDisputesCount: r.openDisputesCount,
          policyConsentPct: r.policyConsentPct,
        })),
        totalsRow: {
          tenantName: 'Platform Totals',
          currency: '',
          claimedHours: totalClaimed,
          supportedHours: round2(rows.reduce((s, r) => s + r.supportedHours, 0)),
          approvedBillableHours: totalApproved,
          approvalRatePct: totalClaimed > 0 ? totalApproved / totalClaimed : 0,
          evidenceArtifactsCount: totalArtifacts,
          openDisputesCount: totalDisputes,
          policyConsentPct: rows.length > 0 ? rows.reduce((s, r) => s + r.policyConsentPct, 0) / rows.length : 1,
        },
      },
    ],
    footnotes: [GOVERNANCE_FOOTNOTE],
  }
}

// =============================================================================
// TENANT OPERATIONAL REPORTS (R1 - R8)
// =============================================================================

export interface ExecutiveReportData {
  kpis: {
    elapsedHours: number
    claimedHours: number
    observedHours: number
    supportedHours: number
    approvedHours: number
    approvalRate: number
    corroborationRate: number
    billableUtilization: number
    approvedRevenue: number
    internalCost: number
    grossProfit: number
    profitMargin: number
    unreviewedExposureHours: number
    unreviewedExposureAmount: number
  }
  fiveConceptFunnel: Array<{ stage: string; hours: number; pctOfElapsed: number }>
  dailyTrend: Array<{
    date: string
    claimedHours: number
    supportedHours: number
    approvedHours: number
    revenue: number
    cost: number
  }>
  projectSummary: Array<{
    projectId: string
    projectCode: string
    projectName: string
    clientName: string
    claimedHours: number
    supportedHours: number
    approvedHours: number
    revenue: number
    cost: number
    marginPct: number
  }>
  document: ReportDocument
}

export function computeExecutiveSummaryReport(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext
): ExecutiveReportData {
  const lines = filterScopedTimesheetLines(dataset, filters, access)
  const bounds = resolveDateRangeBounds(filters)
  const showFin = access.canViewFinancials && !access.hideClientBillingRates && !access.isClientReviewer
  const showClientRevenueOnly = access.isClientReviewer && !access.hideClientBillingRates

  const elapsedMins = lines.reduce((s, l) => s + l.elapsedMinutes, 0)
  const claimedMins = lines.reduce((s, l) => s + l.claimedMinutes, 0)
  const observedMins = lines.reduce((s, l) => s + l.observedMinutes, 0)
  const supportedMins = lines.reduce((s, l) => s + l.supportedMinutes, 0)
  const approvedMins = lines.reduce((s, l) => s + l.approvedBillableMinutes, 0)

  const taskMap = new Map(dataset.tasks.map((t) => [t.id, t]))
  const billableClaimedMins = lines
    .filter((l) => taskMap.get(l.taskId)?.isBillable ?? true)
    .reduce((s, l) => s + l.claimedMinutes, 0)

  const approvedRevenue = round2(
    lines.reduce((s, l) => s + (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate, 0)
  )
  const internalCost = round2(
    lines.reduce(
      (s, l) =>
        s +
        computeInternalCostForLine(l, dataset.developerPaymentConfigs, dataset.taskPaymentConfigs),
      0
    )
  )
  const grossProfit = round2(approvedRevenue - internalCost)
  const profitMargin = approvedRevenue > 0 ? grossProfit / approvedRevenue : 0

  const unreviewedLines = lines.filter(
    (l) => l.evidenceStatus !== 'approved' && l.approvedBillableMinutes === 0
  )
  const unreviewedExposureHours = minsToHours(
    unreviewedLines.reduce((s, l) => s + l.claimedMinutes, 0)
  )
  const unreviewedExposureAmount = round2(
    unreviewedLines.reduce((s, l) => s + (l.claimedMinutes / 60) * l.snapshotHourlyRate, 0)
  )

  const elapsedHours = minsToHours(elapsedMins)
  const claimedHours = minsToHours(claimedMins)
  const observedHours = minsToHours(observedMins)
  const supportedHours = minsToHours(supportedMins)
  const approvedHours = minsToHours(approvedMins)
  const approvalRate = claimedMins > 0 ? approvedMins / claimedMins : 0
  const corroborationRate = claimedMins > 0 ? Math.min(1, supportedMins / claimedMins) : 0
  const billableUtilization = claimedMins > 0 ? billableClaimedMins / claimedMins : 0

  const baseForFunnel = Math.max(elapsedHours, claimedHours, 0.01)
  const fiveConceptFunnel = [
    { stage: '1. Elapsed', hours: elapsedHours, pctOfElapsed: elapsedHours / baseForFunnel },
    { stage: '2. Claimed', hours: claimedHours, pctOfElapsed: claimedHours / baseForFunnel },
    { stage: '3. Observed', hours: observedHours, pctOfElapsed: observedHours / baseForFunnel },
    { stage: '4. Supported', hours: supportedHours, pctOfElapsed: supportedHours / baseForFunnel },
    { stage: '5. Approved Billable', hours: approvedHours, pctOfElapsed: approvedHours / baseForFunnel },
  ]

  // Daily trend
  const dailyMap = new Map<
    string,
    { date: string; claimedMins: number; supportedMins: number; approvedMins: number; revenue: number; cost: number }
  >()
  for (const l of lines) {
    const cur = dailyMap.get(l.workDate) ?? {
      date: l.workDate,
      claimedMins: 0,
      supportedMins: 0,
      approvedMins: 0,
      revenue: 0,
      cost: 0,
    }
    cur.claimedMins += l.claimedMinutes
    cur.supportedMins += l.supportedMinutes
    cur.approvedMins += l.approvedBillableMinutes
    cur.revenue += (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate
    cur.cost += computeInternalCostForLine(
      l,
      dataset.developerPaymentConfigs,
      dataset.taskPaymentConfigs
    )
    dailyMap.set(l.workDate, cur)
  }
  const dailyTrend = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      claimedHours: minsToHours(d.claimedMins),
      supportedHours: minsToHours(d.supportedMins),
      approvedHours: minsToHours(d.approvedMins),
      revenue: round2(d.revenue),
      cost: round2(d.cost),
    }))

  // Project summary
  const projectSummary = dataset.projects
    .map((p) => {
      const pLines = lines.filter((l) => l.projectId === p.id)
      const pClaimed = minsToHours(pLines.reduce((s, l) => s + l.claimedMinutes, 0))
      const pSupported = minsToHours(pLines.reduce((s, l) => s + l.supportedMinutes, 0))
      const pApproved = minsToHours(pLines.reduce((s, l) => s + l.approvedBillableMinutes, 0))
      const pRev = round2(
        pLines.reduce((s, l) => s + (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate, 0)
      )
      const pCost = round2(
        pLines.reduce(
          (s, l) =>
            s +
            computeInternalCostForLine(
              l,
              dataset.developerPaymentConfigs,
              dataset.taskPaymentConfigs
            ),
          0
        )
      )
      return {
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        clientName: p.clientName,
        claimedHours: pClaimed,
        supportedHours: pSupported,
        approvedHours: pApproved,
        revenue: pRev,
        cost: pCost,
        marginPct: pRev > 0 ? (pRev - pCost) / pRev : 0,
      }
    })
    .filter((p) => p.claimedHours > 0 || filters.projectId === p.projectId)
    .sort((a, b) => b.claimedHours - a.claimedHours)

  const kpiCards: ReportKpiItem[] = [
    {
      label: 'Claimed vs. Approved',
      value: `${approvedHours.toFixed(2)} h`,
      subtext: `of ${claimedHours.toFixed(2)} h claimed (${(approvalRate * 100).toFixed(1)}%)`,
      tone: 'brand',
    },
    {
      label: 'Billable Utilization',
      value: `${(billableUtilization * 100).toFixed(1)}%`,
      subtext: `${minsToHours(billableClaimedMins).toFixed(2)} h billable tasks`,
      tone: 'positive',
    },
    {
      label: 'Evidence Corroboration',
      value: `${(corroborationRate * 100).toFixed(1)}%`,
      subtext: `${supportedHours.toFixed(2)} h context/artifact backed`,
      tone: 'neutral',
    },
    {
      label: 'Unreviewed Exposure',
      value: `${unreviewedExposureHours.toFixed(2)} h`,
      subtext: showFin
        ? `${dataset.tenant.currency} ${unreviewedExposureAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        : 'Pending manager review',
      tone: unreviewedExposureHours > 2 ? 'warning' : 'positive',
    },
  ]

  if (showFin) {
    kpiCards.push(
      {
        label: 'Approved Billable Revenue',
        value: `${dataset.tenant.currency} ${approvedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        subtext: 'Snapshot contracted rates',
        tone: 'positive',
      },
      {
        label: 'Est. Gross Margin',
        value: `${(profitMargin * 100).toFixed(1)}%`,
        subtext: `Profit: ${dataset.tenant.currency} ${grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        tone: profitMargin >= 0.3 ? 'positive' : 'warning',
      }
    )
  } else if (showClientRevenueOnly) {
    kpiCards.push({
      label: 'Approved Client Billing',
      value: `${dataset.tenant.currency} ${approvedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      subtext: 'Approved billable hours only',
      tone: 'positive',
    })
  }

  const projectCols: ReportColumnDef[] = [
    { key: 'projectCode', header: 'Code', width: 12 },
    { key: 'projectName', header: 'Project Name', width: 26 },
    { key: 'clientName', header: 'Client', width: 22 },
    { key: 'claimedHours', header: 'Claimed (h)', format: 'hours', sumInTotals: true, width: 14 },
    { key: 'supportedHours', header: 'Supported (h)', format: 'hours', sumInTotals: true, width: 15 },
    { key: 'approvedHours', header: 'Approved (h)', format: 'hours', sumInTotals: true, width: 15 },
  ]
  if (showFin) {
    projectCols.push(
      { key: 'revenue', header: 'Billable Revenue', format: 'currency', sumInTotals: true, width: 18 },
      { key: 'cost', header: 'Internal Cost', format: 'currency', sumInTotals: true, width: 18 },
      { key: 'marginPct', header: 'Margin %', format: 'percent', width: 13 }
    )
  } else if (showClientRevenueOnly) {
    projectCols.push({
      key: 'revenue',
      header: 'Approved Value',
      format: 'currency',
      sumInTotals: true,
      width: 18,
    })
  }

  const document: ReportDocument = {
    reportCode: 'R1-EXECUTIVE-SUMMARY',
    title: 'Executive Summary Report',
    subtitle: 'Workspace-level overview of the 5-Time-Concept Ledger, utilization, and project performance',
    scopeLabel: `${dataset.tenant.name} (${dataset.tenant.slug})`,
    tenantSlug: dataset.tenant.slug,
    dateRangeLabel: bounds.label,
    appliedFilters: buildAppliedFiltersMeta(dataset, filters),
    currency: dataset.tenant.currency,
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    brandColorHex: dataset.brandColorHex,
    kpis: kpiCards,
    sections: [
      {
        sheetName: '5-Concept Funnel',
        title: 'Five-Time-Concept Reconciliation Funnel',
        description: 'Transparent separation between recorded elapsed time, claimed context, observed activity, supported work, and approved billable hours.',
        columns: [
          { key: 'stage', header: 'Time Ledger Stage', width: 28 },
          { key: 'hours', header: 'Total Hours', format: 'hours', width: 18 },
          { key: 'pctOfElapsed', header: '% of Baseline', format: 'percent', width: 18 },
        ],
        rows: fiveConceptFunnel,
      },
      {
        sheetName: 'Project Summary',
        title: 'Project Performance Overview',
        columns: projectCols,
        rows: projectSummary,
        totalsRow: {
          projectCode: 'TOTAL',
          projectName: `${projectSummary.length} projects`,
          clientName: '',
          claimedHours,
          supportedHours,
          approvedHours,
          ...(showFin
            ? { revenue: approvedRevenue, cost: internalCost, marginPct: profitMargin }
            : showClientRevenueOnly
              ? { revenue: approvedRevenue }
              : {}),
        },
      },
      {
        sheetName: 'Daily Trend',
        title: 'Daily Hours Trend',
        columns: [
          { key: 'date', header: 'Work Date', format: 'date', width: 15 },
          { key: 'claimedHours', header: 'Claimed (h)', format: 'hours', sumInTotals: true, width: 15 },
          { key: 'supportedHours', header: 'Supported (h)', format: 'hours', sumInTotals: true, width: 15 },
          { key: 'approvedHours', header: 'Approved (h)', format: 'hours', sumInTotals: true, width: 15 },
          ...(showFin
            ? [
              { key: 'revenue', header: 'Approved Revenue', format: 'currency' as const, sumInTotals: true, width: 18 },
              { key: 'cost', header: 'Est. Cost', format: 'currency' as const, sumInTotals: true, width: 16 },
            ]
            : []),
        ],
        rows: dailyTrend,
        totalsRow: {
          date: 'Total',
          claimedHours,
          supportedHours,
          approvedHours,
          ...(showFin ? { revenue: approvedRevenue, cost: internalCost } : {}),
        },
      },
    ],
    footnotes: [GOVERNANCE_FOOTNOTE],
  }

  return {
    kpis: {
      elapsedHours,
      claimedHours,
      observedHours,
      supportedHours,
      approvedHours,
      approvalRate,
      corroborationRate,
      billableUtilization,
      approvedRevenue,
      internalCost,
      grossProfit,
      profitMargin,
      unreviewedExposureHours,
      unreviewedExposureAmount,
    },
    fiveConceptFunnel,
    dailyTrend,
    projectSummary,
    document,
  }
}

// =============================================================================
// R2: TIME & UTILIZATION REPORT
// =============================================================================

export interface TimeUtilizationReportData {
  totalLoggedHours: number
  billableHours: number
  nonBillableHours: number
  approvedHours: number
  billableRatio: number
  byMember: Array<{
    memberId: string
    memberName: string
    role: string
    weeklyCapHours: number
    claimedHours: number
    billableHours: number
    nonBillableHours: number
    approvedHours: number
    utilizationPct: number
    entriesCount: number
  }>
  byProvenance: Array<{ provenance: string; hours: number; entries: number; share: number }>
  dailyBillableSeries: Array<{ date: string; billableHours: number; nonBillableHours: number; approvedHours: number }>
  document: ReportDocument
}

export function computeTimeUtilizationReport(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext
): TimeUtilizationReportData {
  const lines = filterScopedTimesheetLines(dataset, filters, access)
  const bounds = resolveDateRangeBounds(filters)
  const taskMap = new Map(dataset.tasks.map((t) => [t.id, t]))
  const memberMap = new Map(dataset.members.map((m) => [m.id, m]))
  const weeklyCapHours = Math.max(1, dataset.tenant.weeklyCapMinutes / 60)

  let totalClaimedMins = 0
  let billableMins = 0
  let nonBillableMins = 0
  let approvedMins = 0

  const devAgg = new Map<
    string,
    { memberId: string; memberName: string; role: string; claimed: number; billable: number; nonBillable: number; approved: number; entries: number }
  >()
  const provAgg = new Map<string, { mins: number; entries: number }>()
  const dayAgg = new Map<string, { date: string; billable: number; nonBillable: number; approved: number }>()

  for (const l of lines) {
    const isBill = taskMap.get(l.taskId)?.isBillable ?? true
    totalClaimedMins += l.claimedMinutes
    if (isBill) billableMins += l.claimedMinutes
    else nonBillableMins += l.claimedMinutes
    approvedMins += l.approvedBillableMinutes

    const mem = memberMap.get(l.developerId)
    const curDev = devAgg.get(l.developerId) ?? {
      memberId: l.developerId,
      memberName: l.developerName || mem?.name || 'Member',
      role: mem?.role || 'developer',
      claimed: 0,
      billable: 0,
      nonBillable: 0,
      approved: 0,
      entries: 0,
    }
    curDev.claimed += l.claimedMinutes
    if (isBill) curDev.billable += l.claimedMinutes
    else curDev.nonBillable += l.claimedMinutes
    curDev.approved += l.approvedBillableMinutes
    curDev.entries += 1
    devAgg.set(l.developerId, curDev)

    const pCur = provAgg.get(l.provenance) ?? { mins: 0, entries: 0 }
    pCur.mins += l.claimedMinutes
    pCur.entries += 1
    provAgg.set(l.provenance, pCur)

    const dCur = dayAgg.get(l.workDate) ?? { date: l.workDate, billable: 0, nonBillable: 0, approved: 0 }
    if (isBill) dCur.billable += l.claimedMinutes
    else dCur.nonBillable += l.claimedMinutes
    dCur.approved += l.approvedBillableMinutes
    dayAgg.set(l.workDate, dCur)
  }

  const totalLoggedHours = minsToHours(totalClaimedMins)
  const billableHours = minsToHours(billableMins)
  const nonBillableHours = minsToHours(nonBillableMins)
  const approvedHours = minsToHours(approvedMins)
  const billableRatio = totalClaimedMins > 0 ? billableMins / totalClaimedMins : 0

  const byMember = Array.from(devAgg.values())
    .map((d) => ({
      memberId: d.memberId,
      memberName: d.memberName,
      role: d.role.replace(/_/g, ' '),
      weeklyCapHours: round2(weeklyCapHours),
      claimedHours: minsToHours(d.claimed),
      billableHours: minsToHours(d.billable),
      nonBillableHours: minsToHours(d.nonBillable),
      approvedHours: minsToHours(d.approved),
      utilizationPct: weeklyCapHours > 0 ? Math.min(2, d.claimed / 60 / weeklyCapHours) : 0,
      entriesCount: d.entries,
    }))
    .sort((a, b) => a.memberName.localeCompare(b.memberName))

  const byProvenance = Array.from(provAgg.entries()).map(([prov, v]) => ({
    provenance: prov.replace(/_/g, ' '),
    hours: minsToHours(v.mins),
    entries: v.entries,
    share: totalClaimedMins > 0 ? v.mins / totalClaimedMins : 0,
  }))

  const dailyBillableSeries = Array.from(dayAgg.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      billableHours: minsToHours(d.billable),
      nonBillableHours: minsToHours(d.nonBillable),
      approvedHours: minsToHours(d.approved),
    }))

  const document: ReportDocument = {
    reportCode: 'R2-TIME-UTILIZATION',
    title: 'Time & Utilization Report',
    subtitle: 'Billable vs. non-billable allocation, capacity utilization against weekly caps, and recording provenance',
    scopeLabel: `${dataset.tenant.name} (${dataset.tenant.slug})`,
    tenantSlug: dataset.tenant.slug,
    dateRangeLabel: bounds.label,
    appliedFilters: buildAppliedFiltersMeta(dataset, filters),
    currency: dataset.tenant.currency,
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    brandColorHex: dataset.brandColorHex,
    kpis: [
      { label: 'Total Claimed Time', value: `${totalLoggedHours.toFixed(2)} h`, subtext: `${lines.length} timesheet entries`, tone: 'brand' },
      { label: 'Billable Share', value: `${(billableRatio * 100).toFixed(1)}%`, subtext: `${billableHours.toFixed(2)} h billable`, tone: 'positive' },
      { label: 'Non-Billable Time', value: `${nonBillableHours.toFixed(2)} h`, subtext: 'Internal / overhead tasks', tone: 'neutral' },
      { label: 'Approved Billable', value: `${approvedHours.toFixed(2)} h`, subtext: `Weekly cap policy: ${weeklyCapHours.toFixed(0)}h`, tone: 'positive' },
    ],
    sections: [
      {
        sheetName: 'Member Utilization',
        title: 'Capacity & Utilization by Team Member',
        description: 'Sorted alphabetically (never ranked as a punitive leaderboard). Utilization compares logged hours against configured weekly cap.',
        columns: [
          { key: 'memberName', header: 'Team Member', width: 24 },
          { key: 'role', header: 'Role', width: 16 },
          { key: 'claimedHours', header: 'Claimed (h)', format: 'hours', sumInTotals: true, width: 14 },
          { key: 'billableHours', header: 'Billable (h)', format: 'hours', sumInTotals: true, width: 14 },
          { key: 'nonBillableHours', header: 'Non-Billable (h)', format: 'hours', sumInTotals: true, width: 16 },
          { key: 'approvedHours', header: 'Approved (h)', format: 'hours', sumInTotals: true, width: 14 },
          { key: 'utilizationPct', header: 'Cap Util %', format: 'percent', width: 13 },
          { key: 'entriesCount', header: 'Sessions', format: 'integer', sumInTotals: true, width: 11 },
        ],
        rows: byMember,
        totalsRow: {
          memberName: 'Total',
          role: `${byMember.length} members`,
          claimedHours: totalLoggedHours,
          billableHours,
          nonBillableHours,
          approvedHours,
          utilizationPct:
            byMember.length > 0
              ? byMember.reduce((s, m) => s + m.utilizationPct, 0) / byMember.length
              : 0,
          entriesCount: lines.length,
        },
      },
      {
        sheetName: 'Recording Provenance',
        title: 'Time Entry Provenance Breakdown',
        columns: [
          { key: 'provenance', header: 'Capture Source', width: 24 },
          { key: 'hours', header: 'Claimed Hours', format: 'hours', sumInTotals: true, width: 16 },
          { key: 'entries', header: 'Entries', format: 'integer', sumInTotals: true, width: 12 },
          { key: 'share', header: 'Share %', format: 'percent', width: 14 },
        ],
        rows: byProvenance,
        totalsRow: {
          provenance: 'Total',
          hours: totalLoggedHours,
          entries: lines.length,
          share: 1,
        },
      },
    ],
    footnotes: [GOVERNANCE_FOOTNOTE],
  }

  return {
    totalLoggedHours,
    billableHours,
    nonBillableHours,
    approvedHours,
    billableRatio,
    byMember,
    byProvenance,
    dailyBillableSeries,
    document,
  }
}

// =============================================================================
// R3: DEEP-WORK & WORK-MODE ANALYSIS REPORT
// =============================================================================

const DEEP_WORK_MODES = new Set(['coding', 'debugging', 'thinking', 'research', 'design', 'testing'])

export interface DeepWorkReportData {
  totalHours: number
  deepWorkHours: number
  deepWorkRatio: number
  meetingHours: number
  observationGapHours: number
  reconciledGapRatio: number
  byWorkMode: Array<{ workMode: string; hours: number; share: number; entries: number; category: string }>
  byAppCategory: Array<{ appCategory: string; hours: number; share: number; buckets: number }>
  gapBreakdown: Array<{ choice: string; hours: number; buckets: number }>
  document: ReportDocument
}

export function computeDeepWorkReport(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext
): DeepWorkReportData {
  const lines = filterScopedTimesheetLines(dataset, filters, access)
  const bounds = resolveDateRangeBounds(filters)

  const modeAgg = new Map<string, { mins: number; entries: number }>()
  let totalMins = 0
  let deepMins = 0
  let meetingMinsFromLines = 0

  for (const l of lines) {
    totalMins += l.claimedMinutes
    if (DEEP_WORK_MODES.has(l.workMode)) deepMins += l.claimedMinutes
    if (l.workMode === 'meeting') meetingMinsFromLines += l.claimedMinutes
    const cur = modeAgg.get(l.workMode) ?? { mins: 0, entries: 0 }
    cur.mins += l.claimedMinutes
    cur.entries += 1
    modeAgg.set(l.workMode, cur)
  }

  // Scoped activity rollups (never exposed to Client Reviewer)
  const scopedRollups = access.isClientReviewer && !access.isSuperAdmin
    ? []
    : dataset.activityRollups.filter((b) => {
      if (!access.canViewTeam && !access.isSuperAdmin && b.userId !== access.activeUserId) return false
      if (bounds.from && b.workDate < bounds.from) return false
      if (bounds.to && b.workDate > bounds.to) return false
      if (filters.projectId !== 'all' && b.projectId !== filters.projectId) return false
      if (filters.developerId !== 'all' && b.userId !== filters.developerId) return false
      if (filters.workMode !== 'all' && b.workMode !== filters.workMode) return false
      return true
    })

  const appAgg = new Map<string, { mins: number; buckets: number }>()
  const gapAgg = new Map<string, { mins: number; buckets: number }>()
  let totalRollupMins = 0
  let gapTotalMins = 0
  let reconciledGapMins = 0

  for (const b of scopedRollups) {
    totalRollupMins += b.durationMinutes
    const aCur = appAgg.get(b.appCategory) ?? { mins: 0, buckets: 0 }
    aCur.mins += b.durationMinutes
    aCur.buckets += 1
    appAgg.set(b.appCategory, aCur)

    if (b.isObservationGap) {
      gapTotalMins += b.durationMinutes
      const label = b.reconciliationChoice ? b.reconciliationChoice : 'unreconciled'
      if (b.reconciliationChoice) reconciledGapMins += b.durationMinutes
      const gCur = gapAgg.get(label) ?? { mins: 0, buckets: 0 }
      gCur.mins += b.durationMinutes
      gCur.buckets += 1
      gapAgg.set(label, gCur)
    }
  }

  // Calendar meetings in scope
  const meetingMinsFromCal = dataset.calendarMeetings
    .filter((m) => {
      if (!access.canViewTeam && !access.isSuperAdmin && m.userId !== access.activeUserId) return false
      if (filters.projectId !== 'all' && m.projectId !== filters.projectId) return false
      return true
    })
    .reduce((s, m) => s + m.durationMinutes, 0)

  const totalHours = minsToHours(totalMins)
  const deepWorkHours = minsToHours(deepMins)
  const deepWorkRatio = totalMins > 0 ? deepMins / totalMins : 0
  const meetingHours = minsToHours(Math.max(meetingMinsFromLines, meetingMinsFromCal))
  const observationGapHours = minsToHours(gapTotalMins)
  const reconciledGapRatio = gapTotalMins > 0 ? reconciledGapMins / gapTotalMins : 1

  const byWorkMode = Array.from(modeAgg.entries())
    .map(([mode, v]) => ({
      workMode: mode.charAt(0).toUpperCase() + mode.slice(1),
      hours: minsToHours(v.mins),
      share: totalMins > 0 ? v.mins / totalMins : 0,
      entries: v.entries,
      category: DEEP_WORK_MODES.has(mode) ? 'Deep Work / Maker' : 'Collaboration / Review',
    }))
    .sort((a, b) => b.hours - a.hours)

  const byAppCategory = Array.from(appAgg.entries())
    .map(([cat, v]) => ({
      appCategory: cat.replace(/_/g, ' ').toUpperCase(),
      hours: minsToHours(v.mins),
      share: totalRollupMins > 0 ? v.mins / totalRollupMins : 0,
      buckets: v.buckets,
    }))
    .sort((a, b) => b.hours - a.hours)

  const gapBreakdown = Array.from(gapAgg.entries())
    .map(([choice, v]) => ({
      choice: choice.replace(/_/g, ' '),
      hours: minsToHours(v.mins),
      buckets: v.buckets,
    }))
    .sort((a, b) => b.hours - a.hours)

  const sections: ReportDocument['sections'] = [
    {
      sheetName: 'Work-Mode Balance',
      title: 'Engineering Investment Balance by Work Mode',
      description: 'Distribution of declared engineering effort across deep-work and collaborative modes.',
      columns: [
        { key: 'workMode', header: 'Work Mode', width: 20 },
        { key: 'category', header: 'Classification', width: 22 },
        { key: 'hours', header: 'Hours', format: 'hours', sumInTotals: true, width: 14 },
        { key: 'share', header: 'Share %', format: 'percent', width: 14 },
        { key: 'entries', header: 'Sessions', format: 'integer', sumInTotals: true, width: 12 },
      ],
      rows: byWorkMode,
      totalsRow: {
        workMode: 'Total',
        category: '',
        hours: totalHours,
        share: 1,
        entries: lines.length,
      },
    },
  ]

  if (!access.isClientReviewer || access.isSuperAdmin) {
    sections.push(
      {
        sheetName: 'App Categories',
        title: 'Coarse Foreground Application Categories (Privacy-Safe)',
        description: 'On-device categorized app buckets only - no typed keystrokes or private window titles.',
        columns: [
          { key: 'appCategory', header: 'Application Category', width: 24 },
          { key: 'hours', header: 'Observed Hours', format: 'hours', sumInTotals: true, width: 16 },
          { key: 'share', header: 'Share %', format: 'percent', width: 14 },
          { key: 'buckets', header: 'Rollup Buckets', format: 'integer', sumInTotals: true, width: 15 },
        ],
        rows: byAppCategory,
        totalsRow: {
          appCategory: 'Total Observed Rollups',
          hours: minsToHours(totalRollupMins),
          share: 1,
          buckets: scopedRollups.length,
        },
      },
      {
        sheetName: 'Gap Reconciliation',
        title: 'Observation Gap Reconciliation Breakdown',
        description: 'Quiet/low-input intervals reconciled by developers (e.g. architectural thinking, reading docs, whiteboarding).',
        columns: [
          { key: 'choice', header: 'Reconciliation Context', width: 24 },
          { key: 'hours', header: 'Hours', format: 'hours', sumInTotals: true, width: 16 },
          { key: 'buckets', header: 'Intervals', format: 'integer', sumInTotals: true, width: 14 },
        ],
        rows: gapBreakdown,
        totalsRow: {
          choice: 'Total Observation Gaps',
          hours: observationGapHours,
          buckets: scopedRollups.filter((b) => b.isObservationGap).length,
        },
      }
    )
  }

  const document: ReportDocument = {
    reportCode: 'R3-DEEP-WORK',
    title: 'Deep-Work & Work-Mode Analysis Report',
    subtitle: 'Engineering investment balance, focus-mode ratio, meeting load, and privacy-safe context rollups',
    scopeLabel: `${dataset.tenant.name} (${dataset.tenant.slug})`,
    tenantSlug: dataset.tenant.slug,
    dateRangeLabel: bounds.label,
    appliedFilters: buildAppliedFiltersMeta(dataset, filters),
    currency: dataset.tenant.currency,
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    brandColorHex: dataset.brandColorHex,
    kpis: [
      { label: 'Deep-Work Ratio', value: `${(deepWorkRatio * 100).toFixed(1)}%`, subtext: `${deepWorkHours.toFixed(2)} h maker focus`, tone: 'brand' },
      { label: 'Meeting Load', value: `${meetingHours.toFixed(2)} h`, subtext: `${totalHours > 0 ? ((meetingHours / totalHours) * 100).toFixed(1) : '0.0'}% of tracked time`, tone: 'neutral' },
      { label: 'Observation Gaps', value: `${observationGapHours.toFixed(2)} h`, subtext: `${(reconciledGapRatio * 100).toFixed(0)}% context-reconciled`, tone: 'positive' },
      { label: 'Work Modes Used', value: String(byWorkMode.length), subtext: 'Declared engineering contexts', tone: 'neutral' },
    ],
    sections,
    footnotes: [
      'Architectural thinking, debugging, reading docs, and whiteboarding are legitimate deep work even without continuous keyboard input.',
      GOVERNANCE_FOOTNOTE,
    ],
  }

  return {
    totalHours,
    deepWorkHours,
    deepWorkRatio,
    meetingHours,
    observationGapHours,
    reconciledGapRatio,
    byWorkMode,
    byAppCategory,
    gapBreakdown,
    document,
  }
}

// =============================================================================
// R4: FINANCIAL & PROFITABILITY REPORT
// =============================================================================

export interface FinancialProfitabilityReportData {
  totalRevenue: number
  totalInternalCost: number
  grossProfit: number
  grossMarginPct: number
  effectiveHourlyRate: number
  unreviewedExposureAmount: number
  byProject: Array<{
    projectId: string
    projectCode: string
    projectName: string
    clientName: string
    approvedHours: number
    estimatedHours: number
    revenue: number
    internalCost: number
    grossProfit: number
    marginPct: number
    effectiveHourlyRate: number
    riskLevel: string
  }>
  byClient: Array<{
    clientName: string
    projectsCount: number
    approvedHours: number
    revenue: number
    internalCost: number
    grossProfit: number
    marginPct: number
  }>
  document: ReportDocument
}

export function computeFinancialProfitabilityReport(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext
): FinancialProfitabilityReportData {
  const lines = filterScopedTimesheetLines(dataset, filters, access)
  const bounds = resolveDateRangeBounds(filters)
  const forecastMap = new Map(dataset.projectForecasts.map((f) => [f.projectId, f]))

  const byProject = dataset.projects
    .map((p) => {
      const pLines = lines.filter((l) => l.projectId === p.id)
      const pTasks = dataset.tasks.filter((t) => t.projectId === p.id)
      const approvedHours = minsToHours(
        pLines.reduce((s, l) => s + l.approvedBillableMinutes, 0)
      )
      const estimatedHours = minsToHours(
        pTasks.reduce((s, t) => s + t.estimateMinutes, 0)
      )
      const revenue = round2(
        pLines.reduce((s, l) => s + (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate, 0)
      )
      const internalCost = round2(
        pLines.reduce(
          (s, l) =>
            s +
            computeInternalCostForLine(
              l,
              dataset.developerPaymentConfigs,
              dataset.taskPaymentConfigs
            ),
          0
        )
      )
      const grossProfit = round2(revenue - internalCost)
      const marginPct = revenue > 0 ? grossProfit / revenue : 0
      const effectiveHourlyRate = approvedHours > 0 ? round2(revenue / approvedHours) : 0
      const riskLevel = forecastMap.get(p.id)?.riskLevel ?? 'on_track'

      return {
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        clientName: p.clientName,
        approvedHours,
        estimatedHours,
        revenue,
        internalCost,
        grossProfit,
        marginPct,
        effectiveHourlyRate,
        riskLevel: riskLevel.replace(/_/g, ' ').toUpperCase(),
      }
    })
    .filter((p) => p.approvedHours > 0 || p.estimatedHours > 0)
    .sort((a, b) => b.revenue - a.revenue)

  const clientMap = new Map<
    string,
    { clientName: string; projectsCount: number; approvedHours: number; revenue: number; internalCost: number }
  >()
  for (const p of byProject) {
    const cur = clientMap.get(p.clientName) ?? {
      clientName: p.clientName,
      projectsCount: 0,
      approvedHours: 0,
      revenue: 0,
      internalCost: 0,
    }
    cur.projectsCount += 1
    cur.approvedHours = round2(cur.approvedHours + p.approvedHours)
    cur.revenue = round2(cur.revenue + p.revenue)
    cur.internalCost = round2(cur.internalCost + p.internalCost)
    clientMap.set(p.clientName, cur)
  }

  const byClient = Array.from(clientMap.values())
    .map((c) => {
      const grossProfit = round2(c.revenue - c.internalCost)
      return {
        ...c,
        grossProfit,
        marginPct: c.revenue > 0 ? grossProfit / c.revenue : 0,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  const totalRevenue = round2(byProject.reduce((s, p) => s + p.revenue, 0))
  const totalInternalCost = round2(byProject.reduce((s, p) => s + p.internalCost, 0))
  const totalApprovedHours = round2(byProject.reduce((s, p) => s + p.approvedHours, 0))
  const grossProfit = round2(totalRevenue - totalInternalCost)
  const grossMarginPct = totalRevenue > 0 ? grossProfit / totalRevenue : 0
  const effectiveHourlyRate =
    totalApprovedHours > 0 ? round2(totalRevenue / totalApprovedHours) : 0
  const unreviewedExposureAmount = round2(
    lines
      .filter((l) => l.evidenceStatus !== 'approved' && l.approvedBillableMinutes === 0)
      .reduce((s, l) => s + (l.claimedMinutes / 60) * l.snapshotHourlyRate, 0)
  )

  const curr = dataset.tenant.currency

  const document: ReportDocument = {
    reportCode: 'R4-FINANCIAL-PROFITABILITY',
    title: 'Financial & Profitability Analysis Report',
    subtitle: 'Client billable revenue vs. internal developer labor cost, gross margin, effective hourly rate, and budget status',
    scopeLabel: `${dataset.tenant.name} (${dataset.tenant.slug})`,
    tenantSlug: dataset.tenant.slug,
    dateRangeLabel: bounds.label,
    appliedFilters: buildAppliedFiltersMeta(dataset, filters),
    currency: curr,
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    brandColorHex: dataset.brandColorHex,
    kpis: [
      { label: 'Approved Billable Revenue', value: `${curr} ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: `${totalApprovedHours.toFixed(2)} approved hrs`, tone: 'brand' },
      { label: 'Internal Labor Cost', value: `${curr} ${totalInternalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: 'Configured dev/task pay rates', tone: 'neutral' },
      { label: 'Gross Profit & Margin', value: `${curr} ${grossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: `${(grossMarginPct * 100).toFixed(1)}% gross margin`, tone: grossMarginPct >= 0.3 ? 'positive' : 'warning' },
      { label: 'Effective Hourly Rate', value: `${curr} ${effectiveHourlyRate.toFixed(2)}/h`, subtext: `Unreviewed exposure: ${curr} ${unreviewedExposureAmount.toFixed(2)}`, tone: 'neutral' },
    ],
    sections: [
      {
        sheetName: 'Project Profitability',
        title: 'Profitability & Margin Breakdown by Project',
        columns: [
          { key: 'projectCode', header: 'Code', width: 11 },
          { key: 'projectName', header: 'Project', width: 24 },
          { key: 'clientName', header: 'Client', width: 20 },
          { key: 'approvedHours', header: 'Approved (h)', format: 'hours', sumInTotals: true, width: 14 },
          { key: 'revenue', header: 'Client Revenue', format: 'currency', sumInTotals: true, width: 18 },
          { key: 'internalCost', header: 'Internal Cost', format: 'currency', sumInTotals: true, width: 18 },
          { key: 'grossProfit', header: 'Gross Profit', format: 'currency', sumInTotals: true, width: 18 },
          { key: 'marginPct', header: 'Margin %', format: 'percent', width: 12 },
          { key: 'riskLevel', header: 'Budget Risk', width: 15 },
        ],
        rows: byProject,
        totalsRow: {
          projectCode: 'TOTAL',
          projectName: `${byProject.length} projects`,
          clientName: '',
          approvedHours: totalApprovedHours,
          revenue: totalRevenue,
          internalCost: totalInternalCost,
          grossProfit,
          marginPct: grossMarginPct,
          riskLevel: '',
        },
      },
      {
        sheetName: 'Client Profitability',
        title: 'Revenue & Gross Margin Rollup by Client',
        columns: [
          { key: 'clientName', header: 'Client Account', width: 26 },
          { key: 'projectsCount', header: 'Projects', format: 'integer', sumInTotals: true, width: 12 },
          { key: 'approvedHours', header: 'Approved (h)', format: 'hours', sumInTotals: true, width: 15 },
          { key: 'revenue', header: 'Client Revenue', format: 'currency', sumInTotals: true, width: 18 },
          { key: 'internalCost', header: 'Internal Cost', format: 'currency', sumInTotals: true, width: 18 },
          { key: 'grossProfit', header: 'Gross Profit', format: 'currency', sumInTotals: true, width: 18 },
          { key: 'marginPct', header: 'Margin %', format: 'percent', width: 13 },
        ],
        rows: byClient,
        totalsRow: {
          clientName: 'All Clients',
          projectsCount: byProject.length,
          approvedHours: totalApprovedHours,
          revenue: totalRevenue,
          internalCost: totalInternalCost,
          grossProfit,
          marginPct: grossMarginPct,
        },
      },
    ],
    footnotes: [
      'Revenue uses effective-dated snapshot hourly rates recorded on approved timesheet lines.',
      'Internal cost uses configured Developer Payment Rates / Task Payment Rates (monthly retainers amortized over 160h/month).',
    ],
  }

  return {
    totalRevenue,
    totalInternalCost,
    grossProfit,
    grossMarginPct,
    effectiveHourlyRate,
    unreviewedExposureAmount,
    byProject,
    byClient,
    document,
  }
}

// =============================================================================
// R5: BILLING, INVOICING & PAYROLL REPORT
// =============================================================================

export interface BillingPayrollReportData {
  totalInvoiced: number
  finalizedTotal: number
  draftTotal: number
  totalTax: number
  uninvoicedApprovedAmount: number
  totalPayoutsPaid: number
  totalPayoutsPending: number
  pipelineStages: Array<{ stage: string; amount: number; count: number }>
  invoiceRows: Array<{
    invoiceNumber: string
    clientName: string
    projectName: string
    periodLabel: string
    status: string
    approvedHours: number
    subtotalAmount: number
    taxAmount: number
    totalAmount: number
  }>
  payoutRows: Array<{
    referenceCode: string
    memberName: string
    periodLabel: string
    payoutMethod: string
    status: string
    approvedHours: number
    grossAmount: number
    taxWithheldAmount: number
    netAmount: number
  }>
  document: ReportDocument
}

export function computeBillingPayrollReport(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext
): BillingPayrollReportData {
  const lines = filterScopedTimesheetLines(dataset, filters, access)
  const bounds = resolveDateRangeBounds(filters)
  const curr = dataset.tenant.currency

  const scopedInvoices = dataset.invoices.filter((inv) => {
    if (filters.projectId !== 'all' && inv.projectId !== filters.projectId) return false
    return true
  })

  const scopedPayouts = dataset.developerPayouts.filter((po) => {
    if (filters.developerId !== 'all' && po.memberId !== filters.developerId) return false
    return true
  })

  const invoicedLineIds = new Set(
    scopedInvoices.flatMap((inv) => inv.lines.map((l) => l.lineId))
  )

  const draftLinesAmount = round2(
    lines
      .filter((l) => l.timesheetStatus === 'draft' || !l.timesheetStatus)
      .reduce((s, l) => s + (l.claimedMinutes / 60) * l.snapshotHourlyRate, 0)
  )
  const submittedPendingAmount = round2(
    lines
      .filter((l) => l.evidenceStatus !== 'approved' && l.timesheetStatus === 'submitted')
      .reduce((s, l) => s + (l.claimedMinutes / 60) * l.snapshotHourlyRate, 0)
  )
  const uninvoicedApprovedLines = lines.filter(
    (l) => l.evidenceStatus === 'approved' && !invoicedLineIds.has(l.id)
  )
  const uninvoicedApprovedAmount = round2(
    uninvoicedApprovedLines.reduce(
      (s, l) => s + (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate,
      0
    )
  )

  const totalInvoiced = round2(scopedInvoices.reduce((s, i) => s + i.totalAmount, 0))
  const finalizedTotal = round2(
    scopedInvoices
      .filter((i) => i.status === 'finalized_locked')
      .reduce((s, i) => s + i.totalAmount, 0)
  )
  const draftTotal = round2(
    scopedInvoices
      .filter((i) => i.status === 'draft')
      .reduce((s, i) => s + i.totalAmount, 0)
  )
  const totalTax = round2(scopedInvoices.reduce((s, i) => s + i.taxAmount, 0))

  const totalPayoutsPaid = round2(
    scopedPayouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.netAmount, 0)
  )
  const totalPayoutsPending = round2(
    scopedPayouts.filter((p) => p.status !== 'paid').reduce((s, p) => s + p.netAmount, 0)
  )

  const pipelineStages = [
    { stage: '1. Draft / Unsubmitted', amount: draftLinesAmount, count: lines.filter((l) => l.timesheetStatus === 'draft' || !l.timesheetStatus).length },
    { stage: '2. Submitted (In Review)', amount: submittedPendingAmount, count: lines.filter((l) => l.evidenceStatus !== 'approved' && l.timesheetStatus === 'submitted').length },
    { stage: '3. Approved (Uninvoiced)', amount: uninvoicedApprovedAmount, count: uninvoicedApprovedLines.length },
    { stage: '4. Invoice Drafts', amount: draftTotal, count: scopedInvoices.filter((i) => i.status === 'draft').length },
    { stage: '5. Finalized & Locked', amount: finalizedTotal, count: scopedInvoices.filter((i) => i.status === 'finalized_locked').length },
  ]

  const invoiceRows = scopedInvoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName,
    projectName: inv.projectName,
    periodLabel: inv.periodLabel,
    status: inv.status.replace(/_/g, ' ').toUpperCase(),
    approvedHours: minsToHours(inv.totalApprovedMinutes),
    subtotalAmount: round2(inv.subtotalAmount),
    taxAmount: round2(inv.taxAmount),
    totalAmount: round2(inv.totalAmount),
  }))

  const payoutRows = scopedPayouts.map((po) => ({
    referenceCode: po.referenceCode,
    memberName: po.memberName,
    periodLabel: po.periodLabel,
    payoutMethod: po.payoutMethod.replace(/_/g, ' '),
    status: po.status.toUpperCase(),
    approvedHours: minsToHours(po.approvedMinutes),
    grossAmount: round2(po.grossAmount),
    taxWithheldAmount: round2(po.taxWithheldAmount),
    netAmount: round2(po.netAmount),
  }))

  const document: ReportDocument = {
    reportCode: 'R5-BILLING-PAYROLL',
    title: 'Billing, Invoicing & Developer Payroll Report',
    subtitle: 'Complete client billing pipeline, invoice ledger with tax breakdown, and staff payout disbursements',
    scopeLabel: `${dataset.tenant.name} (${dataset.tenant.slug})`,
    tenantSlug: dataset.tenant.slug,
    dateRangeLabel: bounds.label,
    appliedFilters: buildAppliedFiltersMeta(dataset, filters),
    currency: curr,
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    brandColorHex: dataset.brandColorHex,
    kpis: [
      { label: 'Total Invoiced', value: `${curr} ${totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: `${scopedInvoices.length} invoices (${curr} ${totalTax.toFixed(2)} tax)`, tone: 'brand' },
      { label: 'Approved Uninvoiced', value: `${curr} ${uninvoicedApprovedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: `${uninvoicedApprovedLines.length} lines ready to bill`, tone: uninvoicedApprovedAmount > 0 ? 'warning' : 'positive' },
      { label: 'Staff Payouts Paid', value: `${curr} ${totalPayoutsPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: 'Completed disbursements', tone: 'positive' },
      { label: 'Pending Staff Payouts', value: `${curr} ${totalPayoutsPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, subtext: 'Scheduled / Processing', tone: totalPayoutsPending > 0 ? 'warning' : 'neutral' },
    ],
    sections: [
      {
        sheetName: 'Billing Pipeline',
        title: 'Revenue Recognition & Billing Pipeline',
        columns: [
          { key: 'stage', header: 'Pipeline Stage', width: 28 },
          { key: 'count', header: 'Records', format: 'integer', sumInTotals: true, width: 14 },
          { key: 'amount', header: 'Amount', format: 'currency', sumInTotals: true, width: 20 },
        ],
        rows: pipelineStages,
      },
      {
        sheetName: 'Client Invoices',
        title: 'Client Invoice Ledger',
        columns: [
          { key: 'invoiceNumber', header: 'Invoice #', width: 16 },
          { key: 'clientName', header: 'Client', width: 20 },
          { key: 'projectName', header: 'Project', width: 20 },
          { key: 'periodLabel', header: 'Period', width: 18 },
          { key: 'status', header: 'Status', width: 16 },
          { key: 'approvedHours', header: 'Hours', format: 'hours', sumInTotals: true, width: 12 },
          { key: 'subtotalAmount', header: 'Subtotal', format: 'currency', sumInTotals: true, width: 16 },
          { key: 'taxAmount', header: 'Tax', format: 'currency', sumInTotals: true, width: 14 },
          { key: 'totalAmount', header: 'Total', format: 'currency', sumInTotals: true, width: 16 },
        ],
        rows: invoiceRows,
        totalsRow: {
          invoiceNumber: 'TOTAL',
          clientName: `${invoiceRows.length} invoices`,
          projectName: '',
          periodLabel: '',
          status: '',
          approvedHours: round2(invoiceRows.reduce((s, r) => s + r.approvedHours, 0)),
          subtotalAmount: round2(invoiceRows.reduce((s, r) => s + r.subtotalAmount, 0)),
          taxAmount: totalTax,
          totalAmount: totalInvoiced,
        },
      },
      {
        sheetName: 'Developer Payouts',
        title: 'Developer Payroll & Disbursement Register',
        columns: [
          { key: 'referenceCode', header: 'Ref Code', width: 16 },
          { key: 'memberName', header: 'Developer', width: 22 },
          { key: 'periodLabel', header: 'Pay Period', width: 18 },
          { key: 'payoutMethod', header: 'Method', width: 16 },
          { key: 'status', header: 'Status', width: 13 },
          { key: 'approvedHours', header: 'Hours', format: 'hours', sumInTotals: true, width: 12 },
          { key: 'grossAmount', header: 'Gross Pay', format: 'currency', sumInTotals: true, width: 16 },
          { key: 'taxWithheldAmount', header: 'Withholding', format: 'currency', sumInTotals: true, width: 15 },
          { key: 'netAmount', header: 'Net Disbursed', format: 'currency', sumInTotals: true, width: 16 },
        ],
        rows: payoutRows,
        totalsRow: {
          referenceCode: 'TOTAL',
          memberName: `${payoutRows.length} payouts`,
          periodLabel: '',
          payoutMethod: '',
          status: '',
          approvedHours: round2(payoutRows.reduce((s, r) => s + r.approvedHours, 0)),
          grossAmount: round2(payoutRows.reduce((s, r) => s + r.grossAmount, 0)),
          taxWithheldAmount: round2(payoutRows.reduce((s, r) => s + r.taxWithheldAmount, 0)),
          netAmount: round2(payoutRows.reduce((s, r) => s + r.netAmount, 0)),
        },
      },
    ],
    footnotes: [
      'Closed/finalized invoices are immutable; adjustments appear as credited/adjusted ledger records.',
    ],
  }

  return {
    totalInvoiced,
    finalizedTotal,
    draftTotal,
    totalTax,
    uninvoicedApprovedAmount,
    totalPayoutsPaid,
    totalPayoutsPending,
    pipelineStages,
    invoiceRows,
    payoutRows,
    document,
  }
}

// =============================================================================
// R6: PROJECT & SPRINT DELIVERY REPORT
// =============================================================================

export interface ProjectDeliveryReportData {
  totalTasks: number
  completedTasks: number
  completionRate: number
  totalEstimatedHours: number
  totalActualHours: number
  estimateAccuracyPct: number
  overdueCount: number
  overEstimateCount: number
  sprintVelocity: Array<{
    sprintName: string
    projectName: string
    status: string
    committedPoints: number
    completedPoints: number
    totalTasks: number
    doneTasks: number
    completionPct: number
  }>
  varianceByIssueType: Array<{
    issueType: string
    taskCount: number
    estimatedHours: number
    actualHours: number
    varianceHours: number
    variancePct: number
  }>
  riskTasks: Array<{
    taskCode: string
    title: string
    projectName: string
    priority: string
    status: string
    dueDate: string
    estimatedHours: number
    actualHours: number
    riskReason: string
  }>
  document: ReportDocument
}

export function computeProjectDeliveryReport(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext
): ProjectDeliveryReportData {
  const lines = filterScopedTimesheetLines(dataset, filters, access)
  const bounds = resolveDateRangeBounds(filters)
  const projectMap = new Map(dataset.projects.map((p) => [p.id, p]))
  const todayStr = new Date().toISOString().slice(0, 10)

  const scopedTasks = dataset.tasks.filter((t) => {
    if (filters.projectId !== 'all' && t.projectId !== filters.projectId) return false
    if (!access.canViewTeam && !access.isSuperAdmin) {
      if (!t.assignedMemberIds.includes(access.activeUserId)) return false
    }
    if (filters.developerId !== 'all' && !t.assignedMemberIds.includes(filters.developerId)) {
      return false
    }
    return true
  })

  const actualMinsByTask = new Map<string, number>()
  for (const l of lines) {
    actualMinsByTask.set(l.taskId, (actualMinsByTask.get(l.taskId) ?? 0) + l.claimedMinutes)
  }

  const totalTasks = scopedTasks.length
  const completedTasks = scopedTasks.filter((t) => t.status === 'done').length
  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0
  const totalEstimatedMins = scopedTasks.reduce((s, t) => s + t.estimateMinutes, 0)
  const totalActualMins = scopedTasks.reduce((s, t) => s + (actualMinsByTask.get(t.id) ?? 0), 0)
  const totalEstimatedHours = minsToHours(totalEstimatedMins)
  const totalActualHours = minsToHours(totalActualMins)
  const estimateAccuracyPct =
    totalEstimatedMins > 0 && totalActualMins > 0
      ? Math.max(0, 1 - Math.abs(totalActualMins - totalEstimatedMins) / totalEstimatedMins)
      : 1

  // Sprint velocity
  const scopedSprints = dataset.sprints.filter(
    (sp) => filters.projectId === 'all' || sp.projectId === filters.projectId
  )
  const sprintVelocity = scopedSprints.map((sp) => {
    const spTasks = scopedTasks.filter((t) => t.sprintId === sp.id)
    const committedPoints = spTasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0)
    const completedPoints = spTasks
      .filter((t) => t.status === 'done')
      .reduce((s, t) => s + (t.storyPoints ?? 0), 0)
    const doneTasks = spTasks.filter((t) => t.status === 'done').length
    return {
      sprintName: sp.name,
      projectName: projectMap.get(sp.projectId)?.name ?? 'Project',
      status: sp.status.toUpperCase(),
      committedPoints,
      completedPoints,
      totalTasks: spTasks.length,
      doneTasks,
      completionPct: spTasks.length > 0 ? doneTasks / spTasks.length : 0,
    }
  })

  // Estimate vs Actual by Issue Type
  const typeAgg = new Map<string, { count: number; estMins: number; actMins: number }>()
  for (const t of scopedTasks) {
    const issueType = t.issueType ?? (t.parentTaskId ? 'subtask' : 'task')
    const cur = typeAgg.get(issueType) ?? { count: 0, estMins: 0, actMins: 0 }
    cur.count += 1
    cur.estMins += t.estimateMinutes
    cur.actMins += actualMinsByTask.get(t.id) ?? 0
    typeAgg.set(issueType, cur)
  }

  const varianceByIssueType = Array.from(typeAgg.entries()).map(([issueType, v]) => {
    const estimatedHours = minsToHours(v.estMins)
    const actualHours = minsToHours(v.actMins)
    const varianceHours = round2(actualHours - estimatedHours)
    const variancePct = estimatedHours > 0 ? varianceHours / estimatedHours : 0
    return {
      issueType: issueType.toUpperCase(),
      taskCount: v.count,
      estimatedHours,
      actualHours,
      varianceHours,
      variancePct,
    }
  })

  // Risk Register (Overdue or Over-Estimate)
  const riskTasks = scopedTasks
    .map((t) => {
      const actMins = actualMinsByTask.get(t.id) ?? 0
      const isOverdue = Boolean(t.dueDate && t.status !== 'done' && t.dueDate < todayStr)
      const isOverEst = t.estimateMinutes > 0 && actMins > t.estimateMinutes * 1.1
      if (!isOverdue && !isOverEst) return null
      const reasons: string[] = []
      if (isOverdue) reasons.push('Overdue')
      if (isOverEst) reasons.push('Over Estimate (>110%)')
      return {
        taskCode: t.code,
        title: t.title,
        projectName: projectMap.get(t.projectId)?.name ?? 'Project',
        priority: t.priority.toUpperCase(),
        status: t.status.toUpperCase(),
        dueDate: t.dueDate || '-',
        estimatedHours: minsToHours(t.estimateMinutes),
        actualHours: minsToHours(actMins),
        riskReason: reasons.join(' + '),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const overdueCount = riskTasks.filter((r) => r.riskReason.includes('Overdue')).length
  const overEstimateCount = riskTasks.filter((r) => r.riskReason.includes('Over Estimate')).length

  const document: ReportDocument = {
    reportCode: 'R6-PROJECT-DELIVERY',
    title: 'Project & Sprint Delivery Report',
    subtitle: 'Sprint velocity, completion rate, estimate-vs-actual variance by issue type, and delivery risk register',
    scopeLabel: `${dataset.tenant.name} (${dataset.tenant.slug})`,
    tenantSlug: dataset.tenant.slug,
    dateRangeLabel: bounds.label,
    appliedFilters: buildAppliedFiltersMeta(dataset, filters),
    currency: dataset.tenant.currency,
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    brandColorHex: dataset.brandColorHex,
    kpis: [
      { label: 'Task Completion', value: `${(completionRate * 100).toFixed(1)}%`, subtext: `${completedTasks} / ${totalTasks} tasks done`, tone: 'brand' },
      { label: 'Estimate Accuracy', value: `${(estimateAccuracyPct * 100).toFixed(1)}%`, subtext: `${totalActualHours.toFixed(1)}h actual vs ${totalEstimatedHours.toFixed(1)}h est.`, tone: estimateAccuracyPct >= 0.8 ? 'positive' : 'warning' },
      { label: 'Overdue Issues', value: String(overdueCount), subtext: 'Past due date & open', tone: overdueCount > 0 ? 'negative' : 'positive' },
      { label: 'Over-Estimate Issues', value: String(overEstimateCount), subtext: 'Exceeded 110% of estimate', tone: overEstimateCount > 0 ? 'warning' : 'positive' },
    ],
    sections: [
      {
        sheetName: 'Estimate Variance',
        title: 'Estimate vs. Actual Variance by Issue Type',
        columns: [
          { key: 'issueType', header: 'Issue Type', width: 16 },
          { key: 'taskCount', header: 'Tasks', format: 'integer', sumInTotals: true, width: 11 },
          { key: 'estimatedHours', header: 'Estimated (h)', format: 'hours', sumInTotals: true, width: 16 },
          { key: 'actualHours', header: 'Actual Logged (h)', format: 'hours', sumInTotals: true, width: 18 },
          { key: 'varianceHours', header: 'Variance (h)', format: 'hours', sumInTotals: true, width: 15 },
          { key: 'variancePct', header: 'Variance %', format: 'percent', width: 14 },
        ],
        rows: varianceByIssueType,
        totalsRow: {
          issueType: 'TOTAL',
          taskCount: totalTasks,
          estimatedHours: totalEstimatedHours,
          actualHours: totalActualHours,
          varianceHours: round2(totalActualHours - totalEstimatedHours),
          variancePct:
            totalEstimatedHours > 0
              ? (totalActualHours - totalEstimatedHours) / totalEstimatedHours
              : 0,
        },
      },
      {
        sheetName: 'Sprint Velocity',
        title: 'Sprint Commitment & Delivery Velocity',
        columns: [
          { key: 'sprintName', header: 'Sprint', width: 22 },
          { key: 'projectName', header: 'Project', width: 22 },
          { key: 'status', header: 'Status', width: 13 },
          { key: 'committedPoints', header: 'Committed Pts', format: 'integer', sumInTotals: true, width: 15 },
          { key: 'completedPoints', header: 'Completed Pts', format: 'integer', sumInTotals: true, width: 15 },
          { key: 'totalTasks', header: 'Tasks', format: 'integer', sumInTotals: true, width: 11 },
          { key: 'doneTasks', header: 'Done', format: 'integer', sumInTotals: true, width: 11 },
          { key: 'completionPct', header: 'Completion %', format: 'percent', width: 14 },
        ],
        rows: sprintVelocity,
      },
      {
        sheetName: 'Delivery Risks',
        title: 'Overdue & Over-Estimate Risk Watchlist',
        columns: [
          { key: 'taskCode', header: 'Code', width: 12 },
          { key: 'title', header: 'Task Title', width: 30 },
          { key: 'projectName', header: 'Project', width: 20 },
          { key: 'priority', header: 'Priority', width: 12 },
          { key: 'dueDate', header: 'Due Date', format: 'date', width: 13 },
          { key: 'estimatedHours', header: 'Est. (h)', format: 'hours', width: 12 },
          { key: 'actualHours', header: 'Actual (h)', format: 'hours', width: 12 },
          { key: 'riskReason', header: 'Flag Reason', width: 22 },
        ],
        rows: riskTasks,
      },
    ],
    footnotes: [
      'Estimate variance highlights complexity and scoping calibration opportunities - exceeding an estimate never automatically invalidates engineering time.',
    ],
  }

  return {
    totalTasks,
    completedTasks,
    completionRate,
    totalEstimatedHours,
    totalActualHours,
    estimateAccuracyPct,
    overdueCount,
    overEstimateCount,
    sprintVelocity,
    varianceByIssueType,
    riskTasks,
    document,
  }
}

// =============================================================================
// R7: EVIDENCE, VERIFICATION & GOVERNANCE REPORT
// =============================================================================

export interface EvidenceGovernanceReportData {
  corroboratedRatio: number
  needsClarificationCount: number
  openDisputesCount: number
  totalArtifactsCount: number
  policyConsentRate: number
  healthyDevicesRatio: number
  byEvidenceStatus: Array<{ status: string; hours: number; lines: number; share: number }>
  byArtifactSource: Array<{ sourceType: string; count: number; confirmedCount: number; share: number }>
  disputeSummary: Array<{
    disputeId: string
    taskCode: string
    status: string
    disputedHours: number
    reason: string
    createdAt: string
  }>
  document: ReportDocument
}

export function computeEvidenceGovernanceReport(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext
): EvidenceGovernanceReportData {
  const lines = filterScopedTimesheetLines(dataset, filters, access)
  const bounds = resolveDateRangeBounds(filters)

  const statusAgg = new Map<string, { mins: number; count: number }>()
  let totalMins = 0
  let corroboratedMins = 0
  let needsClarificationCount = 0

  for (const l of lines) {
    totalMins += l.claimedMinutes
    if (['approved', 'corroborated', 'context_added'].includes(l.evidenceStatus)) {
      corroboratedMins += l.claimedMinutes
    }
    if (l.evidenceStatus === 'needs_clarification') needsClarificationCount += 1
    const cur = statusAgg.get(l.evidenceStatus) ?? { mins: 0, count: 0 }
    cur.mins += l.claimedMinutes
    cur.count += 1
    statusAgg.set(l.evidenceStatus, cur)
  }

  const byEvidenceStatus = Array.from(statusAgg.entries())
    .map(([st, v]) => ({
      status: st.replace(/_/g, ' ').toUpperCase(),
      hours: minsToHours(v.mins),
      lines: v.count,
      share: totalMins > 0 ? v.mins / totalMins : 0,
    }))
    .sort((a, b) => b.hours - a.hours)

  const scopedArtifacts = dataset.evidenceArtifacts.filter((a) => {
    if (filters.projectId !== 'all' && a.projectId !== filters.projectId) return false
    if (bounds.from && a.workDate < bounds.from) return false
    if (bounds.to && a.workDate > bounds.to) return false
    return true
  })

  const artAgg = new Map<string, { count: number; confirmed: number }>()
  for (const a of scopedArtifacts) {
    const cur = artAgg.get(a.sourceType) ?? { count: 0, confirmed: 0 }
    cur.count += 1
    if (a.confirmedByUser) cur.confirmed += 1
    artAgg.set(a.sourceType, cur)
  }
  const byArtifactSource = Array.from(artAgg.entries())
    .map(([src, v]) => ({
      sourceType: src.replace(/_/g, ' ').toUpperCase(),
      count: v.count,
      confirmedCount: v.confirmed,
      share: scopedArtifacts.length > 0 ? v.count / scopedArtifacts.length : 0,
    }))
    .sort((a, b) => b.count - a.count)

  const lineMap = new Map(dataset.timesheetLines.map((l) => [l.id, l]))
  const scopedDisputes = dataset.disputes.filter((d) => {
    if (filters.projectId === 'all') return true
    return lineMap.get(d.timesheetLineId)?.projectId === filters.projectId
  })

  const openDisputesCount = scopedDisputes.filter(
    (d) => !d.status.startsWith('resolved')
  ).length

  const disputeSummary = scopedDisputes.map((d) => ({
    disputeId: d.id.slice(0, 10),
    taskCode: d.taskCode || lineMap.get(d.timesheetLineId)?.taskCode || '-',
    status: d.status.replace(/_/g, ' ').toUpperCase(),
    disputedHours: minsToHours(d.disputedMinutes),
    reason: d.reason,
    createdAt: d.createdAt.slice(0, 10),
  }))

  const activeMembers = dataset.members.filter((m) => m.status === 'active')
  const consentedMembers = activeMembers.filter(
    (m) => m.consentedPolicyVersion === dataset.tenant.policyVersion
  )
  const policyConsentRate =
    activeMembers.length > 0 ? consentedMembers.length / activeMembers.length : 1

  const activeDevices = dataset.devices.filter((d) => !d.revokedAt)
  const healthyDevices = activeDevices.filter((d) => !d.clockAnomalyDetected)
  const healthyDevicesRatio =
    activeDevices.length > 0 ? healthyDevices.length / activeDevices.length : 1

  const corroboratedRatio = totalMins > 0 ? corroboratedMins / totalMins : 0

  const document: ReportDocument = {
    reportCode: 'R7-EVIDENCE-GOVERNANCE',
    title: 'Evidence, Verification & Governance Report',
    subtitle: 'Evidence corroboration coverage, linked engineering deliverables, dispute audit trail, and policy consent posture',
    scopeLabel: `${dataset.tenant.name} (${dataset.tenant.slug})`,
    tenantSlug: dataset.tenant.slug,
    dateRangeLabel: bounds.label,
    appliedFilters: buildAppliedFiltersMeta(dataset, filters),
    currency: dataset.tenant.currency,
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    brandColorHex: dataset.brandColorHex,
    kpis: [
      { label: 'Corroborated / Approved', value: `${(corroboratedRatio * 100).toFixed(1)}%`, subtext: 'Context or artifact supported', tone: 'positive' },
      { label: 'Linked Artifacts', value: String(scopedArtifacts.length), subtext: `${byArtifactSource.length} evidence sources`, tone: 'brand' },
      { label: 'Open Disputes / Clarifications', value: `${openDisputesCount} / ${needsClarificationCount}`, subtext: 'Disputes / clarification requests', tone: openDisputesCount > 0 ? 'warning' : 'positive' },
      { label: 'Policy Consent Posture', value: `${(policyConsentRate * 100).toFixed(0)}%`, subtext: `${consentedMembers.length}/${activeMembers.length} on ${dataset.tenant.policyVersion}`, tone: policyConsentRate >= 0.9 ? 'positive' : 'warning' },
    ],
    sections: [
      {
        sheetName: 'Evidence Statuses',
        title: 'Timesheet Evidence Status Distribution',
        description: 'Section 6.4 taxonomy - Needs Clarification indicates missing/ambiguous context, never misconduct.',
        columns: [
          { key: 'status', header: 'Evidence Status', width: 24 },
          { key: 'lines', header: 'Line Items', format: 'integer', sumInTotals: true, width: 14 },
          { key: 'hours', header: 'Claimed Hours', format: 'hours', sumInTotals: true, width: 16 },
          { key: 'share', header: 'Share %', format: 'percent', width: 14 },
        ],
        rows: byEvidenceStatus,
        totalsRow: {
          status: 'TOTAL',
          lines: lines.length,
          hours: minsToHours(totalMins),
          share: 1,
        },
      },
      {
        sheetName: 'Deliverable Sources',
        title: 'Engineering Evidence Artifacts by Source',
        columns: [
          { key: 'sourceType', header: 'Source Type', width: 24 },
          { key: 'count', header: 'Artifacts Linked', format: 'integer', sumInTotals: true, width: 16 },
          { key: 'confirmedCount', header: 'Developer Confirmed', format: 'integer', sumInTotals: true, width: 20 },
          { key: 'share', header: 'Share %', format: 'percent', width: 14 },
        ],
        rows: byArtifactSource,
      },
      {
        sheetName: 'Disputes & Appeals',
        title: 'Dispute & Appeal Resolution Register',
        columns: [
          { key: 'disputeId', header: 'Dispute ID', width: 14 },
          { key: 'taskCode', header: 'Task', width: 13 },
          { key: 'status', header: 'Status', width: 18 },
          { key: 'disputedHours', header: 'Disputed (h)', format: 'hours', sumInTotals: true, width: 15 },
          { key: 'createdAt', header: 'Opened', format: 'date', width: 13 },
          { key: 'reason', header: 'Reason Summary', width: 36 },
        ],
        rows: disputeSummary,
      },
    ],
    footnotes: [
      `Active Enrolled Devices: ${activeDevices.length} (${(healthyDevicesRatio * 100).toFixed(0)}% clock-healthy).`,
      GOVERNANCE_FOOTNOTE,
    ],
  }

  return {
    corroboratedRatio,
    needsClarificationCount,
    openDisputesCount,
    totalArtifactsCount: scopedArtifacts.length,
    policyConsentRate,
    healthyDevicesRatio,
    byEvidenceStatus,
    byArtifactSource,
    disputeSummary,
    document,
  }
}

// =============================================================================
// R8: CUSTOM PIVOT REPORT BUILDER
// =============================================================================

export const PIVOT_DIMENSION_LABELS: Record<PivotDimension, string> = {
  project: 'Project',
  client: 'Client',
  developer: 'Team Member',
  task: 'Task',
  workMode: 'Work Mode',
  evidenceStatus: 'Evidence Status',
  workDate: 'Work Date',
  provenance: 'Capture Source',
}

export const PIVOT_METRIC_META: Record<
  PivotMetricKey,
  { label: string; format: ReportColumnDef['format']; sumInTotals?: boolean; requiresFinancials?: boolean }
> = {
  elapsedHours: { label: 'Elapsed (h)', format: 'hours', sumInTotals: true },
  claimedHours: { label: 'Claimed (h)', format: 'hours', sumInTotals: true },
  observedHours: { label: 'Observed (h)', format: 'hours', sumInTotals: true },
  supportedHours: { label: 'Supported (h)', format: 'hours', sumInTotals: true },
  approvedHours: { label: 'Approved (h)', format: 'hours', sumInTotals: true },
  approvalRate: { label: 'Approval %', format: 'percent' },
  billableAmount: { label: 'Billable Revenue', format: 'currency', sumInTotals: true, requiresFinancials: true },
  internalCost: { label: 'Internal Cost', format: 'currency', sumInTotals: true, requiresFinancials: true },
  grossProfit: { label: 'Gross Profit', format: 'currency', sumInTotals: true, requiresFinancials: true },
  entryCount: { label: 'Entries', format: 'integer', sumInTotals: true },
}

export interface CustomPivotResult {
  rows: Array<Record<string, string | number>>
  totals: Record<string, string | number>
  allowedMetrics: PivotMetricKey[]
  document: ReportDocument
}

function resolveDimensionLabel(
  line: ReportTimesheetLineInput,
  dim: PivotDimension,
  projectMap: Map<string, ReportProjectInput>
): string {
  const proj = projectMap.get(line.projectId)
  switch (dim) {
    case 'project':
      return proj ? `${proj.code} - ${proj.name}` : line.projectId
    case 'client':
      return proj?.clientName || 'Unassigned Client'
    case 'developer':
      return line.developerName || line.developerId
    case 'task':
      return `${line.taskCode} - ${line.taskTitle}`
    case 'workMode':
      return line.workMode.charAt(0).toUpperCase() + line.workMode.slice(1)
    case 'evidenceStatus':
      return line.evidenceStatus.replace(/_/g, ' ').toUpperCase()
    case 'workDate':
      return line.workDate
    case 'provenance':
      return line.provenance.replace(/_/g, ' ')
  }
}

export function computeCustomPivotReport(
  dataset: TenantAnalyticsDataset,
  filters: ReportFilterState,
  access: ReportAccessContext,
  config: CustomPivotConfig,
  customTitle?: string
): CustomPivotResult {
  const lines = filterScopedTimesheetLines(dataset, filters, access)
  const bounds = resolveDateRangeBounds(filters)
  const projectMap = new Map(dataset.projects.map((p) => [p.id, p]))
  const showFin = access.canViewFinancials && !access.hideClientBillingRates && !access.isClientReviewer

  const allowedMetrics = config.selectedMetrics.filter((m) => {
    if (PIVOT_METRIC_META[m]?.requiresFinancials && !showFin) return false
    return true
  })
  const finalMetrics: PivotMetricKey[] =
    allowedMetrics.length > 0 ? allowedMetrics : ['claimedHours', 'approvedHours', 'entryCount']

  const hasSecondary =
    config.groupBySecondary !== 'none' && config.groupBySecondary !== config.groupByPrimary

  const groups = new Map<
    string,
    {
      primary: string
      secondary: string
      elapsed: number
      claimed: number
      observed: number
      supported: number
      approved: number
      revenue: number
      cost: number
      count: number
    }
  >()

  for (const l of lines) {
    const pVal = resolveDimensionLabel(l, config.groupByPrimary, projectMap)
    const sVal = hasSecondary
      ? resolveDimensionLabel(l, config.groupBySecondary as PivotDimension, projectMap)
      : ''
    const key = `${pVal}||${sVal}`
    const cur = groups.get(key) ?? {
      primary: pVal,
      secondary: sVal,
      elapsed: 0,
      claimed: 0,
      observed: 0,
      supported: 0,
      approved: 0,
      revenue: 0,
      cost: 0,
      count: 0,
    }
    cur.elapsed += l.elapsedMinutes
    cur.claimed += l.claimedMinutes
    cur.observed += l.observedMinutes
    cur.supported += l.supportedMinutes
    cur.approved += l.approvedBillableMinutes
    cur.revenue += (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate
    cur.cost += computeInternalCostForLine(
      l,
      dataset.developerPaymentConfigs,
      dataset.taskPaymentConfigs
    )
    cur.count += 1
    groups.set(key, cur)
  }

  const rows = Array.from(groups.values())
    .map((g) => {
      const rec: Record<string, string | number> = {
        primary: g.primary,
        ...(hasSecondary ? { secondary: g.secondary } : {}),
        elapsedHours: minsToHours(g.elapsed),
        claimedHours: minsToHours(g.claimed),
        observedHours: minsToHours(g.observed),
        supportedHours: minsToHours(g.supported),
        approvedHours: minsToHours(g.approved),
        approvalRate: g.claimed > 0 ? g.approved / g.claimed : 0,
        billableAmount: round2(g.revenue),
        internalCost: round2(g.cost),
        grossProfit: round2(g.revenue - g.cost),
        entryCount: g.count,
      }
      return rec
    })
    .sort((a, b) => Number(b.claimedHours) - Number(a.claimedHours))

  const totElapsed = minsToHours(lines.reduce((s, l) => s + l.elapsedMinutes, 0))
  const totClaimed = minsToHours(lines.reduce((s, l) => s + l.claimedMinutes, 0))
  const totObserved = minsToHours(lines.reduce((s, l) => s + l.observedMinutes, 0))
  const totSupported = minsToHours(lines.reduce((s, l) => s + l.supportedMinutes, 0))
  const totApproved = minsToHours(lines.reduce((s, l) => s + l.approvedBillableMinutes, 0))
  const totRev = round2(
    lines.reduce((s, l) => s + (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate, 0)
  )
  const totCost = round2(
    lines.reduce(
      (s, l) =>
        s +
        computeInternalCostForLine(
          l,
          dataset.developerPaymentConfigs,
          dataset.taskPaymentConfigs
        ),
      0
    )
  )

  const totals: Record<string, string | number> = {
    primary: 'TOTAL',
    ...(hasSecondary ? { secondary: `${rows.length} groups` } : {}),
    elapsedHours: totElapsed,
    claimedHours: totClaimed,
    observedHours: totObserved,
    supportedHours: totSupported,
    approvedHours: totApproved,
    approvalRate: totClaimed > 0 ? totApproved / totClaimed : 0,
    billableAmount: totRev,
    internalCost: totCost,
    grossProfit: round2(totRev - totCost),
    entryCount: lines.length,
  }

  const columns: ReportColumnDef[] = [
    { key: 'primary', header: PIVOT_DIMENSION_LABELS[config.groupByPrimary], width: 26 },
    ...(hasSecondary
      ? [
        {
          key: 'secondary',
          header: PIVOT_DIMENSION_LABELS[config.groupBySecondary as PivotDimension],
          width: 22,
        },
      ]
      : []),
    ...finalMetrics.map((mk) => ({
      key: mk,
      header: PIVOT_METRIC_META[mk].label,
      format: PIVOT_METRIC_META[mk].format,
      sumInTotals: PIVOT_METRIC_META[mk].sumInTotals,
      width: 16,
    })),
  ]

  const kpis: ReportKpiItem[] = finalMetrics.slice(0, 4).map((mk) => ({
    label: PIVOT_METRIC_META[mk].label,
    value: formatReportCellValue(
      totals[mk],
      PIVOT_METRIC_META[mk].format,
      dataset.tenant.currency
    ),
    subtext: `Across ${rows.length} group(s)`,
    tone: mk === 'grossProfit' ? 'positive' : 'brand',
  }))

  const document: ReportDocument = {
    reportCode: 'R8-CUSTOM-PIVOT',
    title: customTitle?.trim() || 'Custom Pivot Analysis Report',
    subtitle: `Grouped by ${PIVOT_DIMENSION_LABELS[config.groupByPrimary]}${hasSecondary ? ` → ${PIVOT_DIMENSION_LABELS[config.groupBySecondary as PivotDimension]}` : ''
      }`,
    scopeLabel: `${dataset.tenant.name} (${dataset.tenant.slug})`,
    tenantSlug: dataset.tenant.slug,
    dateRangeLabel: bounds.label,
    appliedFilters: buildAppliedFiltersMeta(dataset, filters),
    currency: dataset.tenant.currency,
    generatedBy: access.activeUserName,
    generatedRole: access.activeUserRole,
    generatedAtIso: new Date().toISOString(),
    brandColorHex: dataset.brandColorHex,
    kpis,
    sections: [
      {
        sheetName: 'Custom Pivot',
        title: `Pivot Matrix (${PIVOT_DIMENSION_LABELS[config.groupByPrimary]})`,
        columns,
        rows,
        totalsRow: totals,
      },
    ],
    footnotes: [GOVERNANCE_FOOTNOTE],
  }

  return { rows, totals, allowedMetrics: finalMetrics, document }
}
