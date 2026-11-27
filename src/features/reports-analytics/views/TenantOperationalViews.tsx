import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SavedReportClientItem } from '@/lib/prismaApiClient'
import {
  PIVOT_DIMENSION_LABELS,
  PIVOT_METRIC_META,
  type BillingPayrollReportData,
  type CustomPivotConfig,
  type CustomPivotResult,
  type DeepWorkReportData,
  type EvidenceGovernanceReportData,
  type ExecutiveReportData,
  type FinancialProfitabilityReportData,
  type PivotDimension,
  type PivotMetricKey,
  type ProjectDeliveryReportData,
  type TimeUtilizationReportData,
} from '../engine/reportAnalyticsEngine'
import {
  CHART_COLORS,
  ChartCard,
  ChartEmptyState,
  KpiGrid,
  REPORT_CARD_CLS,
  StructuredDataTable,
} from '../components/ReportSharedUi'
import { Select } from '@/components/Select'

// =============================================================================
// R1: EXECUTIVE SUMMARY VIEW
// =============================================================================

export function ExecutiveSummaryReportView({
  data,
  showFinancialCharts,
}: {
  data: ExecutiveReportData
  showFinancialCharts: boolean
}) {
  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.document.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <ChartCard
            title="Five-Time-Concept Funnel"
            subtitle="Elapsed → Claimed → Observed → Supported → Approved Billable"
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.fiveConceptFunnel}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 20, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis type="number" unit="h" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="stage" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="hours" name="Hours" radius={[0, 6, 6, 0]}>
                    {data.fiveConceptFunnel.map((item, idx) => (
                      <Cell key={item.stage} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="lg:col-span-7">
          <ChartCard
            title={
              showFinancialCharts
                ? 'Daily Approved Revenue vs. Estimated Cost'
                : 'Daily Hours Trend (Claimed vs. Supported vs. Approved)'
            }
            subtitle={
              showFinancialCharts
                ? 'Approved billable revenue compared to internal labor cost per day'
                : 'Daily progression across the selected reporting window'
            }
          >
            {data.dailyTrend.length === 0 ? (
              <ChartEmptyState message="No timesheet entries recorded in this date range." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {showFinancialCharts ? (
                    <ComposedChart data={data.dailyTrend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="revenue" name="Billable Revenue" fill="#6d25da" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cost" name="Internal Cost" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="approvedHours" name="Approved (h)" stroke="#10b981" strokeWidth={2} />
                    </ComposedChart>
                  ) : (
                    <AreaChart data={data.dailyTrend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis unit="h" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="claimedHours" name="Claimed (h)" stroke="#6d25da" fill="#6d25da" fillOpacity={0.14} />
                      <Area type="monotone" dataKey="supportedHours" name="Supported (h)" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.14} />
                      <Area type="monotone" dataKey="approvedHours" name="Approved (h)" stroke="#10b981" fill="#10b981" fillOpacity={0.22} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {data.document.sections.slice(1).map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={data.document.currency}
        />
      ))}
    </div>
  )
}

// =============================================================================
// R2: TIME & UTILIZATION VIEW
// =============================================================================

export function TimeUtilizationReportView({ data }: { data: TimeUtilizationReportData }) {
  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.document.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <ChartCard
            title="Daily Billable vs. Non-Billable Hours"
            subtitle="Stacked daily hours with approved billable overlay"
          >
            {data.dailyBillableSeries.length === 0 ? (
              <ChartEmptyState message="No tracked time entries match the current filters." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.dailyBillableSeries} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis unit="h" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="billableHours" stackId="a" name="Billable (h)" fill="#6d25da" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="nonBillableHours" stackId="a" name="Non-Billable (h)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="approvedHours" name="Approved (h)" stroke="#10b981" strokeWidth={2.2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-4">
          <ChartCard
            title="Capture Provenance Split"
            subtitle="Desktop timer vs. web timer vs. manual entries"
          >
            {data.byProvenance.length === 0 ? (
              <ChartEmptyState message="No provenance records." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.byProvenance}
                      dataKey="hours"
                      nameKey="provenance"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {data.byProvenance.map((item, idx) => (
                        <Cell key={item.provenance} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {data.document.sections.map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={data.document.currency}
        />
      ))}
    </div>
  )
}

// =============================================================================
// R3: DEEP-WORK & WORK-MODE ANALYSIS VIEW
// =============================================================================

export function DeepWorkReportView({ data }: { data: DeepWorkReportData }) {
  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.document.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ChartCard
            title="Work-Mode Investment Balance"
            subtitle="Engineering time distribution across deep-work and collaborative contexts"
          >
            {data.byWorkMode.length === 0 ? (
              <ChartEmptyState message="No declared work modes recorded in this range." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byWorkMode} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="workMode" tick={{ fontSize: 11 }} />
                    <YAxis unit="h" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="hours" name="Hours" radius={[6, 6, 0, 0]}>
                      {data.byWorkMode.map((entry, idx) => (
                        <Cell key={entry.workMode} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <ChartCard
            title="Privacy-Safe App Categories"
            subtitle="Coarse local classifications only (no keystrokes or private titles)"
          >
            {data.byAppCategory.length === 0 ? (
              <ChartEmptyState message="No desktop/IDE rollup buckets available for this scope." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.byAppCategory}
                      dataKey="hours"
                      nameKey="appCategory"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {data.byAppCategory.map((item, idx) => (
                        <Cell key={item.appCategory} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {data.document.sections.map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={data.document.currency}
        />
      ))}
    </div>
  )
}

// =============================================================================
// R4: FINANCIAL & PROFITABILITY VIEW
// =============================================================================

export function FinancialProfitabilityReportView({
  data,
}: {
  data: FinancialProfitabilityReportData
}) {
  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.document.kpis} />

      <ChartCard
        title="Client Billable Revenue vs. Internal Cost vs. Gross Profit by Project"
        subtitle={`True agency profitability comparison (${data.document.currency})`}
      >
        {data.byProject.length === 0 ? (
          <ChartEmptyState message="No project billing or estimate data for this selection." />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byProject} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="projectCode" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Client Revenue" fill="#6d25da" radius={[4, 4, 0, 0]} />
                <Bar dataKey="internalCost" name="Internal Cost" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="grossProfit" name="Gross Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {data.document.sections.map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={data.document.currency}
        />
      ))}
    </div>
  )
}

// =============================================================================
// R5: BILLING, INVOICING & PAYROLL VIEW
// =============================================================================

export function BillingPayrollReportView({ data }: { data: BillingPayrollReportData }) {
  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.document.kpis} />

      <ChartCard
        title="Revenue Recognition & Billing Pipeline"
        subtitle="Financial progression from draft work logs to locked client invoices"
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.pipelineStages} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="stage" tick={{ fontSize: 10.5 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="amount" name={`Amount (${data.document.currency})`} radius={[6, 6, 0, 0]}>
                {data.pipelineStages.map((st, idx) => (
                  <Cell key={st.stage} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {data.document.sections.slice(1).map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={data.document.currency}
        />
      ))}
    </div>
  )
}

// =============================================================================
// R6: PROJECT & SPRINT DELIVERY VIEW
// =============================================================================

export function ProjectDeliveryReportView({ data }: { data: ProjectDeliveryReportData }) {
  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.document.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6">
          <ChartCard
            title="Estimate vs. Actual Hours by Issue Type"
            subtitle="Calibrates scoping accuracy across Epics, Stories, Tasks, Bugs, and Subtasks"
          >
            {data.varianceByIssueType.length === 0 ? (
              <ChartEmptyState message="No tasks found for the active filter." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.varianceByIssueType} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="issueType" tick={{ fontSize: 11 }} />
                    <YAxis unit="h" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="estimatedHours" name="Estimated (h)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actualHours" name="Actual Logged (h)" fill="#6d25da" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-6">
          <ChartCard
            title="Sprint Velocity (Committed vs. Completed Story Points)"
            subtitle="Sprint commitment reliability across active & completed sprints"
          >
            {data.sprintVelocity.length === 0 ? (
              <ChartEmptyState message="No sprints configured for the selected project(s)." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.sprintVelocity} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="sprintName" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="committedPoints" name="Committed Pts" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completedPoints" name="Completed Pts" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {data.document.sections.map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={data.document.currency}
        />
      ))}
    </div>
  )
}

// =============================================================================
// R7: EVIDENCE, VERIFICATION & GOVERNANCE VIEW
// =============================================================================

export function EvidenceGovernanceReportView({ data }: { data: EvidenceGovernanceReportData }) {
  return (
    <div className="space-y-5">
      <KpiGrid kpis={data.document.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6">
          <ChartCard
            title="Evidence Status Distribution (Hours)"
            subtitle="Non-accusatory taxonomy: signals describe context, never verdicts"
          >
            {data.byEvidenceStatus.length === 0 ? (
              <ChartEmptyState message="No timesheet evidence lines in this range." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.byEvidenceStatus}
                      dataKey="hours"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {data.byEvidenceStatus.map((item, idx) => (
                        <Cell key={item.status} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-6">
          <ChartCard
            title="Corroborating Artifacts by Engineering Source"
            subtitle="Git commits, PRs, reviews, CI runs, VS Code debug/test metadata"
          >
            {data.byArtifactSource.length === 0 ? (
              <ChartEmptyState message="No engineering artifacts linked for this selection." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byArtifactSource} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="sourceType" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" name="Total Linked" fill="#6d25da" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="confirmedCount" name="Dev Confirmed" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {data.document.sections.map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={data.document.currency}
        />
      ))}
    </div>
  )
}

// =============================================================================
// R8: CUSTOM PIVOT REPORT BUILDER VIEW
// =============================================================================

export function CustomPivotBuilderView({
  config,
  onChangeConfig,
  result,
  showFinancialMetrics,
  savedReports,
  onSaveReport,
  onLoadSavedReport,
  onDeleteSavedReport,
}: {
  config: CustomPivotConfig
  onChangeConfig: (next: CustomPivotConfig) => void
  result: CustomPivotResult
  showFinancialMetrics: boolean
  savedReports: SavedReportClientItem[]
  onSaveReport: (name: string, description: string) => Promise<void>
  onLoadSavedReport: (item: SavedReportClientItem) => void
  onDeleteSavedReport: (id: string) => Promise<void>
}) {
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const allDimensions = Object.keys(PIVOT_DIMENSION_LABELS) as PivotDimension[]
  const allMetrics = (Object.keys(PIVOT_METRIC_META) as PivotMetricKey[]).filter((m) =>
    PIVOT_METRIC_META[m].requiresFinancials ? showFinancialMetrics : true
  )

  const toggleMetric = (m: PivotMetricKey) => {
    const exists = config.selectedMetrics.includes(m)
    const next = exists
      ? config.selectedMetrics.filter((x) => x !== m)
      : [...config.selectedMetrics, m]
    if (next.length === 0) return
    onChangeConfig({ ...config, selectedMetrics: next })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!saveName.trim()) return
    setSaving(true)
    await onSaveReport(saveName.trim(), saveDesc.trim())
    setSaveName('')
    setSaveDesc('')
    setSaving(false)
  }

  const primaryChartMetric =
    result.allowedMetrics.find((m) => m !== 'approvalRate') ?? result.allowedMetrics[0]

  return (
    <div className="space-y-5">
      {/* Configuration Studio */}
      <section className={`${REPORT_CARD_CLS} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
              Custom Pivot Report Builder
            </h3>
            <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
              Choose dimensions, metrics, and visualization - exports cleanly to structured PDF &amp; Excel
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
              Primary Group By
            </label>
            <Select
              value={config.groupByPrimary}
              onChange={(e) =>
                onChangeConfig({ ...config, groupByPrimary: e.target.value as PivotDimension })
              }
              className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
            >
              {allDimensions.map((d) => (
                <option key={d} value={d}>
                  {PIVOT_DIMENSION_LABELS[d]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
              Secondary Breakdown (Optional)
            </label>
            <Select
              value={config.groupBySecondary}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  groupBySecondary: e.target.value as PivotDimension | 'none',
                })
              }
              className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
            >
              <option value="none">None (Single Level)</option>
              {allDimensions
                .filter((d) => d !== config.groupByPrimary)
                .map((d) => (
                  <option key={d} value={d}>
                    {PIVOT_DIMENSION_LABELS[d]}
                  </option>
                ))}
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
              Visual Preview
            </label>
            <Select
              value={config.chartType}
              onChange={(e) =>
                onChangeConfig({
                  ...config,
                  chartType: e.target.value as CustomPivotConfig['chartType'],
                })
              }
              className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
            >
              <option value="bar">Bar Chart + Table</option>
              <option value="stacked">Stacked Comparison + Table</option>
              <option value="line">Trend Line + Table</option>
              <option value="table_only">Table Only</option>
            </Select>
          </div>
        </div>

        {/* Metric Chips */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
            Columns &amp; Metrics Included
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allMetrics.map((m) => {
              const active = config.selectedMetrics.includes(m)
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMetric(m)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${active
                      ? 'bg-[#6d25da] text-white shadow-xs'
                      : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/[0.1]'
                    }`}
                >
                  {active ? '✓ ' : '+ '}
                  {PIVOT_METRIC_META[m].label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Save Report Bar */}
        <form
          onSubmit={handleSave}
          className="pt-3 border-t border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center gap-2 text-xs"
        >
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Save this view (e.g., Monthly Client Margin by Work Mode)..."
            className="flex-1 min-w-[220px] rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
          />
          <input
            type="text"
            value={saveDesc}
            onChange={(e) => setSaveDesc(e.target.value)}
            placeholder="Optional description"
            className="w-56 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-zinc-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={saving || !saveName.trim()}
            className="px-4 py-2 rounded-xl bg-[#6d25da] hover:bg-[#5c1ec0] text-white font-semibold transition cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Report View'}
          </button>
        </form>

        {/* Saved Reports List */}
        {savedReports.length > 0 && (
          <div className="pt-2 space-y-1.5">
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              Saved Views ({savedReports.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {savedReports.map((sr) => (
                <div
                  key={sr.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onLoadSavedReport(sr)}
                    className="font-semibold text-zinc-800 dark:text-zinc-100 hover:text-[#6d25da] dark:hover:text-[#c5a8f0] cursor-pointer"
                  >
                    {sr.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteSavedReport(sr.id)}
                    title="Delete saved report"
                    className="text-zinc-400 hover:text-rose-500 cursor-pointer ml-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <KpiGrid kpis={result.document.kpis} />

      {config.chartType !== 'table_only' && primaryChartMetric && (
        <ChartCard
          title={`Custom Chart - ${PIVOT_DIMENSION_LABELS[config.groupByPrimary]}`}
          subtitle="Live visualization synced with your selected pivot grouping and filters"
        >
          {result.rows.length === 0 ? (
            <ChartEmptyState message="No rows match the active filters." />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {config.chartType === 'line' ? (
                  <AreaChart data={result.rows.slice(0, 20)} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="primary" tick={{ fontSize: 10.5 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {result.allowedMetrics.slice(0, 3).map((m, idx) => (
                      <Area
                        key={m}
                        type="monotone"
                        dataKey={m}
                        name={PIVOT_METRIC_META[m].label}
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        fillOpacity={0.14}
                      />
                    ))}
                  </AreaChart>
                ) : (
                  <BarChart data={result.rows.slice(0, 20)} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="primary" tick={{ fontSize: 10.5 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {result.allowedMetrics.slice(0, 3).map((m, idx) => (
                      <Bar
                        key={m}
                        dataKey={m}
                        stackId={config.chartType === 'stacked' ? 'pivot' : undefined}
                        name={PIVOT_METRIC_META[m].label}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      )}

      {result.document.sections.map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={result.document.currency}
        />
      ))}
    </div>
  )
}
