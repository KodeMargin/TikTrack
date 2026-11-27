import { useState } from 'react'
import { usePhase4Store } from '@/context/Phase4Store'
import { PHASE4_PLAN_CATALOG } from '@/lib/phase4/saasBilling'
import type {
  OutboundWebhookEventType,
  PublicApiScope,
} from '@/types/domain.types'
import { Select } from '@/components/Select'

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

const INPUT_CLS =
  'w-full rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#702fe3]/30 focus:border-[#702fe3] transition'

const LABEL_CLS = 'block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1'

const CARD_CLS =
  'rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-sm p-5'

export function PublicApiAndWebhooksPanel({
  onFeedback,
}: {
  onFeedback?: (msg: { ok: boolean; text: string }) => void
}) {
  const {
    subscription,
    apiKeys,
    webhookEndpoints,
    webhookDeliveries,
    createScopedApiKey,
    revokeApiKey,
    testPublicApiEndpoint,
    createWebhookEndpoint,
    dispatchTestOutboundWebhook,
  } = usePhase4Store()

  const planSpec = PHASE4_PLAN_CATALOG[subscription.planTier]
  const webhooksAllowed = planSpec.outboundWebhooksEnabled

  const [copiedId, setCopiedId] = useState<string | null>(null)
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
  const [apiTestResult, setApiTestResult] = useState('')
  const [testingApi, setTestingApi] = useState(false)

  const [whName, setWhName] = useState('Automation / Zapier Listener')
  const [whUrl, setWhUrl] = useState('')
  const [whEvents, setWhEvents] = useState<OutboundWebhookEventType[]>([
    'timesheet.approved',
    'invoice.finalized',
  ])
  const [whSecretReveal, setWhSecretReveal] = useState<string | null>(null)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)

  function copyToClipboard(id: string, value: string) {
    void navigator.clipboard?.writeText(value)
    setCopiedId(id)
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800)
  }

  async function handleCreateApiKey(e: React.FormEvent) {
    e.preventDefault()
    const res = await createScopedApiKey({
      name: keyName,
      scopes: selectedScopes,
      rateLimitPerMin,
    })
    onFeedback?.({ ok: res.ok, text: res.message })
    if (res.ok && res.plaintextKey) {
      setNewlyCreatedKey(res.plaintextKey)
      setTestBearerKey(res.plaintextKey)
    }
  }

  async function handleTestApiCall() {
    setTestingApi(true)
    try {
      const res = await testPublicApiEndpoint({
        bearerKey: testBearerKey,
        resource: testResource,
      })
      setApiTestResult(
        `GET /api/prisma/v1/${testResource} → HTTP ${res.statusCode}\n${JSON.stringify(res.payload, null, 2)}`
      )
    } finally {
      setTestingApi(false)
    }
  }

  async function handleCreateWebhook(e: React.FormEvent) {
    e.preventDefault()
    const res = await createWebhookEndpoint({
      name: whName,
      targetUrl: whUrl,
      subscribedEvents: whEvents,
    })
    onFeedback?.({ ok: res.ok, text: res.message })
    if (res.ok && res.signingSecret) {
      setWhSecretReveal(res.signingSecret)
      setWhUrl('')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Public API Keys + Live REST API v1 Tester */}
      <div className={`lg:col-span-6 ${CARD_CLS} space-y-5`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Public REST API Keys
          </h3>
          <code className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
            /api/prisma/v1/*
          </code>
        </div>

        <form onSubmit={(e) => void handleCreateApiKey(e)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className={LABEL_CLS}>Key Name</label>
              <input
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g. PowerBI / ERP Sync"
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

        {/* Live HTTP API Tester */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="text-xs font-bold text-zinc-900 dark:text-white">
            Live API Request Tester
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-6">
              <label className={LABEL_CLS}>Bearer API Key</label>
              <input
                type="text"
                placeholder="Paste key here"
                value={testBearerKey}
                onChange={(e) => setTestBearerKey(e.target.value)}
                className={`${INPUT_CLS} font-mono`}
              />
            </div>
            <div className="sm:col-span-3">
              <label className={LABEL_CLS}>Endpoint</label>
              <Select
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
              </Select>
            </div>
            <div className="sm:col-span-3 flex items-end">
              <button
                type="button"
                disabled={testingApi}
                onClick={() => void handleTestApiCall()}
                className="w-full py-2 rounded-xl bg-[#6d25da]/[0.08] hover:bg-[#702fe3] text-[#581eae] hover:text-white ring-1 ring-[#6d25da]/20 hover:ring-[#702fe3] dark:bg-[#6d25da]/20 dark:hover:bg-[#702fe3] dark:text-[#c5a8f0] dark:hover:text-white text-xs font-semibold cursor-pointer transition disabled:opacity-50"
              >
                {testingApi ? 'Calling...' : 'Send GET'}
              </button>
            </div>
          </div>
          {apiTestResult && (
            <pre className="rounded-xl bg-zinc-50 dark:bg-zinc-950 ring-1 ring-zinc-200 dark:ring-zinc-800 p-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 max-h-44 overflow-auto">
              {apiTestResult}
            </pre>
          )}
        </div>
      </div>

      {/* Real Outbound Webhooks */}
      <div className={`lg:col-span-6 ${CARD_CLS} space-y-5`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Outbound Webhooks (Live HTTP POST)
          </h3>
          {webhooksAllowed ? (
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              HMAC-SHA256
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#6d25da]/12 text-[#581eae] dark:bg-[#8b51e1]/20 dark:text-[#c5a8f0]">
              Team+ Plan Required
            </span>
          )}
        </div>

        {!webhooksAllowed && (
          <div className="rounded-xl border border-[#6d25da]/25 bg-[#6d25da]/[0.06] dark:bg-[#8b51e1]/10 px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-300">
            Outbound webhooks are unlocked starting on the <strong className="text-[#581eae] dark:text-[#c5a8f0]">Team</strong> plan (currently on <strong className="uppercase">{subscription.planTier}</strong>).
          </div>
        )}

        <form onSubmit={(e) => void handleCreateWebhook(e)} className={`space-y-4 ${!webhooksAllowed ? 'opacity-60 pointer-events-none select-none' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Webhook Name</label>
              <input
                type="text"
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                placeholder="e.g. Zapier / n8n / Custom ERP"
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
                placeholder="https://webhook.site/... or https://hooks.zapier.com/..."
                className={`${INPUT_CLS} font-mono`}
                required
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Trigger Events</label>
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
            className="w-full py-2.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition cursor-pointer"
          >
            Add Webhook Endpoint
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
                  disabled={dispatchingId === ep.id}
                  onClick={() => {
                    setDispatchingId(ep.id)
                    void dispatchTestOutboundWebhook({
                      endpointId: ep.id,
                      eventType: ep.subscribedEvents[0] ?? 'timesheet.approved',
                    })
                      .then((res) => onFeedback?.({ ok: res.ok, text: res.message }))
                      .finally(() => setDispatchingId(null))
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-[11px] font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {dispatchingId === ep.id ? 'Sending...' : 'Send Live Test'}
                </button>
              </div>
            ))}
          </div>
        )}

        {webhookDeliveries.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <div className="text-xs font-bold text-zinc-900 dark:text-white">
              Recent Outbound Deliveries
            </div>
            {webhookDeliveries.slice(0, 5).map((d) => {
              const failed = d.deliveryStatus === 'failed'
              return (
                <div
                  key={d.id}
                  className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3 py-2 text-[11px] space-y-0.5"
                >
                  <div className="flex items-center justify-between font-medium text-zinc-800 dark:text-zinc-200">
                    <span className="font-mono">{d.eventType}</span>
                    <span
                      className={`font-semibold ${
                        failed
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {failed ? 'Failed' : 'Delivered'} (HTTP {d.httpStatus ?? 0})
                    </span>
                  </div>
                  {d.responseSnippet && (
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                      Response: {d.responseSnippet}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
