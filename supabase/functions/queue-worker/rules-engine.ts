// =============================================================================
// Phase 3 Milestone 3.1: Versioned Verification Rules Engine (R-01 to R-08)
// Evaluates canonical segments and emits non-punitive explanation triggers.
// Zero automated pay deductions; zero "fraud" labels.
// =============================================================================

export type RuleCode = 'R-01' | 'R-02' | 'R-03' | 'R-04' | 'R-05' | 'R-06' | 'R-07' | 'R-08'

export interface RuleEvaluationRow {
  tenant_id: string
  time_segment_id: string
  rule_set_id: string
  rule_code: RuleCode
  triggered: boolean
  severity: 'info' | 'clarification' | 'warning'
  title: string
  trigger_description: string
  suggested_action: string
  prohibited_inference: string
  explanation_prompt: string | null
}

export interface SegmentEvalContext {
  id: string
  work_mode: string
  provenance: string
  elapsed_minutes: number
  observed_minutes: number
  developer_explanation: string | null
  clock_drift_seconds: number
  has_debug_or_test_artifact: boolean
  has_commit_artifact: boolean
  has_docs_browser_rollup: boolean
  has_retrospective_artifact: boolean
  was_overlap_deduplicated: boolean
  task_estimate_minutes: number
  cumulative_task_minutes: number
}

export interface RuleSetThresholds {
  idle_clarification_threshold_minutes: number
  deep_work_no_input_window_minutes: number
  clock_drift_threshold_seconds: number
  estimate_variance_alert_percent: number
}

export function evaluateSegmentRulesR01ToR08(
  tenantId: string,
  ruleSetId: string,
  seg: SegmentEvalContext,
  thresholds: RuleSetThresholds = {
    idle_clarification_threshold_minutes: 15,
    deep_work_no_input_window_minutes: 90,
    clock_drift_threshold_seconds: 120,
    estimate_variance_alert_percent: 125,
  }
): RuleEvaluationRow[] {
  const rows: RuleEvaluationRow[] = []
  const isDeepWork =
    seg.work_mode === 'thinking' ||
    seg.work_mode === 'design' ||
    seg.work_mode === 'research' ||
    seg.work_mode === 'meeting'

  // R-01: Unexplained gap > threshold in ordinary coding mode
  if (
    !isDeepWork &&
    seg.observed_minutes === 0 &&
    seg.elapsed_minutes >= thresholds.idle_clarification_threshold_minutes &&
    !seg.developer_explanation
  ) {
    rows.push({
      tenant_id: tenantId,
      time_segment_id: seg.id,
      rule_set_id: ruleSetId,
      rule_code: 'R-01',
      triggered: true,
      severity: 'clarification',
      title: `Unobserved Input Gap (> ${thresholds.idle_clarification_threshold_minutes}m)`,
      trigger_description: `${seg.elapsed_minutes}m interval without IDE/desktop telemetry in "${seg.work_mode}" mode.`,
      suggested_action:
        'Prompt developer at session end to categorize interval as Thinking, Reading, Meeting, or Break.',
      prohibited_inference: 'Never infer "Employee was absent" or apply automatic pay deduction.',
      explanation_prompt: `Would you like to mark this ${seg.elapsed_minutes}m interval as Thinking, Reading, Meeting, or Break?`,
    })
  }

  // R-02: Overlapping sessions across devices deduplicated
  if (seg.was_overlap_deduplicated) {
    rows.push({
      tenant_id: tenantId,
      time_segment_id: seg.id,
      rule_set_id: ruleSetId,
      rule_code: 'R-02',
      triggered: true,
      severity: 'info',
      title: 'Overlapping Session Deduplicated',
      trigger_description: 'Concurrent tracking across devices sliced into canonical interval.',
      suggested_action: 'Prompt developer to confirm primary task attribution if needed.',
      prohibited_inference: 'Do NOT infer double-billing fraud.',
      explanation_prompt: null,
    })
  }

  // R-03: Debugging + tests without commits
  if (seg.work_mode === 'debugging' && seg.has_debug_or_test_artifact && !seg.has_commit_artifact) {
    rows.push({
      tenant_id: tenantId,
      time_segment_id: seg.id,
      rule_set_id: ruleSetId,
      rule_code: 'R-03',
      triggered: true,
      severity: 'info',
      title: 'Corroborated Debugging Without Commit',
      trigger_description: 'Debugger lifecycle and/or local test runs recorded with 0 commits.',
      suggested_action: 'Upgrade segment status to corroborated.',
      prohibited_inference: 'Never infer "No productive work" from zero commits.',
      explanation_prompt: null,
    })
  }

  // R-04: Documentation browser during research mode
  if (seg.work_mode === 'research' && seg.has_docs_browser_rollup) {
    rows.push({
      tenant_id: tenantId,
      time_segment_id: seg.id,
      rule_set_id: ruleSetId,
      rule_code: 'R-04',
      triggered: true,
      severity: 'info',
      title: 'Contextual Documentation Research',
      trigger_description: 'Coarse docs_browser signal aligned with declared Research mode.',
      suggested_action: 'Upgrade segment status to context_added.',
      prohibited_inference: 'URL category is context, not algorithmic proof of reading speed.',
      explanation_prompt: null,
    })
  }

  // R-05: Retrospective PR/commit linked
  if (seg.has_retrospective_artifact) {
    rows.push({
      tenant_id: tenantId,
      time_segment_id: seg.id,
      rule_set_id: ruleSetId,
      rule_code: 'R-05',
      triggered: true,
      severity: 'info',
      title: 'Retrospective Deliverable Linked',
      trigger_description: 'Later PR/commit attached as retrospective outcome on task.',
      suggested_action: 'Display deliverable relationship without altering historical claimed_minutes.',
      prohibited_inference: 'A later commit does not retroactively prove exact earlier hours.',
      explanation_prompt: null,
    })
  }

  // R-06: Task estimate / budget cap exceeded
  if (
    seg.task_estimate_minutes > 0 &&
    (seg.cumulative_task_minutes / seg.task_estimate_minutes) * 100 >=
      thresholds.estimate_variance_alert_percent
  ) {
    rows.push({
      tenant_id: tenantId,
      time_segment_id: seg.id,
      rule_set_id: ruleSetId,
      rule_code: 'R-06',
      triggered: true,
      severity: 'warning',
      title: 'Task Estimate Variance Exceeded',
      trigger_description: `Cumulative task effort (${seg.cumulative_task_minutes}m) exceeded estimate (${seg.task_estimate_minutes}m).`,
      suggested_action: 'Create non-blocking budget variance review notice for Project Manager.',
      prohibited_inference: 'Exceeding an estimate does not indicate a low-performing developer.',
      explanation_prompt: null,
    })
  }

  // R-07: Manual entry provenance
  if (seg.provenance === 'manual_entry') {
    rows.push({
      tenant_id: tenantId,
      time_segment_id: seg.id,
      rule_set_id: ruleSetId,
      rule_code: 'R-07',
      triggered: true,
      severity: 'clarification',
      title: 'Manual Time Entry Provenance',
      trigger_description: 'Time entered manually with developer explanation.',
      suggested_action: 'Route to manager review with manual provenance badge.',
      prohibited_inference: 'Never treat manual entry as a false time entry.',
      explanation_prompt: 'Verify manual entry reason during manager review.',
    })
  }

  // R-08: Device clock drift > threshold
  if (Math.abs(seg.clock_drift_seconds) > thresholds.clock_drift_threshold_seconds) {
    rows.push({
      tenant_id: tenantId,
      time_segment_id: seg.id,
      rule_set_id: ruleSetId,
      rule_code: 'R-08',
      triggered: true,
      severity: 'warning',
      title: 'Device Clock Drift Detected',
      trigger_description: `Device wall clock differed from server receipt by ${seg.clock_drift_seconds}s.`,
      suggested_action: 'Use monotonic duration for interval math and display sync notice.',
      prohibited_inference: 'Clock drift is a technical anomaly, never proof of tampering.',
      explanation_prompt: null,
    })
  }

  return rows
}

