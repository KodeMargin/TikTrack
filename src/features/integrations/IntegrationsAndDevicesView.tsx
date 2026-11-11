import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store, type EnrolledDeviceRecord } from '@/context/Phase2Store'

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

  const isFinanceOrClient =
    activeUser.role === 'finance' || activeUser.role === 'client_reviewer'

  if (isFinanceOrClient) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-amber-300 font-bold">
          Role Boundary Enforced (Section 12.4)
        </div>
        <h2 className="text-lg font-bold text-white">
          IDE, GitHub & Device Telemetry Controls Restricted
        </h2>
        <p className="text-xs text-slate-300 max-w-2xl">
          Finance and Client Reviewer personas cannot access developer workstation enrollments,
          VS Code branch mappings, or raw webhook delivery logs. Switch to Developer, Project
          Manager, or Tenant Owner to manage Phase 2 integrations.
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
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Integrations & Enrolled Devices
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
              Connect GitHub, GitLab, or your IDE extension, review branch-to-task mappings, and
              manage enrolled devices.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-semibold">Target Task:</label>
            <select
              value={simTaskId}
              onChange={(e) => setSimTaskId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-xl border px-3.5 py-2 text-xs flex items-center justify-between ${
              feedback.ok
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/40 text-rose-200'
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

      {/* Connected Integrations (F2-015, F2-016, F2-020, F2-025, F2-026) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              Connected Developer Integrations (One-Click Disconnect Supported — Sec 5.5)
            </h3>
            <p className="text-xs text-slate-400">
              Developers and admins can disconnect an IDE or Git integration at any time while
              retaining historical audit metadata per retention policy.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleEmitTelemetry('vscode_debug')}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white cursor-pointer"
            >
              + Emit VS Code Debug Event (F2-012)
            </button>
            <button
              type="button"
              onClick={() => handleEmitTelemetry('vscode_test')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
            >
              + Emit Local Test Run (F2-013)
            </button>
            <button
              type="button"
              onClick={() => handleEmitTelemetry('terminal_category')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              + Emit Terminal Category (F2-016)
            </button>
            <button
              type="button"
              onClick={() => handleEmitTelemetry('concurrent_ide_desktop')}
              className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-xs font-bold text-white cursor-pointer"
            >
              Test 10m Concurrent IDE+Desktop Merge
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {integrations.map((int) => (
            <div
              key={int.id}
              className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold">
                    {int.provider}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      int.status === 'connected'
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {int.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs font-bold text-white">{int.displayName}</div>
                <p className="text-[11px] text-slate-400 leading-snug">{int.scopeSummary}</p>
                <div className="text-[10px] font-mono text-slate-400">
                  Scope: {int.reposOrWorkspaces.join(', ')} • Retention: {int.retentionDays}d
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-500 font-mono">
                  ID: {int.installationId}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    toggleIntegrationConnection(int.id)
                    setFeedback({
                      ok: true,
                      text: `${int.displayName} is now ${
                        int.status === 'connected' ? 'disconnected' : 'connected'
                      }.`,
                    })
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    int.status === 'connected'
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-700/60 hover:bg-rose-900/70'
                      : 'bg-emerald-700 text-white hover:bg-emerald-600'
                  }`}
                >
                  {int.status === 'connected' ? 'Disconnect' : 'Connect / Opt-In'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* IDE Project-Task Mapping Suggestions (F2-010, F2-011) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">
            IDE Workspace & Branch-to-Task Mappings (F2-010, F2-011)
          </h3>
          <p className="text-xs text-slate-400">
            Branch names and workspace remotes generate suggested task links; developers can
            explicitly confirm or override any mapping.
          </p>
        </div>

        <div className="space-y-2">
          {ideMappings.map((mapping) => {
            const selectedTask = selectedTaskByMapping[mapping.id] ?? mapping.taskId
            return (
              <div
                key={mapping.id}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                      {mapping.ideType.toUpperCase()}
                    </span>
                    <span className="font-mono text-white font-semibold">
                      {mapping.workspaceIdentifier}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="font-mono text-cyan-300">{mapping.branchName}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Repo: {mapping.repoFullName} • Mapped Task:{' '}
                    <strong className="text-emerald-300 font-mono">{mapping.taskCode}</strong> (
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
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      confirmOrOverrideIdeMapping(mapping.id, selectedTask)
                      setFeedback({
                        ok: true,
                        text: `Confirmed workspace mapping "${mapping.branchName}" -> ${
                          tasks.find((t) => t.id === selectedTask)?.code ?? selectedTask
                        }.`,
                      })
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white cursor-pointer"
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
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60">
              F2-021..024 • Section 5.5 Replay Test
            </span>
            <span className="text-[11px] text-slate-400">HMAC-SHA256 Verified</span>
          </div>
          <h3 className="text-sm font-bold text-white">
            GitHub / GitLab Webhook Delivery & Replay Simulator
          </h3>
          <p className="text-xs text-slate-400">
            Send the same <code className="text-indigo-300">X-GitHub-Delivery</code> ID three
            times to verify idempotent deduplication into 1 canonical evidence artifact.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-300 mb-1">Provider</label>
              <select
                value={whProvider}
                onChange={(e) => setWhProvider(e.target.value as 'github' | 'gitlab')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
              >
                <option value="github">GitHub App</option>
                <option value="gitlab">GitLab Webhook</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-300 mb-1">Event Type</label>
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
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
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
              <label className="block text-[11px] text-slate-300 mb-1">
                X-GitHub-Delivery ID
              </label>
              <input
                type="text"
                value={whDeliveryId}
                onChange={(e) => setWhDeliveryId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-300 mb-1">
                External Artifact ID
              </label>
              <input
                type="text"
                value={whExternalId}
                onChange={(e) => setWhExternalId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-300 mb-1">Outcome Summary</label>
            <input
              type="text"
              value={whSummary}
              onChange={(e) => setWhSummary(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={whRetrospective}
                onChange={(e) => setWhRetrospective(e.target.checked)}
              />
              <span>Mark as Retrospective Outcome (R-05)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-rose-300">
              <input
                type="checkbox"
                checked={whTamperSig}
                onChange={(e) => setWhTamperSig(e.target.checked)}
              />
              <span>Simulate Invalid HMAC Signature</span>
            </label>
          </div>

          <button
            type="submit"
            className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white cursor-pointer"
          >
            Deliver Webhook Event (Click 3x to Verify Replay Deduplication)
          </button>
        </form>

        {/* Webhook Receipts Ledger */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Webhook Deduplication Ledger ({webhookReceipts.length})
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              UNIQUE(provider, delivery_id)
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {webhookReceipts.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-800 bg-slate-950/85 p-3 space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-indigo-300">
                    {r.provider.toUpperCase()} • {r.deliveryId}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      r.status === 'processed'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                        : r.status === 'duplicate_ignored'
                          ? 'bg-amber-950 text-amber-300 border border-amber-700/50'
                          : 'bg-rose-950 text-rose-300 border border-rose-700/50'
                    }`}
                  >
                    {r.status.toUpperCase()} ({r.deliveryAttemptCount}x)
                  </span>
                </div>
                <div className="text-xs text-white">{r.summary}</div>
                <div className="text-[10px] font-mono text-slate-500">
                  HMAC Verified: {String(r.signatureVerified)} • Event: {r.eventType}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Device Enrollment, Update Channels & Clock Anomaly Detection (F2-006..F2-008) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-white">
            Enrolled Desktop Devices, Update Channels & Clock Anomaly Monitor (F2-006..F2-008)
          </h3>
          <p className="text-xs text-slate-400">
            Compares monotonic client duration against server receipt time. Clock drift &gt;120s
            flags a technical anomaly badge (never treated as fraud) and preserves monotonic
            duration math.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {devices.map((dev) => (
            <div
              key={dev.id}
              className={`rounded-xl border p-4 space-y-2.5 ${
                dev.revokedAt
                  ? 'border-rose-700/60 bg-rose-950/20'
                  : dev.clockAnomalyDetected
                    ? 'border-amber-500/50 bg-amber-950/15'
                    : 'border-slate-800 bg-slate-950/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-white">{dev.deviceName}</div>
                  <div className="text-[11px] text-slate-400">
                    Owner: {dev.userName} • OS: {dev.osPlatform} • Agent v{dev.agentVersion}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    dev.revokedAt
                      ? 'bg-rose-950 text-rose-300 border border-rose-700'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  }`}
                >
                  {dev.revokedAt ? 'REVOKED' : 'ACTIVE'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-900 rounded-lg p-2">
                  <div className="text-slate-400">Clock Drift vs Server (F2-007)</div>
                  <div
                    className={`font-mono font-bold ${
                      dev.clockAnomalyDetected ? 'text-amber-300' : 'text-emerald-300'
                    }`}
                  >
                    {dev.lastClockDriftSeconds}s{' '}
                    {dev.clockAnomalyDetected ? '(Anomaly Notice R-08)' : '(Synchronized)'}
                  </div>
                </div>
                <div className="bg-slate-900 rounded-lg p-2">
                  <div className="text-slate-400">Multi-Display Policy (F2-008)</div>
                  <div className="font-mono font-semibold text-indigo-300">
                    {dev.multiDisplayPolicy}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400 text-[11px]">Channel:</span>
                  <select
                    value={dev.updateChannel}
                    onChange={(e) =>
                      updateDeviceChannel(
                        dev.id,
                        e.target.value as EnrolledDeviceRecord['updateChannel']
                      )
                    }
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-white"
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
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-amber-200 cursor-pointer"
                  >
                    {dev.clockAnomalyDetected ? 'Reset Clock Sync' : 'Simulate +185s Drift'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleDeviceRevocation(dev.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                      dev.revokedAt
                        ? 'bg-emerald-700 text-white'
                        : 'bg-rose-950/90 text-rose-300 border border-rose-700/60'
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

