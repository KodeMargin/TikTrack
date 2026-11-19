import { useEffect, useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store, type EnrolledDeviceRecord } from '@/context/Phase2Store'

const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/KodeMargin/TikTrack/releases/latest'

const DEFAULT_DESKTOP_RELEASE = {
  version: 'v0.2.0',
  links: {
    macArm: 'https://github.com/KodeMargin/TikTrack/releases/download/v0.2.0/TikTrack_0.2.0_aarch64.dmg',
    macIntel: 'https://github.com/KodeMargin/TikTrack/releases/download/v0.2.0/TikTrack_0.2.0_x64.dmg',
    winExe: 'https://github.com/KodeMargin/TikTrack/releases/download/v0.2.0/TikTrack_0.2.0_x64-setup.exe',
    linuxDeb: 'https://github.com/KodeMargin/TikTrack/releases/download/v0.2.0/TikTrack_0.2.0_amd64.deb',
  },
}

export function IntegrationsAndDevicesView() {
  const { tasks, activeUser } = usePhase1Store()
  const {
    ideMappings,
    confirmOrOverrideIdeMapping,
    emitSimulatedIdeTelemetry,
    integrations,
    toggleIntegrationConnection,
    webhookReceipts,
    simulateWebhookDelivery,
    devices,
    updateDeviceChannel,
    simulateDeviceClockAnomaly,
    toggleDeviceRevocation,
  } = usePhase2Store()

  const [selectedTaskByMapping, setSelectedTaskByMapping] = useState<Record<string, string>>({})
  const [simTaskId, setSimTaskId] = useState<string>(() => tasks[0]?.id ?? '')
  const [whProvider, setWhProvider] = useState<'github' | 'gitlab'>('github')
  const [whDeliveryId, setWhDeliveryId] = useState('gh-del-replay-demo-001')
  const [whEventType, setWhEventType] = useState<
    'push' | 'pull_request' | 'pull_request_review' | 'check_suite'
  >('pull_request')
  const [whExternalId, setWhExternalId] = useState('pr-209')
  const [whSummary, setWhSummary] = useState('PR #209: fix(DEV-102): harden webhook retry backoff')
  const [whRetrospective, setWhRetrospective] = useState(true)
  const [whTamperSig, setWhTamperSig] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [desktopRelease, setDesktopRelease] = useState(DEFAULT_DESKTOP_RELEASE)

  useEffect(() => {
    let active = true
    fetch(GITHUB_LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tag_name?: string; assets?: Array<{ name: string; browser_download_url: string }> } | null) => {
        if (!active || !data?.assets?.length) return
        const findAsset = (suffix: string) =>
          data.assets!.find((a) => a.name.toLowerCase().endsWith(suffix))?.browser_download_url
        setDesktopRelease((prev) => ({
          version: data.tag_name || prev.version,
          links: {
            macArm: findAsset('aarch64.dmg') ?? prev.links.macArm,
            macIntel: findAsset('x64.dmg') ?? prev.links.macIntel,
            winExe: findAsset('-setup.exe') ?? prev.links.winExe,
            linuxDeb: findAsset('.deb') ?? prev.links.linuxDeb,
          },
        }))
      })
      .catch(() => {
        // Keep fallback URLs if GitHub API is unreachable or rate-limited
      })
    return () => {
      active = false
    }
  }, [])

  const isFinanceOrClient =
    activeUser.role === 'finance' || activeUser.role === 'client_reviewer'

  if (isFinanceOrClient) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-6 space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 font-bold">
          Access Restricted
        </div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          Integrations & Device Controls Restricted
        </h2>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 max-w-2xl">
          Finance and Client Reviewer roles cannot access developer workstation enrollments,
          IDE branch mappings, or webhook logs.
        </p>
      </div>
    )
  }

  function handleEmitTelemetry(
    kind: 'vscode_debug' | 'vscode_test' | 'terminal_category' | 'concurrent_ide_desktop'
  ) {
    const res = emitSimulatedIdeTelemetry(kind, simTaskId || tasks[0]?.id || '')
    setFeedback({ ok: res.ok, text: res.message })
  }

  function handleSimulateWebhook(e: React.FormEvent) {
    e.preventDefault()
    const res = simulateWebhookDelivery({
      provider: whProvider,
      deliveryId: whDeliveryId,
      eventType: whEventType,
      taskId: simTaskId || tasks[0]?.id || '',
      externalId: whExternalId,
      summaryTitle: whSummary,
      isRetrospective: whRetrospective,
      tamperSignature: whTamperSig,
    })
    setFeedback({ ok: res.accepted, text: res.message })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Integrations & Enrolled Devices
          </h2>

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">Target Task:</label>
            <select
              value={simTaskId}
              onChange={(e) => setSimTaskId(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} - {t.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-xl border px-3.5 py-2 text-xs flex items-center justify-between ${feedback.ok
                ? 'border-emerald-500/40 bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200'
                : 'border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
              }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="font-semibold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Developer Apps Download & Connection Center */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#702fe3] dark:text-[#a87ce9] font-bold">
            Companion Apps & Developer Tools
          </span>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white mt-0.5">
            Download Desktop App or Connect VS Code Extension
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Choose your preferred companion tool to track focus time, sync Git commits, and verify engineering effort automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: VS Code Extension */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.94-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zM18 17.818l-7.391-5.818L18 6.182v11.636z" />
                  </svg>
                  VS Code Extension (Recommended)
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">v0.2.0</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Track code edits, Git branch switches, and test runs directly inside VS Code or Cursor with 0 manual effort.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="vscode:extension/kodemargin.tiktrack-vscode-telemetry"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white transition shadow-sm"
              >
                ⚡ Install in VS Code (1-Click)
              </a>
              <a
                href="https://marketplace.visualstudio.com/items?itemName=kodemargin.tiktrack-vscode-telemetry"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition"
              >
                View on Marketplace
              </a>
            </div>
          </div>

          {/* Card 2: Desktop Tray App */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-semibold">
                  🖥️ Desktop Tray App
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">{desktopRelease.version}</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Lightweight system tray timer for macOS, Windows, and Linux. Transparently displays your active focus mode and idle reconciliation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={desktopRelease.links.macArm}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold transition shadow-sm"
              >
                🍏 Mac (Apple Silicon)
              </a>
              <a
                href={desktopRelease.links.macIntel}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition"
              >
                🍏 Mac (Intel)
              </a>
              <a
                href={desktopRelease.links.winExe}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition shadow-sm"
              >
                🪟 Windows (.exe)
              </a>
              <a
                href={desktopRelease.links.linuxDeb}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition"
              >
                🐧 Linux (.deb)
              </a>
            </div>
          </div>
        </div>

        {/* Sync Token helper */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/50 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Your Developer Sync Token:</span>
            <code className="px-2 py-0.5 rounded bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
              dp_live_{activeUser.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_sync
            </code>
          </div>
          <button
            type="button"
            onClick={() => {
              const token = `dp_live_${activeUser.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_sync`
              void navigator.clipboard.writeText(token)
              setCopiedToken(true)
              setTimeout(() => setCopiedToken(false), 2000)
            }}
            className="px-2.5 py-1 rounded-md bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium cursor-pointer transition"
          >
            {copiedToken ? '✓ Copied Token!' : '📋 Copy Token'}
          </button>
        </div>
      </div>

      {/* Connected Integrations (F2-015, F2-016, F2-020, F2-025, F2-026) */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Connected Integrations
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleEmitTelemetry('vscode_debug')}
              className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-bold text-white cursor-pointer"
            >
              + Emit Debug Event
            </button>
            <button
              type="button"
              onClick={() => handleEmitTelemetry('vscode_test')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
            >
              + Emit Test Run
            </button>
            <button
              type="button"
              onClick={() => handleEmitTelemetry('terminal_category')}
              className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer"
            >
              + Emit Terminal Event
            </button>
            <button
              type="button"
              onClick={() => handleEmitTelemetry('concurrent_ide_desktop')}
              className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-xs font-bold text-white cursor-pointer"
            >
              Test IDE + Desktop Merge
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {integrations.map((int) => (
            <div
              key={int.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 p-3.5 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[#6d25da] dark:text-[#c5a8f0] font-bold">
                    {int.provider}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${int.status === 'connected'
                        ? 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-emerald-600/50'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                      }`}
                  >
                    {int.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs font-bold text-zinc-900 dark:text-white">{int.displayName}</div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">{int.scopeSummary}</p>
                <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                  Scope: {int.reposOrWorkspaces.join(', ')} • Retention: {int.retentionDays}d
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
                <span className="text-[10px] text-slate-500 font-mono">
                  ID: {int.installationId}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    toggleIntegrationConnection(int.id)
                    setFeedback({
                      ok: true,
                      text: `${int.displayName} is now ${int.status === 'connected' ? 'disconnected' : 'connected'
                        }.`,
                    })
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${int.status === 'connected'
                      ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60 hover:bg-rose-100 dark:hover:bg-rose-900/70'
                      : 'bg-emerald-700 text-white hover:bg-emerald-600'
                    }`}
                >
                  {int.status === 'connected' ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-5 space-y-3">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          IDE & Branch Mappings
        </h3>

        <div className="space-y-2">
          {ideMappings.map((mapping) => {
            const selectedTask = selectedTaskByMapping[mapping.id] ?? mapping.taskId
            return (
              <div
                key={mapping.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 p-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50">
                      {mapping.ideType.toUpperCase()}
                    </span>
                    <span className="font-mono text-zinc-900 dark:text-white font-semibold">
                      {mapping.workspaceIdentifier}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">•</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">{mapping.branchName}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Repo: {mapping.repoFullName} • Mapped Task:{' '}
                    <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{mapping.taskCode}</strong> (
                    {Math.round(mapping.confidenceScore * 100)}% confidence)
                    {mapping.overriddenByUser && ' • Overridden by developer'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedTask}
                    onChange={(e) =>
                      setSelectedTaskByMapping((prev) => ({
                        ...prev,
                        [mapping.id]: e.target.value,
                      }))
                    }
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
                  >
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} - {t.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      confirmOrOverrideIdeMapping(mapping.id, selectedTask)
                      setFeedback({
                        ok: true,
                        text: `Confirmed workspace mapping "${mapping.branchName}" -> ${tasks.find((t) => t.id === selectedTask)?.code ?? selectedTask
                          }.`,
                      })
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-bold text-white cursor-pointer"
                  >
                    {mapping.confirmedByUser ? 'Update Mapping' : 'Confirm Mapping'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* GitHub/GitLab Webhook Ingestion & Replay Deduplication Tester (F2-021, Sec 5.5) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <form
          onSubmit={handleSimulateWebhook}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Webhook Delivery Simulator
            </h3>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">HMAC-SHA256</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">Provider</label>
              <select
                value={whProvider}
                onChange={(e) => setWhProvider(e.target.value as 'github' | 'gitlab')}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-900 dark:text-white"
              >
                <option value="github">GitHub App</option>
                <option value="gitlab">GitLab Webhook</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">Event Type</label>
              <select
                value={whEventType}
                onChange={(e) =>
                  setWhEventType(
                    e.target.value as
                    | 'push'
                    | 'pull_request'
                    | 'pull_request_review'
                    | 'check_suite'
                  )
                }
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-900 dark:text-white"
              >
                <option value="push">push (Commit)</option>
                <option value="pull_request">pull_request (PR/MR)</option>
                <option value="pull_request_review">pull_request_review</option>
                <option value="check_suite">check_suite (CI Status)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">
                X-GitHub-Delivery ID
              </label>
              <input
                type="text"
                value={whDeliveryId}
                onChange={(e) => setWhDeliveryId(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs font-mono text-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">
                External Artifact ID
              </label>
              <input
                type="text"
                value={whExternalId}
                onChange={(e) => setWhExternalId(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs font-mono text-zinc-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-700 dark:text-zinc-300 mb-1">Outcome Summary</label>
            <input
              type="text"
              value={whSummary}
              onChange={(e) => setWhSummary(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-900 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-700 dark:text-zinc-300 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={whRetrospective}
                onChange={(e) => setWhRetrospective(e.target.checked)}
              />
              <span>Retrospective Outcome</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-rose-700 dark:text-rose-300">
              <input
                type="checkbox"
                checked={whTamperSig}
                onChange={(e) => setWhTamperSig(e.target.checked)}
              />
              <span>Invalid HMAC Signature</span>
            </label>
          </div>

          <button
            type="submit"
            className="w-full py-2 px-3 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-bold text-white cursor-pointer"
          >
            Deliver Webhook Event
          </button>
        </form>

        {/* Webhook Receipts Ledger */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Webhook Receipts ({webhookReceipts.length})
            </h3>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {webhookReceipts.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/85 p-3 space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                    {r.provider.toUpperCase()} • {r.deliveryId}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.status === 'processed'
                        ? 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800'
                        : r.status === 'duplicate_ignored'
                          ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50'
                          : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700/50'
                      }`}
                  >
                    {r.status.toUpperCase()} ({r.deliveryAttemptCount}x)
                  </span>
                </div>
                <div className="text-xs text-zinc-900 dark:text-white">{r.summary}</div>
                <div className="text-[10px] font-mono text-slate-500">
                  HMAC Verified: {String(r.signatureVerified)} • Event: {r.eventType}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-5 space-y-3">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          Enrolled Devices
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {devices.map((dev) => (
            <div
              key={dev.id}
              className={`rounded-xl border p-4 space-y-2.5 ${dev.revokedAt
                  ? 'border-rose-200 dark:border-rose-700/60 bg-rose-50 dark:bg-rose-950/20'
                  : dev.clockAnomalyDetected
                    ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/15'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80'
                }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white">{dev.deviceName}</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Owner: {dev.userName} • OS: {dev.osPlatform} • Agent v{dev.agentVersion}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${dev.revokedAt
                      ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700'
                      : 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800'
                    }`}
                >
                  {dev.revokedAt ? 'REVOKED' : 'ACTIVE'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
                  <div className="text-zinc-500 dark:text-zinc-400">Clock Drift</div>
                  <div
                    className={`font-mono font-bold ${dev.clockAnomalyDetected ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-800 dark:text-zinc-200'
                      }`}
                  >
                    {dev.lastClockDriftSeconds}s{' '}
                    {dev.clockAnomalyDetected ? '(Drift Anomaly)' : '(Synchronized)'}
                  </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-lg p-2">
                  <div className="text-zinc-500 dark:text-zinc-400">Display Policy</div>
                  <div className="font-mono font-semibold text-[#6d25da] dark:text-[#c5a8f0]">
                    {dev.multiDisplayPolicy}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">Channel:</span>
                  <select
                    value={dev.updateChannel}
                    onChange={(e) =>
                      updateDeviceChannel(
                        dev.id,
                        e.target.value as EnrolledDeviceRecord['updateChannel']
                      )
                    }
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
                  >
                    <option value="stable">stable</option>
                    <option value="beta">beta</option>
                    <option value="enterprise_pinned">enterprise_pinned</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      simulateDeviceClockAnomaly(
                        dev.id,
                        dev.clockAnomalyDetected ? 2 : 185
                      )
                    }
                    className="px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-[11px] text-amber-800 dark:text-amber-200 cursor-pointer"
                  >
                    {dev.clockAnomalyDetected ? 'Reset Clock Sync' : 'Simulate +185s Drift'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleDeviceRevocation(dev.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${dev.revokedAt
                        ? 'bg-emerald-700 text-white'
                        : 'bg-rose-50 dark:bg-rose-950/90 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60'
                      }`}
                  >
                    {dev.revokedAt ? 'Restore Device' : 'Revoke Token'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

