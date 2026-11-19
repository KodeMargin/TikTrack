/**
 * TikTrack - VS Code Extension Entrypoint (Milestone 2.2: F2-010..F2-016)
 *
 * Integrates with VS Code workspace, debugger, and test runner lifecycles while
 * giving the developer full visibility ("Inspect Local Telemetry Buffer" - F2-035)
 * and one-click disconnect control (Section 5.5).
 */

import {
  classifyTerminalCommandCategory,
  suggestTaskMappingFromGitContext,
  type WorkspaceTaskMappingSuggestion,
} from './taskMapper.js'
import { VsCodeTelemetryBuffer } from './telemetryBuffer.js'
import { renderTikTrackPanelHtml } from './panelHtml.js'

export interface VsCodeExtensionRuntime {
  buffer: VsCodeTelemetryBuffer
  currentMapping: WorkspaceTaskMappingSuggestion
  overrideTaskMapping: (nextTaskCode: string) => WorkspaceTaskMappingSuggestion
  disconnectIntegration: () => void
  reconnectIntegration: () => void
  recordTerminalCommandIfOptedIn: (
    rawExecutable: string,
    optedIn: boolean
  ) => { recorded: boolean; category?: string }
}

export function createTikTrackVsCodeRuntime(initialContext?: {
  workspaceName?: string
  gitRemoteUrl?: string
  branchName?: string
}): VsCodeExtensionRuntime {
  const buffer = new VsCodeTelemetryBuffer('v1.0-2026-11')
  const workspaceName = initialContext?.workspaceName ?? 'settlement-core'
  const gitRemoteUrl =
    initialContext?.gitRemoteUrl ?? 'git@github.com:northstar/settlement-core.git'
  const branchName = initialContext?.branchName ?? 'feature/DEV-101-gist-exclusion'

  let currentMapping = suggestTaskMappingFromGitContext(
    workspaceName,
    gitRemoteUrl,
    branchName
  )

  return {
    buffer,
    get currentMapping() {
      return currentMapping
    },
    overrideTaskMapping(nextTaskCode: string) {
      currentMapping = suggestTaskMappingFromGitContext(
        workspaceName,
        gitRemoteUrl,
        branchName,
        nextTaskCode
      )
      return currentMapping
    },
    disconnectIntegration() {
      buffer.setConnected(false)
    },
    reconnectIntegration() {
      buffer.setConnected(true)
    },
    recordTerminalCommandIfOptedIn(rawExecutable: string, optedIn: boolean) {
      if (!optedIn || !buffer.isIntegrationConnected()) {
        return { recorded: false }
      }
      const category = classifyTerminalCommandCategory(rawExecutable)
      return { recorded: true, category }
    },
  }
}

interface WebviewPanelLike {
  webview: {
    html: string
    onDidReceiveMessage: (cb: (msg: { action?: string }) => void) => { dispose: () => void }
  }
  reveal: () => void
  onDidDispose: (cb: () => void) => { dispose: () => void }
  dispose: () => void
}

interface VsCodeApiLike {
  workspace: {
    name?: string
    onDidSaveTextDocument: (cb: (doc: { languageId: string }) => void) => { dispose: () => void }
  }
  window: {
    createStatusBarItem: (alignment: number, priority: number) => {
      text: string
      tooltip: string
      command?: string
      show: () => void
      dispose: () => void
    }
    createWebviewPanel?: (
      viewType: string,
      title: string,
      showOptions: number,
      options?: { enableScripts?: boolean }
    ) => WebviewPanelLike
    showInformationMessage: (msg: string) => Promise<string | undefined>
    showWarningMessage: (msg: string) => Promise<string | undefined>
    showInputBox: (opts: { prompt: string; value: string }) => Promise<string | undefined>
  }
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => { dispose: () => void }
    executeCommand?: (id: string) => Promise<unknown>
  }
  StatusBarAlignment: {
    Left: number
    Right: number
  }
  ViewColumn?: {
    One: number
  }
}

let activeRuntime: VsCodeExtensionRuntime | null = null
let activePanel: WebviewPanelLike | null = null

export async function activate(context: { subscriptions: Array<{ dispose: () => void }> }): Promise<void> {
  let vscode: VsCodeApiLike
  try {
    const vscodeModuleName = 'vscode'
    const mod = await import(vscodeModuleName)
    vscode = (mod.default ?? mod) as unknown as VsCodeApiLike
  } catch {
    return
  }

  const workspaceName = vscode.workspace.name ?? 'current-workspace'
  activeRuntime = createTikTrackVsCodeRuntime({
    workspaceName,
    branchName: 'feature/DEV-101-work',
  })

  const taskCode = activeRuntime.currentMapping.suggestedTaskCode ?? 'unmapped'
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.text = `$(shield) TikTrack: ${taskCode}`
  statusBar.tooltip = 'TikTrack Privacy-First Verification Active - Click to open panel'
  statusBar.command = 'tiktrack.openDashboard'
  statusBar.show()
  context.subscriptions.push(statusBar)

  const refreshPanel = () => {
    if (activePanel && activeRuntime) {
      activePanel.webview.html = renderTikTrackPanelHtml(activeRuntime)
    }
  }

  const openOrRevealPanel = () => {
    if (!activeRuntime || !vscode.window.createWebviewPanel) return
    if (activePanel) {
      refreshPanel()
      activePanel.reveal()
      return
    }
    const panel = vscode.window.createWebviewPanel(
      'tiktrackPrivacyPanel',
      'TikTrack Privacy & Telemetry',
      vscode.ViewColumn?.One ?? 1,
      { enableScripts: true }
    )
    activePanel = panel
    panel.webview.html = renderTikTrackPanelHtml(activeRuntime)
    panel.webview.onDidReceiveMessage((msg) => {
      if (!activeRuntime) return
      if (msg.action === 'overrideTask') {
        void vscode.commands.executeCommand?.('tiktrack.confirmTaskMapping')
      } else if (msg.action === 'flushBatch') {
        void vscode.commands.executeCommand?.('tiktrack.flushTelemetryBatch')
      } else if (msg.action === 'toggleConnection') {
        if (activeRuntime.buffer.isIntegrationConnected()) {
          void vscode.commands.executeCommand?.('tiktrack.disconnectExtension')
        } else {
          activeRuntime.reconnectIntegration()
          statusBar.text = `$(shield) TikTrack: ${activeRuntime.currentMapping.suggestedTaskCode ?? 'unmapped'}`
          refreshPanel()
        }
      }
    })
    panel.onDidDispose(() => {
      activePanel = null
    })
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('tiktrack.openDashboard', () => {
      openOrRevealPanel()
    }),

    vscode.commands.registerCommand('tiktrack.confirmTaskMapping', async () => {
      if (!activeRuntime) return
      const currentCode = activeRuntime.currentMapping.suggestedTaskCode ?? 'DEV-101'
      const next = await vscode.window.showInputBox({
        prompt: 'Confirm or override TikTrack task key for this branch',
        value: currentCode,
      })
      if (next && next.trim()) {
        activeRuntime.overrideTaskMapping(next.trim())
        statusBar.text = `$(shield) TikTrack: ${activeRuntime.currentMapping.suggestedTaskCode}`
        refreshPanel()
        await vscode.window.showInformationMessage(`TikTrack: Task mapped to ${activeRuntime.currentMapping.suggestedTaskCode}`)
      }
    }),

    vscode.commands.registerCommand('tiktrack.inspectLocalBuffer', async () => {
      if (!activeRuntime) return
      if (vscode.window.createWebviewPanel) {
        openOrRevealPanel()
        return
      }
      const count = activeRuntime.buffer.getQueuedEvents().length
      const isConn = activeRuntime.buffer.isIntegrationConnected()
      await vscode.window.showInformationMessage(
        `TikTrack Local Audit: ${count} coarse event buckets buffered. Status: ${isConn ? 'Connected' : 'Disconnected'}. DPIA Gate: Zero keystrokes, screenshots, or code captured.`
      )
    }),

    vscode.commands.registerCommand('tiktrack.flushTelemetryBatch', async () => {
      if (!activeRuntime) return
      const evt = activeRuntime.buffer.flushOneMinuteEditBucket(activeRuntime.currentMapping.suggestedTaskCode)
      refreshPanel()
      await vscode.window.showInformationMessage(
        evt ? `TikTrack: Flushed 1-minute edit bucket (${evt.event_id}).` : 'TikTrack: Local buffer clean, nothing to flush.'
      )
    }),

    vscode.commands.registerCommand('tiktrack.disconnectExtension', async () => {
      if (!activeRuntime) return
      activeRuntime.disconnectIntegration()
      statusBar.text = `$(circle-slash) TikTrack: Disconnected`
      refreshPanel()
      await vscode.window.showWarningMessage('TikTrack: Extension disconnected. Telemetry capture is paused.')
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!activeRuntime || !activeRuntime.buffer.isIntegrationConnected()) return
      activeRuntime.buffer.recordDocumentSave(doc.languageId, doc.languageId)
      refreshPanel()
    })
  )
}

export function deactivate(): void {
  activePanel?.dispose()
  activePanel = null
  activeRuntime = null
}

