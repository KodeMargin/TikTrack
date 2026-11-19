import type { VsCodeExtensionRuntime } from './extension.js'

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderTikTrackPanelHtml(runtime: VsCodeExtensionRuntime): string {
  const isConnected = runtime.buffer.isIntegrationConnected()
  const events = runtime.buffer.getQueuedEvents()
  const mapping = runtime.currentMapping
  const taskCode = mapping.suggestedTaskCode ?? 'Unmapped'

  const eventsHtml =
    events.length === 0
      ? `<div class="tt-empty">No buffered telemetry buckets right now. Save a file or run a debug/test session to record coarse metadata.</div>`
      : events
          .slice(-15)
          .reverse()
          .map(
            (evt) => `
          <div class="tt-event">
            <div class="tt-event-head">
              <span class="tt-event-type">${escapeHtml(evt.event_type)}</span>
              <span class="tt-event-time">${escapeHtml(evt.occurred_at_utc)}</span>
            </div>
            <pre class="tt-code">${escapeHtml(JSON.stringify(evt.metadata, null, 2))}</pre>
          </div>`
          )
          .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TikTrack Privacy &amp; Telemetry</title>
  <style>
    :root {
      --tt-violet-50: #f0e9fb;
      --tt-violet-200: #c5a8f0;
      --tt-violet-300: #a87ce9;
      --tt-violet-400: #8b51e1;
      --tt-violet-500: #6d25da;
      --tt-violet-600: #581eae;
      --tt-bg: #09090b;
      --tt-card-bg: linear-gradient(180deg, rgba(24, 24, 29, 0.92) 0%, rgba(14, 15, 18, 0.98) 100%);
      --tt-card-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.06), 0 12px 28px -12px rgba(0, 0, 0, 0.6);
      --tt-border: rgba(63, 63, 70, 0.7);
      --tt-surface: #0f0f13;
      --tt-text: #f4f4f5;
      --tt-text-strong: #ffffff;
      --tt-text-secondary: #a1a1aa;
      --tt-text-muted: #71717a;
      --tt-glow: rgba(109, 37, 218, 0.24);
      --tt-grid: rgba(255, 255, 255, 0.03);
    }

    body.vscode-light {
      --tt-bg: #ffffff;
      --tt-card-bg: linear-gradient(180deg, #ffffff 0%, #fcfbfe 100%);
      --tt-card-shadow: 0 1px 2px rgba(15, 5, 31, 0.04), 0 12px 28px -12px rgba(109, 37, 218, 0.12);
      --tt-border: #e4e4e7;
      --tt-surface: #f9f8fc;
      --tt-text: #18181b;
      --tt-text-strong: #09090b;
      --tt-text-secondary: #52525b;
      --tt-text-muted: #71717a;
      --tt-glow: rgba(109, 37, 218, 0.12);
      --tt-grid: rgba(109, 37, 218, 0.04);
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background-color: var(--tt-bg);
      color: var(--tt-text);
      font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      letter-spacing: -0.01em;
      -webkit-font-smoothing: antialiased;
    }

    .tt-wrap {
      min-height: 100vh;
      padding: 24px;
      background-color: var(--tt-bg);
      background-image:
        radial-gradient(ellipse 75% 36% at 50% -6%, var(--tt-glow), transparent 72%),
        linear-gradient(to right, var(--tt-grid) 1px, transparent 1px),
        linear-gradient(to bottom, var(--tt-grid) 1px, transparent 1px);
      background-size: 100% 100%, 36px 36px, 36px 36px;
    }

    .tt-container {
      max-width: 720px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .tt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .tt-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .tt-logo {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--tt-violet-500), var(--tt-violet-400));
      box-shadow: 0 6px 16px rgba(109, 37, 218, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-weight: 800;
      font-size: 15px;
    }

    .tt-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--tt-text-strong);
    }

    .tt-subtitle {
      font-size: 12px;
      color: var(--tt-text-secondary);
    }

    .tt-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid rgba(139, 81, 225, 0.35);
      background: rgba(109, 37, 218, 0.14);
      color: var(--tt-violet-200);
    }

    body.vscode-light .tt-pill {
      background: var(--tt-violet-50);
      color: var(--tt-violet-600);
      border-color: var(--tt-violet-200);
    }

    .tt-pill--connected {
      border-color: rgba(16, 185, 129, 0.35);
      background: rgba(16, 185, 129, 0.14);
      color: #34d399;
    }

    body.vscode-light .tt-pill--connected {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }

    .tt-pill--disconnected {
      border-color: rgba(245, 158, 11, 0.4);
      background: rgba(245, 158, 11, 0.15);
      color: #fcd34d;
    }

    body.vscode-light .tt-pill--disconnected {
      background: #fffbeb;
      color: #b45309;
      border-color: #fde68a;
    }

    .tt-card {
      background: var(--tt-card-bg);
      border: 1px solid var(--tt-border);
      border-radius: 18px;
      padding: 18px;
      box-shadow: var(--tt-card-shadow);
    }

    .tt-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }

    .tt-stat {
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      border-radius: 12px;
      padding: 10px 12px;
    }

    .tt-stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--tt-text-muted);
      margin-bottom: 4px;
    }

    .tt-stat-value {
      font-size: 13px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--tt-text-strong);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tt-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tt-btn {
      border: 1px solid var(--tt-border);
      background: var(--tt-surface);
      color: var(--tt-text-strong);
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      transition: transform 0.14s ease, border-color 0.16s ease, filter 0.16s ease;
    }

    .tt-btn:hover {
      transform: translateY(-1px);
      border-color: var(--tt-violet-400);
    }

    .tt-btn--primary {
      border-color: transparent;
      background: linear-gradient(135deg, var(--tt-violet-500), var(--tt-violet-400));
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(109, 37, 218, 0.35);
    }

    .tt-btn--primary:hover {
      filter: brightness(1.08);
    }

    .tt-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }

    .tt-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--tt-text-strong);
      margin: 0;
    }

    .tt-event {
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }

    .tt-event:last-child {
      margin-bottom: 0;
    }

    .tt-event-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    .tt-event-type {
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 700;
      color: var(--tt-violet-300);
    }

    body.vscode-light .tt-event-type {
      color: var(--tt-violet-600);
    }

    .tt-event-time {
      font-size: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--tt-text-muted);
    }

    .tt-code {
      margin: 0;
      font-size: 11px;
      line-height: 1.45;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--tt-text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .tt-empty {
      font-size: 12px;
      color: var(--tt-text-secondary);
      padding: 12px;
      border-radius: 12px;
      border: 1px dashed var(--tt-border);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="tt-wrap">
    <div class="tt-container">
      <div class="tt-header">
        <div class="tt-brand">
          <div class="tt-logo">T</div>
          <div>
            <h1 class="tt-title">TikTrack IDE Verification</h1>
            <div class="tt-subtitle">Zero keystrokes, zero source code capture — coarse metadata only</div>
          </div>
        </div>
        <span class="tt-pill ${isConnected ? 'tt-pill--connected' : 'tt-pill--disconnected'}">
          ${isConnected ? '● CONNECTED' : '○ DISCONNECTED'}
        </span>
      </div>

      <div class="tt-card">
        <div class="tt-grid">
          <div class="tt-stat">
            <div class="tt-stat-label">Mapped Task</div>
            <div class="tt-stat-value">${escapeHtml(taskCode)}</div>
          </div>
          <div class="tt-stat">
            <div class="tt-stat-label">Repository</div>
            <div class="tt-stat-value" title="${escapeHtml(mapping.repoFullName)}">${escapeHtml(mapping.repoFullName)}</div>
          </div>
          <div class="tt-stat">
            <div class="tt-stat-label">Active Branch</div>
            <div class="tt-stat-value" title="${escapeHtml(mapping.branchName)}">${escapeHtml(mapping.branchName)}</div>
          </div>
          <div class="tt-stat">
            <div class="tt-stat-label">Buffered Buckets</div>
            <div class="tt-stat-value">${events.length}</div>
          </div>
        </div>

        <div class="tt-actions">
          <button class="tt-btn tt-btn--primary" onclick="send('overrideTask')">Override Task Mapping</button>
          <button class="tt-btn" onclick="send('flushBatch')">Flush Batch Now</button>
          <button class="tt-btn" onclick="send('toggleConnection')">${isConnected ? 'Disconnect & Pause' : 'Reconnect Telemetry'}</button>
        </div>
      </div>

      <div class="tt-card">
        <div class="tt-section-head">
          <h2 class="tt-section-title">Local Privacy Audit Buffer</h2>
          <span class="tt-pill">DPIA Gate Active</span>
        </div>
        ${eventsHtml}
      </div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function send(action) {
      vscode.postMessage({ action });
    }
  </script>
</body>
</html>`
}
