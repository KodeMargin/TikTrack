import type {
  CanonicalTimeSegment,
  ContractBillingPolicy,
  ContractRateVersion,
  EvidenceArtifact,
  EvidenceStatus,
  FiveTimeMetrics,
  RawTimeSliceInput,
  RoundingRule,
  TriggeredRuleEvaluation,
} from '@/types/domain.types'

/**
 * Applies contract rounding rule (D-002 / F1-044) to a minute quantity.
 */
export function applyTimeRounding(minutes: number, rule: RoundingRule): number {
  if (minutes <= 0) return 0
  switch (rule) {
    case 'none':
      return Math.round(minutes * 100) / 100
    case 'nearest_5m':
      return Math.round(minutes / 5) * 5
    case 'nearest_6m':
      return Math.round(minutes / 6) * 6
    case 'nearest_15m':
      return Math.round(minutes / 15) * 15
  }
}

/**
 * Resolves the historical effective-dated rate version for a specific workDate (Acceptance Scenario 6).
 */
export function resolveEffectiveRate(
  workDate: string,
  rateVersions: ContractRateVersion[]
): ContractRateVersion {
  const matched = rateVersions.find((rv) => {
    const afterStart = workDate >= rv.effectiveFrom
    const beforeEnd = rv.effectiveTo === null || workDate <= rv.effectiveTo
    return afterStart && beforeEnd
  })
  return (
    matched ??
    rateVersions[rateVersions.length - 1] ?? {
      id: 'fallback-rate',
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      hourlyRate: 85,
      currency: 'USD',
      label: 'Standard Rate ($85/hr)',
    }
  )
}

/**
 * Formats minute-of-day (0..1440) as HH:MM string.
 */
export function formatMinuteOfDay(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minute)))
  const hrs = Math.floor(clamped / 60)
  const mins = clamped % 60
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * Section 12.3 & 14: Canonical Non-Overlapping Timeline & Verification Engine
 *
 * - Slices overlapping intervals across multiple devices so the same real-time minute
 *   is NEVER billed twice (Principle 5 & Acceptance Scenario 3).
 * - Computes the Five Separate Time Concepts (F1-041):
 *   1. Elapsed Minutes
 *   2. Claimed Minutes
 *   3. Observed Minutes
 *   4. Supported Minutes
 *   5. Approved Billable Minutes
 * - Evaluates Rules R-01 through R-08 without ever labeling low input as "fraud".
 */
export function evaluateCanonicalTimeline(
  rawSlices: RawTimeSliceInput[],
  policy: ContractBillingPolicy,
  taskEstimateMinutes: number,
  managerApprovalState: Record<string, { status: 'pending' | 'approved' | 'clarify' | 'disputed'; adjustedMinutes?: number }> = {}
): {
  segments: CanonicalTimeSegment[]
  totals: FiveTimeMetrics & { totalEstimatedBillableAmount: number }
} {
  if (rawSlices.length === 0) {
    return {
      segments: [],
      totals: {
        elapsedMinutes: 0,
        claimedMinutes: 0,
        observedMinutes: 0,
        supportedMinutes: 0,
        approvedBillableMinutes: 0,
        totalEstimatedBillableAmount: 0,
      },
    }
  }

  // Group by workDate so each day's timeline is partitioned into canonical atomic intervals
  const dates = Array.from(new Set(rawSlices.map((s) => s.workDate))).sort()
  const canonicalSegments: CanonicalTimeSegment[] = []
  let cumulativeClaimedMinutes = 0

  for (const workDate of dates) {
    const daySlices = rawSlices.filter((s) => s.workDate === workDate)
    const boundaries = Array.from(
      new Set(daySlices.flatMap((s) => [s.startMinuteOfDay, s.endMinuteOfDay]))
    ).sort((a, b) => a - b)

    let remainingPaidBreakMinutes = policy.paidBreakAllowanceMinutesPerDay

    for (let i = 0; i < boundaries.length - 1; i++) {
      const startMin = boundaries[i]
      const endMin = boundaries[i + 1]
      const duration = endMin - startMin
      if (duration <= 0) continue

      const covering = daySlices.filter(
        (s) => s.startMinuteOfDay <= startMin && s.endMinuteOfDay >= endMin
      )
      if (covering.length === 0) continue

      // Primary slice selection when multiple devices or tools overlap
      const primary = covering[0]
      const wasDeduplicatedOverlap =
        new Set(covering.map((c) => c.deviceId)).size > 1 || covering.length > 1
      const contributingDevices = Array.from(new Set(covering.map((c) => c.deviceName)))
      const combinedArtifacts: EvidenceArtifact[] = Array.from(
        new Map(
          covering.flatMap((c) => c.artifacts).map((art) => [art.id, art])
        ).values()
      )
      const combinedHasInput = covering.some((c) => c.hasInputSignal)
      const combinedNote = covering
        .map((c) => c.developerNote)
        .filter(Boolean)
        .join(' | ')

      const triggeredRules: TriggeredRuleEvaluation[] = []

      // Evaluate R-02: Overlapping sessions across devices
      if (wasDeduplicatedOverlap) {
        triggeredRules.push({
          ruleCode: 'R-02',
          title: 'Overlapping Session Deduplicated',
          triggerDescription: `Concurrent tracking detected across (${contributingDevices.join(', ')}) during ${formatMinuteOfDay(startMin)}–${formatMinuteOfDay(endMin)}.`,
          suggestedAction:
            'Merged into a single canonical interval of ' +
            duration +
            'm so parallel activity never multiplies billed minutes.',
          prohibitedInference: 'Do NOT infer double-billing fraud.',
          severity: 'info',
        })
      }

      // Evaluate R-01: Input gap > threshold in ordinary coding mode without note
      const isDeepWorkDeclared =
        primary.workMode === 'thinking' ||
        primary.workMode === 'design' ||
        primary.workMode === 'research' ||
        primary.workMode === 'meeting'

      if (
        !primary.isBreak &&
        !combinedHasInput &&
        !isDeepWorkDeclared &&
        duration >= policy.idleClarificationThresholdMinutes &&
        !combinedNote
      ) {
        triggeredRules.push({
          ruleCode: 'R-01',
          title: 'Unobserved Input Gap (> ' + policy.idleClarificationThresholdMinutes + 'm)',
          triggerDescription: `${duration}m interval without keyboard/IDE telemetry in standard "${primary.workMode}" mode.`,
          suggestedAction:
            'Prompt developer at session end: "Was this Thinking, Reading, Meeting, Break, or Away?"',
          prohibitedInference: 'Never auto-label as "Employee was absent or idle".',
          severity: 'clarification',
        })
      }

      // Evaluate R-03: Debugging + tests with zero commits
      const hasDebugOrTestArtifact = combinedArtifacts.some(
        (a) => a.sourceType === 'vscode_debug' || a.sourceType === 'vscode_test'
      )
      const hasCommitArtifact = combinedArtifacts.some(
        (a) => a.sourceType === 'github_commit'
      )
      if (primary.workMode === 'debugging' && hasDebugOrTestArtifact && !hasCommitArtifact) {
        triggeredRules.push({
          ruleCode: 'R-03',
          title: 'Corroborated Debugging Without Commit',
          triggerDescription:
            'Debugger lifecycle and local test execution recorded alongside investigation notes with 0 Git commits.',
          suggestedAction:
            'Treat as a corroborated work claim; lack of commit never triggers a deduction.',
          prohibitedInference: 'Never infer "No productive output because 0 commits".',
          severity: 'info',
        })
      }

      // Evaluate R-04: Documentation browser during research mode
      if (primary.workMode === 'research' && primary.appCategory === 'docs_browser') {
        triggeredRules.push({
          ruleCode: 'R-04',
          title: 'Contextual Documentation Research',
          triggerDescription:
            'Coarse documentation browser category aligned with declared Research mode.',
          suggestedAction: 'Link developer research note to task context.',
          prohibitedInference: 'URL category is context, not algorithmic proof of reading speed.',
          severity: 'info',
        })
      }

      // Evaluate R-05: Retrospective commit/PR linked later
      const retrospectiveArtifacts = combinedArtifacts.filter(
        (a) => a.linkType === 'retrospective_outcome'
      )
      if (retrospectiveArtifacts.length > 0) {
        triggeredRules.push({
          ruleCode: 'R-05',
          title: 'Retrospective Deliverable Linked',
          triggerDescription: `Later artifact (${retrospectiveArtifacts.map((a) => a.externalId).join(', ')}) linked as task outcome.`,
          suggestedAction:
            'Show deliverable outcome relationship while keeping historical session duration independent.',
          prohibitedInference: 'A later commit does not retroactively prove exact earlier hours.',
          severity: 'info',
        })
      }

      // Evaluate R-07: Manual time entry after period
      if (primary.provenance === 'manual_entry') {
        triggeredRules.push({
          ruleCode: 'R-07',
          title: 'Manual Time Entry Provenance',
          triggerDescription: 'Segment was entered manually with an explicit developer reason.',
          suggestedAction: 'Route to manager review with manual provenance badge.',
          prohibitedInference: 'Never treat manual entry as a false time claim.',
          severity: 'clarification',
        })
      }

      // Evaluate R-08: Device clock drift anomaly
      if (primary.clockDriftSeconds && Math.abs(primary.clockDriftSeconds) > 120) {
        triggeredRules.push({
          ruleCode: 'R-08',
          title: 'Device Clock Drift Detected',
          triggerDescription: `Wall clock differed from server receipt / monotonic timer by ${primary.clockDriftSeconds}s.`,
          suggestedAction: 'Use monotonic duration for interval math and display sync notice.',
          prohibitedInference: 'Clock drift is a technical anomaly, not proof of tampering.',
          severity: 'warning',
        })
      }

      // Compute the Five Separate Time Concepts (F1-041)
      const elapsedMinutes = duration
      let claimedMinutes = duration
      if (primary.isBreak) {
        if (primary.breakType === 'paid' && remainingPaidBreakMinutes > 0) {
          const paidPortion = Math.min(duration, remainingPaidBreakMinutes)
          remainingPaidBreakMinutes -= paidPortion
          claimedMinutes = paidPortion
        } else {
          claimedMinutes = 0
        }
      }

      const observedMinutes = !primary.isBreak && combinedHasInput ? duration : 0

      // Supported minutes include observed activity OR declared deep-work within policy window OR notes/artifacts
      const isSupportedByContext =
        !primary.isBreak &&
        (combinedHasInput ||
          (isDeepWorkDeclared && duration <= policy.deepWorkNoInputWindowMinutes) ||
          Boolean(combinedNote) ||
          combinedArtifacts.length > 0)

      const supportedMinutes = isSupportedByContext ? claimedMinutes : observedMinutes

      cumulativeClaimedMinutes += claimedMinutes
      if (taskEstimateMinutes > 0 && cumulativeClaimedMinutes > taskEstimateMinutes) {
        triggeredRules.push({
          ruleCode: 'R-06',
          title: 'Task Estimate Variance Exceeded',
          triggerDescription: `Cumulative claimed time (${cumulativeClaimedMinutes}m) exceeds task estimate (${taskEstimateMinutes}m).`,
          suggestedAction:
            'Notify manager for budget variance review without stopping legitimate engineering work.',
          prohibitedInference: 'Exceeding an estimate does not indicate a low-performing developer.',
          severity: 'warning',
        })
      }

      // Determine canonical EvidenceStatus (Section 6.4)
      const segmentId = `${workDate}-${startMin}-${endMin}`
      const managerOverride = managerApprovalState[segmentId]

      let evidenceStatus: EvidenceStatus = 'declared'
      if (managerOverride?.status === 'approved') {
        evidenceStatus = 'approved'
      } else if (managerOverride?.status === 'disputed') {
        evidenceStatus = 'disputed'
      } else if (
        managerOverride?.status === 'clarify' ||
        triggeredRules.some((r) => r.severity === 'clarification')
      ) {
        evidenceStatus = 'needs_clarification'
      } else if (combinedArtifacts.length > 0 && (combinedHasInput || Boolean(combinedNote))) {
        evidenceStatus = 'corroborated'
      } else if (Boolean(combinedNote) || isDeepWorkDeclared) {
        evidenceStatus = 'context_added'
      } else if (combinedHasInput) {
        evidenceStatus = 'observed'
      }

      const rawApprovedMinutes =
        managerOverride?.status === 'approved'
          ? (managerOverride.adjustedMinutes ?? claimedMinutes)
          : evidenceStatus === 'needs_clarification' || evidenceStatus === 'disputed'
            ? 0
            : claimedMinutes

      const approvedBillableMinutes = applyTimeRounding(
        rawApprovedMinutes,
        policy.roundingRule
      )

      const effectiveRate = resolveEffectiveRate(workDate, policy.rateVersions)
      const estimatedCost =
        Math.round(((approvedBillableMinutes / 60) * effectiveRate.hourlyRate) * 100) / 100

      canonicalSegments.push({
        id: segmentId,
        workDate,
        startMinuteOfDay: startMin,
        endMinuteOfDay: endMin,
        durationMinutes: duration,
        workMode: primary.workMode,
        provenance: primary.provenance,
        appCategory: primary.appCategory,
        hasInputSignal: combinedHasInput,
        isBreak: Boolean(primary.isBreak),
        breakType: primary.breakType,
        developerNote: combinedNote || undefined,
        evidenceStatus,
        metrics: {
          elapsedMinutes,
          claimedMinutes,
          observedMinutes,
          supportedMinutes,
          approvedBillableMinutes,
        },
        appliedRate: effectiveRate.hourlyRate,
        appliedRateLabel: effectiveRate.label,
        estimatedCost,
        triggeredRules,
        artifacts: combinedArtifacts,
        wasDeduplicatedOverlap,
        contributingDevices,
      })
    }
  }

  const totals = canonicalSegments.reduce(
    (acc, seg) => {
      acc.elapsedMinutes += seg.metrics.elapsedMinutes
      acc.claimedMinutes += seg.metrics.claimedMinutes
      acc.observedMinutes += seg.metrics.observedMinutes
      acc.supportedMinutes += seg.metrics.supportedMinutes
      acc.approvedBillableMinutes += seg.metrics.approvedBillableMinutes
      acc.totalEstimatedBillableAmount =
        Math.round((acc.totalEstimatedBillableAmount + seg.estimatedCost) * 100) / 100
      return acc
    },
    {
      elapsedMinutes: 0,
      claimedMinutes: 0,
      observedMinutes: 0,
      supportedMinutes: 0,
      approvedBillableMinutes: 0,
      totalEstimatedBillableAmount: 0,
    }
  )

  return { segments: canonicalSegments, totals }
}
