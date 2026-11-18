/**
 * DevProof VS Code Extension - Privacy-Preserving Telemetry Buffer (F2-010..F2-016)
 *
 * Collects ONLY coarse summaries:
 * - 1-minute edit/save buckets (files_touched_count, language_ids, save_count)
 * - Debugger lifecycle events (debug_type, duration_seconds, breakpoints_hit)
 * - Local test runner summaries (passed, failed, duration_ms)
 * - Opt-in terminal command categories
 *
 * Hard-blocks source code, file diffs, keystrokes, and terminal output (D-003).
 */

export interface VsCodeTelemetryEvent {
  event_id: string
  schema_version: 1
  source: 'vscode'
  event_type:
  | 'vscode_workspace_context'
  | 'vscode_edit_save_bucket'
  | 'vscode_debug_session'
  | 'vscode_test_run'
  | 'terminal_command_category'
  occurred_at_utc: string
  local_sequence: number
  monotonic_elapsed_ms: number
  consent_policy_version: string
  metadata: Record<string, string | number | boolean | string[]>
}

const PROHIBITED_KEYS = [
  'keystrokes',
  'raw_source_code',
  'file_contents',
  'git_diff_raw',
  'terminal_output',
  'clipboard',
  'password',
]

export class VsCodeTelemetryBuffer {
  private queue: VsCodeTelemetryEvent[] = []
  private sequence = 0
  private readonly startedPerfMs = Date.now()
  private touchedFilesInCurrentMinute = new Set<string>()
  private languagesInCurrentMinute = new Set<string>()
  private saveCountInCurrentMinute = 0
  private isConnected = true

  private readonly policyVersion: string

  public constructor(policyVersion: string = 'v1.0-2026-11') {
    this.policyVersion = policyVersion
  }

  public setConnected(connected: boolean): void {
    this.isConnected = connected
  }

  public isIntegrationConnected(): boolean {
    return this.isConnected
  }

  public recordDocumentEdit(filePathHash: string, languageId: string): void {
    if (!this.isConnected) return
    this.touchedFilesInCurrentMinute.add(filePathHash)
    this.languagesInCurrentMinute.add(languageId)
  }

  public recordDocumentSave(filePathHash: string, languageId: string): void {
    if (!this.isConnected) return
    this.touchedFilesInCurrentMinute.add(filePathHash)
    this.languagesInCurrentMinute.add(languageId)
    this.saveCountInCurrentMinute += 1
  }

  /**
   * Emits a coarse 1-minute edit/save bucket (F2-010) - zero source code or line diffs.
   */
  public flushOneMinuteEditBucket(activeTaskCode: string | null): VsCodeTelemetryEvent | null {
    if (!this.isConnected) return null
    if (this.touchedFilesInCurrentMinute.size === 0 && this.saveCountInCurrentMinute === 0) {
      return null
    }

    const evt = this.enqueueEvent('vscode_edit_save_bucket', {
      app_category: 'ide',
      files_touched_count: this.touchedFilesInCurrentMinute.size,
      language_ids: Array.from(this.languagesInCurrentMinute),
      save_count: this.saveCountInCurrentMinute,
      mapped_task_code: activeTaskCode ?? 'unmapped',
      has_input_signal: true,
    })

    this.touchedFilesInCurrentMinute.clear()
    this.languagesInCurrentMinute.clear()
    this.saveCountInCurrentMinute = 0
    return evt
  }

  /**
   * F2-012: Records debugger session lifecycle to corroborate zero-commit debugging sessions.
   */
  public recordDebugSessionCompleted(params: {
    debugType: string
    durationSeconds: number
    breakpointsHit: number
    mappedTaskCode: string | null
    investigationNote?: string
  }): VsCodeTelemetryEvent | null {
    if (!this.isConnected) return null
    return this.enqueueEvent('vscode_debug_session', {
      app_category: 'ide',
      debug_type: params.debugType,
      duration_seconds: params.durationSeconds,
      breakpoints_hit: params.breakpointsHit,
      mapped_task_code: params.mappedTaskCode ?? 'unmapped',
      investigation_note: params.investigationNote ?? '',
      has_input_signal: true,
    })
  }

  /**
   * F2-013: Records local test execution pass/fail summary.
   */
  public recordTestExecutionSummary(params: {
    runnerName: string
    passedCount: number
    failedCount: number
    durationMs: number
    mappedTaskCode: string | null
  }): VsCodeTelemetryEvent | null {
    if (!this.isConnected) return null
    return this.enqueueEvent('vscode_test_run', {
      app_category: 'ide',
      runner: params.runnerName,
      passed: params.passedCount,
      failed: params.failedCount,
      duration_ms: params.durationMs,
      mapped_task_code: params.mappedTaskCode ?? 'unmapped',
      has_input_signal: true,
    })
  }

  public getQueuedEvents(): ReadonlyArray<VsCodeTelemetryEvent> {
    return [...this.queue]
  }

  public acknowledgeEvents(acceptedIds: string[]): void {
    const acceptedSet = new Set(acceptedIds)
    this.queue = this.queue.filter((e) => !acceptedSet.has(e.event_id))
  }

  private enqueueEvent(
    eventType: VsCodeTelemetryEvent['event_type'],
    metadata: Record<string, string | number | boolean | string[]>
  ): VsCodeTelemetryEvent {
    for (const key of Object.keys(metadata)) {
      if (PROHIBITED_KEYS.some((blocked) => key.toLowerCase().includes(blocked))) {
        throw new Error(`DPIA Violation: Prohibited key "${key}" blocked in VS Code extension.`)
      }
    }

    this.sequence += 1
    const event: VsCodeTelemetryEvent = {
      event_id: crypto.randomUUID(),
      schema_version: 1,
      source: 'vscode',
      event_type: eventType,
      occurred_at_utc: new Date().toISOString(),
      local_sequence: this.sequence,
      monotonic_elapsed_ms: Math.max(0, Date.now() - this.startedPerfMs),
      consent_policy_version: this.policyVersion,
      metadata,
    }
    this.queue.push(event)
    return event
  }
}

