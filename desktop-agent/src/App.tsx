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
      idleSeconds: 1320, // 22 minutes unobserved gap
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

  async function addDenylistApp() {
    const trimmed = newExcludedApp.trim()
    if (!trimmed) return
    const updated = Array.from(new Set([...status.excluded_apps, trimmed]))
    setNewExcludedApp('')
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

  return (
    <div style={{ padding: 18, maxWidth: 400, margin: '0 auto', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#818cf8', fontWeight: 700 }}>
          DevProof Desktop Agent v0.2 (Phase 2)
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 99,
            background: status.privacy_pause_active ? '#7c2d12' : '#064e3b',
            color: status.privacy_pause_active ? '#fdba74' : '#6ee7b7',
            fontWeight: 700,
          }}
        >
          {status.privacy_pause_active ? 'PRIVACY PAUSE ON' : `CAT: ${status.foreground_category.toUpperCase()}`}
        </span>
      </div>

      <div style={{ fontSize: 32, fontFamily: 'monospace', fontWeight: 800, margin: '10px 0 4px' }}>
        {formatHms(status.elapsed_seconds)}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
        State: <strong style={{ color: '#e2e8f0' }}>{status.lifecycle.toUpperCase()}</strong> • Break:{' '}
        {formatHms(status.break_seconds)} • Queued: {status.queued_envelopes} • Drift: {status.clock_drift_seconds}s
      </div>

      <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
        Declared Work Mode (F1-023 / F2-001)
      </label>
      <select
        value={workMode}
        onChange={(e) => setWorkMode(e.target.value)}
        style={{
          width: '100%',
          padding: 8,
          borderRadius: 8,
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #334155',
          marginBottom: 10,
        }}
      >
        <option value="coding">coding</option>
        <option value="debugging">debugging</option>
        <option value="thinking">thinking / architecture (90m focus window)</option>
        <option value="research">research / documentation</option>
        <option value="testing">testing</option>
        <option value="review">code_review</option>
        <option value="meeting">meeting / pair programming</option>
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => void transition('running')}
          style={{ padding: 9, borderRadius: 8, border: 0, background: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Start / Resume
        </button>
        <button
          type="button"
          onClick={() => void transition('on_break')}
          style={{ padding: 9, borderRadius: 8, border: 0, background: '#0284c7', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Start Break
        </button>
        <button
          type="button"
          onClick={() => void transition('paused')}
          style={{ padding: 9, borderRadius: 8, border: 0, background: '#d97706', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Pause
        </button>
        <button
          type="button"
          onClick={() => void transition('completed')}
          style={{ padding: 9, borderRadius: 8, border: 0, background: '#4f46e5', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Complete & Queue
        </button>
      </div>

      {/* F2-003 & F2-004: Return-from-Idle Reconciliation Card */}
      <div
        style={{
          padding: 10,
          borderRadius: 10,
          background: status.needs_idle_reconciliation ? '#451a03' : '#0f172a',
          border: status.needs_idle_reconciliation ? '1px solid #f59e0b' : '1px solid #1e293b',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fcd34d' }}>
            Return-from-Idle Reconciliation (F2-003 / F2-004)
          </span>
          {!status.needs_idle_reconciliation && (
            <button
              type="button"
              onClick={() => void simulateUnobservedIdleGap()}
              style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, border: '1px solid #475569', background: '#1e293b', color: '#cbd5e1', cursor: 'pointer' }}
            >
              Simulate 22m Gap
            </button>
          )}
        </div>
        {status.needs_idle_reconciliation ? (
          <div>
            <p style={{ fontSize: 11, color: '#fde68a', margin: '0 0 8px' }}>
              You had a {Math.round(status.unobserved_idle_seconds / 60)}m unobserved gap (never labeled fraud). How should this interval be categorized?
            </p>
            <select
              value={idleChoice}
              onChange={(e) => setIdleChoice(e.target.value)}
              style={{ width: '100%', padding: 6, borderRadius: 6, background: '#090d16', color: '#fff', border: '1px solid #b45309', marginBottom: 6, fontSize: 11 }}
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
              placeholder="Optional context note..."
              value={idleNote}
              onChange={(e) => setIdleNote(e.target.value)}
              style={{ width: '100%', padding: 6, borderRadius: 6, background: '#090d16', color: '#fff', border: '1px solid #b45309', marginBottom: 6, fontSize: 11, boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => void submitIdleReconciliation()}
              style={{ width: '100%', padding: 7, borderRadius: 6, border: 0, background: '#d97706', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
            >
              Confirm Reconciliation
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: '#64748b' }}>
            No unconfirmed input gaps. Multi-display policy: {status.multi_display_policy} (0 screenshots).
          </div>
        )}
      </div>

      {/* F2-005: Local Privacy Exclusions & Personal Mode */}
      <div style={{ padding: 10, borderRadius: 10, background: '#0f172a', border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1' }}>
            Local Privacy Exclusions (F2-005)
          </span>
          <button
            type="button"
            onClick={() => void togglePrivacyPause()}
            style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 6,
              border: 0,
              background: status.privacy_pause_active ? '#ea580c' : '#334155',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {status.privacy_pause_active ? 'Resume Work Capture' : '1-Click Privacy Pause'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>
          Suppressed locally before queuing: {status.excluded_apps.join(', ')}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Add app to local denylist..."
            value={newExcludedApp}
            onChange={(e) => setNewExcludedApp(e.target.value)}
            style={{ flex: 1, padding: 6, borderRadius: 6, background: '#090d16', color: '#fff', border: '1px solid #334155', fontSize: 11 }}
          />
          <button
            type="button"
            onClick={() => void addDenylistApp()}
            style={{ padding: '6px 10px', borderRadius: 6, border: 0, background: '#4f46e5', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
