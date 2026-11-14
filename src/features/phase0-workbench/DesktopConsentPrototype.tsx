import { useState } from 'react'
import type {
  CanonicalEventEnvelope,
  SessionLifecycleState,
  WorkMode,
} from '@/types/domain.types'
import { DEFAULT_TRACKING_POLICY_SPEC, validateEventEnvelope } from '@/lib/schemas'

const WORK_MODES: { mode: WorkMode; label: string; badge: string; deepWork: boolean; desc: string }[] = [
  {
    mode: 'coding',
    label: 'Coding',
    badge: 'IDE / Active Build',
    deepWork: false,
    desc: 'Standard implementation with optional coarse IDE/Git metadata.',
  },
  {
    mode: 'thinking',
    label: 'Thinking / Architecture',
    badge: 'Deep Work (No Input Required)',
    deepWork: true,
    desc: 'Silent reasoning, whiteboarding, or system design. Suppresses idle gap flags.',
  },
  {
    mode: 'debugging',
    label: 'Debugging',
    badge: 'Investigation',
    deepWork: false,
    desc: 'Root-cause investigation supported by debugger sessions, test runs, and notes.',
  },
  {
    mode: 'research',
    label: 'Research / Docs',
    badge: 'Deep Work (Reading)',
    deepWork: true,
    desc: 'Reading RFCs, API documentation, or papers without artificial keystrokes.',
  },
  {
    mode: 'testing',
    label: 'Testing / QA',
    badge: 'Verification',
    deepWork: false,
    desc: 'Writing and executing unit, integration, or pgTAP security suites.',
  },
  {
    mode: 'review',
    label: 'Code Review',
    badge: 'PR / Architecture Review',
    deepWork: true,
    desc: 'Reviewing pull requests, security rules, and deliverable acceptance criteria.',
  },
  {
    mode: 'meeting',
    label: 'Meeting / Pairing',
    badge: 'Collaboration',
    deepWork: true,
    desc: 'Pair programming or client/team sync where another participant may be typing.',
  },
  {
    mode: 'design',
    label: 'UI / Schema Design',
    badge: 'Deep Work',
    deepWork: true,
    desc: 'Database schema modeling, UX flows, or specification authoring.',
  },
]

export function DesktopConsentPrototype() {
  const [policyConsented, setPolicyConsented] = useState(true)
  const [lifecycle, setLifecycle] = useState<SessionLifecycleState>('running')
  const [selectedMode, setSelectedMode] = useState<WorkMode>('thinking')
  const [isOffline, setIsOffline] = useState(false)
  const [sessionNote, setSessionNote] = useState(
    'Designing PostgreSQL btree_gist non-overlapping time_segments constraint and RLS policy helpers.'
  )
  const [excludedAppsInput, setExcludedAppsInput] = useState('1Password, Signal, WhatsApp, Apple Mail, Spotify')
  const [showIdlePrompt, setShowIdlePrompt] = useState(true)
  const [idleResolution, setIdleResolution] = useState<string | null>(null)
  const [simulatedEvents, setSimulatedEvents] = useState<CanonicalEventEnvelope[]>([
    {
      event_id: '01J9Z8A001-SESSION-START',
      schema_version: 1,
      tenant_id: 'tenant-northstar-labs',
      user_id: 'usr-dev-aria',
      device_id: 'dev-macbook-pro-1',
      session_id: 'ses-20261110-001',
      source: 'desktop',
      event_type: 'session_started',
      occurred_at_utc: '2026-11-10T09:00:00Z',
      received_at_utc: '2026-11-10T09:00:01Z',
      local_sequence: 1,
      monotonic_elapsed_ms: 0,
      consent_policy_version: DEFAULT_TRACKING_POLICY_SPEC.version,
      metadata: {
        project_code: 'SETTLEMENT-CORE',
        task_code: 'DEV-104',
        work_mode: 'thinking',
      },
      integrity: {
        agent_build: '1.0.0-tauri',
        batch_id: 'batch-1001',
      },
    },
  ])

  const activeModeObj = WORK_MODES.find((m) => m.mode === selectedMode) ?? WORK_MODES[0]
  const excludedList = excludedAppsInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  function emitPrototypeEvent(
    eventType: CanonicalEventEnvelope['event_type'],
    extraMeta: Record<string, string | number | boolean>
  ) {
    const nextSeq = simulatedEvents.length + 1
    const candidate: CanonicalEventEnvelope = {
      event_id: `01J9Z8A00${nextSeq}-${eventType.toUpperCase()}`,
      schema_version: 1,
      tenant_id: 'tenant-northstar-labs',
      user_id: 'usr-dev-aria',
      device_id: 'dev-macbook-pro-1',
      session_id: 'ses-20261110-001',
      source: 'desktop',
      event_type: eventType,
      occurred_at_utc: new Date().toISOString(),
      received_at_utc: isOffline ? undefined : new Date().toISOString(),
      local_sequence: nextSeq,
      monotonic_elapsed_ms: nextSeq * 900000,
      consent_policy_version: DEFAULT_TRACKING_POLICY_SPEC.version,
      metadata: {
        task_code: 'DEV-104',
        work_mode: selectedMode,
        ...extraMeta,
      },
      integrity: {
        agent_build: '1.0.0-tauri',
        batch_id: isOffline ? 'offline-encrypted-sqlite-queue' : `batch-100${nextSeq}`,
      },
    }

    const validation = validateEventEnvelope(candidate, excludedList)
    const validatedData = validation.data
    if (validation.valid && validatedData) {
      setSimulatedEvents((prev) => [validatedData, ...prev])
    }
  }

  function handleModeSelect(mode: WorkMode) {
    setSelectedMode(mode)
    emitPrototypeEvent('work_mode_changed', {
      new_mode: mode,
      deep_work_protected: WORK_MODES.some((m) => m.mode === mode && m.deepWork),
    })
  }

  function handleReconcileIdle(choice: string) {
    setIdleResolution(choice)
    setShowIdlePrompt(false)
    emitPrototypeEvent('idle_gap_reconciled', {
      gap_minutes: 22,
      reconciled_as: choice,
      note: 'Whiteboarding session state machine transitions on notepad',
    })
  }

  function handleFlushOfflineQueue() {
    setIsOffline(false)
    setSimulatedEvents((prev) =>
      prev.map((ev) => ({
        ...ev,
        received_at_utc: ev.received_at_utc ?? new Date().toISOString(),
        integrity: {
          ...ev.integrity,
          batch_id:
            ev.integrity.batch_id === 'offline-encrypted-sqlite-queue'
              ? 'batch-reconciled-idempotent'
              : ev.integrity.batch_id,
        },
      }))
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Tauri Desktop Mini-Timer & Consent UX */}
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 shadow-xl overflow-hidden">
          {/* Persistent System Tray / Top Bar Indicator (F1-027) */}
          <div
            className={`px-4 py-2.5 flex items-center justify-between text-xs font-medium border-b ${!policyConsented
                ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                : lifecycle === 'running'
                  ? 'bg-zinc-50 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
                  : lifecycle === 'on_break'
                    ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-200'
                    : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${!policyConsented
                    ? 'bg-rose-400'
                    : lifecycle === 'running'
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-amber-400'
                  }`}
              />
              <span>
                {!policyConsented
                  ? 'TRACKING BLOCKED - CONSENT REQUIRED'
                  : lifecycle === 'running'
                    ? `VISIBLE TRACKING ACTIVE • ${activeModeObj.label.toUpperCase()}`
                    : lifecycle === 'on_break'
                      ? 'ON BREAK - EXCLUDED FROM BILLABLE CLAIM'
                      : 'SESSION PAUSED - NO METADATA COLLECTED'}
              </span>
            </div>
            <span className="font-mono text-[11px] opacity-80">
              {isOffline ? 'OFFLINE (SQLite AES-256)' : 'SYNCED TLS 1.3'}
            </span>
          </div>

          <div className="p-5 space-y-5">
            {/* Tenant / Project / Task Context Header (F1-021) */}
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/80 pb-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                  Northstar Labs • Acme FinTech Global
                </div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white mt-0.5">
                  DEV-104: Multi-Tenant RLS & GiST Non-Overlap Ledger
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Assigned to <span className="text-zinc-800 dark:text-zinc-200">Aria Chen</span> • Policy{' '}
                  <span className="font-mono text-[#6d25da] dark:text-[#c5a8f0]">
                    {DEFAULT_TRACKING_POLICY_SPEC.version}
                  </span>
                </p>
              </div>
              <div className="text-right font-mono">
                <div className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">01:30:00</div>
                <div className="text-[11px] text-[#6d25da] dark:text-[#a87ce9]">Monotonic Clock Verified</div>
              </div>
            </div>

            {/* Session Lifecycle Controls (F1-022 & F1-024) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!policyConsented}
                onClick={() => {
                  setLifecycle('running')
                  emitPrototypeEvent('session_resumed', { state: 'running' })
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${lifecycle === 'running'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  } disabled:opacity-40`}
              >
                ● Active Session
              </button>
              <button
                type="button"
                onClick={() => {
                  setLifecycle('paused')
                  emitPrototypeEvent('session_paused', { state: 'paused' })
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${lifecycle === 'paused'
                    ? 'bg-amber-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
              >
                ❚❚ Pause Tracking
              </button>
              <button
                type="button"
                onClick={() => {
                  setLifecycle('on_break')
                  emitPrototypeEvent('break_started', { break_type: 'paid_15m_allowance' })
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${lifecycle === 'on_break'
                    ? 'bg-[#702fe3] text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
              >
                ☕ Take Break
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isOffline) {
                    handleFlushOfflineQueue()
                  } else {
                    setIsOffline(true)
                  }
                }}
                className={`ml-auto px-3 py-2 rounded-lg text-xs font-medium border transition cursor-pointer ${isOffline
                    ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200'
                    : 'border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
              >
                {isOffline ? '⚡ Reconnect & Flush Queue' : 'Simulate Offline Mode'}
              </button>
            </div>

            {/* First-Class Work Mode Picker (F1-014 & F1-023) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Declared Work Mode (First-Class Signal)
                </label>
                {activeModeObj.deepWork && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/20 text-[#6d25da] dark:text-[#c5a8f0] border border-[#6d25da]/30">
                    Deep-Work Protected: Zero Keystrokes Required
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {WORK_MODES.map((item) => {
                  const selected = item.mode === selectedMode
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => handleModeSelect(item.mode)}
                      className={`text-left p-2.5 rounded-lg border transition cursor-pointer ${selected
                          ? 'border-[#6d25da] bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-zinc-900 dark:text-white'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{item.label}</span>
                        {item.deepWork && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0]">
                            Deep
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">{item.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Contemporaneous Session Note & Outcome (F1-026) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                Contemporaneous Work Note / Reasoning Context
              </label>
              <textarea
                rows={2}
                value={sessionNote}
                onChange={(e) => setSessionNote(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 focus:border-[#6d25da] focus:outline-none"
                placeholder="What problem are you reasoning through, debugging, or designing?"
              />
            </div>

            {/* Return-From-Idle Non-Accusatory Reconciliation (F2-004) */}
            {showIdlePrompt ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/25 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Return-From-Idle Context Check (22m Unobserved Interval)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                    Rule R-01 • Not a Penalty
                  </span>
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  No keyboard or IDE signal was observed from <span className="font-mono">09:40–10:02</span>.
                  How should this segment be represented on your timesheet?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Thinking / Whiteboarding',
                    'Reading Documentation',
                    'Client / Team Call',
                    'Unpaid Personal Break',
                  ].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleReconcileIdle(option)}
                      className="px-2.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-800 dark:text-amber-100 text-xs font-medium transition cursor-pointer"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 px-3.5 py-2.5 flex items-center justify-between text-xs text-zinc-800 dark:text-zinc-200">
                <span>
                  ✓ 22m interval reconciled as: <strong>{idleResolution}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setShowIdlePrompt(true)}
                  className="text-[#6d25da] dark:text-[#a87ce9] underline cursor-pointer"
                >
                  Change
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Consent Ledger, Local Privacy Denylist & Outgoing Event Queue */}
      <div className="lg:col-span-7 space-y-5">
        {/* Consent & Local Privacy Controls (F1-030 & F2-005) */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Explicit Policy Consent & Local Privacy Exclusions (D-004 / F1-030 / F2-005)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Tracking is strictly opt-in per session and governed by versioned tenant policies.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                checked={policyConsented}
                onChange={(e) => setPolicyConsented(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 text-[#6d25da] dark:text-[#a87ce9] focus:ring-[#6d25da]"
              />
              Acknowledge Policy {DEFAULT_TRACKING_POLICY_SPEC.version}
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-3">
              <div className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
                Permitted Collection Scope (During Active Session Only)
              </div>
              <ul className="space-y-1 text-zinc-700 dark:text-zinc-300 text-[11px]">
                <li>• Session start/pause/stop & declared work mode</li>
                <li>• Coarse on-device app category (IDE, Browser, Terminal)</li>
                <li>• Opt-in VS Code branch, debug session & test counts</li>
                <li>• Linked GitHub PR, review & commit identifiers</li>
              </ul>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/20 p-3">
              <div className="font-semibold text-rose-700 dark:text-rose-300 mb-1.5">
                Hard-Blocked by Architecture (Never Collected)
              </div>
              <ul className="space-y-1 text-zinc-700 dark:text-zinc-300 text-[11px]">
                <li>✗ Raw keystrokes, key counts, or clipboard contents</li>
                <li>✗ Private messages, Slack/email text, or raw window titles</li>
                <li>✗ Raw source code files or unapproved screen recordings</li>
                <li>✗ Webcam frames, microphone audio, or background spyware</li>
              </ul>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              On-Device Personal App Denylist (Suppressed Before Local Queue)
            </label>
            <input
              type="text"
              value={excludedAppsInput}
              onChange={(e) => setExcludedAppsInput(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 font-mono"
            />
          </div>
        </div>

        {/* Local Privacy Audit View: Exact Outgoing Event Envelopes (F2-035) */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Developer Local Privacy Audit Log - "What Was Captured & Queued" (F2-035)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Every event envelope is inspectable locally before and after batch upload.
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {simulatedEvents.length} events in buffer
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {simulatedEvents.map((ev) => (
              <div
                key={ev.event_id}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/90 p-3 font-mono text-[11px]"
              >
                <div className="flex items-center justify-between text-[#6d25da] dark:text-[#c5a8f0] mb-1">
                  <span>
                    #{ev.local_sequence} • {ev.event_type} ({ev.event_id})
                  </span>
                  <span
                    className={
                      ev.received_at_utc ? 'text-[#6d25da] dark:text-[#a87ce9]' : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {ev.received_at_utc ? 'ACKED BY SERVER' : 'QUEUED OFFLINE (ENCRYPTED)'}
                  </span>
                </div>
                <pre className="text-zinc-500 dark:text-zinc-400 overflow-x-auto">
                  {JSON.stringify(ev.metadata, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

