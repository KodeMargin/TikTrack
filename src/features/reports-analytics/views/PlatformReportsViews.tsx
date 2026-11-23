import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PlatformTenantReportRowClient } from '@/lib/prismaApiClient'
import type { ReportDocument } from '../export/reportDocument.types'
import {
  CHART_COLORS,
  ChartCard,
  ChartEmptyState,
  KpiGrid,
  StructuredDataTable,
} from '../components/ReportSharedUi'

export function PlatformRevenueReportView({
  rows,
  document,
  onInspectTenant,
}: {
  rows: PlatformTenantReportRowClient[]
  document: ReportDocument
  onInspectTenant: (tenantId: string) => void
}) {
  const tierMap = new Map<string, { tier: string; mrr: number; tenants: number }>()
  for (const r of rows) {
    const key = r.planTier.toUpperCase()
    const cur = tierMap.get(key) ?? { tier: key, mrr: 0, tenants: 0 }
    cur.mrr += r.estimatedMrrUsd
    cur.tenants += 1
    tierMap.set(key, cur)
  }
  const tierSeries = Array.from(tierMap.values())

  return (
    <div className="space-y-5">
      <KpiGrid kpis={document.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ChartCard
            title="Estimated MRR by Tenant Workspace (USD)"
            subtitle="Separate monthly recurring subscription value per registered tenant"
          >
            {rows.length === 0 ? (
              <ChartEmptyState message="No tenant workspaces found." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="tenantName" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid rgba(148,163,184,0.25)',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="estimatedMrrUsd" name="Est. MRR (USD)" fill="#6d25da" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="saasPaidTotalUsd" name="Collected SaaS (USD)" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <ChartCard
            title="MRR Share by Subscription Tier"
            subtitle="Plan distribution across Starter, Team, Agency, and Enterprise"
          >
            {tierSeries.length === 0 ? (
              <ChartEmptyState message="No plan tier data yet." />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tierSeries}
                      dataKey="tenants"
                      nameKey="tier"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {tierSeries.map((entry, idx) => (
                        <Cell key={entry.tier} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
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

      {document.sections.map((sec, secIdx) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={document.currency}
          actionRenderer={
            secIdx === 0
              ? (_row, idx) => {
                  const target = rows[idx]
                  if (!target) return null
                  return (
                    <button
                      type="button"
                      onClick={() => onInspectTenant(target.tenantId)}
                      className="px-2.5 py-1 rounded-lg bg-[#6d25da]/10 hover:bg-[#6d25da]/20 text-[#6d25da] dark:text-[#c5a8f0] text-[11px] font-semibold transition cursor-pointer"
                    >
                      Inspect Tenant →
                    </button>
                  )
                }
              : undefined
          }
        />
      ))}
    </div>
  )
}

export function PlatformHealthReportView({
  rows,
  document,
  onInspectTenant,
}: {
  rows: PlatformTenantReportRowClient[]
  document: ReportDocument
  onInspectTenant: (tenantId: string) => void
}) {
  const chartData = rows.map((r) => ({
    tenantName: r.tenantName,
    seatUtilPct: Math.round(r.seatUtilizationPct * 100),
    activeProjects: r.activeProjects,
  }))

  return (
    <div className="space-y-5">
      <KpiGrid kpis={document.kpis} />

      <ChartCard
        title="Seat Capacity Utilization per Tenant (%)"
        subtitle="Monitors tenants approaching their plan seat limits (≥85% upgrade watch)"
      >
        {chartData.length === 0 ? (
          <ChartEmptyState message="No tenant usage records available." />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="tenantName" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="seatUtilPct" name="Seat Utilization %" radius={[6, 6, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell
                      key={d.tenantName}
                      fill={d.seatUtilPct >= 85 ? '#f59e0b' : '#6d25da'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {document.sections.map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={document.currency}
          actionRenderer={(_row, idx) => {
            const target = rows[idx]
            if (!target) return null
            return (
              <button
                type="button"
                onClick={() => onInspectTenant(target.tenantId)}
                className="px-2.5 py-1 rounded-lg bg-[#6d25da]/10 hover:bg-[#6d25da]/20 text-[#6d25da] dark:text-[#c5a8f0] text-[11px] font-semibold transition cursor-pointer"
              >
                Open Reports →
              </button>
            )
          }}
        />
      ))}
    </div>
  )
}

export function PlatformOperationsReportView({
  rows,
  document,
  onInspectTenant,
}: {
  rows: PlatformTenantReportRowClient[]
  document: ReportDocument
  onInspectTenant: (tenantId: string) => void
}) {
  return (
    <div className="space-y-5">
      <KpiGrid kpis={document.kpis} />

      <ChartCard
        title="Claimed vs. Supported vs. Approved Hours by Tenant"
        subtitle="Each tenant's time ledger compared side by side without mixing tenant data"
      >
        {rows.length === 0 ? (
          <ChartEmptyState message="No operational telemetry across tenants yet." />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="tenantName" tick={{ fontSize: 11 }} />
                <YAxis unit="h" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="claimedHours" name="Claimed (h)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="supportedHours" name="Supported (h)" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="approvedBillableHours" name="Approved (h)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {document.sections.map((sec) => (
        <StructuredDataTable
          key={sec.sheetName}
          title={sec.title}
          description={sec.description}
          columns={sec.columns}
          rows={sec.rows}
          totalsRow={sec.totalsRow}
          currency={document.currency}
          actionRenderer={(_row, idx) => {
            const target = rows[idx]
            if (!target) return null
            return (
              <button
                type="button"
                onClick={() => onInspectTenant(target.tenantId)}
                className="px-2.5 py-1 rounded-lg bg-[#6d25da]/10 hover:bg-[#6d25da]/20 text-[#6d25da] dark:text-[#c5a8f0] text-[11px] font-semibold transition cursor-pointer"
              >
                Drill Into Tenant →
              </button>
            )
          }}
        />
      ))}
    </div>
  )
}
