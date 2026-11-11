import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase4Store } from '@/context/Phase4Store'
import {
  calculateSaasSubscriptionTotals,
  PHASE4_PLAN_CATALOG,
} from '@/lib/phase4/saasBilling'
import {
  buildQuickBooksInvoicePayload,
  buildXeroInvoiceCsv,
} from '@/lib/phase4/ecosystemConnectors'
import {
  formatPortableReportMarkdown,
  verifyPortableWorkReportSignature,
} from '@/lib/phase4/portableReport'
import type {
  BillingProvider,
  EcosystemConnectorProvider,
  OutboundWebhookEventType,
  PublicApiScope,
  SaasPlanTier,
} from '@/types/domain.types'

type Phase4Tab =
  | 'plans-usage'
  | 'forecast-accounting'
  | 'api-webhooks'
  | 'connectors-whitelabel'
  | 'portable-report'

const ALL_SCOPES: PublicApiScope[] = [
  'projects:read',
  'tasks:read',
  'tasks:write',
  'timesheets:read',
  'invoices:read',
  'webhooks:manage',
]

const ALL_WEBHOOK_EVENTS: OutboundWebhookEventType[] = [
  'timesheet.approved',
  'dispute.opened',
  'dispute.resolved',
  'invoice.finalized',
  'usage.threshold_reached',
]

export function SaasBillingAndEcosystemView() {
  const { activeTenant, activeUser, projects, tasks, invoices } = usePhase1Store()
  const {
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
  } = usePhase4Store()

  const isDeveloper = activeUser.role === 'developer'
  const isClient = activeUser.role === 'client_reviewer'
  const isOwnerOrAdmin =
    activeUser.role === 'tenant_owner' || activeUser.role === 'finance' || activeUser.role === 'project_manager'

  const [tab, setTab] = useState<Phase4Tab>(() =>
    isDeveloper ? 'portable-report' : 'plans-usage'
  )
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  // Plan checkout state
  const [billingProvider, setBillingProvider] = useState<BillingProvider>('stripe')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  // Accounting export preview
  const [accountingPreview, setAccountingPreview] = useState<string>('')

  // API key state
  const [keyName, setKeyName] = useState('CI / ERP Sync Key')
  const [selectedScopes, setSelectedScopes] = useState<PublicApiScope[]>([
    'projects:read',
    'tasks:read',
    'timesheets:read',
  ])
  const [rateLimitPerMin, setRateLimitPerMin] = useState(120)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [testBearerKey, setTestBearerKey] = useState('')
  const [testResource, setTestResource] = useState<
    'projects' | 'tasks' | 'timesheets' | 'invoices'
  >('projects')
  const [apiTestResult, setApiTestResult] = useState<string>('')

  // Outbound webhook state
  const [whName, setWhName] = useState('Finance & ERP Listener')
  const [whUrl, setWhUrl] = useState('https://erp.example.com/webhooks/devproof')
  const [whEvents, setWhEvents] = useState<OutboundWebhookEventType[]>([
    'timesheet.approved',
    'invoice.finalized',
  ])
  const [whSecretReveal, setWhSecretReveal] = useState<string | null>(null)

  // Calendar sync state
  const [calProjectId, setCalProjectId] = useState(() => projects[0]?.id ?? '')
  const [calTitle, setCalTitle] = useState('Sprint Architecture Review — alice@acme.com')
  const [calScope, setCalScope] = useState<'metadata_only' | 'title_and_duration'>(
    'title_and_duration'
  )
  const [calDurationMins, setCalDurationMins] = useState(45)

  // External PM import state
  const [pmProvider, setPmProvider] = useState<'jira' | 'linear' | 'trello' | 'azure_devops'>('linear')
  const [pmKey, setPmKey] = useState('LIN-408')
  const [pmTitle, setPmTitle] = useState('Implement webhook retry dead-letter alert')
  const [pmEstimate, setPmEstimate] = useState(180)

  // White-label branding form
  const [brandDraft, setBrandDraft] = useState(() => whiteLabelBranding)

  // Portable report state
  const [reportTitle, setReportTitle] = useState(
    `${activeUser.name} — Verified Engineering Hours`
  )
  const [periodStart, setPeriodStart] = useState('2026-11-01')
  const [periodEnd, setPeriodEnd] = useState('2026-11-30')
  const [verifiedReportIds, setVerifiedReportIds] = useState<Record<string, boolean>>({})

  if (isClient) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-amber-300 font-bold">
          Client Reviewer Boundary (F4-005 & F4-012)
        </div>
        <h2 className="text-lg font-bold text-white">
          SaaS Administration & Internal Ecosystem Restricted
        </h2>
        <p className="text-xs text-slate-300 max-w-2xl">
          External Client Reviewers only have read-only access to the{' '}
          <strong>Client Portal</strong> tab showing approved project hours, deliverables,
          and finalized client invoices.
        </p>
      </div>
    )
  }

  function downloadTextFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleCreateApiKey(e: React.FormEvent) {
    e.preventDefault()
    const res = await createScopedApiKey({
      name: keyName,
      scopes: selectedScopes,
      rateLimitPerMin,
    })
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok && res.plaintextKey) {
      setNewlyCreatedKey(res.plaintextKey)
      setTestBearerKey(res.plaintextKey)
    }
  }

  async function handleTestApiCall() {
    const res = await testPublicApiEndpoint({
      bearerKey: testBearerKey,
      resource: testResource,
    })
    setApiTestResult(`HTTP ${res.statusCode}\n${JSON.stringify(res.payload, null, 2)}`)
  }

  async function handleCreateWebhook(e: React.FormEvent) {
    e.preventDefault()
    const res = await createWebhookEndpoint({
      name: whName,
      targetUrl: whUrl,
      subscribedEvents: whEvents,
    })
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok && res.signingSecret) {
      setWhSecretReveal(res.signingSecret)
    }
  }

  async function handleGeneratePortableReport(e: React.FormEvent) {
    e.preventDefault()
    const res = await generateDeveloperPortableReport({
      reportTitle,
      periodStart,
      periodEnd,
    })
    setBanner({ ok: res.ok, text: res.message })
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            banner.ok
              ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
              : 'border-rose-700 bg-rose-950/60 text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'plans-usage' as const, label: 'Plans, Metering & SaaS Billing', show: isOwnerOrAdmin },
          { id: 'forecast-accounting' as const, label: 'Forecasting & Accounting Exports', show: isOwnerOrAdmin },
          { id: 'api-webhooks' as const, label: 'Public API & Outbound Webhooks', show: isOwnerOrAdmin },
          { id: 'connectors-whitelabel' as const, label: 'Calendar, PM & White-Label', show: true },
          { id: 'portable-report' as const, label: 'Developer Portable Report', show: true },
        ]
          .filter((t) => t.show)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === item.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
      </div>

      {/* TAB 1: Plans, Metering & Strictly Separate SaaS Invoices (F4-001..F4-004) */}
      {tab === 'plans-usage' && isOwnerOrAdmin && (
        <div className="space-y-6">
          {/* Graceful Limit Handling Banner */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-bold text-emerald-300 uppercase tracking-wider text-[11px]">
                F4-004 · Graceful Quota Protection Active
              </div>
              <p className="text-slate-300 mt-0.5">
                Core time tracking (`work_sessions` & `time_segments`) is{' '}
                <strong>ALWAYS ACTIVE</strong> and never drops data on quota overage. Only
                optional LLM drafting or high-frequency telemetry degrades gracefully.
              </p>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-300">
              <div>Plan: <span className="text-white font-bold uppercase">{subscription.planTier}</span> ({subscription.status})</div>
              <div>Telemetry Mode: <span className="text-emerald-300">{quotaReport.highFreqTelemetryMode}</span></div>
            </div>
          </div>

          {quotaReport.alerts.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 space-y-1 text-xs text-amber-200">
              {quotaReport.alerts.map((a, idx) => (
                <div key={idx}>{a}</div>
              ))}
            </div>
          )}

          {/* Plan Selection & Checkout */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Self-Service Subscription Lifecycle (F4-001)
                </h3>
                <p className="text-xs text-slate-400">
                  Switch plans or simulate Stripe/Paddle checkout. Entitlements sync immediately.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <select
                  value={billingProvider}
                  onChange={(e) => setBillingProvider(e.target.value as BillingProvider)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                >
                  <option value="stripe">Stripe Billing</option>
                  <option value="paddle">Paddle MoR</option>
                </select>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as 'monthly' | 'annual')}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual (15% off)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['starter', 'team', 'agency', 'enterprise'] as SaasPlanTier[]).map((tier) => {
                const spec = PHASE4_PLAN_CATALOG[tier]
                const isCurrent = subscription.planTier === tier
                const totals = calculateSaasSubscriptionTotals(
                  tier,
                  Math.max(1, usageSnapshot.activeSeats),
                  billingCycle
                )
                return (
                  <div
                    key={tier}
                    className={`rounded-xl border p-4 flex flex-col justify-between space-y-3 ${
                      isCurrent
                        ? 'border-indigo-500 bg-indigo-950/25'
                        : 'border-slate-800 bg-slate-950/70'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">{spec.displayName}</span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">{spec.tagline}</p>
                      <div className="text-lg font-bold font-mono text-white pt-1">
                        ${(totals.totalCents / 100).toFixed(0)}
                        <span className="text-[11px] font-normal text-slate-400">
                          /{billingCycle === 'annual' ? 'yr' : 'mo'} ({Math.max(1, usageSnapshot.activeSeats)} seats)
                        </span>
                      </div>
                      <ul className="text-[11px] text-slate-300 space-y-1 pt-2">
                        <li>• Up to {spec.maxSeats} seats / {spec.maxActiveProjects} projects</li>
                        <li>• {(spec.monthlyEventQuota / 1000).toLocaleString()}k events/mo</li>
                        <li>• {spec.clientPortalEnabled ? 'Client Portal + White-Label' : 'Internal Review Only'}</li>
                        <li>• {spec.accountingConnectorsEnabled ? 'Xero & QuickBooks Exports' : 'CSV Invoice Export'}</li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const res = checkoutSubscriptionPlan({
                          planTier: tier,
                          billingProvider,
                          billingCycle,
                        })
                        setBanner({ ok: res.ok, text: res.message })
                      }}
                      className={`w-full py-2 rounded-lg text-xs font-semibold cursor-pointer transition ${
                        isCurrent
                          ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                          : 'bg-indigo-600 text-white hover:bg-indigo-500'
                      }`}
                    >
                      {isCurrent ? 'Renew / Issue SaaS Invoice' : `Switch to ${spec.displayName}`}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Seat & Usage Metering + Separate SaaS Invoices */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">
                Seat & Usage Metering (`usage_records` — F4-002)
              </h3>
              <div className="space-y-3">
                {quotaReport.metrics.map((m) => (
                  <div key={m.key} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 font-medium">{m.label}</span>
                      <span className="font-mono text-slate-300">
                        {m.used.toLocaleString()} / {m.limit.toLocaleString()} ({m.percent}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          m.state === 'overage_graceful'
                            ? 'bg-amber-500'
                            : m.state === 'warning_80'
                              ? 'bg-amber-400'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, m.percent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Public API Requests Today: {usageSnapshot.apiRequestsCount}</span>
                <span>Webhook Deliveries: {usageSnapshot.webhookDeliveriesCount}</span>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                  F4-003 · Separate Platform Billing Ledger
                </span>
                <h3 className="text-sm font-bold text-white">
                  SaaS Subscription Invoices (Separate from Client/Freelancer Work Invoices)
                </h3>
              </div>
              {saasInvoices.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-5 text-xs text-slate-400 text-center">
                  No platform SaaS invoices yet. Select a plan above to generate your first SaaS subscription receipt.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {saasInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-mono font-bold text-white">
                          {inv.invoiceNumber}{' '}
                          <span className="text-indigo-300 uppercase">({inv.planTier})</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Period: {inv.billingPeriodLabel} · {inv.seatsBilled} seat(s) · {inv.status}
                        </div>
                      </div>
                      <div className="text-sm font-bold font-mono text-emerald-300">
                        {inv.currency} {(inv.totalCents / 100).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Advanced Forecasting & Accounting Exports (F4-009, F4-011) */}
      {tab === 'forecast-accounting' && isOwnerOrAdmin && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">
                Project Forecasting & Unreviewed Billing Exposure (F4-011)
              </h3>
              <p className="text-xs text-slate-400">
                Tracks estimate accuracy, pending unreviewed exposure, approved spend, and projected remaining backlog cost.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-3">Project</th>
                    <th className="py-2 pr-3 text-right">Est. Accuracy</th>
                    <th className="py-2 pr-3 text-right">Approved Spend</th>
                    <th className="py-2 pr-3 text-right">Unreviewed Exposure</th>
                    <th className="py-2 pr-3 text-right">Projected Remaining</th>
                    <th className="py-2 text-right">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {projectForecasts.map((f) => (
                    <tr key={f.projectId} className="text-slate-200">
                      <td className="py-2.5 pr-3">
                        <span className="font-mono text-indigo-300 mr-1.5">{f.projectCode}</span>
                        <span className="font-medium text-white">{f.projectName}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono">{f.estimateAccuracyPercent}%</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-emerald-300">
                        {activeTenant.currency} {f.approvedSpendAmount.toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-amber-300">
                        {activeTenant.currency} {f.unreviewedExposureAmount.toFixed(2)} (
                        {(f.unreviewedExposureMinutes / 60).toFixed(1)}h)
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono">
                        {activeTenant.currency} {f.projectedRemainingCost.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                            f.riskLevel === 'over_estimate'
                              ? 'bg-rose-500/20 text-rose-300'
                              : f.riskLevel === 'watch'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {f.riskLevel.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Accounting Connectors: Xero & QuickBooks (F4-009) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Accounting Exports & Connectors — Xero & QuickBooks (F4-009)
                </h3>
                <p className="text-xs text-slate-400">
                  Exports finalized client work invoices to Xero CSV or QuickBooks Online JSON without raw workstation telemetry.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(['xero', 'quickbooks'] as const).map((prov) => {
                  const connected = connectors.some(
                    (c) => c.provider === prov && c.status === 'connected'
                  )
                  return (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => {
                        const res = toggleEcosystemConnector({
                          category: 'accounting',
                          provider: prov,
                          displayName: prov === 'xero' ? 'Xero Accounting' : 'QuickBooks Online',
                          syncConfig: { accountCode: '200', taxType: 'OUTPUT' },
                        })
                        setBanner({ ok: res.ok, text: res.message })
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        connected
                          ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                          : 'border-slate-700 bg-slate-950 text-slate-300'
                      }`}
                    >
                      {prov === 'xero' ? 'Xero' : 'QuickBooks'}: {connected ? 'Connected' : 'Connect'}
                    </button>
                  )
                })}
              </div>
            </div>

            {invoices.length === 0 ? (
              <p className="text-xs text-slate-400">
                Create a client work invoice in Billing & Rates first to export to Xero or QuickBooks.
              </p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-white">{inv.invoiceNumber}</span>{' '}
                      <span className="text-slate-400">
                        · {inv.clientName} · {inv.currency} {inv.totalAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const csv = buildXeroInvoiceCsv(inv)
                          setAccountingPreview(csv)
                          downloadTextFile(`${inv.invoiceNumber}-xero.csv`, csv, 'text/csv')
                        }}
                        className="px-2.5 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-semibold cursor-pointer"
                      >
                        Export Xero CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const qb = JSON.stringify(buildQuickBooksInvoicePayload(inv), null, 2)
                          setAccountingPreview(qb)
                          downloadTextFile(
                            `${inv.invoiceNumber}-quickbooks.json`,
                            qb,
                            'application/json'
                          )
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold cursor-pointer"
                      >
                        Export QuickBooks JSON
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {accountingPreview && (
              <pre className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48">
                {accountingPreview}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Public API & Outbound Webhooks (F4-006, F4-007) */}
      {tab === 'api-webhooks' && isOwnerOrAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Scoped API Keys */}
          <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">
                Scoped Public API Keys (`dp_live_...` — F4-006)
              </h3>
              <p className="text-xs text-slate-400">
                Keys are SHA-256 hashed at rest. Never exposes raw workstation telemetry.
              </p>
            </div>

            <form onSubmit={(e) => void handleCreateApiKey(e)} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="API Key Name"
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                  required
                />
                <input
                  type="number"
                  min={10}
                  value={rateLimitPerMin}
                  onChange={(e) => setRateLimitPerMin(Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {ALL_SCOPES.map((sc) => {
                  const active = selectedScopes.includes(sc)
                  return (
                    <button
                      key={sc}
                      type="button"
                      onClick={() =>
                        setSelectedScopes((prev) =>
                          prev.includes(sc) ? prev.filter((x) => x !== sc) : [...prev, sc]
                        )
                      }
                      className={`px-2 py-1 rounded text-[11px] font-mono border cursor-pointer ${
                        active
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {sc}
                    </button>
                  )
                })}
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
              >
                Generate Scoped API Key
              </button>
            </form>

            {newlyCreatedKey && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs space-y-1">
                <div className="font-semibold text-emerald-300">One-Time Key Secret:</div>
                <div className="font-mono text-white break-all">{newlyCreatedKey}</div>
              </div>
            )}

            <div className="space-y-2">
              {apiKeys.map((k) => (
                <div
                  key={k.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">
                      {k.name}{' '}
                      <span className="font-mono text-slate-400">({k.keyPrefix}...)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {k.scopes.join(', ')} · {k.rateLimitPerMin}/min
                    </div>
                  </div>
                  {k.revokedAt ? (
                    <span className="text-[11px] text-rose-400 font-semibold">Revoked</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revokeApiKey(k.id)}
                      className="px-2.5 py-1 rounded bg-rose-900/50 hover:bg-rose-800 text-rose-200 text-[11px] cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Public API Interactive Tester */}
            <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-200">
                Public API Endpoint Tester (`/v1/public-api`)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste dp_live_... key"
                  value={testBearerKey}
                  onChange={(e) => setTestBearerKey(e.target.value)}
                  className="flex-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-white"
                />
                <select
                  value={testResource}
                  onChange={(e) =>
                    setTestResource(
                      e.target.value as 'projects' | 'tasks' | 'timesheets' | 'invoices'
                    )
                  }
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white"
                >
                  <option value="projects">projects</option>
                  <option value="tasks">tasks</option>
                  <option value="timesheets">timesheets</option>
                  <option value="invoices">invoices</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleTestApiCall()}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                >
                  Call
                </button>
              </div>
              {apiTestResult && (
                <pre className="rounded border border-slate-800 bg-slate-950 p-2.5 text-[11px] font-mono text-slate-300 max-h-40 overflow-auto">
                  {apiTestResult}
                </pre>
              )}
            </div>
          </div>

          {/* Outbound Signed Webhooks */}
          <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">
                Outbound Signed Webhooks (`X-DevProof-Signature-256` — F4-007)
              </h3>
              <p className="text-xs text-slate-400">
                Dispatches HMAC-SHA256 signed events on approvals, disputes, and finalized invoices.
              </p>
            </div>

            <form onSubmit={(e) => void handleCreateWebhook(e)} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  placeholder="Endpoint Name"
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                  required
                />
                <input
                  type="url"
                  value={whUrl}
                  onChange={(e) => setWhUrl(e.target.value)}
                  placeholder="https://..."
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                  required
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {ALL_WEBHOOK_EVENTS.map((ev) => {
                  const active = whEvents.includes(ev)
                  return (
                    <button
                      key={ev}
                      type="button"
                      onClick={() =>
                        setWhEvents((prev) =>
                          prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]
                        )
                      }
                      className={`px-2 py-1 rounded text-[11px] font-mono border cursor-pointer ${
                        active
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {ev}
                    </button>
                  )
                })}
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-semibold cursor-pointer"
              >
                Register Outbound Webhook Endpoint
              </button>
            </form>

            {whSecretReveal && (
              <div className="rounded-lg border border-cyan-500/40 bg-cyan-950/30 p-3 text-xs">
                <span className="font-semibold text-cyan-300">Signing Secret: </span>
                <span className="font-mono text-white break-all">{whSecretReveal}</span>
              </div>
            )}

            <div className="space-y-2">
              {webhookEndpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{ep.name}</div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {ep.targetUrl}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void dispatchTestOutboundWebhook({
                        endpointId: ep.id,
                        eventType: ep.subscribedEvents[0] ?? 'timesheet.approved',
                      }).then((res) => setBanner({ ok: res.ok, text: res.message }))
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                  >
                    Dispatch Signed Event
                  </button>
                </div>
              ))}
            </div>

            {webhookDeliveries.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="text-xs font-semibold text-slate-300">Recent Signed Deliveries</div>
                {webhookDeliveries.slice(0, 5).map((d) => (
                  <div
                    key={d.id}
                    className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] font-mono space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-slate-200">
                      <span>{d.eventType}</span>
                      <span className="text-emerald-300">
                        {d.deliveryStatus} ({d.httpStatus ?? 202})
                      </span>
                    </div>
                    <div className="text-slate-500 truncate">
                      X-DevProof-Signature-256: {d.signatureHeader}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Calendar, External PM & White-Label Branding (F4-008, F4-010, F4-012) */}
      {tab === 'connectors-whitelabel' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Calendar & Meeting Metadata (F4-008) */}
          <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Permissioned Calendar Integrations (F4-008)
                </h3>
                <p className="text-xs text-slate-400">
                  Associates meeting metadata to `meeting` work mode without leaking private emails.
                </p>
              </div>
              <div className="flex gap-1.5">
                {(['google_calendar', 'outlook_calendar'] as EcosystemConnectorProvider[]).map(
                  (prov) => {
                    const active = connectors.some(
                      (c) => c.provider === prov && c.status === 'connected'
                    )
                    return (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => {
                          const res = toggleEcosystemConnector({
                            category: 'calendar',
                            provider: prov,
                            displayName:
                              prov === 'google_calendar' ? 'Google Calendar' : 'Outlook Calendar',
                          })
                          setBanner({ ok: res.ok, text: res.message })
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                          active
                            ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                            : 'border-slate-700 bg-slate-950 text-slate-300'
                        }`}
                      >
                        {prov === 'google_calendar' ? 'Google' : 'Outlook'}
                      </button>
                    )
                  }
                )}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <input
                type="text"
                value={calTitle}
                onChange={(e) => setCalTitle(e.target.value)}
                placeholder="Calendar Event Title"
                className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={calProjectId}
                  onChange={(e) => setCalProjectId(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </select>
                <select
                  value={calScope}
                  onChange={(e) =>
                    setCalScope(e.target.value as 'metadata_only' | 'title_and_duration')
                  }
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white"
                >
                  <option value="metadata_only">metadata_only</option>
                  <option value="title_and_duration">title_and_duration</option>
                </select>
                <input
                  type="number"
                  min={15}
                  value={calDurationMins}
                  onChange={(e) => setCalDurationMins(Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const start = new Date()
                  const end = new Date(start.getTime() + calDurationMins * 60000)
                  const res = syncCalendarMeeting({
                    projectId: calProjectId || projects[0]?.id || '',
                    taskId: tasks[0]?.id,
                    rawTitle: calTitle,
                    startedAtUtc: start.toISOString(),
                    endedAtUtc: end.toISOString(),
                    syncPermissionScope: calScope,
                  })
                  setBanner({ ok: res.ok, text: res.message })
                }}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
              >
                Associate Calendar Meeting Metadata
              </button>
            </div>

            {calendarMeetings.length > 0 && (
              <div className="space-y-1.5">
                {calendarMeetings.slice(0, 4).map((m) => (
                  <div
                    key={m.id}
                    className="rounded border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs flex items-center justify-between"
                  >
                    <span className="text-slate-200">{m.meetingTitleSanitized}</span>
                    <span className="font-mono text-[11px] text-indigo-300">
                      {m.durationMinutes}m · {m.syncPermissionScope}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* External PM Import (F4-010) & Agency White-Label Branding (F4-012) */}
          <div className="lg:col-span-6 space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-white">
                External PM Integration — Jira / Linear / Trello / Azure DevOps (F4-010)
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={pmProvider}
                  onChange={(e) =>
                    setPmProvider(
                      e.target.value as 'jira' | 'linear' | 'trello' | 'azure_devops'
                    )
                  }
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white"
                >
                  <option value="linear">Linear</option>
                  <option value="jira">Jira</option>
                  <option value="trello">Trello</option>
                  <option value="azure_devops">Azure DevOps</option>
                </select>
                <input
                  type="text"
                  value={pmKey}
                  onChange={(e) => setPmKey(e.target.value)}
                  placeholder="Issue Key"
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                />
                <input
                  type="number"
                  min={30}
                  value={pmEstimate}
                  onChange={(e) => setPmEstimate(Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <input
                type="text"
                value={pmTitle}
                onChange={(e) => setPmTitle(e.target.value)}
                placeholder="External Issue Title"
                className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
              />
              <button
                type="button"
                onClick={() => {
                  const res = importExternalPmIssue({
                    projectId: calProjectId || projects[0]?.id || '',
                    provider: pmProvider,
                    externalKey: pmKey,
                    title: pmTitle,
                    acceptanceCriteria: `Synced from ${pmProvider.toUpperCase()} (${pmKey})`,
                    estimateMinutes: pmEstimate,
                    priority: 'high',
                  })
                  setBanner({ ok: res.ok, text: res.message })
                }}
                className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
              >
                Import External PM Ticket into DevProof Tasks
              </button>
            </div>

            {isOwnerOrAdmin && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    White-Label Agency Client Portal Branding (F4-012)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Available on Agency & Enterprise plans. Strictly preserves read-only client data boundaries and forbids impersonation.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={brandDraft.agencyBrandName}
                    onChange={(e) =>
                      setBrandDraft((b) => ({ ...b, agencyBrandName: e.target.value }))
                    }
                    placeholder="Agency Brand Name"
                    className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                  />
                  <input
                    type="text"
                    value={brandDraft.customDomain}
                    onChange={(e) =>
                      setBrandDraft((b) => ({ ...b, customDomain: e.target.value }))
                    }
                    placeholder="Custom Domain"
                    className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                  />
                  <input
                    type="text"
                    value={brandDraft.logoText}
                    maxLength={4}
                    onChange={(e) =>
                      setBrandDraft((b) => ({ ...b, logoText: e.target.value.toUpperCase() }))
                    }
                    placeholder="Logo Monogram"
                    className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                  />
                  <input
                    type="color"
                    value={brandDraft.accentColorHex}
                    onChange={(e) =>
                      setBrandDraft((b) => ({ ...b, accentColorHex: e.target.value }))
                    }
                    className="h-8 w-full rounded border border-slate-700 bg-slate-950 px-1"
                  />
                </div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={brandDraft.hideDevProofWatermark}
                    onChange={(e) =>
                      setBrandDraft((b) => ({
                        ...b,
                        hideDevProofWatermark: e.target.checked,
                      }))
                    }
                  />
                  <span>Hide DevProof watermark on external Client Portal</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const res = updateWhiteLabelBranding(brandDraft)
                    setBanner({ ok: res.ok, text: res.message })
                  }}
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                >
                  Save Agency Branding Config
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Developer Portable Work Report (F4-013) */}
      {tab === 'portable-report' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">
                Developer Portable Work Report (F4-013)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Export a cryptographically signed summary of <strong>your own</strong> approved
                session hours and linked deliverable outcomes across projects.
              </p>
            </div>

            <form
              onSubmit={(e) => void handleGeneratePortableReport(e)}
              className="space-y-3 text-xs"
            >
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                  required
                />
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold cursor-pointer"
              >
                Generate Signed Portable Report (JSON + Markdown)
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">
              Your Signed Portable Reports
            </h3>
            {portableReports.filter((r) => r.developerUserId === activeUser.id).length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
                No portable reports generated for {activeUser.name} yet.
              </div>
            ) : (
              <div className="space-y-3">
                {portableReports
                  .filter((r) => r.developerUserId === activeUser.id)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/80 p-4 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-white">{r.reportTitle}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {r.periodStart} → {r.periodEnd} · {(r.totalApprovedMinutes / 60).toFixed(2)}h approved · {r.deliverablesCount} deliverable(s)
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void verifyPortableWorkReportSignature(r).then((valid) => {
                                setVerifiedReportIds((prev) => ({ ...prev, [r.id]: valid }))
                              })
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px] cursor-pointer"
                          >
                            {verifiedReportIds[r.id] ? 'Signature Valid ✓' : 'Verify Signature'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadTextFile(
                                `${r.id}.json`,
                                JSON.stringify(r.reportPayload, null, 2),
                                'application/json'
                              )
                            }
                            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] cursor-pointer"
                          >
                            JSON
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadTextFile(
                                `${r.id}.md`,
                                formatPortableReportMarkdown(r),
                                'text/markdown'
                              )
                            }
                            className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] cursor-pointer"
                          >
                            Markdown
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate">
                        SHA-256: {r.payloadDigestSha256} | HMAC: {r.signatureHmacSha256}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

