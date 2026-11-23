import { useEffect, useState } from 'react'
import { notifyFeedback } from '@/lib/notify'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store, type EnrolledDeviceRecord } from '@/context/Phase2Store'
import { PublicApiAndWebhooksPanel } from '@/features/integrations/EcosystemToolsAndApiPanels'
import { RealIntegrationsHub } from '@/features/integrations/RealIntegrationsHub'

const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/KodeMargin/TikTrack-Release/releases/latest'

const DEFAULT_DESKTOP_RELEASE = {
  version: 'v0.2.0',
  links: {
    macArm:
      'https://github.com/KodeMargin/TikTrack-Release/releases/download/v0.2.0/TikTrack_0.2.0_aarch64.dmg',
    macIntel:
      'https://github.com/KodeMargin/TikTrack-Release/releases/download/v0.2.0/TikTrack_0.2.0_x64.dmg',
    winExe:
      'https://github.com/KodeMargin/TikTrack-Release/releases/download/v0.2.0/TikTrack_0.2.0_x64-setup.exe',
    linuxDeb:
      'https://github.com/KodeMargin/TikTrack-Release/releases/download/v0.2.0/TikTrack_0.2.0_amd64.deb',
  },
}

const CARD_CLS =
  'rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-sm p-5'

export function IntegrationsAndDevicesView() {
  const { tasks, activeUser } = usePhase1Store()
  const {
    ideMappings,
    confirmOrOverrideIdeMapping,
    webhookReceipts,
    devices,
    updateDeviceChannel,
    toggleDeviceRevocation,
  } = usePhase2Store()

  const [activeTab, setActiveTab] = useState<'apps-devices' | 'external-tools' | 'api-webhooks'>(
    'external-tools'
  )
  const [selectedTaskByMapping, setSelectedTaskByMapping] = useState<Record<string, string>>({})
  const setFeedback = notifyFeedback
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedMacFix, setCopiedMacFix] = useState(false)
  const [desktopRelease, setDesktopRelease] = useState(DEFAULT_DESKTOP_RELEASE)

  useEffect(() => {
    let active = true
    fetch(GITHUB_LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            tag_name?: string
            assets?: Array<{ name: string; browser_download_url: string }>
          } | null
        ) => {
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
        }
      )
      .catch(() => {
        // Keep fallback release URLs if GitHub API is unreachable
      })
    return () => {
      active = false
    }
  }, [])

  const isFinanceOrClient =
    activeUser.role === 'finance' || activeUser.role === 'client_reviewer'
  const canManageApi =
    activeUser.role === 'super_admin' ||
    activeUser.role === 'tenant_owner' ||
    activeUser.role === 'project_manager'
  const effectiveTab = activeTab === 'api-webhooks' && !canManageApi ? 'external-tools' : activeTab

  if (isFinanceOrClient) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-6 space-y-2">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          Restricted Area
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xl">
          Your role does not have access to developer apps, IDE mappings, or API integrations.
        </p>
      </div>
    )
  }

  const syncToken = `tt_live_${activeUser.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_sync`

  return (
    <div className="space-y-6">
      {/* Header + Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
          Integrations &amp; API
        </h2>

        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900/90 p-1">
          {[
            { id: 'external-tools' as const, label: 'Connected Tools', show: true },
            { id: 'apps-devices' as const, label: 'Desktop & IDE Apps', show: true },
            { id: 'api-webhooks' as const, label: 'API & Webhooks', show: canManageApi },
          ]
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${effectiveTab === t.id
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
              >
                {t.label}
              </button>
            ))}
        </div>
      </div>

      {effectiveTab === 'external-tools' ? (
        <RealIntegrationsHub onFeedback={setFeedback} />
      ) : effectiveTab === 'api-webhooks' && canManageApi ? (
        <PublicApiAndWebhooksPanel onFeedback={setFeedback} />
      ) : (
        <div className="space-y-6">
          {/* Companion Apps Download & Setup */}
          <div className={`${CARD_CLS} space-y-4`}>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Desktop App &amp; IDE Extension
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* VS Code Extension */}
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.94-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zM18 17.818l-7.391-5.818L18 6.182v11.636z" />
                      </svg>
                      VS Code Extension
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">v0.2.0</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">
                    Automatically links code edits, Git branches, and test runs inside VS Code or Cursor.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href="vscode:extension/kodemargin.devproof-vscode-telemetry"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white transition"
                  >
                    Install in VS Code
                  </a>
                  <a
                    href="https://marketplace.visualstudio.com/items?itemName=kodemargin.devproof-vscode-telemetry"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition"
                  >
                    View on Marketplace
                  </a>
                </div>
              </div>

              {/* Desktop Tray App */}
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#6d25da]/10 text-[#581eae] dark:text-[#c5a8f0] text-xs font-semibold">
                      Desktop Tray App
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {desktopRelease.version}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">
                    Lightweight system tray timer for macOS, Windows, and Linux with focus modes and idle detection.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={desktopRelease.links.macArm}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold transition"
                  >
                    Mac (Apple Silicon)
                  </a>
                  <a
                    href={desktopRelease.links.macIntel}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition"
                  >
                    Mac (Intel)
                  </a>
                  <a
                    href={desktopRelease.links.winExe}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition"
                  >
                    Windows (.exe)
                  </a>
                  <a
                    href={desktopRelease.links.linuxDeb}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition"
                  >
                    Linux (.deb)
                  </a>
                </div>

                <div className="rounded-lg border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-2.5 space-y-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                  <p className="leading-snug">
                    <strong>macOS note:</strong> If macOS blocks opening the app, move it to{' '}
                    <code className="font-mono">Applications</code> and run once in Terminal:
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 dark:border-amber-500/25 bg-white dark:bg-zinc-950/90 px-2.5 py-1.5 font-mono text-[10.5px] text-zinc-800 dark:text-amber-100">
                    <code className="truncate">xattr -cr /Applications/TikTrack.app</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText('xattr -cr /Applications/TikTrack.app')
                        setCopiedMacFix(true)
                        setTimeout(() => setCopiedMacFix(false), 2000)
                      }}
                      className="px-2 py-0.5 rounded bg-amber-100 dark:bg-zinc-800 hover:bg-amber-200 dark:hover:bg-zinc-700 font-sans font-semibold text-[10px] text-amber-900 dark:text-zinc-200 shrink-0 cursor-pointer transition"
                    >
                      {copiedMacFix ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Developer Sync Token */}
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Personal Sync Token:
                </span>
                <code className="px-2.5 py-0.5 rounded-lg bg-white dark:bg-zinc-950 ring-1 ring-zinc-200 dark:ring-zinc-800 font-mono text-[11px] text-[#581eae] dark:text-[#c5a8f0]">
                  {syncToken}
                </code>
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(syncToken)
                  setCopiedToken(true)
                  setTimeout(() => setCopiedToken(false), 2000)
                }}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 ring-1 ring-zinc-200 dark:ring-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold cursor-pointer transition"
              >
                {copiedToken ? 'Copied ✓' : 'Copy Token'}
              </button>
            </div>
          </div>

          {/* IDE & Branch Mappings */}
          {ideMappings.length > 0 && (
            <div className={`${CARD_CLS} space-y-3`}>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Branch to Task Mappings
              </h3>

              <div className="space-y-2">
                {ideMappings.map((mapping) => {
                  const selectedTask = selectedTaskByMapping[mapping.id] ?? mapping.taskId
                  return (
                    <div
                      key={mapping.id}
                      className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold px-2 py-0.5 rounded-md bg-[#6d25da]/10 dark:bg-[#6d25da]/20 text-[#581eae] dark:text-[#c5a8f0]">
                            {mapping.ideType.toUpperCase()}
                          </span>
                          <span className="font-mono text-zinc-900 dark:text-white font-semibold">
                            {mapping.workspaceIdentifier}
                          </span>
                          <span className="text-zinc-400">·</span>
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">
                            {mapping.branchName}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {mapping.repoFullName} · Linked to{' '}
                          <strong className="text-zinc-800 dark:text-zinc-200 font-mono">
                            {mapping.taskCode}
                          </strong>{' '}
                          ({Math.round(mapping.confidenceScore * 100)}% match)
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
                          className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
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
                              text: `Linked branch "${mapping.branchName}" to ${tasks.find((t) => t.id === selectedTask)?.code ?? selectedTask
                                }.`,
                            })
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-xs font-semibold text-white cursor-pointer transition"
                        >
                          {mapping.confirmedByUser ? 'Update' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Enrolled Devices + Incoming Git Activity Log */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className={`lg:col-span-7 ${CARD_CLS} space-y-4`}>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Connected Devices ({devices.length})
              </h3>

              {devices.length === 0 ? (
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No devices enrolled yet. Sign in from the Desktop App or VS Code extension to connect a device.
                </div>
              ) : (
                <div className="space-y-3">
                  {devices.map((dev) => (
                    <div
                      key={dev.id}
                      className={`rounded-xl p-4 space-y-3 ring-1 ${dev.revokedAt
                          ? 'bg-rose-50/60 dark:bg-rose-950/20 ring-rose-500/25'
                          : 'bg-zinc-50 dark:bg-zinc-900/60 ring-zinc-950/[0.04] dark:ring-white/[0.06]'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-zinc-900 dark:text-white">
                            {dev.deviceName}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {dev.userName} · {dev.osPlatform} · App v{dev.agentVersion} · Clock{' '}
                            {dev.clockAnomalyDetected
                              ? `drift ${dev.lastClockDriftSeconds}s`
                              : 'in sync'}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${dev.revokedAt
                              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            }`}
                        >
                          {dev.revokedAt ? 'Revoked' : 'Active'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200/70 dark:border-zinc-800">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">
                            Release Channel:
                          </span>
                          <select
                            value={dev.updateChannel}
                            onChange={(e) =>
                              updateDeviceChannel(
                                dev.id,
                                e.target.value as EnrolledDeviceRecord['updateChannel']
                              )
                            }
                            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-900 dark:text-white"
                          >
                            <option value="stable">Stable</option>
                            <option value="beta">Beta</option>
                            <option value="enterprise_pinned">Pinned</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleDeviceRevocation(dev.id)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition ${dev.revokedAt
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                            }`}
                        >
                          {dev.revokedAt ? 'Restore Device' : 'Revoke Access'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`lg:col-span-5 ${CARD_CLS} space-y-4`}>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Incoming Git Webhook Activity ({webhookReceipts.length})
              </h3>

              {webhookReceipts.length === 0 ? (
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No incoming GitHub or GitLab events received yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {webhookReceipts.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#581eae] dark:text-[#c5a8f0] truncate">
                          {r.provider.toUpperCase()} · {r.eventType}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${r.status === 'processed'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : r.status === 'duplicate_ignored'
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            }`}
                        >
                          {r.status === 'processed'
                            ? 'Processed'
                            : r.status === 'duplicate_ignored'
                              ? 'Duplicate'
                              : 'Rejected'}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-800 dark:text-zinc-200">{r.summary}</div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        Delivery: {r.deliveryId}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
