import { useEffect, useState } from 'react'

interface AgentAuthPublicDto {
  server_url: string
  user_id: string
  email: string
  name: string
  role: string
  status: string
  must_change_password: boolean
  tenant_id: string
  tenant_name: string
  pairing_token: string | null
}

interface AssignedTaskDto {
  id: string
  projectId: string
  projectCode: string
  projectName: string
  code: string
  title: string
  status: string
  priority: string
  estimateMinutes: number
  defaultWorkMode: string
  dueDate: string | null
}

interface TrayStatusDto {
  session_id: string | null
  project_id: string
  task_id: string
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
  auth: AgentAuthPublicDto | null
  assigned_tasks: AssignedTaskDto[]
  is_online: boolean
  last_sync_at_utc: string | null
  last_sync_error: string | null
}

interface SubmitSessionResultDto {
  synced_online: boolean
  message: string
  status: TrayStatusDto
}

const DEFAULT_SERVER_URL = 'https://tiktrack-portal.vercel.app'

function formatHms(total: number): string {
  const hrs = String(Math.floor(total / 3600)).padStart(2, '0')
  const mins = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const secs = String(total % 60).padStart(2, '0')
  return `${hrs}:${mins}:${secs}`
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core')
  return core.invoke<T>(cmd, args)
}

async function tryInvokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invokeTauri<T>(cmd, args)
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
    project_id: '',
    task_id: '',
    lifecycle: 'idle',
    work_mode: 'coding',
    elapsed_seconds: 0,
    break_seconds: 0,
    queued_envelopes: 0,
    foreground_category: 'ide',
    privacy_pause_active: false,
    excluded_apps: ['1Password', 'Signal'],
    unobserved_idle_seconds: 0,
    needs_idle_reconciliation: false,
    clock_drift_seconds: 0,
    multi_display_policy: 'coarse_metadata_only',
    auth: null,
    assigned_tasks: [],
    is_online: true,
    last_sync_at_utc: null,
    last_sync_error: null,
  })

  // Auth form state
  const [loginTab, setLoginTab] = useState<'password' | 'token'>('password')
  const [serverUrl, setServerUrl] = useState<string>(() => {
    try {
      return window.localStorage.getItem('tiktrack-agent-server') || DEFAULT_SERVER_URL
    } catch {
      return DEFAULT_SERVER_URL
    }
  })
  const [showServerConfig, setShowServerConfig] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pairingToken, setPairingToken] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  // First-time password activation state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Workspace controls state
  const [workMode, setWorkMode] = useState('coding')
  const [newExcludedApp, setNewExcludedApp] = useState('')
  const [idleChoice, setIdleChoice] = useState('thinking')
  const [idleNote, setIdleNote] = useState('')

  // Submit panel state
  const [showSubmitPanel, setShowSubmitPanel] = useState(false)
  const [submitNote, setSubmitNote] = useState('')
  const [markTaskForReview, setMarkTaskForReview] = useState(false)
  const [submitTimesheet, setSubmitTimesheet] = useState(true)
  const [submitBusy, setSubmitBusy] = useState(false)

  // General banner notice
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.background = theme === 'dark' ? '#09090b' : '#ffffff'
    document.body.style.background = theme === 'dark' ? '#09090b' : '#ffffff'
    try {
      window.localStorage.setItem('tiktrack-agent-theme', theme)
    } catch {
      // Ignore storage errors
    }
  }, [theme])

  // Initial load + 1s timer poll
  useEffect(() => {
    void tryInvokeTauri<TrayStatusDto>('get_tray_status').then((res) => {
      if (res) {
        setStatus(res)
        if (res.work_mode) setWorkMode(res.work_mode)
        if (res.auth && res.auth.status === 'active' && !res.auth.must_change_password) {
          void tryInvokeTauri<TrayStatusDto>('fetch_assigned_tasks').then((updated) => {
            if (updated) setStatus(updated)
          })
        }
      }
    })

    const timer = window.setInterval(() => {
      void tryInvokeTauri<TrayStatusDto>('get_tray_status').then((res) => {
        if (res) {
          setStatus(res)
        }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Auto-sync offline queue every 30s when authenticated & active
  useEffect(() => {
    if (!status.auth || status.auth.status !== 'active' || status.auth.must_change_password) {
      return
    }
    const syncTimer = window.setInterval(() => {
      if (status.queued_envelopes > 0 || !status.is_online) {
        void tryInvokeTauri<TrayStatusDto>('sync_offline_queue').then((res) => {
          if (res) setStatus(res)
        })
      }
    }, 30000)
    return () => window.clearInterval(syncTimer)
  }, [status.auth, status.queued_envelopes, status.is_online])

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAuthBusy(true)
    setNotice(null)
    try {
      try {
        window.localStorage.setItem('tiktrack-agent-server', serverUrl.trim() || DEFAULT_SERVER_URL)
      } catch {
        // ignore
      }
      const res =
        loginTab === 'password'
          ? await invokeTauri<TrayStatusDto>('login_with_password', {
              serverUrl: serverUrl.trim() || DEFAULT_SERVER_URL,
              email: email.trim(),
              password,
            })
          : await invokeTauri<TrayStatusDto>('login_with_pairing_token', {
              serverUrl: serverUrl.trim() || DEFAULT_SERVER_URL,
              token: pairingToken.trim(),
            })
      setStatus(res)
      if (res.work_mode) setWorkMode(res.work_mode)
      setPassword('')
      setPairingToken('')
      setNotice({ ok: true, text: `Signed in to ${res.auth?.tenant_name ?? 'TikTrack'}.` })
    } catch (err) {
      setNotice({ ok: false, text: String(err) })
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleActivatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      setNotice({ ok: false, text: 'Password must be at least 6 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setNotice({ ok: false, text: 'Passwords do not match.' })
      return
    }
    setAuthBusy(true)
    setNotice(null)
    try {
      const res = await invokeTauri<TrayStatusDto>('activate_invited_password', {
        newPassword,
      })
      setStatus(res)
      setNewPassword('')
      setConfirmPassword('')
      setNotice({
        ok: true,
        text: 'Profile activated! Your Tenant Owner can now assign tasks to you.',
      })
    } catch (err) {
      setNotice({ ok: false, text: String(err) })
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleLogout() {
    setNotice(null)
    const res = await tryInvokeTauri<TrayStatusDto>('logout_agent')
    if (res) {
      setStatus(res)
      setShowSubmitPanel(false)
    }
  }

  async function handleRefreshTasks() {
    setSyncBusy(true)
    setNotice(null)
    try {
      const res = await invokeTauri<TrayStatusDto>('fetch_assigned_tasks')
      setStatus(res)
      setNotice({
        ok: res.is_online,
        text: res.is_online
          ? `Synced ${res.assigned_tasks.length} assigned task(s).`
          : 'Offline mode: showing cached assigned tasks.',
      })
    } catch (err) {
      setNotice({ ok: false, text: String(err) })
    } finally {
      setSyncBusy(false)
    }
  }

  async function handleSyncQueue() {
    setSyncBusy(true)
    setNotice(null)
    try {
      const res = await invokeTauri<TrayStatusDto>('sync_offline_queue')
      setStatus(res)
      setNotice({
        ok: res.is_online,
        text: res.is_online
          ? res.queued_envelopes === 0
            ? 'All queued sessions synced!'
            : `Synced partial queue (${res.queued_envelopes} remaining).`
          : res.last_sync_error || 'Still offline. Queue remains encrypted locally.',
      })
    } catch (err) {
      setNotice({ ok: false, text: String(err) })
    } finally {
      setSyncBusy(false)
    }
  }

  async function handleSelectTask(taskId: string) {
    const task = status.assigned_tasks.find((t) => t.id === taskId)
    if (!task) return
    setNotice(null)
    try {
      const res = await invokeTauri<TrayStatusDto>('select_task', {
        projectId: task.projectId,
        taskId: task.id,
        workMode: task.defaultWorkMode || workMode,
      })
      setStatus(res)
      if (task.defaultWorkMode) setWorkMode(task.defaultWorkMode)
    } catch (err) {
      setNotice({ ok: false, text: String(err) })
    }
  }

  async function transition(target: TrayStatusDto['lifecycle']) {
    setNotice(null)
    try {
      const res = await invokeTauri<TrayStatusDto>('start_or_transition_session', {
        projectId: status.project_id,
        taskId: status.task_id,
        workMode,
        targetState: target,
      })
      setStatus(res)
    } catch (err) {
      setNotice({ ok: false, text: String(err) })
    }
  }

  async function handleSubmitSession(e: React.FormEvent) {
    e.preventDefault()
    setSubmitBusy(true)
    setNotice(null)
    try {
      const result = await invokeTauri<SubmitSessionResultDto>('submit_completed_session', {
        developerNote: submitNote.trim(),
        markTaskForReview,
        submitTimesheet,
      })
      setStatus(result.status)
      setShowSubmitPanel(false)
      setSubmitNote('')
      setMarkTaskForReview(false)
      setNotice({ ok: true, text: result.message })
    } catch (err) {
      setNotice({ ok: false, text: String(err) })
    } finally {
      setSubmitBusy(false)
    }
  }

  async function togglePrivacyPause() {
    const nextPause = !status.privacy_pause_active
    const res = await tryInvokeTauri<TrayStatusDto>('set_privacy_pause_and_denylist', {
      privacyPauseActive: nextPause,
      excludedApps: status.excluded_apps,
    })
    if (res) setStatus(res)
  }

  async function simulateUnobservedIdleGap() {
    const res = await tryInvokeTauri<TrayStatusDto>('record_activity_bucket', {
      foregroundApp: 'com.microsoft.VSCode',
      hasInputSignal: false,
      idleSeconds: 1320,
    })
    if (res) setStatus(res)
  }

  async function submitIdleReconciliation() {
    const res = await tryInvokeTauri<TrayStatusDto>('reconcile_idle_gap', {
      choice: idleChoice,
      note: idleNote || `Reconciled 22m unobserved gap as ${idleChoice}`,
    })
    if (res) {
      setStatus(res)
      setIdleNote('')
    }
  }

  async function updateDenylist(updated: string[]) {
    const res = await tryInvokeTauri<TrayStatusDto>('set_privacy_pause_and_denylist', {
      privacyPauseActive: status.privacy_pause_active,
      excludedApps: updated,
    })
    if (res) setStatus(res)
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

  const selectedTask = status.assigned_tasks.find((t) => t.id === status.task_id) ?? null
  const isAuthenticated = Boolean(status.auth)
  const requiresActivation = Boolean(
    status.auth && (status.auth.status === 'invited' || status.auth.must_change_password)
  )
  const canStart = Boolean(selectedTask) && status.lifecycle !== 'running'
  const canSubmit = status.elapsed_seconds > 0 && Boolean(selectedTask)

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
            <span className="tt-brand-sub">v0.3.0 • Privacy-First</span>
          </div>
        </div>

        <div className="tt-header-actions">
          {isAuthenticated && (
            <span
              className={`tt-badge ${status.is_online ? 'tt-badge--ok' : 'tt-badge--warn'}`}
              title={status.last_sync_error || (status.is_online ? 'Connected' : 'Offline Mode')}
            >
              {status.is_online ? 'ONLINE' : 'OFFLINE'}
            </span>
          )}
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

      {notice && (
        <div className={`tt-notice ${notice.ok ? 'tt-notice--ok' : 'tt-notice--err'}`}>
          {notice.text}
        </div>
      )}

      {/* SCREEN 1: LOGIN GATE */}
      {!isAuthenticated ? (
        <section className="tt-card">
          <div className="tt-section-head">
            <span className="tt-section-title">Sign In to Track Tasks</span>
            <button
              type="button"
              className="tt-link-btn"
              onClick={() => setShowServerConfig((v) => !v)}
            >
              {showServerConfig ? 'Hide Server' : 'Server URL'}
            </button>
          </div>

          <div className="tt-tabs">
            <button
              type="button"
              className={`tt-tab ${loginTab === 'password' ? 'tt-tab--active' : ''}`}
              onClick={() => setLoginTab('password')}
            >
              Email & Password
            </button>
            <button
              type="button"
              className={`tt-tab ${loginTab === 'token' ? 'tt-tab--active' : ''}`}
              onClick={() => setLoginTab('token')}
            >
              Pairing Token
            </button>
          </div>

          <form className="tt-form" onSubmit={(e) => void handleLoginSubmit(e)}>
            {showServerConfig && (
              <div className="tt-field">
                <label className="tt-label" htmlFor="tt-server-url">
                  TikTrack Portal URL
                </label>
                <input
                  id="tt-server-url"
                  type="url"
                  className="tt-input"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://tiktrack-portal.vercel.app"
                />
              </div>
            )}

            {loginTab === 'password' ? (
              <>
                <div className="tt-field">
                  <label className="tt-label" htmlFor="tt-email">
                    Work Email
                  </label>
                  <input
                    id="tt-email"
                    type="email"
                    required
                    className="tt-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="tt-field">
                  <label className="tt-label" htmlFor="tt-password">
                    Password (or Temporary Password)
                  </label>
                  <input
                    id="tt-password"
                    type="password"
                    required
                    className="tt-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </>
            ) : (
              <div className="tt-field">
                <label className="tt-label" htmlFor="tt-token">
                  Device Pairing Token
                </label>
                <input
                  id="tt-token"
                  type="text"
                  required
                  className="tt-input"
                  value={pairingToken}
                  onChange={(e) => setPairingToken(e.target.value)}
                  placeholder="dp_live_xxxxxxxxxxxx_sync"
                />
                <span className="tt-muted-note">
                  Copy your sync token from TikTrack Web → Integrations &amp; Devices.
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={authBusy}
              className="tt-btn tt-btn--primary tt-btn--full"
            >
              {authBusy
                ? 'Connecting...'
                : loginTab === 'password'
                  ? 'Sign In'
                  : 'Pair Workstation'}
            </button>
          </form>

          <div className="tt-muted-note" style={{ marginTop: 10 }}>
            Only Tenant Owners can self-register on the web portal. Team members must be invited by
            their Tenant Owner and sign in with their temporary password first to activate their
            profile.
          </div>
        </section>
      ) : requiresActivation ? (
        /* SCREEN 2: MANDATORY PASSWORD CHANGE FOR INVITED MEMBERS */
        <section className="tt-card tt-card--warn">
          <div className="tt-section-head">
            <span className="tt-section-title tt-section-title--warn">
              Activate Your Profile
            </span>
            <button type="button" className="tt-link-btn" onClick={() => void handleLogout()}>
              Sign Out
            </button>
          </div>

          <p className="tt-warn-note">
            Welcome, <strong>{status.auth?.name}</strong> ({status.auth?.tenant_name}). You signed
            in with a temporary password. You must set a new password to activate your profile
            before tasks can be assigned to you.
          </p>

          <form className="tt-form" onSubmit={(e) => void handleActivatePassword(e)}>
            <div className="tt-field">
              <label className="tt-label" htmlFor="tt-new-pass">
                New Password
              </label>
              <input
                id="tt-new-pass"
                type="password"
                required
                minLength={6}
                className="tt-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
              />
            </div>
            <div className="tt-field">
              <label className="tt-label" htmlFor="tt-confirm-pass">
                Confirm New Password
              </label>
              <input
                id="tt-confirm-pass"
                type="password"
                required
                minLength={6}
                className="tt-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
              />
            </div>
            <button
              type="submit"
              disabled={authBusy}
              className="tt-btn tt-btn--amber tt-btn--full"
            >
              {authBusy ? 'Activating Profile...' : 'Change Password & Activate Profile'}
            </button>
          </form>
        </section>
      ) : (
        /* SCREEN 3: AUTHENTICATED & ACTIVE WORKSPACE TIMER */
        <>
          {/* Account & Sync Bar */}
          <div className="tt-account-bar">
            <div className="tt-account-meta">
              <span className="tt-account-name">
                {status.auth?.name} • {status.auth?.tenant_name}
              </span>
              <span className="tt-account-sub">
                {status.auth?.email} ({status.auth?.role})
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {status.queued_envelopes > 0 && (
                <button
                  type="button"
                  disabled={syncBusy}
                  className="tt-btn tt-btn--amber tt-btn--sm"
                  onClick={() => void handleSyncQueue()}
                >
                  {syncBusy ? '...' : `Sync (${status.queued_envelopes})`}
                </button>
              )}
              <button
                type="button"
                className="tt-btn tt-btn--secondary tt-btn--sm"
                onClick={() => void handleLogout()}
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Assigned Task Selector Card */}
          <section className="tt-card">
            <div className="tt-section-head">
              <span className="tt-section-title">Assigned Task</span>
              <button
                type="button"
                disabled={syncBusy}
                className="tt-link-btn"
                onClick={() => void handleRefreshTasks()}
              >
                {syncBusy ? 'Refreshing...' : 'Refresh Tasks'}
              </button>
            </div>

            {status.assigned_tasks.length === 0 ? (
              <div className="tt-muted-note">
                No tasks are assigned to you yet. Ask your Tenant Owner or Project Manager to assign
                a task in <strong>{status.auth?.tenant_name}</strong>, then click{' '}
                <strong>Refresh Tasks</strong>.
              </div>
            ) : (
              <>
                <select
                  aria-label="Assigned Task"
                  className="tt-select"
                  value={status.task_id}
                  disabled={status.lifecycle === 'running'}
                  onChange={(e) => void handleSelectTask(e.target.value)}
                >
                  <option value="">-- Select an assigned task --</option>
                  {status.assigned_tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.projectCode}] {t.code}: {t.title} ({t.status})
                    </option>
                  ))}
                </select>
                {selectedTask && (
                  <div className="tt-task-meta">
                    <span>Project: {selectedTask.projectName}</span>
                    <span>
                      Status: <strong>{selectedTask.status.toUpperCase()}</strong>
                    </span>
                  </div>
                )}
              </>
            )}
          </section>

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
                disabled={!canStart}
                className="tt-btn tt-btn--emerald"
                onClick={() => void transition('running')}
              >
                Start / Resume
              </button>
              <button
                type="button"
                disabled={status.lifecycle !== 'running'}
                className="tt-btn tt-btn--secondary"
                onClick={() => void transition('on_break')}
              >
                Start Break
              </button>
              <button
                type="button"
                disabled={status.lifecycle !== 'running' && status.lifecycle !== 'on_break'}
                className="tt-btn tt-btn--secondary"
                onClick={() => void transition('paused')}
              >
                Pause
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                className="tt-btn tt-btn--primary"
                onClick={() => setShowSubmitPanel((v) => !v)}
              >
                Complete &amp; Submit
              </button>
            </div>

            {showSubmitPanel && canSubmit && (
              <form
                className="tt-form"
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: '1px solid var(--tt-border)',
                }}
                onSubmit={(e) => void handleSubmitSession(e)}
              >
                <div className="tt-field">
                  <label className="tt-label" htmlFor="tt-submit-note">
                    Work Summary Note (for Tenant Owner / Reviewer)
                  </label>
                  <textarea
                    id="tt-submit-note"
                    className="tt-textarea"
                    value={submitNote}
                    onChange={(e) => setSubmitNote(e.target.value)}
                    placeholder={`What did you complete on ${selectedTask?.code ?? 'this task'}?`}
                  />
                </div>
                <label className="tt-checkbox-row">
                  <input
                    type="checkbox"
                    checked={markTaskForReview}
                    onChange={(e) => setMarkTaskForReview(e.target.checked)}
                  />
                  Mark task Ready for Review
                </label>
                <label className="tt-checkbox-row">
                  <input
                    type="checkbox"
                    checked={submitTimesheet}
                    onChange={(e) => setSubmitTimesheet(e.target.checked)}
                  />
                  Submit timesheet entry immediately
                </label>
                <div className="tt-btn-grid">
                  <button
                    type="button"
                    className="tt-btn tt-btn--secondary"
                    onClick={() => setShowSubmitPanel(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitBusy}
                    className="tt-btn tt-btn--primary"
                  >
                    {submitBusy
                      ? 'Submitting...'
                      : status.is_online
                        ? 'Submit Now'
                        : 'Save Offline'}
                  </button>
                </div>
              </form>
            )}
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
        </>
      )}
    </div>
  )
}
