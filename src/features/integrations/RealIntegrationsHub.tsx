import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase4Store } from '@/context/Phase4Store'
import {
  connectRealIntegrationViaPrisma,
  disconnectRealIntegrationViaPrisma,
  fetchCalendarOAuthStatusViaPrisma,
  fetchRealCalendarEventsViaPrisma,
  fetchRealIntegrationItemsViaPrisma,
  sendChatTestAlertViaPrisma,
  type RealCalendarEventItem,
  type RealExternalTaskItem,
} from '@/lib/prismaApiClient'
import {
  INTEGRATION_PROVIDERS,
  type ConnectorCategory,
  type ProviderGuideSpec,
} from '@/features/integrations/integrationGuides'
import { IntegrationBrandLogo } from '@/features/integrations/IntegrationBrandLogo'

const CATEGORY_TABS: { id: ConnectorCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All Tools' },
  { id: 'pm', label: 'Project Management' },
  { id: 'git', label: 'Git & Code' },
  { id: 'chat', label: 'Chat Alerts' },
  { id: 'calendar', label: 'Calendars' },
]

const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  pm: 'Project Management',
  git: 'Git & Code',
  chat: 'Chat Alerts',
  calendar: 'Calendar · OAuth 2.0',
}

const CARD_CLS =
  'group rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] hover:ring-[#6d25da]/25 dark:hover:ring-[#a87ce9]/30 shadow-sm p-5 transition-all duration-200'

const SOFT_VIOLET_BTN =
  'bg-[#6d25da]/[0.08] hover:bg-[#702fe3] text-[#581eae] hover:text-white ring-1 ring-[#6d25da]/20 hover:ring-[#702fe3] dark:bg-[#6d25da]/20 dark:hover:bg-[#702fe3] dark:text-[#c5a8f0] dark:hover:text-white transition-all duration-150'

const INPUT_CLS =
  'w-full rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#702fe3]/30 focus:border-[#702fe3] transition'

const LABEL_CLS = 'block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1'

export function RealIntegrationsHub({
  onFeedback,
}: {
  onFeedback?: (msg: { ok: boolean; text: string }) => void
}) {
  const { activeTenant, activeUser, isSuperAdminSession, projects, tasks, createTask } =
    usePhase1Store()
  const isPlatformAdmin = activeUser.role === 'super_admin' || isSuperAdminSession
  const {
    connectors,
    upsertRealConnectorState,
    removeRealConnectorState,
    syncCalendarMeeting,
  } = usePhase4Store()

  const [categoryFilter, setCategoryFilter] = useState<ConnectorCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null)
  const [credDraft, setCredDraft] = useState<Record<string, string>>({})
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({})
  const [modalError, setModalError] = useState<string | null>(null)
  const [busyProvider, setBusyProvider] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Live ticket importer state
  const [importSourceProvider, setImportSourceProvider] = useState<string | null>(null)
  const [liveItems, setLiveItems] = useState<RealExternalTaskItem[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [targetProjectId, setTargetProjectId] = useState(() => projects[0]?.id ?? '')
  const [itemSearch, setItemSearch] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)

  // Calendar OAuth status & live events
  const [oauthStatus, setOauthStatus] = useState({
    googleConfigured: false,
    microsoftConfigured: false,
  })
  const [calendarEvents, setCalendarEvents] = useState<RealCalendarEventItem[]>([])
  const [calendarSyncScope, setCalendarSyncScope] = useState<
    'title_and_duration' | 'metadata_only'
  >('title_and_duration')

  useEffect(() => {
    void fetchCalendarOAuthStatusViaPrisma().then(setOauthStatus)

    const params = new URLSearchParams(window.location.search)
    const oauthResult = params.get('oauth')
    const oauthErr = params.get('oauth_error')
    if (oauthResult) {
      onFeedback?.({
        ok: true,
        text:
          oauthResult === 'google_connected'
            ? 'Google Calendar connected via OAuth.'
            : 'Outlook Calendar connected via OAuth.',
      })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (oauthErr) {
      onFeedback?.({ ok: false, text: oauthErr })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [onFeedback])

  // Close setup modal on Escape
  useEffect(() => {
    if (!activeGuideId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSetupModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeGuideId])

  const resolvedTargetProjectId = targetProjectId || projects[0]?.id || ''
  const activeGuideSpec = INTEGRATION_PROVIDERS.find((p) => p.id === activeGuideId) ?? null

  function getConnector(providerId: string) {
    return connectors.find((c) => c.provider === providerId && c.status === 'connected')
  }

  function openSetupModal(spec: ProviderGuideSpec) {
    setActiveGuideId(spec.id)
    setModalError(null)
    setRevealedFields({})
    setCredDraft(spec.id === 'gitlab' ? { baseUrl: 'https://gitlab.com' } : {})
  }

  function closeSetupModal() {
    setActiveGuideId(null)
    setModalError(null)
    setCredDraft({})
    setRevealedFields({})
  }

  function copyValue(id: string, value: string) {
    void navigator.clipboard?.writeText(value)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey((curr) => (curr === id ? null : curr)), 1800)
  }

  async function handleConnectSubmit(spec: ProviderGuideSpec, e: React.FormEvent) {
    e.preventDefault()
    setModalError(null)
    setBusyProvider(spec.id)
    try {
      const res = await connectRealIntegrationViaPrisma({
        tenantId: activeTenant.id,
        provider: spec.id,
        credentials: credDraft,
        connectedBy: activeUser.id,
      })
      if (res.ok && res.connector) {
        upsertRealConnectorState(res.connector)
        closeSetupModal()
        onFeedback?.({ ok: true, text: res.message || `${spec.name} connected.` })
      } else {
        setModalError(res.error || `Could not verify ${spec.name} credentials.`)
      }
    } finally {
      setBusyProvider(null)
    }
  }

  async function handleDisconnect(providerId: string, name: string) {
    setBusyProvider(providerId)
    try {
      const res = await disconnectRealIntegrationViaPrisma({
        tenantId: activeTenant.id,
        provider: providerId,
      })
      if (res.ok) {
        removeRealConnectorState(providerId)
        if (importSourceProvider === providerId) {
          setImportSourceProvider(null)
          setLiveItems([])
        }
        onFeedback?.({ ok: true, text: res.message || `${name} disconnected.` })
      } else {
        onFeedback?.({ ok: false, text: res.error || `Failed to disconnect ${name}.` })
      }
    } finally {
      setBusyProvider(null)
    }
  }

  async function handleFetchLiveItems(providerId: string, name: string) {
    setImportSourceProvider(providerId)
    setLoadingItems(true)
    setSelectedItemIds([])
    setItemSearch('')
    try {
      const res = await fetchRealIntegrationItemsViaPrisma({
        tenantId: activeTenant.id,
        provider: providerId,
      })
      if (res.ok) {
        setLiveItems(res.items)
        if (res.items.length === 0) {
          onFeedback?.({ ok: true, text: `Connected to ${name}, but no open items were found.` })
        }
      } else {
        setLiveItems([])
        onFeedback?.({ ok: false, text: res.error || `Failed to fetch items from ${name}.` })
      }
    } finally {
      setLoadingItems(false)
    }
  }

  function handleImportSelectedItems() {
    if (!resolvedTargetProjectId) {
      onFeedback?.({
        ok: false,
        text: 'Create a project in Projects & Tasks first before importing tasks.',
      })
      return
    }
    const chosen = liveItems.filter((item) => selectedItemIds.includes(item.id))
    if (chosen.length === 0) {
      onFeedback?.({ ok: false, text: 'Select at least one task to import.' })
      return
    }
    for (const item of chosen) {
      createTask({
        projectId: resolvedTargetProjectId,
        code: item.externalKey,
        title: item.title,
        acceptanceCriteria: item.url
          ? `Imported from ${item.provider.toUpperCase()} (${item.externalKey}) - ${item.url}`
          : `Imported from ${item.provider.toUpperCase()} (${item.externalKey})`,
        status: 'active',
        priority: item.priority,
        estimateMinutes: item.estimateMinutes || 120,
        isBillable: true,
        defaultWorkMode: 'coding',
        assignedMemberIds: [activeUser.id],
        dueDate: new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10),
      })
    }
    setSelectedItemIds([])
    onFeedback?.({
      ok: true,
      text: `Imported ${chosen.length} live task(s) into Projects & Tasks.`,
    })
  }

  async function handleSendChatTest(provider: 'slack' | 'discord' | 'ms_teams') {
    setBusyProvider(provider)
    try {
      const res = await sendChatTestAlertViaPrisma({
        tenantId: activeTenant.id,
        provider,
      })
      onFeedback?.({
        ok: res.ok,
        text: res.message || res.error || (res.ok ? 'Test message sent.' : 'Delivery failed.'),
      })
    } finally {
      setBusyProvider(null)
    }
  }

  async function handleFetchCalendar(provider: 'google_calendar' | 'outlook_calendar') {
    setBusyProvider(provider)
    try {
      const res = await fetchRealCalendarEventsViaPrisma({
        tenantId: activeTenant.id,
        provider,
      })
      if (res.ok) {
        setCalendarEvents(res.events)
        onFeedback?.({
          ok: true,
          text: `Loaded ${res.events.length} calendar event(s).`,
        })
      } else {
        onFeedback?.({ ok: false, text: res.error || 'Could not load calendar events.' })
      }
    } finally {
      setBusyProvider(null)
    }
  }

  const visibleProviders = INTEGRATION_PROVIDERS.filter((p) => {
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      p.shortSummary.toLowerCase().includes(q) ||
      CATEGORY_LABEL[p.category].toLowerCase().includes(q)
    )
  })

  const filteredLiveItems = liveItems.filter((item) => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return true
    return (
      item.title.toLowerCase().includes(q) ||
      item.externalKey.toLowerCase().includes(q) ||
      (item.projectOrRepo || '').toLowerCase().includes(q)
    )
  })

  const activeCount = connectors.filter((c) => c.status === 'connected').length
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

  return (
    <div className="space-y-6">
      {/* Category Filter + Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {CATEGORY_TABS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${categoryFilter === cat.id
                  ? 'bg-[#702fe3] text-white shadow-xs'
                  : 'bg-white dark:bg-[#131319] text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] hover:text-zinc-900 dark:hover:text-white'
                }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools..."
            className="w-44 sm:w-52 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-[#131319] px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#702fe3]/30 focus:border-[#702fe3]"
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium shrink-0">
            {activeCount} connected
          </span>
        </div>
      </div>

      {/* Live External Ticket / Issue Importer Drawer */}
      {importSourceProvider && (
        <div className={`${CARD_CLS} ring-2 ring-[#702fe3]/30 space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Live Items from{' '}
                {INTEGRATION_PROVIDERS.find((p) => p.id === importSourceProvider)?.name ??
                  importSourceProvider}
              </h3>
              <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-600 dark:text-zinc-300">
                {filteredLiveItems.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search tickets..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="w-44 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
              />
              <select
                aria-label="Target Project"
                value={resolvedTargetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
              >
                {projects.length === 0 ? (
                  <option value="">No projects yet</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      Import to: {p.code} - {p.name}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={handleImportSelectedItems}
                disabled={selectedItemIds.length === 0}
                className="px-3.5 py-1.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold cursor-pointer disabled:opacity-40 transition"
              >
                Import Selected ({selectedItemIds.length})
              </button>
              <button
                type="button"
                onClick={() => setImportSourceProvider(null)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {loadingItems ? (
            <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Fetching live items from external API...
            </div>
          ) : filteredLiveItems.length === 0 ? (
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No matching open items found.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredLiveItems.map((item) => {
                const checked = selectedItemIds.includes(item.id)
                return (
                  <label
                    key={item.id}
                    className={`rounded-xl p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition ring-1 ${checked
                        ? 'bg-[#702fe3]/[0.06] dark:bg-[#702fe3]/15 ring-[#702fe3]/40'
                        : 'bg-zinc-50 dark:bg-zinc-900/60 ring-zinc-950/[0.04] dark:ring-white/[0.06]'
                      }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedItemIds((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((id) => id !== item.id)
                              : [...prev, item.id]
                          )
                        }
                        className="rounded border-zinc-300 text-[#702fe3]"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#581eae] dark:text-[#c5a8f0]">
                            {item.externalKey}
                          </span>
                          <span className="font-semibold text-zinc-900 dark:text-white truncate">
                            {item.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {item.projectOrRepo || item.provider} · {item.status} · Est.{' '}
                          {Math.round((item.estimateMinutes / 60) * 10) / 10}h
                        </div>
                      </div>
                    </div>

                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:underline shrink-0"
                      >
                        Open ↗
                      </a>
                    )}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Synced Calendar Events Drawer (appears after loading meetings from Google/Outlook) */}
      {calendarEvents.length > 0 && (
        <div className={`${CARD_CLS} ring-2 ring-[#702fe3]/30 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Upcoming &amp; Recent Meetings ({calendarEvents.length})
            </h3>
            <div className="flex items-center gap-2">
              <select
                aria-label="Privacy Level"
                value={calendarSyncScope}
                onChange={(e) =>
                  setCalendarSyncScope(e.target.value as 'title_and_duration' | 'metadata_only')
                }
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
              >
                <option value="title_and_duration">Log Title &amp; Duration</option>
                <option value="metadata_only">Log Time &amp; Duration Only</option>
              </select>
              <button
                type="button"
                onClick={() => setCalendarEvents([])}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {calendarEvents.map((ev) => (
              <div
                key={ev.id}
                className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-white">{ev.title}</div>
                  <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    {ev.startedAtUtc.slice(0, 16).replace('T', ' ')} · {ev.durationMinutes} min
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const res = syncCalendarMeeting({
                      projectId: resolvedTargetProjectId,
                      taskId: tasks[0]?.id,
                      rawTitle: ev.title,
                      startedAtUtc: ev.startedAtUtc,
                      endedAtUtc: ev.endedAtUtc,
                      syncPermissionScope: calendarSyncScope,
                    })
                    onFeedback?.({ ok: res.ok, text: res.message })
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold cursor-pointer"
                >
                  Log to Project
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unified 3-Column Tool Cards Grid (All 15 Tools) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleProviders.map((spec) => {
          const conn = getConnector(spec.id)
          const connected = Boolean(conn)
          const accountLabel = String(conn?.syncConfig?.accountLabel || '')
          const masked = String(conn?.syncConfig?.maskedCredential || '')
          const oauthReady =
            spec.id === 'google_calendar'
              ? oauthStatus.googleConfigured
              : spec.id === 'outlook_calendar'
                ? oauthStatus.microsoftConfigured
                : true

          return (
            <div key={spec.id} className={`${CARD_CLS} flex flex-col justify-between gap-4`}>
              <div className="space-y-3">
                {/* Top Row: Brand Logo + Name + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="h-10 w-10 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] flex items-center justify-center shrink-0">
                      <IntegrationBrandLogo providerId={spec.id} size={22} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                        {spec.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
                        {CATEGORY_LABEL[spec.category]}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0 ${connected
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : spec.isOAuthCalendar && !oauthReady
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${connected
                          ? 'bg-emerald-500'
                          : spec.isOAuthCalendar && !oauthReady
                            ? 'bg-amber-500'
                            : 'bg-zinc-400'
                        }`}
                    />
                    {connected
                      ? 'Connected'
                      : spec.isOAuthCalendar && !oauthReady
                        ? isPlatformAdmin
                          ? 'Platform Setup'
                          : 'Not Enabled'
                        : 'Not Connected'}
                  </span>
                </div>

                {/* Short Clear Description */}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {spec.shortSummary}
                </p>

                {/* Meta Row: Setup Time */}
                <div className="text-[11px] text-zinc-400">
                  {spec.steps.length} steps · {spec.setupTime}
                </div>

                {/* Connected Account Info */}
                {connected && (
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 px-3 py-2 text-[11px] space-y-0.5">
                    <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      {accountLabel || spec.name}
                    </div>
                    {masked && (
                      <div className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        Key: {masked}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card Action Footer */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                {connected ? (
                  <>
                    {spec.supportsLiveImport && (
                      <button
                        type="button"
                        onClick={() => void handleFetchLiveItems(spec.id, spec.name)}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold cursor-pointer transition"
                      >
                        Fetch Live Tasks
                      </button>
                    )}
                    {spec.category === 'chat' && (
                      <button
                        type="button"
                        disabled={busyProvider === spec.id}
                        onClick={() =>
                          void handleSendChatTest(spec.id as 'slack' | 'discord' | 'ms_teams')
                        }
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 ${SOFT_VIOLET_BTN}`}
                      >
                        {busyProvider === spec.id ? 'Sending...' : 'Send Test Alert'}
                      </button>
                    )}
                    {spec.isOAuthCalendar && (
                      <button
                        type="button"
                        disabled={busyProvider === spec.id}
                        onClick={() =>
                          void handleFetchCalendar(
                            spec.id as 'google_calendar' | 'outlook_calendar'
                          )
                        }
                        className="flex-1 py-2 px-3 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold cursor-pointer transition"
                      >
                        Load Meetings
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyProvider === spec.id}
                      onClick={() => void handleDisconnect(spec.id, spec.name)}
                      className="py-2 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold cursor-pointer transition"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSetupModal(spec)}
                    className={`w-full py-2 rounded-xl text-xs font-semibold cursor-pointer ${SOFT_VIOLET_BTN}`}
                  >
                    Connect {spec.name}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ==================================================================== */}
      {/* GUIDED SPLIT-PANE SETUP MODAL (Official Step-by-Step + Live Verify)  */}
      {/* ==================================================================== */}
      {activeGuideSpec &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 backdrop-blur-xs p-4"
            onClick={closeSetupModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="integration-guide-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/10 dark:ring-white/10 shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-10 w-10 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] flex items-center justify-center shrink-0">
                    <IntegrationBrandLogo providerId={activeGuideSpec.id} size={22} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        id="integration-guide-title"
                        className="text-base font-bold text-zinc-900 dark:text-white"
                      >
                        Connect {activeGuideSpec.name}
                      </h3>
                      <span className="rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/20 px-2 py-0.5 text-[10px] font-semibold text-[#581eae] dark:text-[#c5a8f0]">
                        {activeGuideSpec.setupTime} setup
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {activeGuideSpec.shortSummary}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <a
                    href={activeGuideSpec.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:underline"
                  >
                    Official Docs ↗
                  </a>
                  <button
                    type="button"
                    onClick={closeSetupModal}
                    aria-label="Close setup modal"
                    className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center text-sm font-bold cursor-pointer transition"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Split Body: Left = Official Step-by-Step Guide, Right = Credentials / OAuth */}
              <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto">
                {/* LEFT PANE: Step-by-Step Guide */}
                <div className="lg:col-span-7 p-6 bg-zinc-50/70 dark:bg-white/[0.02] border-b lg:border-b-0 lg:border-r border-zinc-200/80 dark:border-zinc-800 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Step-by-Step Setup Guide
                    </span>
                    {!activeGuideSpec.isOAuthCalendar && (
                      <a
                        href={activeGuideSpec.portalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:ring-[#702fe3]/40 text-xs font-semibold text-[#581eae] dark:text-[#c5a8f0] transition"
                      >
                        {activeGuideSpec.portalButtonLabel} ↗
                      </a>
                    )}
                  </div>

                  {/* Numbered Timeline Steps */}
                  <ol className="space-y-4">
                    {activeGuideSpec.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <span className="h-6 w-6 rounded-full bg-[#702fe3] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                          {idx + 1}
                        </span>
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-zinc-900 dark:text-white">
                            {step.title}
                          </div>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {step.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {/* Helpful Tip Callout */}
                  {activeGuideSpec.tip && (
                    <div className="rounded-xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/20 px-3.5 py-3 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      <strong className="text-[#581eae] dark:text-[#c5a8f0]">Good to know:</strong>{' '}
                      {activeGuideSpec.tip}
                    </div>
                  )}
                </div>

                {/* RIGHT PANE: Live Credentials Form OR OAuth Setup */}
                <div className="lg:col-span-5 p-6 flex flex-col justify-between gap-5">
                  {activeGuideSpec.isOAuthCalendar ? (
                    (() => {
                      const isGoogle = activeGuideSpec.id === 'google_calendar'
                      const isConfigured = isGoogle
                        ? oauthStatus.googleConfigured
                        : oauthStatus.microsoftConfigured
                      const redirectUri = `${appOrigin}/api/prisma/oauth/${isGoogle ? 'google' : 'microsoft'
                        }/callback`
                      const envSnippet = isGoogle
                        ? `GOOGLE_CLIENT_ID=your-client-id\nGOOGLE_CLIENT_SECRET=your-client-secret`
                        : `MICROSOFT_CLIENT_ID=your-client-id\nMICROSOFT_CLIENT_SECRET=your-client-secret`
                      const startHref = `/api/prisma/oauth/${isGoogle ? 'google' : 'microsoft'
                        }/start?tenantId=${encodeURIComponent(activeTenant.id)}&userId=${encodeURIComponent(
                          activeUser.id
                        )}`

                      return (
                        <div className="space-y-4 flex-1 flex flex-col justify-between">
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                                Connect to {activeTenant.name}
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                One-click read-only authorization scoped privately to your workspace.
                              </p>
                            </div>

                            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3.5 py-3 space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-500 dark:text-zinc-400">Workspace</span>
                                <span className="font-semibold text-zinc-900 dark:text-white">
                                  {activeTenant.name}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-500 dark:text-zinc-400">Access Level</span>
                                <span className="font-semibold text-zinc-900 dark:text-white">
                                  Read-only meetings
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-500 dark:text-zinc-400">Data Isolation</span>
                                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                                  Private to this tenant
                                </span>
                              </div>
                            </div>

                            {!isConfigured && !isPlatformAdmin && (
                              <div className="rounded-xl px-3.5 py-3 text-xs font-medium bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 ring-1 ring-amber-500/25 leading-relaxed">
                                {isGoogle ? 'Google Calendar' : 'Outlook Calendar'} 1-click sign-in is not enabled on this platform yet. Please contact your platform administrator.
                              </div>
                            )}

                            {/* Platform OAuth Setup — visible ONLY to Super Admin */}
                            {isPlatformAdmin && !isConfigured && (
                              <details className="rounded-xl bg-amber-50/70 dark:bg-amber-950/20 ring-1 ring-amber-500/25 p-3 text-xs space-y-3" open>
                                <summary className="font-semibold text-amber-900 dark:text-amber-200 cursor-pointer">
                                  Platform OAuth Setup (Super Admin Only — 1-time for all tenants)
                                </summary>
                                <div className="space-y-3 pt-2">
                                  <a
                                    href={activeGuideSpec.portalUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-[#581eae] dark:text-[#c5a8f0] hover:underline"
                                  >
                                    {activeGuideSpec.portalButtonLabel} ↗
                                  </a>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                                        Authorized Redirect URI
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => copyValue('redirect-uri', redirectUri)}
                                        className="text-[11px] font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:underline cursor-pointer"
                                      >
                                        {copiedKey === 'redirect-uri' ? 'Copied ✓' : 'Copy'}
                                      </button>
                                    </div>
                                    <code className="block rounded-lg bg-white dark:bg-zinc-950 ring-1 ring-zinc-200 dark:ring-zinc-800 px-2.5 py-1.5 font-mono text-[10.5px] text-zinc-800 dark:text-zinc-200 break-all">
                                      {redirectUri}
                                    </code>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                                        Server Environment Variables
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => copyValue('env-snippet', envSnippet)}
                                        className="text-[11px] font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:underline cursor-pointer"
                                      >
                                        {copiedKey === 'env-snippet' ? 'Copied ✓' : 'Copy'}
                                      </button>
                                    </div>
                                    <pre className="rounded-lg bg-white dark:bg-zinc-950 ring-1 ring-zinc-200 dark:ring-zinc-800 px-2.5 py-1.5 font-mono text-[10.5px] text-zinc-700 dark:text-zinc-300 overflow-x-auto">
                                      {envSnippet}
                                    </pre>
                                  </div>
                                </div>
                              </details>
                            )}
                          </div>

                          <div className="space-y-2.5 pt-2">
                            <a
                              href={isConfigured ? startHref : undefined}
                              onClick={(e) => {
                                if (!isConfigured) e.preventDefault()
                              }}
                              className={`block w-full text-center py-2.5 rounded-xl text-xs font-semibold transition ${
                                isConfigured
                                  ? 'bg-[#702fe3] hover:bg-[#5f21cc] text-white cursor-pointer shadow-xs'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                              }`}
                            >
                              Connect {isGoogle ? 'Google Calendar' : 'Outlook Calendar'} →
                            </a>
                          </div>
                        </div>
                      )
                    })()
                  ) : (
                    <form
                      onSubmit={(e) => void handleConnectSubmit(activeGuideSpec, e)}
                      className="space-y-4 flex-1 flex flex-col justify-between"
                    >
                      <div className="space-y-3.5">
                        <div className="text-xs font-bold text-zinc-900 dark:text-white">
                          Enter Your Credentials
                        </div>

                        {modalError && (
                          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-500/30 px-3 py-2.5 text-xs text-rose-800 dark:text-rose-200">
                            {modalError}
                          </div>
                        )}

                        {activeGuideSpec.fields.map((field) => {
                          const isSecret = field.type === 'password'
                          const revealed = Boolean(revealedFields[field.key])
                          return (
                            <div key={field.key}>
                              <label className={LABEL_CLS}>
                                {field.label}
                                {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                              </label>
                              <div className="relative">
                                <input
                                  type={isSecret && !revealed ? 'password' : field.type === 'password' ? 'text' : field.type || 'text'}
                                  required={field.required}
                                  placeholder={field.placeholder}
                                  value={credDraft[field.key] ?? ''}
                                  onChange={(e) =>
                                    setCredDraft((prev) => ({
                                      ...prev,
                                      [field.key]: e.target.value,
                                    }))
                                  }
                                  className={`${INPUT_CLS} ${isSecret ? 'font-mono pr-14' : ''}`}
                                />
                                {isSecret && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRevealedFields((prev) => ({
                                        ...prev,
                                        [field.key]: !prev[field.key],
                                      }))
                                    }
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-zinc-500 hover:text-[#6d25da] dark:hover:text-[#c5a8f0] cursor-pointer"
                                  >
                                    {revealed ? 'Hide' : 'Show'}
                                  </button>
                                )}
                              </div>
                              {field.hint && (
                                <p className="mt-1 text-[11px] text-zinc-400">{field.hint}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                          <span>
                            Verified live &amp; encrypted server-side (AES-256-GCM).
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={closeSetupModal}
                            className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold cursor-pointer transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={busyProvider === activeGuideSpec.id}
                            className="flex-1 py-2.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition shadow-xs"
                          >
                            {busyProvider === activeGuideSpec.id
                              ? `Verifying with ${activeGuideSpec.name}...`
                              : `Verify & Connect`}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
