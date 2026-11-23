import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPlatformHealthDocument,
  buildPlatformOperationsDocument,
  buildPlatformRevenueDocument,
  computeCustomPivotReport,
  computeDeepWorkReport,
  computeExecutiveSummaryReport,
  computeFinancialProfitabilityReport,
  type PlatformTenantReportRowInput,
  type ReportAccessContext,
  type ReportFilterState,
  type TenantAnalyticsDataset,
} from '../../../features/reports-analytics/engine/reportAnalyticsEngine.ts'
import { buildPdfReportInstance } from '../../../features/reports-analytics/export/pdfReportGenerator.ts'
import { buildExcelWorkbook } from '../../../features/reports-analytics/export/excelReportGenerator.ts'

const BASE_FILTERS: ReportFilterState = {
  preset: 'all',
  dateFrom: '',
  dateTo: '',
  projectId: 'all',
  developerId: 'all',
  workMode: 'all',
  evidenceStatus: 'all',
  billableFilter: 'all',
}

function makeSampleDataset(): TenantAnalyticsDataset {
  return {
    tenant: {
      id: 'tenant-1',
      name: 'Acme Engineering',
      slug: 'acme-eng',
      timezone: 'UTC',
      currency: 'USD',
      planTier: 'agency',
      roundingRule: 'none',
      paidBreakMinutesPerDay: 15,
      weeklyCapMinutes: 2400,
      policyVersion: 'v2.0',
    },
    members: [
      {
        id: 'dev-1',
        tenantId: 'tenant-1',
        name: 'Kasun Perera',
        email: 'kasun@acme.dev',
        role: 'developer',
        status: 'active',
        mfaEnabled: true,
        consentedPolicyVersion: 'v2.0',
        assignedProjectIds: ['proj-1'],
      },
      {
        id: 'dev-2',
        tenantId: 'tenant-1',
        name: 'Nimali Silva',
        email: 'nimali@acme.dev',
        role: 'developer',
        status: 'active',
        mfaEnabled: true,
        consentedPolicyVersion: 'v2.0',
        assignedProjectIds: ['proj-1'],
      },
    ],
    projects: [
      {
        id: 'proj-1',
        tenantId: 'tenant-1',
        code: 'ACM',
        name: 'Core Payments API',
        clientName: 'FinServe Global',
        status: 'active',
        description: 'Payments microservice',
      },
    ],
    sprints: [
      {
        id: 'sp-1',
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        name: 'Sprint 14',
        goal: 'Settlement engine',
        status: 'active',
        startDate: '2026-11-01',
        endDate: '2026-11-14',
        createdAt: '2026-11-01T00:00:00Z',
      },
    ],
    tasks: [
      {
        id: 'task-1',
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        sprintId: 'sp-1',
        code: 'ACM-101',
        title: 'Idempotent ledger writer',
        acceptanceCriteria: 'No double charges',
        issueType: 'story',
        status: 'done',
        priority: 'high',
        storyPoints: 8,
        estimateMinutes: 240,
        isBillable: true,
        defaultWorkMode: 'coding',
        assignedMemberIds: ['dev-1'],
        dueDate: '2026-11-10',
        attachments: [],
      },
      {
        id: 'task-2',
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        sprintId: 'sp-1',
        code: 'ACM-102',
        title: 'Debug timeout edge case',
        acceptanceCriteria: 'Retries cleanly',
        issueType: 'bug',
        status: 'active',
        priority: 'urgent',
        storyPoints: 5,
        estimateMinutes: 120,
        isBillable: true,
        defaultWorkMode: 'debugging',
        assignedMemberIds: ['dev-2'],
        dueDate: '2026-11-05',
        attachments: [],
      },
    ],
    timesheetLines: [
      {
        id: 'line-1',
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        taskId: 'task-1',
        taskCode: 'ACM-101',
        taskTitle: 'Idempotent ledger writer',
        developerId: 'dev-1',
        developerName: 'Kasun Perera',
        workDate: '2026-11-10',
        startTime: '09:00',
        endTime: '13:00',
        workMode: 'coding',
        provenance: 'desktop_timer',
        elapsedMinutes: 240,
        claimedMinutes: 240,
        observedMinutes: 220,
        supportedMinutes: 240,
        approvedBillableMinutes: 240,
        evidenceStatus: 'approved',
        snapshotHourlyRate: 100,
        rateLabel: 'Standard $100/h',
        developerNote: 'Completed ledger migration and unit tests',
        disputeMessages: [],
        isLocked: false,
      },
      {
        id: 'line-2',
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        taskId: 'task-2',
        taskCode: 'ACM-102',
        taskTitle: 'Debug timeout edge case',
        developerId: 'dev-2',
        developerName: 'Nimali Silva',
        workDate: '2026-11-11',
        startTime: '10:00',
        endTime: '12:00',
        workMode: 'debugging',
        provenance: 'desktop_timer',
        elapsedMinutes: 120,
        claimedMinutes: 120,
        observedMinutes: 90,
        supportedMinutes: 120,
        approvedBillableMinutes: 0,
        evidenceStatus: 'corroborated',
        snapshotHourlyRate: 100,
        rateLabel: 'Standard $100/h',
        developerNote: 'Deep debugging race condition',
        disputeMessages: [],
        isLocked: false,
      },
    ],
    invoices: [],
    developerPaymentConfigs: [
      {
        id: 'dpc-1',
        tenantId: 'tenant-1',
        memberId: 'dev-1',
        payModel: 'hourly',
        hourlyRate: 40,
        monthlyRetainerAmount: 0,
        currency: 'USD',
        payoutFrequency: 'monthly',
        payoutMethod: 'wise',
        accountSummary: 'Wise USD',
        taxWithholdingPercent: 0,
        effectiveFrom: '2026-01-01',
        notes: '',
        updatedAt: '2026-11-01T00:00:00Z',
        updatedBy: 'Owner',
      },
      {
        id: 'dpc-2',
        tenantId: 'tenant-1',
        memberId: 'dev-2',
        payModel: 'hourly',
        hourlyRate: 50,
        monthlyRetainerAmount: 0,
        currency: 'USD',
        payoutFrequency: 'monthly',
        payoutMethod: 'bank_transfer',
        accountSummary: 'Bank',
        taxWithholdingPercent: 0,
        effectiveFrom: '2026-01-01',
        notes: '',
        updatedAt: '2026-11-01T00:00:00Z',
        updatedBy: 'Owner',
      },
    ],
    taskPaymentConfigs: [],
    developerPayouts: [],
    activityRollups: [
      {
        id: 'roll-1',
        tenantId: 'tenant-1',
        userId: 'dev-1',
        projectId: 'proj-1',
        taskId: 'task-1',
        workDate: '2026-11-10',
        startMinuteOfDay: 540,
        endMinuteOfDay: 600,
        durationMinutes: 60,
        appCategory: 'ide',
        workMode: 'coding',
        hasInputSignal: true,
        concurrentSources: ['desktop', 'vscode'],
        isObservationGap: false,
        displayCount: 1,
      },
    ],
    evidenceArtifacts: [],
    devices: [],
    disputes: [],
    calendarMeetings: [],
    projectForecasts: [],
  }
}

test('Tenant Owner financial profitability accurately calculates revenue, internal cost, and gross margin', () => {
  const dataset = makeSampleDataset()
  const ownerAccess: ReportAccessContext = {
    isSuperAdmin: false,
    isInSuperAdminPortal: false,
    canViewTeam: true,
    canViewFinancials: true,
    canExportPdf: true,
    canExportExcel: true,
    canCreateSaved: true,
    canAiInsights: true,
    isClientReviewer: false,
    hideClientBillingRates: false,
    activeUserId: 'owner-1',
    activeUserName: 'Workspace Owner',
    activeUserRole: 'tenant_owner',
  }

  const fin = computeFinancialProfitabilityReport(dataset, BASE_FILTERS, ownerAccess)
  // line-1: 4h approved @ $100 = $400 revenue; dev-1 cost 4h @ $40 = $160
  // line-2: 0h approved = $0 revenue; dev-2 claimed 2h @ $50 = $100 internal cost
  assert.equal(fin.totalRevenue, 400)
  assert.equal(fin.totalInternalCost, 260)
  assert.equal(fin.grossProfit, 140)
  assert.equal(fin.byClient.length, 1)
  assert.equal(fin.byClient[0].clientName, 'FinServe Global')
  assert.equal(fin.byClient[0].grossProfit, 140)
})

test('Developer RBAC strictly scopes reports to own data and hides client financial metrics', () => {
  const dataset = makeSampleDataset()
  const devAccess: ReportAccessContext = {
    isSuperAdmin: false,
    isInSuperAdminPortal: false,
    canViewTeam: false,
    canViewFinancials: false,
    canExportPdf: true,
    canExportExcel: true,
    canCreateSaved: true,
    canAiInsights: true,
    isClientReviewer: false,
    hideClientBillingRates: true,
    activeUserId: 'dev-1',
    activeUserName: 'Kasun Perera',
    activeUserRole: 'developer',
  }

  const exec = computeExecutiveSummaryReport(dataset, BASE_FILTERS, devAccess)
  // Should only include dev-1 (4h), never dev-2 (2h)
  assert.equal(exec.kpis.claimedHours, 4)
  assert.equal(exec.kpis.approvedHours, 4)
  // Financial KPIs must not appear in document
  assert.equal(
    exec.document.kpis.some((k) => k.label.toLowerCase().includes('revenue') || k.label.toLowerCase().includes('margin')),
    false
  )

  // Custom Pivot strips financial metrics even if requested
  const pivot = computeCustomPivotReport(dataset, BASE_FILTERS, devAccess, {
    groupByPrimary: 'project',
    groupBySecondary: 'none',
    selectedMetrics: ['claimedHours', 'billableAmount', 'internalCost', 'grossProfit'],
    chartType: 'bar',
  })
  assert.deepEqual(pivot.allowedMetrics, ['claimedHours'])
})

test('Client Reviewer only sees approved work and never raw workstation activity rollups', () => {
  const dataset = makeSampleDataset()
  const clientAccess: ReportAccessContext = {
    isSuperAdmin: false,
    isInSuperAdminPortal: false,
    canViewTeam: true,
    canViewFinancials: false,
    canExportPdf: true,
    canExportExcel: true,
    canCreateSaved: false,
    canAiInsights: false,
    isClientReviewer: true,
    hideClientBillingRates: false,
    activeUserId: 'client-1',
    activeUserName: 'External Client',
    activeUserRole: 'client_reviewer',
  }

  const deepWork = computeDeepWorkReport(dataset, BASE_FILTERS, clientAccess)
  assert.equal(deepWork.totalHours, 4) // Only approved line-1
  assert.equal(deepWork.byAppCategory.length, 0) // Zero raw workstation activity
  assert.equal(deepWork.document.sections.length, 1) // Only Work-Mode Balance
})

test('Super Admin Platform Reports (P1, P2, P3) generate separate clean PDF and styled multi-sheet Excel workbooks', async () => {
  const superAccess: ReportAccessContext = {
    isSuperAdmin: true,
    isInSuperAdminPortal: true,
    canViewTeam: true,
    canViewFinancials: true,
    canExportPdf: true,
    canExportExcel: true,
    canCreateSaved: true,
    canAiInsights: true,
    isClientReviewer: false,
    hideClientBillingRates: false,
    activeUserId: 'sa-1',
    activeUserName: 'Platform Admin',
    activeUserRole: 'super_admin',
  }

  const rows: PlatformTenantReportRowInput[] = [
    {
      tenantId: 't-1',
      tenantName: 'Acme Engineering',
      tenantSlug: 'acme',
      status: 'active',
      planTier: 'agency',
      currency: 'USD',
      timezone: 'UTC',
      createdAt: '2026-01-01T00:00:00Z',
      subscriptionStatus: 'active',
      billingCycle: 'monthly',
      billingProvider: 'stripe',
      activeSeats: 10,
      maxSeats: 100,
      seatUtilizationPct: 0.1,
      estimatedMrrUsd: 329,
      saasInvoicesCount: 3,
      saasPaidTotalUsd: 987,
      saasOpenTotalUsd: 0,
      activeProjects: 4,
      maxActiveProjects: 100,
      monthlyEventsUsed: 12000,
      monthlyEventQuota: 2500000,
      aiTokensUsed: 45000,
      monthlyAiTokenQuota: 1000000,
      storageMbUsed: 120.5,
      storageQuotaMb: 25600,
      elapsedHours: 160,
      claimedHours: 155,
      observedHours: 140,
      supportedHours: 150,
      approvedBillableHours: 148,
      approvalRatePct: 148 / 155,
      approvedBillableValue: 14800,
      openDisputesCount: 1,
      totalDisputesCount: 2,
      evidenceArtifactsCount: 44,
      activeDevicesCount: 9,
      clockAnomalyDevicesCount: 0,
      policyConsentPct: 1,
    },
    {
      tenantId: 't-2',
      tenantName: 'Nova Labs',
      tenantSlug: 'nova-labs',
      status: 'active',
      planTier: 'team',
      currency: 'EUR',
      timezone: 'Europe/Berlin',
      createdAt: '2026-06-15T00:00:00Z',
      subscriptionStatus: 'trialing',
      billingCycle: 'monthly',
      billingProvider: 'stripe',
      activeSeats: 22,
      maxSeats: 25,
      seatUtilizationPct: 0.88,
      estimatedMrrUsd: 313,
      saasInvoicesCount: 1,
      saasPaidTotalUsd: 0,
      saasOpenTotalUsd: 313,
      activeProjects: 6,
      maxActiveProjects: 25,
      monthlyEventsUsed: 80000,
      monthlyEventQuota: 500000,
      aiTokensUsed: 10000,
      monthlyAiTokenQuota: 250000,
      storageMbUsed: 48.2,
      storageQuotaMb: 5120,
      elapsedHours: 80,
      claimedHours: 78,
      observedHours: 70,
      supportedHours: 76,
      approvedBillableHours: 75,
      approvalRatePct: 75 / 78,
      approvedBillableValue: 7500,
      openDisputesCount: 0,
      totalDisputesCount: 0,
      evidenceArtifactsCount: 18,
      activeDevicesCount: 5,
      clockAnomalyDevicesCount: 0,
      policyConsentPct: 0.95,
    },
  ]

  const p1 = buildPlatformRevenueDocument(rows, superAccess)
  const p2 = buildPlatformHealthDocument(rows, superAccess)
  const p3 = buildPlatformOperationsDocument(rows, superAccess)

  assert.equal(p1.reportCode, 'P1-PLATFORM-REVENUE')
  assert.equal(p2.reportCode, 'P2-TENANT-HEALTH')
  assert.equal(p3.reportCode, 'P3-CROSS-TENANT-OPS')
  assert.equal(p1.sections[0].rows.length, 2)

  // Verify clean vector PDF output (independent of DOM/display view)
  const pdf = buildPdfReportInstance(p1)
  const pdfBytes = new Uint8Array(pdf.output('arraybuffer'))
  const pdfHeader = Buffer.from(pdfBytes.slice(0, 5)).toString('ascii')
  assert.equal(pdfHeader, '%PDF-')
  assert.ok(pdf.getNumberOfPages() >= 1)

  // Verify styled multi-sheet Excel (.xlsx) workbook with native SUM formulas
  const wb = await buildExcelWorkbook(p1)
  assert.equal(wb.worksheets.length, 3) // Executive Summary + Tenant Subscriptions + By Plan Tier
  assert.equal(wb.worksheets[0].name, 'Executive Summary')
  const subsSheet = wb.worksheets[1]
  assert.equal(subsSheet.name, 'Tenant Subscriptions')
  // Totals row is Row 7 (4 header + 2 data rows + 1 totals row)
  const mrrTotalCell = subsSheet.getCell('G7')
  const formulaVal = mrrTotalCell.value as { formula?: string; result?: number }
  assert.equal(formulaVal.formula, 'SUM(G5:G6)')
  assert.equal(formulaVal.result, 642)

  const xlsxBuf = await wb.xlsx.writeBuffer()
  assert.ok(xlsxBuf.byteLength > 2000)
})
