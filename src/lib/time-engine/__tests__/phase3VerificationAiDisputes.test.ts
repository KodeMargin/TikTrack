import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONTRACT_POLICY } from '../../fixtures/pilot-scenarios.ts'
import {
  DEFAULT_VERIFICATION_RULE_CONFIG,
  detectUnusualPatternAlerts,
  evaluateSegmentsWithRuleSet,
  simulateRuleSetImpact,
  suggestWorkModeFromSignals,
} from '../../phase3/rulesEngine.ts'
import {
  buildEvidenceCorrelationGraph,
  computeTaskEffortVariances,
} from '../../phase3/correlationGraph.ts'
import {
  generateGuardrailedAiDraft,
  sanitizeMetadataForAiPrompt,
  verifyAiCitations,
} from '../../phase3/aiAssistant.ts'
import { buildContractualAuditBundle } from '../../phase3/auditExport.ts'
import type { RawTimeSliceInput } from '../../../types/domain.types.ts'

describe('Phase 3 Milestone 3.1: Versioned Rules Engine, Policy Simulation & Correlation Graph', () => {
  const sampleSlices: RawTimeSliceInput[] = [
    {
      id: 'slice-gap-25m',
      deviceId: 'dev-1',
      deviceName: 'MacBook Pro',
      workDate: '2026-11-11',
      startMinuteOfDay: 540,
      endMinuteOfDay: 565,
      workMode: 'coding',
      provenance: 'desktop_timer',
      appCategory: 'unobserved',
      hasInputSignal: false,
      artifacts: [],
    },
    {
      id: 'slice-debug-45m',
      deviceId: 'dev-1',
      deviceName: 'MacBook Pro',
      workDate: '2026-11-11',
      startMinuteOfDay: 570,
      endMinuteOfDay: 615,
      workMode: 'debugging',
      provenance: 'desktop_timer',
      appCategory: 'ide',
      hasInputSignal: true,
      clockDriftSeconds: 185,
      developerNote: 'Investigated pgmq deadlock without committing yet.',
      artifacts: [
        {
          id: 'art-dbg-1',
          sourceType: 'vscode_debug',
          externalId: 'dbg-001',
          occurredAtUtc: '2026-11-11T09:40:00Z',
          summaryTitle: 'Node debugger attached (12 breakpoints)',
          linkType: 'contemporaneous',
          linkConfidence: 0.94,
          linkRationale: 'Matched active session',
        },
      ],
    },
  ]

  it('simulates draft rule threshold changes with zero retroactive mutations or auto deductions (F3-007)', () => {
    const draftConfig = {
      ...DEFAULT_VERIFICATION_RULE_CONFIG,
      idleClarificationThresholdMinutes: 30,
    }

    const report = simulateRuleSetImpact(
      sampleSlices,
      DEFAULT_CONTRACT_POLICY,
      120,
      DEFAULT_VERIFICATION_RULE_CONFIG,
      draftConfig,
      'v2.0 Relaxed Gap Policy'
    )

    assert.equal(report.totalEvaluatedSegments, 2)
    assert.equal(report.clarificationCountBefore, 1)
    assert.equal(report.clarificationCountAfter, 0)
    assert.equal(report.statusChangedCount, 1)
    assert.equal(report.retroactiveHistoricalMutations, 0)
    assert.equal(report.automatedPayDeductions, 0)
  })

  it('suggests work modes from observed IDE/docs signals without altering billed hours (F3-003)', () => {
    const suggestions = suggestWorkModeFromSignals(
      [
        {
          id: 'rol-1',
          workDate: '2026-11-11',
          startMinuteOfDay: 570,
          endMinuteOfDay: 575,
          appCategory: 'ide',
          workMode: 'coding',
          hasInputSignal: true,
          isObservationGap: false,
        },
      ],
      [
        {
          id: 'art-dbg-1',
          workDate: '2026-11-11',
          minuteOfDay: 572,
          sourceType: 'vscode_debug',
          summaryTitle: 'Debugger active',
        },
      ]
    )

    assert.equal(suggestions.length, 1)
    assert.equal(suggestions[0].suggestedWorkMode, 'debugging')
  })

  it('builds correlation edges, effort variance reason codes & non-punitive pattern alerts (F3-004, F3-009, F3-010)', () => {
    const tasks = [
      {
        id: 'tsk-1',
        projectId: 'proj-1',
        code: 'DEV-301',
        title: 'Harden queue worker',
        status: 'review',
        estimateMinutes: 60,
        acceptanceCriteria: 'Idempotent retries',
      },
    ]
    const lines = [
      {
        id: 'line-1',
        projectId: 'proj-1',
        taskId: 'tsk-1',
        taskCode: 'DEV-301',
        workDate: '2026-11-11',
        startTime: '09:00',
        endTime: '10:30',
        workMode: 'debugging',
        provenance: 'desktop_timer',
        claimedMinutes: 90,
        supportedMinutes: 90,
        approvedBillableMinutes: 90,
        evidenceStatus: 'corroborated',
        developerNote: 'Reproduced retry race condition',
      },
    ]
    const artifacts = [
      {
        id: 'art-pr-1',
        projectId: 'proj-1',
        taskId: 'tsk-1',
        taskCode: 'DEV-301',
        sourceType: 'github_pr',
        externalId: 'pr-301',
        summaryTitle: 'PR #301: Fix queue backoff',
        linkType: 'retrospective_outcome' as const,
        linkConfidence: 0.92,
        linkRationale: 'Matched branch DEV-301',
      },
    ]

    const edges = buildEvidenceCorrelationGraph('ten-1', tasks, lines, [], artifacts, [])
    assert.ok(edges.some((e) => e.edgeType === 'attributed_to'))
    assert.ok(edges.some((e) => e.edgeType === 'retrospective_outcome_of'))
    assert.ok(edges.some((e) => e.edgeType === 'outcome_associated'))

    const variances = computeTaskEffortVariances(tasks, lines, artifacts, 125)
    assert.equal(variances[0].variancePercent, 150)
    assert.ok(variances[0].reasonCodes.includes('DEEP_DEBUGGING_UNCERTAINTY'))

    const evaluated = evaluateSegmentsWithRuleSet(
      sampleSlices,
      DEFAULT_CONTRACT_POLICY,
      60,
      DEFAULT_VERIFICATION_RULE_CONFIG
    )
    const alerts = detectUnusualPatternAlerts(evaluated, variances, 125)
    assert.ok(alerts.some((a) => a.ruleCode === 'R-08'))
    assert.ok(alerts.some((a) => a.ruleCode === 'R-06'))
    assert.ok(alerts.every((a) => a.prohibitedInference.length > 0))
  })
})

describe('Phase 3 Milestone 3.2: Guardrailed AI Assistance & Tenant Opt-Out Gate', () => {
  it('strips prohibited keys, local file paths, and query URLs from AI prompt payloads (Sec 6.5)', () => {
    const { sanitized, strippedKeys } = sanitizeMetadataForAiPrompt({
      task_code: 'DEV-301',
      task_title: 'Inspect /Users/alice/secret/repo.ts and https://internal.app/doc?token=abc',
      keystrokes: 'const secret = 123',
      clipboard_text: 'private token',
      raw_source_code: 'fn main() {}',
      arbitrary_unapproved_field: 'should strip',
    })

    assert.equal(sanitized.task_code, 'DEV-301')
    assert.ok(String(sanitized.task_title).includes('[REDACTED_PATH_OR_URL]'))
    assert.equal('keystrokes' in sanitized, false)
    assert.equal('clipboard_text' in sanitized, false)
    assert.equal('raw_source_code' in sanitized, false)
    assert.equal('arbitrary_unapproved_field' in sanitized, false)
    assert.ok(strippedKeys.includes('keystrokes'))
  })

  it('verifies 100% of cited event and artifact IDs against stored tenant IDs (Exit Gate)', () => {
    const validEvents = new Set(['evt-1', 'evt-2'])
    const validArtifacts = new Set(['art-1'])

    const result = verifyAiCitations(
      ['evt-1', 'hallucinated-evt-999'],
      ['art-1', 'cross-tenant-art-888'],
      validEvents,
      validArtifacts
    )

    assert.deepEqual(result.validEventIds, ['evt-1'])
    assert.deepEqual(result.validArtifactIds, ['art-1'])
    assert.deepEqual(result.rejectedIds, ['hallucinated-evt-999', 'cross-tenant-art-888'])
    assert.equal(result.allValid, false)
  })

  it('enforces tenant AI opt-out gate (F3-027) using deterministic template with 0 LLM tokens', () => {
    const draft = generateGuardrailedAiDraft({
      tenantId: 'ten-1',
      aiEnabled: false,
      userId: 'usr-1',
      targetType: 'daily_summary',
      targetId: 'tsk-1',
      targetLabel: 'DEV-301',
      rawContextPayload: { task_code: 'DEV-301', keystrokes: 'blocked' },
      candidateEventIds: ['evt-1'],
      candidateArtifactIds: ['art-1'],
      validTenantEventIds: new Set(['evt-1']),
      validTenantArtifactIds: new Set(['art-1']),
      summaryContext: {
        taskCode: 'DEV-301',
        claimedMinutes: 90,
        supportedMinutes: 90,
        workModes: ['debugging'],
      },
    })

    assert.equal(draft.generationMode, 'deterministic_template')
    assert.equal(draft.modelId, 'deterministic-template-v1')
    assert.equal(draft.tokensUsed, 0)
    assert.equal(draft.status, 'draft')
  })

  it('builds contractual audit bundle with evidence inventory and dispute history (F3-035)', () => {
    const bundle = buildContractualAuditBundle({
      tenantName: 'Northstar Engineering',
      policyVersion: 'v1.0-2026-11',
      timesheetLines: [
        {
          id: 'tl-1',
          workDate: '2026-11-11',
          taskCode: 'DEV-301',
          taskTitle: 'Harden queue worker',
          developerName: 'Aria Chen',
          workMode: 'debugging',
          provenance: 'desktop_timer',
          elapsedMinutes: 90,
          claimedMinutes: 90,
          observedMinutes: 90,
          supportedMinutes: 90,
          approvedBillableMinutes: 90,
          evidenceStatus: 'approved',
          snapshotHourlyRate: 120,
          isLocked: true,
          developerNote: 'Verified race condition',
        },
      ],
      artifacts: [],
      correlationEdges: [],
      aiGenerations: [],
    })

    assert.equal(bundle.jsonBundle.schemaVersion, 'devproof.audit_bundle.v1')
    assert.ok(bundle.markdown.includes('Northstar Engineering'))
    assert.ok(bundle.markdown.includes('DEV-301'))
  })
})

