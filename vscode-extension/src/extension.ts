/**
 * DevProof (TikTrack) - VS Code Extension Entrypoint (Milestone 2.2: F2-010..F2-016)
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

export function createDevProofVsCodeRuntime(initialContext?: {
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
    showInformationMessage: (msg: string) => Promise<string | undefined>
    showWarningMessage: (msg: string) => Promise<string | undefined>
    showInputBox: (opts: { prompt: string; value: string }) => Promise<string | undefined>
  }
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => { dispose: () => void }
  }
  StatusBarAlignment: {
    Left: number
    Right: number
  }
}

let activeRuntime: VsCodeExtensionRuntime | null = null

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
  activeRuntime = createDevProofVsCodeRuntime({
    workspaceName,
    branchName: 'feature/DEV-101-work',
  })

  const taskCode = activeRuntime.currentMapping.suggestedTaskCode ?? 'unmapped'
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.text = `$(shield) DevProof: ${taskCode}`
  statusBar.tooltip = 'DevProof Privacy-First Verification Active (Zero Keystrokes/Source Capture)'
  statusBar.command = 'devproof.confirmTaskMapping'
  statusBar.show()
  context.subscriptions.push(statusBar)

  context.subscriptions.push(
    vscode.commands.registerCommand('devproof.confirmTaskMapping', async () => {
      if (!activeRuntime) return
      const currentCode = activeRuntime.currentMapping.suggestedTaskCode ?? 'DEV-101'
      const next = await vscode.window.showInputBox({
        prompt: 'Confirm or override DevProof task key for this branch',
        value: currentCode,
      })
      if (next && next.trim()) {
        activeRuntime.overrideTaskMapping(next.trim())
        statusBar.text = `$(shield) DevProof: ${activeRuntime.currentMapping.suggestedTaskCode}`
        await vscode.window.showInformationMessage(`DevProof: Task mapped to ${activeRuntime.currentMapping.suggestedTaskCode}`)
      }
    }),

    vscode.commands.registerCommand('devproof.inspectLocalBuffer', async () => {
      if (!activeRuntime) return
      const count = activeRuntime.buffer.getQueuedEvents().length
      const isConn = activeRuntime.buffer.isIntegrationConnected()
      await vscode.window.showInformationMessage(
        `DevProof Local Audit: ${count} coarse event buckets buffered. Status: ${isConn ? 'Connected' : 'Disconnected'}. DPIA Gate: Zero keystrokes, screenshots, or code captured.`
      )
    }),

    vscode.commands.registerCommand('devproof.flushTelemetryBatch', async () => {
      if (!activeRuntime) return
      const evt = activeRuntime.buffer.flushOneMinuteEditBucket(activeRuntime.currentMapping.suggestedTaskCode)
      await vscode.window.showInformationMessage(
        evt ? `DevProof: Flushed 1-minute edit bucket (${evt.event_id}).` : 'DevProof: Local buffer clean, nothing to flush.'
      )
    }),

    vscode.commands.registerCommand('devproof.disconnectExtension', async () => {
      if (!activeRuntime) return
      activeRuntime.disconnectIntegration()
      statusBar.text = `$(circle-slash) DevProof: Disconnected`
      await vscode.window.showWarningMessage('DevProof: Extension disconnected. Telemetry capture is paused.')
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!activeRuntime || !activeRuntime.buffer.isIntegrationConnected()) return
      activeRuntime.buffer.recordDocumentSave(doc.languageId, doc.languageId)
    })
  )
}

export function deactivate(): void {
  activeRuntime = null
}

