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

const SCOPE_OPTIONS: { value: PublicApiScope; label: string }[] = [
  { value: 'projects:read', label: 'Read Projects' },
  { value: 'tasks:read', label: 'Read Tasks' },
  { value: 'tasks:write', label: 'Edit Tasks' },
  { value: 'timesheets:read', label: 'Read Timesheets' },
  { value: 'invoices:read', label: 'Read Invoices' },
  { value: 'webhooks:manage', label: 'Manage Webhooks' },
]

const WEBHOOK_EVENT_OPTIONS: { value: OutboundWebhookEventType; label: string }[] = [
  { value: 'timesheet.approved', label: 'Timesheet Approved' },
  { value: 'dispute.opened', label: 'Dispute Opened' },
  { value: 'dispute.resolved', label: 'Dispute Resolved' },
  { value: 'invoice.finalized', label: 'Invoice Finalized' },
  { value: 'usage.threshold_reached', label: 'Usage Limit Reached' },
]

const RISK_BADGE: Record<string, { label: string; cls: string }> = {
  on_track: {
    label: 'On Track',
    cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20',
  },
  watch: {
    label: 'Watch',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20',
  },
  over_estimate: {
    label: 'Over Budget',
    cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20',
  },
}

const INPUT_CLS =
  'w-full rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#702fe3]/30 focus:border-[#702fe3] transition'

const LABEL_CLS = 'block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1'

const CARD_CLS =
  'rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-sm p-5'

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
    activeUser.role === 'super_admin' ||
    activeUser.role === 'tenant_owner' ||
    activeUser.role === 'finance' ||
    activeUser.role === 'project_manager'

  const [tab, setTab] = useState<Phase4Tab>(() =>
    isDeveloper ? 'portable-report' : 'plans-usage'
  )
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

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
  const [whUrl, setWhUrl] = useState('https://erp.example.com/webhooks/tiktrack')
  const [whEvents, setWhEvents] = useState<OutboundWebhookEventType[]>([
    'timesheet.approved',
    'invoice.finalized',
  ])
  const [whSecretReveal, setWhSecretReveal] = useState<string | null>(null)

  // Calendar sync state
  const [calProjectId, setCalProjectId] = useState(() => projects[0]?.id ?? '')
  const [calTitle, setCalTitle] = useState('Sprint Architecture Review')
  const [calScope, setCalScope] = useState<'metadata_only' | 'title_and_duration'>(
    'title_and_duration'
  )
  const [calDurationMins, setCalDurationMins] = useState(45)

  // External PM import state
  const [pmProjectId, setPmProjectId] = useState(() => projects[0]?.id ?? '')
  const [pmProvider, setPmProvider] = useState<'jira' | 'linear' | 'trello' | 'azure_devops'>(
    'linear'
  )
  const [pmKey, setPmKey] = useState('LIN-408')
  const [pmTitle, setPmTitle] = useState('Implement webhook retry dead-letter alert')
  const [pmEstimate, setPmEstimate] = useState(180)

  // Workspace branding form
  const [brandDraft, setBrandDraft] = useState(() => whiteLabelBranding)

  // Portable report state
  const [reportTitle, setReportTitle] = useState(`${activeUser.name} - Verified Work Summary`)
  const [periodStart, setPeriodStart] = useState('2026-11-01')
  const [periodEnd, setPeriodEnd] = useState('2026-11-30')
  const [verifiedReportIds, setVerifiedReportIds] = useState<Record<string, boolean>>({})

  if (isClient) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-6 space-y-2">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          Restricted Area
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xl">
          Your role does not have access to workspace plans, integrations, or API settings.
        </p>
      </div>
    )
  }

  const allTabs: { id: Phase4Tab; label: string; show: boolean }[] = [
    { id: 'plans-usage', label: 'Usage & Plan', show: isOwnerOrAdmin },
    { id: 'forecast-accounting', label: 'Budget & Accounting', show: isOwnerOrAdmin },
    { id: 'api-webhooks', label: 'API & Webhooks', show: isOwnerOrAdmin },
    { id: 'connectors-whitelabel', label: 'Calendar, Tools & Branding', show: true },
    { id: 'portable-report', label: 'Work Reports', show: true },
  ]
  const visibleTabs = allTabs.filter((t) => t.show)
  const activeTab: Phase4Tab = visibleTabs.some((t) => t.id === tab)
    ? tab
    : (visibleTabs[0]?.id ?? 'connectors-whitelabel')

  const currentPlanSpec = PHASE4_PLAN_CATALOG[subscription.planTier]
  const resolvedCalProjectId = calProjectId || projects[0]?.id || ''
  const resolvedPmProjectId = pmProjectId || projects[0]?.id || ''

  function copyToClipboard(id: string, value: string) {
    void navigator.clipboard?.writeText(value)
    setCopiedId(id)
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800)
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

  const myPortableReports = portableReports.filter(
    (r) => r.developerUserId === activeUser.id
  )

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {banner && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-medium flex items-center justify-between ring-1 ${
            banner.ok
              ? 'bg-emerald-50/90 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 ring-emerald-500/25'
              : 'bg-rose-50/90 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 ring-rose-500/25'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="ml-4 font-semibold underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header + Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            SaaS &amp; Ecosystem
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/25 px-2.5 py-0.5 text-[11px] font-semibold text-[#581eae] dark:text-[#c5a8f0]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#702fe3] dark:bg-[#c5a8f0]" />
            {currentPlanSpec.displayName} Plan
          </span>
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900/90 p-1">
          {visibleTabs.map((item) => {
            const selected = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selected
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* TAB 1: Usage & Plan */}
      {activeTab === 'plans-usage' && isOwnerOrAdmin && (
        <div className="space-y-6">
          {/* Top KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={CARD_CLS}>
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                Current Plan
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-lg font-bold text-zinc-900 dark:text-white">
                  {currentPlanSpec.displayName}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-emerald-700 dark:text-emerald-300">
                  {subscription.status}
                </span>
              </div>
            </div>

            <div className={CARD_CLS}>
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                Active Seats
              </div>
              <div className="mt-1.5 text-lg font-bold font-mono text-zinc-900 dark:text-white">
                {usageSnapshot.activeSeats}{' '}
                <span className="text-xs font-normal text-zinc-400">
                  / {currentPlanSpec.maxSeats}
                </span>
              </div>
            </div>

            <div className={CARD_CLS}>
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                Active Projects
              </div>
              <div className="mt-1.5 text-lg font-bold font-mono text-zinc-900 dark:text-white">
                {usageSnapshot.activeProjects}{' '}
                <span className="text-xs font-normal text-zinc-400">
                  / {currentPlanSpec.maxActiveProjects}
                </span>
              </div>
            </div>

            <div className={CARD_CLS}>
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                API &amp; Webhooks Today
              </div>
              <div className="mt-1.5 text-lg font-bold font-mono text-zinc-900 dark:text-white">
                {usageSnapshot.apiRequestsCount}{' '}
                <span className="text-xs font-normal text-zinc-400">
                  calls · {usageSnapshot.webhookDeliveriesCount} webhooks
                </span>
              </div>
            </div>
          </div>

          {quotaReport.alerts.length > 0 && (
            <div className="rounded-2xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-1 text-xs text-amber-800 dark:text-amber-200">
              {quotaReport.alerts.map((a, idx) => (
                <div key={idx}>{a}</div>
              ))}
            </div>
          )}

          {/* Usage Metering & Platform Subscription Receipts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className={`lg:col-span-6 ${CARD_CLS} space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Workspace Usage Limits
                </h3>
                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  Quota Protection On
                </span>
              </div>

              <div className="space-y-3.5">
                {quotaReport.metrics.map((m) => (
                  <div key={m.key} className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {m.label}
                      </span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">
                        {m.used.toLocaleString()} / {m.limit.toLocaleString()} ({m.percent}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          m.state === 'overage_graceful'
                            ? 'bg-rose-500'
                            : m.state === 'warning_80'
                              ? 'bg-amber-400'
                              : 'bg-[#702fe3]'
                        }`}
                        style={{ width: `${Math.min(100, m.percent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`lg:col-span-6 ${CARD_CLS} space-y-4`}>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Platform Billing Receipts
              </h3>

              {saasInvoices.length === 0 ? (
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-6 text-xs text-zinc-500 dark:text-zinc-400 text-center">
                  No subscription receipts yet. Switch or renew a plan below to generate one.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {saasInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3.5 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-zinc-900 dark:text-white">
                            {inv.invoiceNumber}
                          </span>
                          <span className="rounded-md bg-[#6d25da]/10 dark:bg-[#6d25da]/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#581eae] dark:text-[#c5a8f0]">
                            {inv.planTier}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {inv.billingPeriodLabel} · {inv.seatsBilled} seat(s) · {inv.status}
                        </div>
                      </div>
                      <div className="text-sm font-bold font-mono text-zinc-900 dark:text-white shrink-0">
                        {inv.currency} {(inv.totalCents / 100).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Plan Switcher */}
          <div className={`${CARD_CLS} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Manage Workspace Plan
              </h3>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  aria-label="Billing Provider"
                  value={billingProvider}
                  onChange={(e) => setBillingProvider(e.target.value as BillingProvider)}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-white"
                >
                  <option value="stripe">Stripe</option>
                  <option value="paddle">Paddle</option>
                </select>
                <select
                  aria-label="Billing Cycle"
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as 'monthly' | 'annual')}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-white"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual (Save 15%)</option>
                </select>
                <a
                  href="/pricing"
                  onClick={(e) => {
                    e.preventDefault()
                    window.history.pushState({}, '', '/pricing')
                    window.dispatchEvent(new PopStateEvent('popstate'))
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#6d25da]/10 dark:bg-[#6d25da]/20 text-[#581eae] dark:text-[#c5a8f0] font-semibold hover:bg-[#6d25da]/15 transition cursor-pointer"
                >
                  Compare All Plans →
                </a>
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
                    className={`rounded-2xl p-4 flex flex-col justify-between space-y-4 transition ${
                      isCurrent
                        ? 'bg-[#702fe3]/[0.05] dark:bg-[#702fe3]/15 ring-2 ring-[#702fe3]'
                        : 'bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08]'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-zinc-900 dark:text-white">
                          {spec.displayName}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-[#702fe3] px-2 py-0.5 text-[10px] font-semibold text-white">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
                        ${(totals.totalCents / 100).toFixed(0)}
                        <span className="text-[11px] font-sans font-normal text-zinc-500 dark:text-zinc-400">
                          /{billingCycle === 'annual' ? 'yr' : 'mo'} ·{' '}
                          {Math.max(1, usageSnapshot.activeSeats)} seat(s)
                        </span>
                      </div>

                      <ul className="text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1.5 pt-1">
                        <li>✓ Up to {spec.maxSeats} seats &amp; {spec.maxActiveProjects} projects</li>
                        <li>✓ {(spec.monthlyEventQuota / 1000).toLocaleString()}k activity events / mo</li>
                        <li>
                          ✓ {spec.whiteLabelEnabled ? 'Custom Workspace Branding' : 'Standard Branding'}
                        </li>
                        <li>
                          ✓ {spec.accountingConnectorsEnabled ? 'Xero & QuickBooks Export' : 'CSV Invoice Export'}
                        </li>
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
                      className={`w-full py-2 rounded-xl text-xs font-semibold cursor-pointer transition ${
                        isCurrent
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                          : 'bg-[#702fe3] text-white hover:bg-[#5f21cc]'
                      }`}
                    >
                      {isCurrent ? 'Renew Plan' : `Switch to ${spec.displayName}`}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Budget & Accounting */}
      {activeTab === 'forecast-accounting' && isOwnerOrAdmin && (
        <div className="space-y-6">
          {/* Project Budget Forecast */}
          <div className={`${CARD_CLS} space-y-4`}>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Project Budget Forecast
            </h3>

            {projectForecasts.length === 0 ? (
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                No projects yet. Create a project in Projects &amp; Tasks to see budget forecasts.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="py-2.5 pr-4">Project</th>
                      <th className="py-2.5 pr-4 text-right">Estimate Accuracy</th>
                      <th className="py-2.5 pr-4 text-right">Approved Cost</th>
                      <th className="py-2.5 pr-4 text-right">Pending Review</th>
                      <th className="py-2.5 pr-4 text-right">Remaining Estimate</th>
                      <th className="py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                    {projectForecasts.map((f) => {
                      const badge = RISK_BADGE[f.riskLevel] ?? RISK_BADGE.on_track
                      return (
                        <tr key={f.projectId} className="text-zinc-800 dark:text-zinc-200">
                          <td className="py-3 pr-4">
                            <span className="font-mono font-semibold text-[#6d25da] dark:text-[#c5a8f0] mr-2">
                              {f.projectCode}
                            </span>
                            <span className="font-medium text-zinc-900 dark:text-white">
                              {f.projectName}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right font-mono">
                            {f.estimateAccuracyPercent}%
                          </td>
                          <td className="py-3 pr-4 text-right font-mono">
                            {activeTenant.currency} {f.approvedSpendAmount.toFixed(2)}
                          </td>
                          <td className="py-3 pr-4 text-right font-mono text-amber-700 dark:text-amber-300">
                            {activeTenant.currency} {f.unreviewedExposureAmount.toFixed(2)} (
                            {(f.unreviewedExposureMinutes / 60).toFixed(1)}h)
                          </td>
                          <td className="py-3 pr-4 text-right font-mono">
                            {activeTenant.currency} {f.projectedRemainingCost.toFixed(2)}
                          </td>
                          <td className="py-3 text-right">
                            <span
                              className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Accounting Exports */}
          <div className={`${CARD_CLS} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Accounting Software &amp; Exports
              </h3>
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
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition cursor-pointer ${
                        connected
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30'
                          : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          connected ? 'bg-emerald-500' : 'bg-zinc-400'
                        }`}
                      />
                      {prov === 'xero' ? 'Xero' : 'QuickBooks'}:{' '}
                      {connected ? 'Connected' : 'Connect'}
                    </button>
                  )
                })}
              </div>
            </div>

            {invoices.length === 0 ? (
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                No client invoices yet. Create one in Contracts &amp; Invoicing to export to Xero or QuickBooks.
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-zinc-900 dark:text-white">
                        {inv.invoiceNumber}
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {' '}
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
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 font-semibold transition cursor-pointer"
                      >
                        Xero CSV
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
                        className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold transition cursor-pointer"
                      >
                        QuickBooks JSON
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {accountingPreview && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  <span>Last Export Preview</span>
                  <button
                    type="button"
                    onClick={() => setAccountingPreview('')}
                    className="underline cursor-pointer"
                  >
                    Hide
                  </button>
                </div>
                <pre className="rounded-xl bg-zinc-50 dark:bg-zinc-950 ring-1 ring-zinc-200 dark:ring-zinc-800 p-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 overflow-x-auto max-h-48">
                  {accountingPreview}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: API & Webhooks */}
      {activeTab === 'api-webhooks' && isOwnerOrAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* API Keys */}
          <div className={`lg:col-span-6 ${CARD_CLS} space-y-5`}>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              API Keys
            </h3>

            <form onSubmit={(e) => void handleCreateApiKey(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}>Key Name</label>
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. ERP Sync Key"
                    className={INPUT_CLS}
                    required
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Requests / Min</label>
                  <input
                    type="number"
                    min={10}
                    value={rateLimitPerMin}
                    onChange={(e) => setRateLimitPerMin(Number(e.target.value))}
                    className={`${INPUT_CLS} font-mono`}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLS}>Allowed Access</label>
                <div className="flex flex-wrap gap-1.5">
                  {SCOPE_OPTIONS.map((sc) => {
                    const active = selectedScopes.includes(sc.value)
                    return (
                      <button
                        key={sc.value}
                        type="button"
                        title={sc.value}
                        onClick={() =>
                          setSelectedScopes((prev) =>
                            prev.includes(sc.value)
                              ? prev.filter((x) => x !== sc.value)
                              : [...prev, sc.value]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 transition cursor-pointer ${
                          active
                            ? 'bg-[#702fe3]/10 dark:bg-[#702fe3]/25 text-[#581eae] dark:text-[#c5a8f0] ring-[#702fe3]/40'
                            : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 ring-zinc-200 dark:ring-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {sc.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition cursor-pointer"
              >
                Create API Key
              </button>
            </form>

            {newlyCreatedKey && (
              <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 ring-1 ring-emerald-500/30 p-3.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-200">
                    New API Key (shown once)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('api-key', newlyCreatedKey)}
                    className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 ring-1 ring-emerald-500/30 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
                  >
                    {copiedId === 'api-key' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <div className="font-mono text-[11px] text-zinc-900 dark:text-white break-all">
                  {newlyCreatedKey}
                </div>
              </div>
            )}

            {apiKeys.length > 0 && (
              <div className="space-y-2">
                {apiKeys.map((k) => (
                  <div
                    key={k.id}
                    className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-900 dark:text-white truncate">
                        {k.name}{' '}
                        <span className="font-mono font-normal text-zinc-500 dark:text-zinc-400">
                          ({k.keyPrefix}…)
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {k.scopes.join(', ')} · {k.rateLimitPerMin}/min
                      </div>
                    </div>
                    {k.revokedAt ? (
                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                        Revoked
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => revokeApiKey(k.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] font-semibold cursor-pointer shrink-0"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Quick API Tester */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                Test an API Request
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-6">
                  <label className={LABEL_CLS}>API Key</label>
                  <input
                    type="text"
                    placeholder="Paste key here"
                    value={testBearerKey}
                    onChange={(e) => setTestBearerKey(e.target.value)}
                    className={`${INPUT_CLS} font-mono`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={LABEL_CLS}>Data</label>
                  <select
                    value={testResource}
                    onChange={(e) =>
                      setTestResource(
                        e.target.value as 'projects' | 'tasks' | 'timesheets' | 'invoices'
                      )
                    }
                    className={INPUT_CLS}
                  >
                    <option value="projects">Projects</option>
                    <option value="tasks">Tasks</option>
                    <option value="timesheets">Timesheets</option>
                    <option value="invoices">Invoices</option>
                  </select>
                </div>
                <div className="sm:col-span-3 flex items-end">
                  <button
                    type="button"
                    onClick={() => void handleTestApiCall()}
                    className="w-full py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 text-xs font-semibold cursor-pointer"
                  >
                    Send Test
                  </button>
                </div>
              </div>
              {apiTestResult && (
                <pre className="rounded-xl bg-zinc-50 dark:bg-zinc-950 ring-1 ring-zinc-200 dark:ring-zinc-800 p-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 max-h-40 overflow-auto">
                  {apiTestResult}
                </pre>
              )}
            </div>
          </div>

          {/* Outbound Webhooks */}
          <div className={`lg:col-span-6 ${CARD_CLS} space-y-5`}>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Outbound Webhooks
            </h3>

            <form onSubmit={(e) => void handleCreateWebhook(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Webhook Name</label>
                  <input
                    type="text"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    placeholder="e.g. Accounting Sync"
                    className={INPUT_CLS}
                    required
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Target URL</label>
                  <input
                    type="url"
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                    placeholder="https://..."
                    className={`${INPUT_CLS} font-mono`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLS}>Send Notifications For</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEBHOOK_EVENT_OPTIONS.map((ev) => {
                    const active = whEvents.includes(ev.value)
                    return (
                      <button
                        key={ev.value}
                        type="button"
                        title={ev.value}
                        onClick={() =>
                          setWhEvents((prev) =>
                            prev.includes(ev.value)
                              ? prev.filter((x) => x !== ev.value)
                              : [...prev, ev.value]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 transition cursor-pointer ${
                          active
                            ? 'bg-sky-500/10 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 ring-sky-500/40'
                            : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 ring-zinc-200 dark:ring-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {ev.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 text-xs font-semibold transition cursor-pointer"
              >
                Add Webhook
              </button>
            </form>

            {whSecretReveal && (
              <div className="rounded-xl bg-sky-50/80 dark:bg-sky-950/30 ring-1 ring-sky-500/30 p-3.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sky-800 dark:text-sky-200">
                    Signing Secret (shown once)
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('wh-secret', whSecretReveal)}
                    className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 ring-1 ring-sky-500/30 text-[11px] font-semibold text-sky-700 dark:text-sky-300 cursor-pointer"
                  >
                    {copiedId === 'wh-secret' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <div className="font-mono text-[11px] text-zinc-900 dark:text-white break-all">
                  {whSecretReveal}
                </div>
              </div>
            )}

            {webhookEndpoints.length > 0 && (
              <div className="space-y-2">
                {webhookEndpoints.map((ep) => (
                  <div
                    key={ep.id}
                    className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-900 dark:text-white truncate">
                        {ep.name}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
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
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                    >
                      Send Test
                    </button>
                  </div>
                ))}
              </div>
            )}

            {webhookDeliveries.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div className="text-xs font-bold text-zinc-900 dark:text-white">
                  Recent Deliveries
                </div>
                {webhookDeliveries.slice(0, 5).map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3 py-2 text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between font-medium text-zinc-800 dark:text-zinc-200">
                      <span className="font-mono">{d.eventType}</span>
                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                        {d.deliveryStatus} ({d.httpStatus ?? 202})
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                      Signature: {d.signatureHeader}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Calendar, Tools & Branding */}
      {activeTab === 'connectors-whitelabel' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Calendar Sync */}
          <div className={`lg:col-span-6 ${CARD_CLS} space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Calendar Sync
              </h3>
              <div className="flex items-center gap-1.5">
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
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 transition cursor-pointer ${
                          active
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30'
                            : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            active ? 'bg-emerald-500' : 'bg-zinc-400'
                          }`}
                        />
                        {prov === 'google_calendar' ? 'Google' : 'Outlook'}
                        {active ? ' · Connected' : ''}
                      </button>
                    )
                  }
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className={LABEL_CLS}>Meeting Title</label>
                <input
                  type="text"
                  value={calTitle}
                  onChange={(e) => setCalTitle(e.target.value)}
                  placeholder="e.g. Sprint Planning"
                  className={INPUT_CLS}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={LABEL_CLS}>Project</label>
                  <select
                    value={resolvedCalProjectId}
                    onChange={(e) => setCalProjectId(e.target.value)}
                    className={INPUT_CLS}
                  >
                    {projects.length === 0 ? (
                      <option value="">No projects yet</option>
                    ) : (
                      projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className={LABEL_CLS}>What to Sync</label>
                  <select
                    value={calScope}
                    onChange={(e) =>
                      setCalScope(e.target.value as 'metadata_only' | 'title_and_duration')
                    }
                    className={INPUT_CLS}
                  >
                    <option value="title_and_duration">Title &amp; Duration</option>
                    <option value="metadata_only">Time &amp; Duration Only</option>
                  </select>
                </div>

                <div>
                  <label className={LABEL_CLS}>Duration (mins)</label>
                  <input
                    type="number"
                    min={5}
                    value={calDurationMins}
                    onChange={(e) => setCalDurationMins(Number(e.target.value))}
                    className={`${INPUT_CLS} font-mono`}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const start = new Date()
                  const end = new Date(start.getTime() + calDurationMins * 60000)
                  const res = syncCalendarMeeting({
                    projectId: resolvedCalProjectId,
                    taskId: tasks[0]?.id,
                    rawTitle: calTitle,
                    startedAtUtc: start.toISOString(),
                    endedAtUtc: end.toISOString(),
                    syncPermissionScope: calScope,
                  })
                  setBanner({ ok: res.ok, text: res.message })
                }}
                className="w-full py-2.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition cursor-pointer"
              >
                Log Calendar Meeting
              </button>
            </div>

            {calendarMeetings.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  Recent Synced Meetings
                </div>
                {calendarMeetings.slice(0, 4).map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3 py-2 text-xs flex items-center justify-between gap-2"
                  >
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium truncate">
                      {m.meetingTitleSanitized}
                    </span>
                    <span className="font-mono text-[11px] text-[#581eae] dark:text-[#c5a8f0] shrink-0">
                      {m.durationMinutes}m ·{' '}
                      {m.syncPermissionScope === 'metadata_only' ? 'Time only' : 'Title + time'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Import External Task + Workspace Branding */}
          <div className="lg:col-span-6 space-y-6">
            {/* Import External Task */}
            <div className={`${CARD_CLS} space-y-4`}>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Import External Task
              </h3>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Tool</label>
                    <select
                      value={pmProvider}
                      onChange={(e) =>
                        setPmProvider(
                          e.target.value as 'jira' | 'linear' | 'trello' | 'azure_devops'
                        )
                      }
                      className={INPUT_CLS}
                    >
                      <option value="linear">Linear</option>
                      <option value="jira">Jira</option>
                      <option value="trello">Trello</option>
                      <option value="azure_devops">Azure DevOps</option>
                    </select>
                  </div>

                  <div>
                    <label className={LABEL_CLS}>Target Project</label>
                    <select
                      value={resolvedPmProjectId}
                      onChange={(e) => setPmProjectId(e.target.value)}
                      className={INPUT_CLS}
                    >
                      {projects.length === 0 ? (
                        <option value="">No projects yet</option>
                      ) : (
                        projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Ticket Key</label>
                    <input
                      type="text"
                      value={pmKey}
                      onChange={(e) => setPmKey(e.target.value)}
                      placeholder="e.g. LIN-408"
                      className={`${INPUT_CLS} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Estimate (mins)</label>
                    <input
                      type="number"
                      min={15}
                      value={pmEstimate}
                      onChange={(e) => setPmEstimate(Number(e.target.value))}
                      className={`${INPUT_CLS} font-mono`}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={LABEL_CLS}>Task Title</label>
                    <input
                      type="text"
                      value={pmTitle}
                      onChange={(e) => setPmTitle(e.target.value)}
                      placeholder="Describe the task to import"
                      className={INPUT_CLS}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const res = importExternalPmIssue({
                      projectId: resolvedPmProjectId,
                      provider: pmProvider,
                      externalKey: pmKey,
                      title: pmTitle,
                      acceptanceCriteria: `Synced from ${pmProvider.toUpperCase()} (${pmKey})`,
                      estimateMinutes: pmEstimate,
                      priority: 'high',
                    })
                    setBanner({ ok: res.ok, text: res.message })
                  }}
                  className="w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 text-xs font-semibold transition cursor-pointer"
                >
                  Import to Projects &amp; Tasks
                </button>
              </div>
            </div>

            {/* Workspace Branding (Admin / Owner / Super Admin) */}
            {isOwnerOrAdmin && (
              <div className={`${CARD_CLS} space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Workspace Branding
                  </h3>
                  {!currentPlanSpec.whiteLabelEnabled && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      Agency+ Plan
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Brand Name</label>
                    <input
                      type="text"
                      value={brandDraft.agencyBrandName}
                      onChange={(e) =>
                        setBrandDraft((b) => ({ ...b, agencyBrandName: e.target.value }))
                      }
                      placeholder="Your Company Name"
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLS}>Custom Domain</label>
                    <input
                      type="text"
                      value={brandDraft.customDomain}
                      onChange={(e) =>
                        setBrandDraft((b) => ({ ...b, customDomain: e.target.value }))
                      }
                      placeholder="app.yourdomain.com"
                      className={`${INPUT_CLS} font-mono`}
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLS}>Logo Monogram (max 4 chars)</label>
                    <input
                      type="text"
                      value={brandDraft.logoText}
                      maxLength={4}
                      onChange={(e) =>
                        setBrandDraft((b) => ({ ...b, logoText: e.target.value.toUpperCase() }))
                      }
                      placeholder="TT"
                      className={`${INPUT_CLS} font-mono`}
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLS}>Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandDraft.accentColorHex}
                        onChange={(e) =>
                          setBrandDraft((b) => ({ ...b, accentColorHex: e.target.value }))
                        }
                        className="h-9 w-12 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-1 cursor-pointer shrink-0"
                      />
                      <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">
                        {brandDraft.accentColorHex}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tactile Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={brandDraft.hideDevProofWatermark}
                  onClick={() =>
                    setBrandDraft((b) => ({
                      ...b,
                      hideDevProofWatermark: !b.hideDevProofWatermark,
                    }))
                  }
                  className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3.5 py-3 flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                      Hide TikTrack Watermark
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Remove platform branding from exported reports and invoices
                    </div>
                  </div>
                  <span
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      brandDraft.hideDevProofWatermark
                        ? 'bg-[#702fe3]'
                        : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                        brandDraft.hideDevProofWatermark ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const res = updateWhiteLabelBranding(brandDraft)
                    setBanner({ ok: res.ok, text: res.message })
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition cursor-pointer"
                >
                  Save Branding
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Work Reports */}
      {activeTab === 'portable-report' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className={`lg:col-span-5 ${CARD_CLS} space-y-4`}>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Create Verified Work Report
            </h3>

            <form
              onSubmit={(e) => void handleGeneratePortableReport(e)}
              className="space-y-3"
            >
              <div>
                <label className={LABEL_CLS}>Report Title</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className={INPUT_CLS}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Start Date</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className={`${INPUT_CLS} font-mono`}
                    required
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>End Date</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className={`${INPUT_CLS} font-mono`}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition cursor-pointer"
              >
                Generate Signed Report
              </button>
            </form>
          </div>

          <div className={`lg:col-span-7 ${CARD_CLS} space-y-4`}>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Your Generated Reports
            </h3>

            {myPortableReports.length === 0 ? (
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                No work reports generated for {activeUser.name} yet.
              </div>
            ) : (
              <div className="space-y-3">
                {myPortableReports.map((r) => {
                  const isVerified = verifiedReportIds[r.id]
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-4 space-y-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-zinc-900 dark:text-white">
                            {r.reportTitle}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                            {r.periodStart} → {r.periodEnd} ·{' '}
                            {(r.totalApprovedMinutes / 60).toFixed(2)}h approved ·{' '}
                            {r.deliverablesCount} deliverable(s)
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              void verifyPortableWorkReportSignature(r).then((valid) => {
                                setVerifiedReportIds((prev) => ({ ...prev, [r.id]: valid }))
                              })
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 transition cursor-pointer ${
                              isVerified
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30'
                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                            }`}
                          >
                            {isVerified ? 'Verified ✓' : 'Verify'}
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
                            className="px-2.5 py-1 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white text-[11px] font-semibold cursor-pointer"
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
                            className="px-2.5 py-1 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 text-[11px] font-semibold cursor-pointer"
                          >
                            Markdown
                          </button>
                        </div>
                      </div>

                      <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                        Verification Hash: {r.payloadDigestSha256}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
