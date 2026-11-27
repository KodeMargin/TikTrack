import { useEffect, useMemo, useState } from 'react'
import { notifyError, notifyInfo, notifySuccess } from '@/lib/notify'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store } from '@/context/Phase2Store'
import { usePhase3Store } from '@/context/Phase3Store'
import { usePhase4Store } from '@/context/Phase4Store'
import {
  createSavedReportViaPrisma,
  deleteSavedReportViaPrisma,
  fetchPlatformReportsViaPrisma,
  generateReportAiBriefViaPrisma,
  listSavedReportsViaPrisma,
  type PlatformTenantReportRowClient,
  type SavedReportClientItem,
} from '@/lib/prismaApiClient'
import {
  buildPlatformHealthDocument,
  buildPlatformOperationsDocument,
  buildPlatformRevenueDocument,
  computeBillingPayrollReport,
  computeCustomPivotReport,
  computeDeepWorkReport,
  computeEvidenceGovernanceReport,
  computeExecutiveSummaryReport,
  computeFinancialProfitabilityReport,
  computeProjectDeliveryReport,
  computeTimeUtilizationReport,
  type CustomPivotConfig,
  type DateRangePreset,
  type ReportAccessContext,
  type ReportFilterState,
  type ReportId,
  type TenantAnalyticsDataset,
} from './engine/reportAnalyticsEngine'
import type { ReportDocument } from './export/reportDocument.types'
import { exportReportToPdf } from './export/pdfReportGenerator'
import { exportReportToExcel } from './export/excelReportGenerator'
import {
  PlatformHealthReportView,
  PlatformOperationsReportView,
  PlatformRevenueReportView,
} from './views/PlatformReportsViews'
import {
  BillingPayrollReportView,
  CustomPivotBuilderView,
  DeepWorkReportView,
  EvidenceGovernanceReportView,
  ExecutiveSummaryReportView,
  FinancialProfitabilityReportView,
  ProjectDeliveryReportView,
  TimeUtilizationReportView,
} from './views/TenantOperationalViews'
import { REPORT_CARD_CLS } from './components/ReportSharedUi'
import { Select } from '@/components/Select'

interface ReportCatalogEntry {
  id: ReportId
  code: string
  label: string
  shortDesc: string
  group: 'platform' | 'tenant'
  requiresFinancials?: boolean
  requiresBuilder?: boolean
}

const REPORT_CATALOG: ReportCatalogEntry[] = [
  // Platform Reports (Super Admin Only)
  {
    id: 'platform-revenue',
    code: 'P1',
    label: 'SaaS Revenue & Plans',
    shortDesc: 'Per-tenant MRR, tiers & SaaS billing',
    group: 'platform',
  },
  {
    id: 'platform-health',
    code: 'P2',
    label: 'Tenant Health & Quotas',
    shortDesc: 'Seats, projects, events & AI limits',
    group: 'platform',
  },
  {
    id: 'platform-operations',
    code: 'P3',
    label: 'Cross-Tenant Operations',
    shortDesc: 'Hours, approvals, disputes per tenant',
    group: 'platform',
  },
  // Tenant Operational Reports
  {
    id: 'executive-summary',
    code: 'R1',
    label: 'Executive Summary',
    shortDesc: 'KPIs, 5-time funnel & daily trends',
    group: 'tenant',
  },
  {
    id: 'time-utilization',
    code: 'R2',
    label: 'Time & Utilization',
    shortDesc: 'Billable split, capacity & provenance',
    group: 'tenant',
  },
  {
    id: 'deep-work',
    code: 'R3',
    label: 'Deep-Work & Work Modes',
    shortDesc: 'Focus ratio, meetings & gap context',
    group: 'tenant',
  },
  {
    id: 'financial-profitability',
    code: 'R4',
    label: 'Financial & Profitability',
    shortDesc: 'Revenue vs. dev cost & gross margin',
    group: 'tenant',
    requiresFinancials: true,
  },
  {
    id: 'billing-payroll',
    code: 'R5',
    label: 'Billing, Invoices & Payroll',
    shortDesc: 'Invoice pipeline, tax & staff payouts',
    group: 'tenant',
    requiresFinancials: true,
  },
  {
    id: 'project-delivery',
    code: 'R6',
    label: 'Project & Sprint Delivery',
    shortDesc: 'Velocity, estimates vs. actual & risks',
    group: 'tenant',
  },
  {
    id: 'evidence-governance',
    code: 'R7',
    label: 'Evidence & Governance',
    shortDesc: 'Artifacts, disputes, consent & devices',
    group: 'tenant',
  },
  {
    id: 'custom-pivot',
    code: 'R8',
    label: 'Custom Pivot Builder',
    shortDesc: 'Multi-level grouping & saved views',
    group: 'tenant',
    requiresBuilder: true,
  },
]

const LOCAL_SAVED_REPORTS_KEY = 'tiktrack_saved_reports_fallback_v1'

export function ReportsAndAnalyticsView() {
  const {
    tenants,
    accessibleTenants,
    activeTenant,
    setActiveTenantId,
    members,
    activeUser,
    isSuperAdminSession,
    isSuperAdminAccount,
    superAdminViewMode,
    setSuperAdminViewMode,
    projects,
    sprints,
    tasks,
    timesheetLines,
    invoices,
    workspacePaymentPolicy,
    developerPaymentConfigs,
    taskPaymentConfigs,
    developerPayouts,
    hasPermission,
  } = usePhase1Store()

  const { activityRollups, evidenceArtifacts, devices } = usePhase2Store()
  const { disputes } = usePhase3Store()
  const { calendarMeetings, projectForecasts, whiteLabelBranding } = usePhase4Store()

  // Strict RBAC evaluation
  const isSuperAdmin =
    isSuperAdminSession || isSuperAdminAccount || activeUser.role === 'super_admin'
  const isInSuperAdminPortal = isSuperAdminAccount && superAdminViewMode === 'portal'
  const canAccessPlatformReports =
    isSuperAdmin && (isInSuperAdminPortal || hasPermission('superadmin:platform_reports'))

  const isTenantOwner = activeUser.role === 'tenant_owner'
  const isClientReviewer = activeUser.role === 'client_reviewer'

  const canViewTeam =
    isSuperAdmin ||
    isTenantOwner ||
    hasPermission('report:view_team') ||
    hasPermission('timesheet:view_team')

  const canViewFinancials =
    !isClientReviewer &&
    (isSuperAdmin ||
      isTenantOwner ||
      hasPermission('report:view_financials') ||
      hasPermission('billing:view'))

  const canExportPdf =
    isSuperAdmin || isTenantOwner || hasPermission('report:export_pdf')

  const canExportExcel =
    isSuperAdmin || isTenantOwner || hasPermission('report:export_excel')

  const canCreateSaved =
    !isClientReviewer &&
    (isSuperAdmin || isTenantOwner || hasPermission('report:create_saved'))

  const canAiInsights =
    !isClientReviewer &&
    (isSuperAdmin || isTenantOwner || hasPermission('report:ai_insights'))

  const hideClientBillingRates =
    !isSuperAdmin &&
    !canViewFinancials &&
    workspacePaymentPolicy.hideClientBillingRatesFromDevelopers

  const access: ReportAccessContext = useMemo(
    () => ({
      isSuperAdmin,
      isInSuperAdminPortal,
      canViewTeam,
      canViewFinancials,
      canExportPdf,
      canExportExcel,
      canCreateSaved,
      canAiInsights,
      isClientReviewer,
      hideClientBillingRates,
      activeUserId: activeUser.id,
      activeUserName: activeUser.name,
      activeUserRole: activeUser.role,
    }),
    [
      isSuperAdmin,
      isInSuperAdminPortal,
      canViewTeam,
      canViewFinancials,
      canExportPdf,
      canExportExcel,
      canCreateSaved,
      canAiInsights,
      isClientReviewer,
      hideClientBillingRates,
      activeUser.id,
      activeUser.name,
      activeUser.role,
    ]
  )

  const visibleCatalog = useMemo(() => {
    return REPORT_CATALOG.filter((entry) => {
      if (entry.group === 'platform') return canAccessPlatformReports
      if (entry.requiresFinancials && !canViewFinancials) return false
      if (entry.requiresBuilder && !canCreateSaved) return false
      return true
    })
  }, [canAccessPlatformReports, canViewFinancials, canCreateSaved])

  const [selectedReportId, setSelectedReportId] = useState<ReportId>(() =>
    canAccessPlatformReports && isInSuperAdminPortal ? 'platform-revenue' : 'executive-summary'
  )

  const activeReportId: ReportId = useMemo(() => {
    if (visibleCatalog.some((r) => r.id === selectedReportId)) {
      return selectedReportId
    }
    return visibleCatalog[0]?.id ?? 'executive-summary'
  }, [visibleCatalog, selectedReportId])

  const setActiveReportId = (id: ReportId) => setSelectedReportId(id)

  // Global filter bar state
  const [filters, setFilters] = useState<ReportFilterState>({
    preset: 'all',
    dateFrom: '',
    dateTo: '',
    projectId: 'all',
    developerId: 'all',
    workMode: 'all',
    evidenceStatus: 'all',
    billableFilter: 'all',
  })

  // Custom Pivot state (R8)
  const [pivotConfig, setPivotConfig] = useState<CustomPivotConfig>({
    groupByPrimary: 'project',
    groupBySecondary: 'workMode',
    selectedMetrics: canViewFinancials
      ? ['claimedHours', 'supportedHours', 'approvedHours', 'billableAmount', 'internalCost', 'grossProfit']
      : ['claimedHours', 'supportedHours', 'approvedHours', 'approvalRate', 'entryCount'],
    chartType: 'bar',
  })
  const [activeCustomTitle, setActiveCustomTitle] = useState<string>('')

  // Platform reports data (Super Admin live DB fetch + local fallback)
  const [platformRows, setPlatformRows] = useState<PlatformTenantReportRowClient[]>([])
  const [platformLoading, setPlatformLoading] = useState(false)

  useEffect(() => {
    if (!canAccessPlatformReports) return
    let cancelled = false

    const loadPlatform = async () => {
      setPlatformLoading(true)
      const res = await fetchPlatformReportsViaPrisma({ actorRole: 'super_admin' })
      if (cancelled) return
      if (res.ok && res.tenants.length > 0) {
        setPlatformRows(res.tenants)
      } else {
        // Fallback from loaded workspace state so Super Admin still sees every tenant separately
        const sourceTenants = tenants.length > 0 ? tenants : accessibleTenants
        const fallbackRows: PlatformTenantReportRowClient[] = sourceTenants.map((t) => {
          const isCurrent = t.id === activeTenant.id
          const tLines = isCurrent ? timesheetLines : []
          const claimedH = Number((tLines.reduce((s, l) => s + l.claimedMinutes, 0) / 60).toFixed(2))
          const supportedH = Number((tLines.reduce((s, l) => s + l.supportedMinutes, 0) / 60).toFixed(2))
          const approvedH = Number((tLines.reduce((s, l) => s + l.approvedBillableMinutes, 0) / 60).toFixed(2))
          const seatCount = isCurrent ? members.filter((m) => m.status === 'active').length : 1
          const tier = t.planTier || 'starter'
          const maxSeats = tier === 'enterprise' ? 10000 : tier === 'agency' ? 100 : tier === 'team' ? 25 : 5
          const base = tier === 'enterprise' ? 499 : tier === 'agency' ? 149 : tier === 'team' ? 49 : 0
          const perSeat = tier === 'enterprise' ? 25 : tier === 'agency' ? 18 : tier === 'team' ? 12 : 0
          return {
            tenantId: t.id,
            tenantName: t.name,
            tenantSlug: t.slug,
            status: 'active',
            planTier: tier,
            currency: t.currency,
            timezone: t.timezone,
            createdAt: new Date().toISOString(),
            subscriptionStatus: 'active',
            billingCycle: 'monthly',
            billingProvider: 'stripe',
            activeSeats: seatCount,
            maxSeats,
            seatUtilizationPct: maxSeats > 0 ? Math.min(1, seatCount / maxSeats) : 0,
            estimatedMrrUsd: Number((base + seatCount * perSeat).toFixed(2)),
            saasInvoicesCount: 0,
            saasPaidTotalUsd: 0,
            saasOpenTotalUsd: 0,
            activeProjects: isCurrent ? projects.filter((p) => p.status === 'active').length : 0,
            maxActiveProjects: tier === 'enterprise' ? 10000 : tier === 'agency' ? 100 : tier === 'team' ? 25 : 3,
            monthlyEventsUsed: 0,
            monthlyEventQuota: 50000,
            aiTokensUsed: 0,
            monthlyAiTokenQuota: 250000,
            storageMbUsed: 0,
            storageQuotaMb: 512,
            elapsedHours: Number((tLines.reduce((s, l) => s + l.elapsedMinutes, 0) / 60).toFixed(2)),
            claimedHours: claimedH,
            observedHours: Number((tLines.reduce((s, l) => s + l.observedMinutes, 0) / 60).toFixed(2)),
            supportedHours: supportedH,
            approvedBillableHours: approvedH,
            approvalRatePct: claimedH > 0 ? approvedH / claimedH : 0,
            approvedBillableValue: Number(
              tLines.reduce((s, l) => s + (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate, 0).toFixed(2)
            ),
            openDisputesCount: isCurrent
              ? disputes.filter((d) => !d.status.startsWith('resolved')).length
              : 0,
            totalDisputesCount: isCurrent ? disputes.length : 0,
            evidenceArtifactsCount: isCurrent ? evidenceArtifacts.length : 0,
            activeDevicesCount: isCurrent ? devices.filter((d) => !d.revokedAt).length : 0,
            clockAnomalyDevicesCount: isCurrent ? devices.filter((d) => d.clockAnomalyDetected).length : 0,
            policyConsentPct: 1,
          }
        })
        setPlatformRows(fallbackRows)
      }
      setPlatformLoading(false)
    }

    void loadPlatform()
    return () => {
      cancelled = true
    }
  }, [
    canAccessPlatformReports,
    tenants,
    accessibleTenants,
    activeTenant.id,
    members,
    projects,
    timesheetLines,
    disputes,
    evidenceArtifacts,
    devices,
  ])

  // Saved Reports per active tenant
  const [savedReports, setSavedReports] = useState<SavedReportClientItem[]>([])

  useEffect(() => {
    let cancelled = false
    const loadSaved = async () => {
      const res = await listSavedReportsViaPrisma({
        tenantId: activeTenant.id,
        actorRole: isSuperAdmin ? 'super_admin' : activeUser.role,
        actorTenantId: activeTenant.id,
      })
      if (cancelled) return
      if (res.ok) {
        setSavedReports(res.reports)
      } else {
        try {
          const raw = localStorage.getItem(`${LOCAL_SAVED_REPORTS_KEY}_${activeTenant.id}`)
          setSavedReports(raw ? (JSON.parse(raw) as SavedReportClientItem[]) : [])
        } catch {
          setSavedReports([])
        }
      }
    }
    void loadSaved()
    return () => {
      cancelled = true
    }
  }, [activeTenant.id, activeUser.role, isSuperAdmin])

  // Assemble tenant dataset
  const tenantDataset: TenantAnalyticsDataset = useMemo(
    () => ({
      tenant: activeTenant,
      members,
      projects,
      sprints,
      tasks,
      timesheetLines,
      invoices,
      developerPaymentConfigs,
      taskPaymentConfigs,
      developerPayouts,
      activityRollups,
      evidenceArtifacts,
      devices,
      disputes,
      calendarMeetings,
      projectForecasts,
      brandColorHex: whiteLabelBranding?.accentColorHex || '#6d25da',
    }),
    [
      activeTenant,
      members,
      projects,
      sprints,
      tasks,
      timesheetLines,
      invoices,
      developerPaymentConfigs,
      taskPaymentConfigs,
      developerPayouts,
      activityRollups,
      evidenceArtifacts,
      devices,
      disputes,
      calendarMeetings,
      projectForecasts,
      whiteLabelBranding?.accentColorHex,
    ]
  )

  // Compute all report outputs cleanly via useMemo
  const platformRevenueDoc = useMemo(
    () => buildPlatformRevenueDocument(platformRows, access),
    [platformRows, access]
  )
  const platformHealthDoc = useMemo(
    () => buildPlatformHealthDocument(platformRows, access),
    [platformRows, access]
  )
  const platformOpsDoc = useMemo(
    () => buildPlatformOperationsDocument(platformRows, access),
    [platformRows, access]
  )

  const executiveData = useMemo(
    () => computeExecutiveSummaryReport(tenantDataset, filters, access),
    [tenantDataset, filters, access]
  )
  const timeUtilData = useMemo(
    () => computeTimeUtilizationReport(tenantDataset, filters, access),
    [tenantDataset, filters, access]
  )
  const deepWorkData = useMemo(
    () => computeDeepWorkReport(tenantDataset, filters, access),
    [tenantDataset, filters, access]
  )
  const financialData = useMemo(
    () => computeFinancialProfitabilityReport(tenantDataset, filters, access),
    [tenantDataset, filters, access]
  )
  const billingData = useMemo(
    () => computeBillingPayrollReport(tenantDataset, filters, access),
    [tenantDataset, filters, access]
  )
  const deliveryData = useMemo(
    () => computeProjectDeliveryReport(tenantDataset, filters, access),
    [tenantDataset, filters, access]
  )
  const evidenceData = useMemo(
    () => computeEvidenceGovernanceReport(tenantDataset, filters, access),
    [tenantDataset, filters, access]
  )
  const customPivotData = useMemo(
    () =>
      computeCustomPivotReport(
        tenantDataset,
        filters,
        access,
        pivotConfig,
        activeCustomTitle
      ),
    [tenantDataset, filters, access, pivotConfig, activeCustomTitle]
  )

  // Resolve the active canonical ReportDocument for structured PDF & Excel export
  const activeDocument: ReportDocument = useMemo(() => {
    switch (activeReportId) {
      case 'platform-revenue':
        return platformRevenueDoc
      case 'platform-health':
        return platformHealthDoc
      case 'platform-operations':
        return platformOpsDoc
      case 'executive-summary':
        return executiveData.document
      case 'time-utilization':
        return timeUtilData.document
      case 'deep-work':
        return deepWorkData.document
      case 'financial-profitability':
        return financialData.document
      case 'billing-payroll':
        return billingData.document
      case 'project-delivery':
        return deliveryData.document
      case 'evidence-governance':
        return evidenceData.document
      case 'custom-pivot':
        return customPivotData.document
    }
  }, [
    activeReportId,
    platformRevenueDoc,
    platformHealthDoc,
    platformOpsDoc,
    executiveData.document,
    timeUtilData.document,
    deepWorkData.document,
    financialData.document,
    billingData.document,
    deliveryData.document,
    evidenceData.document,
    customPivotData.document,
  ])

  const isPlatformReport = activeReportId.startsWith('platform-')

  // Export handlers (Clean Structured PDF & Styled Multi-Sheet Excel - NEVER window.print!)
  const [exportingType, setExportingType] = useState<'pdf' | 'excel' | null>(null)

  function handleExportPdf() {
    if (!canExportPdf) {
      notifyError('You do not have permission (report:export_pdf) to export PDF reports.')
      return
    }
    try {
      setExportingType('pdf')
      const filename = exportReportToPdf(activeDocument)
      notifySuccess(`Clean PDF report exported: ${filename}`)
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to generate PDF report.')
    } finally {
      setExportingType(null)
    }
  }

  async function handleExportExcel() {
    if (!canExportExcel) {
      notifyError('You do not have permission (report:export_excel) to export Excel workbooks.')
      return
    }
    try {
      setExportingType('excel')
      const filename = await exportReportToExcel(activeDocument)
      notifySuccess(`Styled Excel workbook exported: ${filename}`)
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to generate Excel workbook.')
    } finally {
      setExportingType(null)
    }
  }

  // AI Executive Brief state (scoped to activeReportId + activeTenant.id without effect cascading)
  const [aiBriefLoading, setAiBriefLoading] = useState(false)
  const [aiBriefState, setAiBriefState] = useState<{
    scopeKey: string
    text: string
    meta: string
  } | null>(null)

  const currentBriefScopeKey = `${activeReportId}:${activeTenant.id}`
  const aiBriefText =
    aiBriefState && aiBriefState.scopeKey === currentBriefScopeKey ? aiBriefState.text : ''
  const aiBriefMeta =
    aiBriefState && aiBriefState.scopeKey === currentBriefScopeKey ? aiBriefState.meta : ''

  async function handleGenerateAiBrief() {
    if (!canAiInsights) return
    setAiBriefLoading(true)
    const targetScopeKey = currentBriefScopeKey
    const res = await generateReportAiBriefViaPrisma({
      reportTitle: activeDocument.title,
      scopeLabel: activeDocument.scopeLabel,
      dateRangeLabel: activeDocument.dateRangeLabel,
      kpis: activeDocument.kpis.map((k) => ({
        label: k.label,
        value: k.value,
        delta: k.delta,
      })),
      highlights: {
        sectionCount: activeDocument.sections.length,
        primarySectionRows: activeDocument.sections[0]?.rows.slice(0, 8) ?? [],
      },
    })
    setAiBriefLoading(false)
    if (res.ok && res.briefMarkdown) {
      setAiBriefState({
        scopeKey: targetScopeKey,
        text: res.briefMarkdown,
        meta:
          res.mode === 'gemini_live'
            ? `AI Brief (${res.modelId})`
            : 'Structured Executive Snapshot',
      })
    } else {
      notifyError(res.error || 'Could not generate executive brief.')
    }
  }

  // Saved Report Handlers
  async function handleSaveCustomReport(name: string, description: string) {
    const payload = {
      tenantId: activeTenant.id,
      actorRole: isSuperAdmin ? 'super_admin' : activeUser.role,
      actorTenantId: activeTenant.id,
      createdBy: activeUser.id,
      name,
      description,
      reportType: 'custom_pivot',
      visibility: 'workspace',
      configJson: { pivotConfig, filters },
    }
    const res = await createSavedReportViaPrisma(payload)
    if (res.ok && res.report) {
      setSavedReports((prev) => [res.report!, ...prev])
      setActiveCustomTitle(name)
      notifySuccess(`Saved report "${name}" to workspace.`)
      return
    }
    // Local fallback
    const localItem: SavedReportClientItem = {
      id: `sr-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: activeTenant.id,
      createdBy: activeUser.id,
      name,
      description,
      reportType: 'custom_pivot',
      visibility: 'workspace',
      configJson: { pivotConfig, filters },
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setSavedReports((prev) => {
      const next = [localItem, ...prev]
      try {
        localStorage.setItem(`${LOCAL_SAVED_REPORTS_KEY}_${activeTenant.id}`, JSON.stringify(next))
      } catch {
        // ignore quota
      }
      return next
    })
    setActiveCustomTitle(name)
    notifySuccess(`Saved report "${name}".`)
  }

  function handleLoadSavedReport(item: SavedReportClientItem) {
    const cfg = item.configJson as {
      pivotConfig?: CustomPivotConfig
      filters?: ReportFilterState
    }
    if (cfg?.pivotConfig) setPivotConfig(cfg.pivotConfig)
    if (cfg?.filters) setFilters(cfg.filters)
    setActiveCustomTitle(item.name)
    notifyInfo(`Loaded saved report "${item.name}".`)
  }

  async function handleDeleteSavedReport(id: string) {
    await deleteSavedReportViaPrisma({
      id,
      tenantId: activeTenant.id,
      actorRole: isSuperAdmin ? 'super_admin' : activeUser.role,
      actorTenantId: activeTenant.id,
    })
    setSavedReports((prev) => {
      const next = prev.filter((r) => r.id !== id)
      try {
        localStorage.setItem(`${LOCAL_SAVED_REPORTS_KEY}_${activeTenant.id}`, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
    notifySuccess('Saved report deleted.')
  }

  // Super Admin jump from Platform report row -> inspect specific tenant's R1 Executive Summary
  function handleSuperAdminInspectTenant(tenantId: string) {
    setActiveTenantId(tenantId)
    if (isSuperAdminAccount && superAdminViewMode === 'portal') {
      // Keep portal capability while loading that tenant's context
      setSuperAdminViewMode('portal')
    }
    setActiveReportId('executive-summary')
    setFilters((prev) => ({ ...prev, projectId: 'all', developerId: 'all' }))
  }

  const allSelectableTenants = tenants.length > 0 ? tenants : accessibleTenants
  const platformEntries = visibleCatalog.filter((e) => e.group === 'platform')
  const tenantEntries = visibleCatalog.filter((e) => e.group === 'tenant')

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* =================================================================== */}
      {/* LEFT SIDEBAR: SEPARATE REPORT DIRECTORY                             */}
      {/* =================================================================== */}
      <aside className={`${REPORT_CARD_CLS} xl:col-span-3 p-3.5 space-y-5 xl:sticky xl:top-20`}>
        {/* Platform Reports Section - Super Admin Only */}
        {platformEntries.length > 0 && (
          <div className="space-y-1.5">
            <div className="px-2 flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6d25da] dark:text-[#c5a8f0]">
                Platform Reports (Super Admin)
              </span>
              <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[#6d25da]/12 text-[#6d25da] dark:text-[#c5a8f0]">
                ALL TENANTS
              </span>
            </div>
            <div className="space-y-1">
              {platformEntries.map((entry) => {
                const selected = entry.id === activeReportId
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setActiveReportId(entry.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition cursor-pointer flex items-start gap-2.5 ${selected
                      ? 'bg-[#6d25da] text-white shadow-sm shadow-[#6d25da]/25'
                      : 'hover:bg-zinc-100/90 dark:hover:bg-white/[0.05] text-zinc-700 dark:text-zinc-200'
                      }`}
                  >
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0 ${selected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#6d25da]/10 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]'
                        }`}
                    >
                      {entry.code}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{entry.label}</div>
                      <div
                        className={`text-[10.5px] truncate ${selected ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                      >
                        {entry.shortDesc}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Tenant Operational Reports Section */}
        <div className="space-y-1.5">
          <div className="px-2 flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {isSuperAdmin ? 'Tenant Reports (Per Tenant)' : 'Workspace Reports'}
            </span>
            <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 truncate max-w-[100px]">
              {activeTenant.slug}
            </span>
          </div>

          <div className="space-y-1">
            {tenantEntries.map((entry) => {
              const selected = entry.id === activeReportId
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setActiveReportId(entry.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition cursor-pointer flex items-start gap-2.5 ${selected
                    ? 'bg-[#6d25da] text-white shadow-sm shadow-[#6d25da]/25'
                    : 'hover:bg-zinc-100/90 dark:hover:bg-white/[0.05] text-zinc-700 dark:text-zinc-200'
                    }`}
                >
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0 ${selected
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300'
                      }`}
                  >
                    {entry.code}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{entry.label}</div>
                    <div
                      className={`text-[10.5px] truncate ${selected ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                    >
                      {entry.shortDesc}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Access Scope Summary Pill */}
        {/* <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3 text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1">
          <div className="font-semibold text-zinc-700 dark:text-zinc-200">
            Active Access Scope
          </div>
          <div>
            {isSuperAdmin
              ? 'Super Admin: Separate access to Platform & every individual tenant report.'
              : canViewTeam
                ? `Tenant Scope (${activeTenant.name})${canViewFinancials ? ' • Financials Enabled' : ' • Operational Only'}`
                : 'Personal Scope: Showing your own recorded sessions & tasks only.'}
          </div>
        </div> */}
      </aside>

      {/* =================================================================== */}
      {/* MAIN CONTENT: HEADER, TENANT PICKER, FILTERS, EXPORTS & REPORT VIEW */}
      {/* =================================================================== */}
      <div className="xl:col-span-9 space-y-4 min-w-0">
        {/* Report Header + Dedicated Clean PDF & Excel Export Actions */}
        <section className={`${REPORT_CARD_CLS} p-5 space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#6d25da]/12 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]">
                  {activeDocument.reportCode}
                </span>
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {activeDocument.scopeLabel}
                </span>
                {!canViewTeam && !isSuperAdmin && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/12 text-sky-700 dark:text-sky-300">
                    Personal Data Only
                  </span>
                )}
                {isClientReviewer && !isSuperAdmin && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                    Approved Client Scope
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                {activeDocument.title}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {activeDocument.subtitle}
              </p>
            </div>

            {/* Clean Export Buttons (Structured Vector PDF + Styled Excel - NOT Display Print) */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canAiInsights && (
                <button
                  type="button"
                  onClick={() => void handleGenerateAiBrief()}
                  disabled={aiBriefLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-zinc-800 dark:text-zinc-100 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  <span>✦</span>
                  <span>{aiBriefLoading ? 'Analyzing...' : 'Executive Brief'}</span>
                </button>
              )}

              {canExportPdf && (
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exportingType !== null}
                  title="Download a clean, structured A4 vector PDF report (does not print UI view)"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M12 18v-6m-3 3 3 3 3-3" />
                  </svg>
                  <span>{exportingType === 'pdf' ? 'Building PDF...' : 'Export PDF'}</span>
                </button>
              )}

              {canExportExcel && (
                <button
                  type="button"
                  onClick={() => void handleExportExcel()}
                  disabled={exportingType !== null}
                  title="Download a styled multi-sheet Excel (.xlsx) workbook with native formats & SUM formulas"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                  <span>{exportingType === 'excel' ? 'Building Excel...' : 'Export Excel'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Super Admin Per-Tenant Selector Bar (when viewing R1-R8) */}
          {isSuperAdmin && !isPlatformReport && (
            <div className="rounded-xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/[0.14] border border-[#6d25da]/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#6d25da] dark:bg-[#a87ce9]" />
                <span className="font-semibold text-[#581eae] dark:text-[#d8c4f8]">
                  Super Admin Per-Tenant Inspector:
                </span>
                <span className="text-zinc-600 dark:text-zinc-300">
                  Select any tenant workspace to inspect &amp; export this report separately
                </span>
              </div>
              <Select
                value={activeTenant.id}
                onChange={(e) => {
                  setActiveTenantId(e.target.value)
                  setFilters((prev) => ({ ...prev, projectId: 'all', developerId: 'all' }))
                }}
                className="rounded-lg border border-[#6d25da]/30 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-900 dark:text-white cursor-pointer"
              >
                {allSelectableTenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug} • {t.currency})
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Global Filter Bar (for Tenant Operational Reports R1-R8) */}
          {!isPlatformReport && (
            <div className="pt-3 border-t border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-end gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Period
                </label>
                <Select
                  value={filters.preset}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, preset: e.target.value as DateRangePreset }))
                  }
                  className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-800 dark:text-zinc-100"
                >
                  <option value="all">All Dates</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="this_month">This Month</option>
                  <option value="custom">Custom Range</option>
                </Select>
              </div>

              {filters.preset === 'custom' && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                      }
                      className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                      }
                      className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Project
                </label>
                <Select
                  value={filters.projectId}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, projectId: e.target.value }))
                  }
                  className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-800 dark:text-zinc-100 max-w-[190px]"
                >
                  <option value="all">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              {canViewTeam && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Team Member
                  </label>
                  <Select
                    value={filters.developerId}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, developerId: e.target.value }))
                    }
                    className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-800 dark:text-zinc-100 max-w-[175px]"
                  >
                    <option value="all">All Members</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Work Mode
                </label>
                <Select
                  value={filters.workMode}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, workMode: e.target.value }))
                  }
                  className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-800 dark:text-zinc-100"
                >
                  <option value="all">All Modes</option>
                  <option value="coding">Coding</option>
                  <option value="debugging">Debugging</option>
                  <option value="thinking">Thinking</option>
                  <option value="research">Research</option>
                  <option value="testing">Testing</option>
                  <option value="review">Review</option>
                  <option value="meeting">Meeting</option>
                  <option value="design">Design</option>
                </Select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Billability
                </label>
                <Select
                  value={filters.billableFilter}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      billableFilter: e.target.value as ReportFilterState['billableFilter'],
                    }))
                  }
                  className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-zinc-800 dark:text-zinc-100"
                >
                  <option value="all">All</option>
                  <option value="billable">Billable Only</option>
                  <option value="non_billable">Non-Billable Only</option>
                </Select>
              </div>

              {(filters.preset !== 'all' ||
                filters.projectId !== 'all' ||
                filters.developerId !== 'all' ||
                filters.workMode !== 'all' ||
                filters.billableFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() =>
                      setFilters({
                        preset: 'all',
                        dateFrom: '',
                        dateTo: '',
                        projectId: 'all',
                        developerId: 'all',
                        workMode: 'all',
                        evidenceStatus: 'all',
                        billableFilter: 'all',
                      })
                    }
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
            </div>
          )}
        </section>

        {/* AI Executive Brief Card (when generated) */}
        {aiBriefText && (
          <section className="rounded-2xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/[0.14] border border-[#6d25da]/25 p-5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#6d25da] dark:text-[#c5a8f0]">✦</span>
                <span className="text-xs font-bold uppercase tracking-wider text-[#581eae] dark:text-[#d8c4f8]">
                  {aiBriefMeta || 'Executive Report Brief'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAiBriefState(null)}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <div className="text-xs text-zinc-800 dark:text-zinc-100 whitespace-pre-line leading-relaxed">
              {aiBriefText}
            </div>
          </section>
        )}

        {/* Loading Notice for Platform Reports */}
        {isPlatformReport && platformLoading && (
          <div className="rounded-2xl bg-white dark:bg-[#111117] p-4 text-xs text-zinc-500 dark:text-zinc-400 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08]">
            Refreshing live multi-tenant platform telemetry...
          </div>
        )}

        {/* Active Dedicated Report View */}
        {activeReportId === 'platform-revenue' && canAccessPlatformReports && (
          <PlatformRevenueReportView
            rows={platformRows}
            document={platformRevenueDoc}
            onInspectTenant={handleSuperAdminInspectTenant}
          />
        )}
        {activeReportId === 'platform-health' && canAccessPlatformReports && (
          <PlatformHealthReportView
            rows={platformRows}
            document={platformHealthDoc}
            onInspectTenant={handleSuperAdminInspectTenant}
          />
        )}
        {activeReportId === 'platform-operations' && canAccessPlatformReports && (
          <PlatformOperationsReportView
            rows={platformRows}
            document={platformOpsDoc}
            onInspectTenant={handleSuperAdminInspectTenant}
          />
        )}

        {activeReportId === 'executive-summary' && (
          <ExecutiveSummaryReportView
            data={executiveData}
            showFinancialCharts={canViewFinancials && !hideClientBillingRates}
          />
        )}
        {activeReportId === 'time-utilization' && (
          <TimeUtilizationReportView data={timeUtilData} />
        )}
        {activeReportId === 'deep-work' && <DeepWorkReportView data={deepWorkData} />}
        {activeReportId === 'financial-profitability' && canViewFinancials && (
          <FinancialProfitabilityReportView data={financialData} />
        )}
        {activeReportId === 'billing-payroll' && canViewFinancials && (
          <BillingPayrollReportView data={billingData} />
        )}
        {activeReportId === 'project-delivery' && (
          <ProjectDeliveryReportView data={deliveryData} />
        )}
        {activeReportId === 'evidence-governance' && (
          <EvidenceGovernanceReportView data={evidenceData} />
        )}
        {activeReportId === 'custom-pivot' && canCreateSaved && (
          <CustomPivotBuilderView
            config={pivotConfig}
            onChangeConfig={setPivotConfig}
            result={customPivotData}
            showFinancialMetrics={canViewFinancials && !hideClientBillingRates}
            savedReports={savedReports}
            onSaveReport={handleSaveCustomReport}
            onLoadSavedReport={handleLoadSavedReport}
            onDeleteSavedReport={handleDeleteSavedReport}
          />
        )}
      </div>
    </div>
  )
}
