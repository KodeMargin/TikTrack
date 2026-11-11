import type {
  CanonicalTimeSegment,
  ContractBillingPolicy,
  EvidenceArtifact,
  PolicySimulationDelta,
  PolicySimulationReport,
  RawTimeSliceInput,
  TaskEffortVarianceSummary,
  UnusualPatternAlert,
  VerificationRuleCode,
  VerificationRuleConfig,
  WorkMode,
  WorkModeSuggestion,
} from '../../types/domain.types.ts'
import { evaluateCanonicalTimeline, formatMinuteOfDay } from '../time-engine/index.ts'

export const DEFAULT_VERIFICATION_RULE_CONFIG: VerificationRuleConfig = {
  idleClarificationThresholdMinutes: 15,
  deepWorkNoInputWindowMinutes: 90,
  clockDriftThresholdSeconds: 120,
  estimateVarianceAlertPercent: 125,
  enabledRules: {
    'R-01': true,
    'R-02': true,
    'R-03': true,
    'R-04': true,
    'R-05': true,
    'R-06': true,
    'R-07': true,
    'R-08': true,
  },
}

export const RULE_CATALOG_METADATA: Record<
  VerificationRuleCode,
  { title: string; triggerSummary: string; prohibitedInference: string }
> = {
  'R-01': {
    title: 'Unexplained Input Gap in Standard Mode',
    triggerSummary: 'No IDE/desktop input signal beyond threshold in non-deep-work mode without note.',
    prohibitedInference: 'Never infer "Employee was absent" or apply automatic pay deduction.',
  },
  'R-02': {
    title: 'Concurrent Multi-Device Overlap Deduplication',
    triggerSummary: 'Two sessions overlap for the same developer across devices or tools.',
    prohibitedInference: 'Never infer double-billing fraud; slice and merge into single canonical interval.',
  },
  'R-03': {
    title: 'Corroborated Zero-Commit Debugging',
    triggerSummary: 'VS Code debug sessions and local test runs captured with zero Git commits.',
    prohibitedInference: 'Never treat 0 commits as "No productive work".',
  },
  'R-04': {
    title: 'Contextual Documentation Browser Research',
    triggerSummary: 'Coarse docs_browser category aligns with declared Research work mode.',
    prohibitedInference: 'Never score reading speed or treat URL categories as proof of comprehension.',
  },
  'R-05': {
    title: 'Retrospective Deliverable / PR Linked',
    triggerSummary: 'Commit or PR merged later is linked as retrospective outcome on earlier task work.',
    prohibitedInference: 'A later commit does not retroactively prove exact earlier hours.',
  },
  'R-06': {
    title: 'Task Estimate / Budget Variance Notice',
    triggerSummary: 'Cumulative claimed minutes exceed task estimate beyond configured threshold.',
    prohibitedInference: 'Never label developer as "low-performing"; trigger non-blocking PM budget review.',
  },
  'R-07': {
    title: 'Retroactive Manual Time Entry Provenance',
    triggerSummary: 'Time entry created manually after period with explicit developer reason.',
    prohibitedInference: 'Never treat manual entry as a false time claim.',
  },
  'R-08': {
    title: 'Device Clock Drift Synchronization Anomaly',
    triggerSummary: 'Wall clock differs from server receipt / monotonic counter beyond threshold.',
    prohibitedInference: 'Clock drift is a technical anomaly, never proof of tampering.',
  },
}

/**
 * Evaluates canonical segments under a versioned VerificationRuleConfig (F3-001, F3-002).
 * Applies enabled/disabled flags and threshold overrides without modifying historical invoices.
 */
export function evaluateSegmentsWithRuleSet(
  rawSlices: RawTimeSliceInput[],
  policy: ContractBillingPolicy,
  taskEstimateMinutes: number,
  ruleConfig: VerificationRuleConfig
): CanonicalTimeSegment[] {
  const effectivePolicy: ContractBillingPolicy = {
    ...policy,
    idleClarificationThresholdMinutes: ruleConfig.idleClarificationThresholdMinutes,
    deepWorkNoInputWindowMinutes: ruleConfig.deepWorkNoInputWindowMinutes,
  }

  const { segments } = evaluateCanonicalTimeline(rawSlices, effectivePolicy, taskEstimateMinutes)

  return segments.map((seg) => {
    const filteredRules = seg.triggeredRules.filter((rule) => {
      if (!ruleConfig.enabledRules[rule.ruleCode]) return false
      if (rule.ruleCode === 'R-08') {
        const matchingSlice = rawSlices.find(
          (s) =>
            s.workDate === seg.workDate &&
            s.startMinuteOfDay <= seg.startMinuteOfDay &&
            s.endMinuteOfDay >= seg.endMinuteOfDay &&
            typeof s.clockDriftSeconds === 'number'
        )
        if (
          matchingSlice?.clockDriftSeconds !== undefined &&
          Math.abs(matchingSlice.clockDriftSeconds) <= ruleConfig.clockDriftThresholdSeconds
        ) {
          return false
        }
      }
      return true
    })

    // Recompute evidenceStatus if R-01/R-07 clarification triggers were disabled in this rule set
    let nextStatus = seg.evidenceStatus
    if (
      seg.evidenceStatus === 'needs_clarification' &&
      !filteredRules.some((r) => r.severity === 'clarification')
    ) {
      nextStatus =
        seg.artifacts.length > 0 && (seg.hasInputSignal || Boolean(seg.developerNote))
          ? 'corroborated'
          : seg.developerNote
            ? 'context_added'
            : seg.hasInputSignal
              ? 'observed'
              : 'declared'
    }

    return {
      ...seg,
      evidenceStatus: nextStatus,
      triggeredRules: filteredRules,
    }
  })
}

/**
 * F3-007: Policy Simulation
 * Previews impact of a draft rule set against existing segments before activation.
 * Guarantees 0 retroactive historical mutations and 0 automated pay deductions.
 */
export function simulateRuleSetImpact(
  rawSlices: RawTimeSliceInput[],
  policy: ContractBillingPolicy,
  taskEstimateMinutes: number,
  currentConfig: VerificationRuleConfig,
  draftConfig: VerificationRuleConfig,
  draftVersionLabel: string
): PolicySimulationReport {
  const before = evaluateSegmentsWithRuleSet(rawSlices, policy, taskEstimateMinutes, currentConfig)
  const after = evaluateSegmentsWithRuleSet(rawSlices, policy, taskEstimateMinutes, draftConfig)

  const deltas: PolicySimulationDelta[] = []

  for (let i = 0; i < before.length; i++) {
    const b = before[i]
    const a = after[i]
    if (!a) continue
    const bRules = b.triggeredRules.map((r) => r.ruleCode)
    const aRules = a.triggeredRules.map((r) => r.ruleCode)
    const changed =
      b.evidenceStatus !== a.evidenceStatus || bRules.join(',') !== aRules.join(',')

    if (changed) {
      deltas.push({
        segmentId: b.id,
        label: `${b.workDate} ${formatMinuteOfDay(b.startMinuteOfDay)}–${formatMinuteOfDay(b.endMinuteOfDay)} (${b.workMode})`,
        currentStatus: b.evidenceStatus,
        simulatedStatus: a.evidenceStatus,
        currentRules: bRules,
        simulatedRules: aRules,
        retroactivePayDeduction: 0,
      })
    }
  }

  return {
    draftVersionLabel,
    totalEvaluatedSegments: before.length,
    statusChangedCount: deltas.filter((d) => d.currentStatus !== d.simulatedStatus).length,
    clarificationCountBefore: before.filter((s) => s.evidenceStatus === 'needs_clarification')
      .length,
    clarificationCountAfter: after.filter((s) => s.evidenceStatus === 'needs_clarification')
      .length,
    corroboratedCountAfter: after.filter((s) => s.evidenceStatus === 'corroborated').length,
    retroactiveHistoricalMutations: 0,
    automatedPayDeductions: 0,
    deltas,
  }
}

export interface SignalRollupInput {
  id: string
  workDate: string
  startMinuteOfDay: number
  endMinuteOfDay: number
  appCategory: string
  workMode: WorkMode
  hasInputSignal: boolean
  isObservationGap: boolean
}

export interface SignalArtifactInput {
  id: string
  workDate: string
  minuteOfDay: number
  sourceType: string
  summaryTitle: string
}

/**
 * F3-003: Work-Mode Suggestions
 * Suggests coding/debugging/research/meeting/testing based on observed coarse signals.
 * Advisory only — never alters billed hours automatically.
 */
export function suggestWorkModeFromSignals(
  rollups: SignalRollupInput[],
  artifacts: SignalArtifactInput[]
): WorkModeSuggestion[] {
  const suggestions: WorkModeSuggestion[] = []

  for (const r of rollups) {
    if (r.isObservationGap) continue

    const nearbyArtifacts = artifacts.filter(
      (a) =>
        a.workDate === r.workDate &&
        a.minuteOfDay >= r.startMinuteOfDay - 15 &&
        a.minuteOfDay <= r.endMinuteOfDay + 15
    )

    const hasDebug = nearbyArtifacts.some((a) => a.sourceType === 'vscode_debug')
    const hasTest = nearbyArtifacts.some((a) => a.sourceType === 'vscode_test')
    const hasReview = nearbyArtifacts.some((a) => a.sourceType === 'github_review')

    let suggested: WorkMode | null = null
    let rationale = ''
    let confidence = 0.8

    if (hasDebug && r.workMode !== 'debugging') {
      suggested = 'debugging'
      rationale = 'VS Code debug lifecycle events observed during this interval.'
      confidence = 0.91
    } else if (hasTest && !hasDebug && r.workMode !== 'testing') {
      suggested = 'testing'
      rationale = 'Local test runner execution summary observed during this interval.'
      confidence = 0.88
    } else if (hasReview && r.workMode !== 'review') {
      suggested = 'review'
      rationale = 'GitHub pull request review artifact occurred in this window.'
      confidence = 0.87
    } else if (r.appCategory === 'docs_browser' && r.workMode === 'coding') {
      suggested = 'research'
      rationale = 'Coarse documentation browser category observed during coding mode.'
      confidence = 0.82
    } else if (r.appCategory === 'communication' && r.workMode === 'coding') {
      suggested = 'meeting'
      rationale = 'Communication app category active; consider tagging as Meeting / Sync.'
      confidence = 0.78
    }

    if (suggested) {
      suggestions.push({
        id: `wms-${r.id}`,
        workDate: r.workDate,
        startMinuteOfDay: r.startMinuteOfDay,
        endMinuteOfDay: r.endMinuteOfDay,
        currentWorkMode: r.workMode,
        suggestedWorkMode: suggested,
        confidence,
        rationale,
        citedSignalIds: [r.id, ...nearbyArtifacts.map((a) => a.id)],
      })
    }
  }

  return suggestions
}

/**
 * F3-010: Explainable Unusual Pattern Alerts
 * Surfaces transparent review notices without accusations or automated deductions.
 */
export function detectUnusualPatternAlerts(
  segments: CanonicalTimeSegment[],
  taskVariances: TaskEffortVarianceSummary[],
  estimateVarianceAlertPercent = 125
): UnusualPatternAlert[] {
  const alerts: UnusualPatternAlert[] = []

  const driftSegments = segments.filter((s) =>
    s.triggeredRules.some((r) => r.ruleCode === 'R-08')
  )
  if (driftSegments.length > 0) {
    alerts.push({
      id: 'alert-clock-drift',
      ruleCode: 'R-08',
      title: `Device clock drift detected across ${driftSegments.length} interval(s)`,
      explanation:
        'Local wall-clock timestamps diverged from server receipt / monotonic timer by > 120s. Interval durations use monotonic counters.',
      suggestedReviewAction:
        'Verify workstation NTP sync; no billing penalty is applied.',
      prohibitedInference: 'Clock drift is a technical anomaly, never proof of tampering.',
      citedIds: driftSegments.map((s) => s.id),
      severity: 'warning',
    })
  }

  const clarificationSegments = segments.filter(
    (s) => s.evidenceStatus === 'needs_clarification'
  )
  if (clarificationSegments.length >= 2) {
    alerts.push({
      id: 'alert-unexplained-gaps',
      ruleCode: 'R-01',
      title: `${clarificationSegments.length} intervals awaiting developer context`,
      explanation:
        'Multiple standard-mode intervals had >15m without IDE/desktop signals and no deep-work note yet.',
      suggestedReviewAction:
        'Prompt developer to reconcile gaps as Thinking, Research, Meeting, or Break.',
      prohibitedInference: 'Never auto-label gaps as absence or misconduct.',
      citedIds: clarificationSegments.map((s) => s.id),
      severity: 'clarification',
    })
  }

  const overBudgetTasks = taskVariances.filter(
    (tv) => tv.estimateMinutes > 0 && tv.variancePercent >= estimateVarianceAlertPercent
  )
  for (const tv of overBudgetTasks) {
    alerts.push({
      id: `alert-variance-${tv.taskId}`,
      ruleCode: 'R-06',
      title: `${tv.taskCode} effort at ${tv.variancePercent}% of initial estimate`,
      explanation: `Claimed ${tv.claimedMinutes}m vs ${tv.estimateMinutes}m estimate (${tv.reasonCodes.join(', ') || 'scope/investigation complexity'}).`,
      suggestedReviewAction:
        'Review acceptance criteria and update project budget forecast with client/PM.',
      prohibitedInference:
        'Exceeding an estimate does not indicate low developer performance.',
      citedIds: [tv.taskId],
      severity: 'warning',
    })
  }

  return alerts
}

export type { EvidenceArtifact }
