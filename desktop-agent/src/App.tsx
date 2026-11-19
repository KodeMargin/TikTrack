import { useEffect, useState } from 'react'

interface TrayStatusDto {
  session_id: string | null
  lifecycle: 'idle' | 'running' | 'paused' | 'on_break' | 'completed'
  work_mode: string
  elapsed_seconds: number
  break_seconds: number
  queued_envelopes: number
  foreground_category: string
  privacy_pause_active: boolean
  excluded_apps: string[]
  unobserved_idle_seconds: number
  needs_idle_reconciliation: boolean
  clock_drift_seconds: number
  multi_display_policy: string
}

function formatHms(total: number): string {
  const hrs = String(Math.floor(total / 3600)).padStart(2, '0')
  const mins = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const secs = String(total % 60).padStart(2, '0')
  return `${hrs}:${mins}:${secs}`
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const core = await import('@tauri-apps/api/core')
    return await core.invoke<T>(cmd, args)
  } catch {
    return null
  }
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = window.localStorage.getItem('tiktrack-agent-theme')
      return saved === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })

  const [status, setStatus] = useState<TrayStatusDto>({
    session_id: null,
    lifecycle: 'idle',
    work_mode: 'coding',
    elapsed_seconds: 0,
    break_seconds: 0,
    queued_envelopes: 0,
    foreground_category: 'ide',
    privacy_pause_active: false,
    excluded_apps: ['1Password', 'Signal', 'Apple Health'],
    unobserved_idle_seconds: 0,
    needs_idle_reconciliation: false,
    clock_drift_seconds: 0,
    multi_display_policy: 'coarse_metadata_only',
  })
  const [workMode, setWorkMode] = useState('coding')
  const [newExcludedApp, setNewExcludedApp] = useState('')
  const [idleChoice, setIdleChoice] = useState('thinking')
  const [idleNote, setIdleNote] = useState('')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.background = theme === 'dark' ? '#09090b' : '#ffffff'
    document.body.style.background = theme === 'dark' ? '#09090b' : '#ffffff'
    try {
      window.localStorage.setItem('tiktrack-agent-theme', theme)
    } catch {
      // Ignore storage errors in restricted webviews
    }
  }, [theme])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void invokeTauri<TrayStatusDto>('get_tray_status').then((res) => {
        if (res) {
          setStatus(res)
        } else {
          setStatus((prev) =>
            prev.lifecycle === 'running'
              ? { ...prev, elapsed_seconds: prev.elapsed_seconds + 1 }
              : prev.lifecycle === 'on_break'
                ? { ...prev, break_seconds: prev.break_seconds + 1 }
                : prev
          )
        }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function transition(target: TrayStatusDto['lifecycle']) {
    const res = await invokeTauri<TrayStatusDto>('start_or_transition_session', {
      projectId: 'proj_core_api',
      taskId: 'task_101',
      workMode,
      targetState: target,
    })
    if (res) {
      setStatus(res)
      return
    }
    setStatus((prev) => ({
      ...prev,
      lifecycle: target,
      work_mode: workMode,
      queued_envelopes: prev.queued_envelopes + 1,
    }))
  }

  async function togglePrivacyPause() {
    const nextPause = !status.privacy_pause_active
    const res = await invokeTauri<TrayStatusDto>('set_privacy_pause_and_denylist', {
      privacyPauseActive: nextPause,
      excludedApps: status.excluded_apps,
    })
    if (res) {
      setStatus(res)
      return
    }
    setStatus((prev) => ({
      ...prev,
      privacy_pause_active: nextPause,
      foreground_category: nextPause ? 'excluded_private' : 'ide',
    }))
  }

  async function simulateUnobservedIdleGap() {
    const res = await invokeTauri<TrayStatusDto>('record_activity_bucket', {
      foregroundApp: 'com.microsoft.VSCode',
      hasInputSignal: false,
      idleSeconds: 1320,
    })
    if (res) {
      setStatus(res)
      return
    }
    setStatus((prev) => ({
      ...prev,
      foreground_category: 'unobserved',
      unobserved_idle_seconds: 1320,
      needs_idle_reconciliation: true,
    }))
  }

  async function submitIdleReconciliation() {
    const res = await invokeTauri<TrayStatusDto>('reconcile_idle_gap', {
      choice: idleChoice,
      note: idleNote || `Reconciled 22m unobserved gap as ${idleChoice}`,
    })
    if (res) {
      setStatus(res)
      setIdleNote('')
      return
    }
    setStatus((prev) => ({
      ...prev,
      foreground_category: 'ide',
      unobserved_idle_seconds: 0,
      needs_idle_reconciliation: false,
      queued_envelopes: prev.queued_envelopes + 1,
    }))
    setIdleNote('')
  }

  async function updateDenylist(updated: string[]) {
    const res = await invokeTauri<TrayStatusDto>('set_privacy_pause_and_denylist', {
      privacyPauseActive: status.privacy_pause_active,
      excludedApps: updated,
    })
    if (res) {
      setStatus(res)
      return
    }
    setStatus((prev) => ({ ...prev, excluded_apps: updated }))
  }

  async function addDenylistApp() {
    const trimmed = newExcludedApp.trim()
    if (!trimmed) return
    const updated = Array.from(new Set([...status.excluded_apps, trimmed]))
    setNewExcludedApp('')
    await updateDenylist(updated)
  }

  async function removeDenylistApp(appName: string) {
    const updated = status.excluded_apps.filter((a) => a !== appName)
    await updateDenylist(updated)
  }

  return (
    <div className="tt-shell">
      {/* Header */}
      <header className="tt-header">
        <div className="tt-brand">
          <div className="tt-logo-mark" aria-hidden="true">
            T
          </div>
          <div className="tt-brand-text">
            <span className="tt-brand-title">TikTrack Agent</span>
            <span className="tt-brand-sub">v0.2.0 • Privacy-First</span>
          </div>
        </div>

        <div className="tt-header-actions">
          <span
            className={`tt-badge ${status.privacy_pause_active ? 'tt-badge--warn' : 'tt-badge--ok'}`}
          >
            {status.privacy_pause_active
              ? 'PRIVACY PAUSE'
              : `CAT: ${status.foreground_category.toUpperCase()}`}
          </span>
          <button
            type="button"
            className="tt-icon-btn"
            aria-label="Toggle Light/Dark Theme"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Timer & Controls Card */}
      <section className="tt-card">
        <div className="tt-timer-row">
          <div className="tt-timer-value">{formatHms(status.elapsed_seconds)}</div>
          <span className="tt-state-pill">
            <span className={`tt-dot tt-dot--${status.lifecycle}`} />
            {status.lifecycle.replace('_', ' ')}
          </span>
        </div>

        <div className="tt-metrics">
          <div className="tt-metric">
            <span className="tt-metric-label">Break</span>
            <span className="tt-metric-value">{formatHms(status.break_seconds)}</span>
          </div>
          <div className="tt-metric">
            <span className="tt-metric-label">Queued</span>
            <span className="tt-metric-value">{status.queued_envelopes}</span>
          </div>
          <div className="tt-metric">
            <span className="tt-metric-label">Clock Drift</span>
            <span className="tt-metric-value">{status.clock_drift_seconds}s</span>
          </div>
        </div>

        <label className="tt-label" htmlFor="tt-work-mode">
          Declared Work Mode
        </label>
        <select
          id="tt-work-mode"
          className="tt-select"
          value={workMode}
          onChange={(e) => setWorkMode(e.target.value)}
        >
          <option value="coding">Coding</option>
          <option value="debugging">Debugging</option>
          <option value="thinking">Thinking / Architecture (90m focus)</option>
          <option value="research">Research / Documentation</option>
          <option value="testing">Testing</option>
          <option value="review">Code Review</option>
          <option value="meeting">Meeting / Pair Programming</option>
        </select>

        <div className="tt-btn-grid">
          <button
            type="button"
            className="tt-btn tt-btn--emerald"
            onClick={() => void transition('running')}
          >
            Start / Resume
          </button>
          <button
            type="button"
            className="tt-btn tt-btn--secondary"
            onClick={() => void transition('on_break')}
          >
            Start Break
          </button>
          <button
            type="button"
            className="tt-btn tt-btn--secondary"
            onClick={() => void transition('paused')}
          >
            Pause
          </button>
          <button
            type="button"
            className="tt-btn tt-btn--primary"
            onClick={() => void transition('completed')}
          >
            Complete & Queue
          </button>
        </div>
      </section>

      {/* Return-from-Idle Reconciliation Card */}
      <section className={`tt-card ${status.needs_idle_reconciliation ? 'tt-card--warn' : ''}`}>
        <div className="tt-section-head">
          <span
            className={`tt-section-title ${status.needs_idle_reconciliation ? 'tt-section-title--warn' : ''}`}
          >
            Idle Reconciliation
          </span>
          {!status.needs_idle_reconciliation && (
            <button
              type="button"
              className="tt-btn tt-btn--secondary tt-btn--sm"
              onClick={() => void simulateUnobservedIdleGap()}
            >
              Simulate 22m Gap
            </button>
          )}
        </div>

        {status.needs_idle_reconciliation ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <p className="tt-warn-note">
              You had a {Math.round(status.unobserved_idle_seconds / 60)}m unobserved gap (never
              labeled fraud). How should this interval be categorized?
            </p>
            <select
              className="tt-select"
              value={idleChoice}
              onChange={(e) => setIdleChoice(e.target.value)}
            >
              <option value="thinking">Thinking / Whiteboard Architecture</option>
              <option value="reading">Reading Documentation / Specs</option>
              <option value="meeting">Ad-hoc Call / Pair Discussion</option>
              <option value="break">Personal Break</option>
              <option value="away">Away from Desk (Exclude from Claim)</option>
              <option value="other">Other Engineering Context</option>
            </select>
            <input
              type="text"
              className="tt-input"
              placeholder="Optional context note..."
              value={idleNote}
              onChange={(e) => setIdleNote(e.target.value)}
            />
            <button
              type="button"
              className="tt-btn tt-btn--amber tt-btn--full"
              onClick={() => void submitIdleReconciliation()}
            >
              Confirm Reconciliation
            </button>
          </div>
        ) : (
          <div className="tt-muted-note">
            No unconfirmed input gaps. Policy: <strong>{status.multi_display_policy}</strong> (0
            screenshots).
          </div>
        )}
      </section>

      {/* Local Privacy Exclusions Card */}
      <section className="tt-card">
        <div className="tt-section-head">
          <span className="tt-section-title">Local Privacy Exclusions</span>
          <button
            type="button"
            className={`tt-btn tt-btn--sm ${status.privacy_pause_active ? 'tt-btn--amber' : 'tt-btn--primary'}`}
            onClick={() => void togglePrivacyPause()}
          >
            {status.privacy_pause_active ? 'Resume Capture' : '1-Click Privacy Pause'}
          </button>
        </div>

        <div className="tt-chips">
          {status.excluded_apps.map((appName) => (
            <span key={appName} className="tt-chip">
              {appName}
              <button
                type="button"
                className="tt-chip-remove"
                aria-label={`Remove ${appName}`}
                onClick={() => void removeDenylistApp(appName)}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="tt-input-row">
          <input
            type="text"
            className="tt-input"
            placeholder="Add app to local denylist..."
            value={newExcludedApp}
            onChange={(e) => setNewExcludedApp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addDenylistApp()
            }}
          />
          <button
            type="button"
            className="tt-btn tt-btn--primary tt-btn--sm"
            onClick={() => void addDenylistApp()}
          >
            Add
          </button>
        </div>
      </section>
    </div>
  )
}
