import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCanonicalTimeline } from '../index.ts'
import { validateEventEnvelope } from '../../schemas/index.ts'
import type { ContractBillingPolicy, RawTimeSliceInput } from '../../../types/domain.types.ts'
import {
  classifyTerminalCommandCategory,
  normalizeGitRemoteToRepoName,
  suggestTaskMappingFromGitContext,
} from '../../vscode-extension/taskMapper.ts'
import { VsCodeTelemetryBuffer } from '../../vscode-extension/telemetryBuffer.ts'

const PHASE2_POLICY: ContractBillingPolicy = {
  id: 'policy_phase2',
  tenantId: 'tenant_northstar',
  projectName: 'Settlement Core',
  clientName: 'Acme FinTech',
  roundingRule: 'none',
  paidBreakAllowanceMinutesPerDay: 15,
  weeklyCapMinutes: 2400,
  deepWorkNoInputWindowMinutes: 90,
  idleClarificationThresholdMinutes: 15,
  rateVersions: [
    {
      id: 'rv_p2',
      effectiveFrom: '2026-11-01',
      effectiveTo: null,
      hourlyRate: 120,
      currency: 'USD',
      label: 'Phase 2 Standard ($120/hr)',
    },
  ],
}

describe('Phase 2 Milestone 2.2: VS Code Extension Task Mapper & Telemetry Buffer', () => {
  it('extracts task key from Git branch and supports explicit developer override (F2-011)', () => {
    const suggestion = suggestTaskMappingFromGitContext(
      'settlement-core',
      'git@github.com:northstar/settlement-core.git',
      'fix/DEV-102-webhook-retry'
    )
    assert.equal(suggestion.repoFullName, 'northstar/settlement-core')
    assert.equal(suggestion.suggestedTaskCode, 'DEV-102')
    assert.equal(suggestion.confirmedByUser, false)

    const overridden = suggestTaskMappingFromGitContext(
      'settlement-core',
      'https://github.com/northstar/settlement-core.git',
      'fix/DEV-102-webhook-retry',
      'DEV-109'
    )
    assert.equal(overridden.suggestedTaskCode, 'DEV-109')
    assert.equal(overridden.overriddenTaskCode, 'DEV-109')
    assert.equal(overridden.confirmedByUser, true)
    assert.equal(overridden.confidenceScore, 1.0)
  })

  it('normalizes SSH and HTTPS Git remotes cleanly', () => {
    assert.equal(
      normalizeGitRemoteToRepoName('git@github.com:northstar/settlement-core.git', 'fallback'),
      'northstar/settlement-core'
    )
    assert.equal(
      normalizeGitRemoteToRepoName('https://github.com/northstar/devproof-agent.git', 'fallback'),
      'northstar/devproof-agent'
    )
  })

  it('classifies opt-in terminal commands into coarse categories without arguments (F2-016)', () => {
    assert.equal(classifyTerminalCommandCategory('vitest run'), 'test')
    assert.equal(classifyTerminalCommandCategory('cargo build --release'), 'build')
    assert.equal(classifyTerminalCommandCategory('git push origin main'), 'version_control')
    assert.equal(classifyTerminalCommandCategory('prisma migrate dev'), 'database')
  })

  it('emits coarse 1m edit/save buckets, debug events, and test runs, and stops on disconnect (F2-010..013, Sec 5.5)', () => {
    const buffer = new VsCodeTelemetryBuffer('v1.0-2026-11')
    buffer.recordDocumentEdit('hash_a', 'typescript')
    buffer.recordDocumentSave('hash_a', 'typescript')
    buffer.recordDocumentSave('hash_b', 'sql')

    const editBucket = buffer.flushOneMinuteEditBucket('DEV-102')
    assert.ok(editBucket)
    assert.equal(editBucket.event_type, 'vscode_edit_save_bucket')
    assert.equal(editBucket.metadata.files_touched_count, 2)
    assert.equal(editBucket.metadata.save_count, 2)
    assert.equal(editBucket.metadata.mapped_task_code, 'DEV-102')

    const debugEvt = buffer.recordDebugSessionCompleted({
      debugType: 'pwa-node',
      durationSeconds: 3420,
      breakpointsHit: 19,
      mappedTaskCode: 'DEV-102',
      investigationNote: 'Reproduced queue visibility timeout race',
    })
    assert.ok(debugEvt)
    assert.equal(debugEvt.event_type, 'vscode_debug_session')

    const testEvt = buffer.recordTestExecutionSummary({
      runnerName: 'vitest',
      passedCount: 28,
      failedCount: 2,
      durationMs: 4820,
      mappedTaskCode: 'DEV-102',
    })
    assert.ok(testEvt)
    assert.equal(testEvt.event_type, 'vscode_test_run')
    assert.equal(buffer.getQueuedEvents().length, 3)

    // Disconnect integration -> stops further capture (Section 5.5)
    buffer.setConnected(false)
    buffer.recordDocumentSave('hash_c', 'typescript')
    assert.equal(buffer.flushOneMinuteEditBucket('DEV-102'), null)
    assert.equal(
      buffer.recordDebugSessionCompleted({
        debugType: 'lldb',
        durationSeconds: 120,
        breakpointsHit: 1,
        mappedTaskCode: 'DEV-102',
      }),
      null
    )
  })
})

describe('Phase 2 Acceptance Scenarios (Section 5.5 & D-003 Privacy Guardrails)', () => {
  it('substantiates 4h debugging with 0 commits and links retrospective PR without inflating hours (R-03, R-05)', () => {
    const slices: RawTimeSliceInput[] = [
      {
        id: 'dbg_4h',
        deviceId: 'dev_m4',
        deviceName: 'MacBook Pro M4',
        workDate: '2026-11-11',
        startMinuteOfDay: 600,
        endMinuteOfDay: 840, // 240m = 4 hours
        workMode: 'debugging',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote: '4h debugging race condition; PR merged next morning',
        artifacts: [
          {
            id: 'art_dbg',
            sourceType: 'vscode_debug',
            externalId: 'dbg-9941',
            occurredAtUtc: '2026-11-11T10:45:00Z',
            summaryTitle: 'VS Code Debug Session (19 breakpoints)',
            linkType: 'contemporaneous',
            linkConfidence: 0.96,
            linkRationale: 'Matched active branch fix/DEV-102',
          },
          {
            id: 'art_pr_next_day',
            sourceType: 'github_pr',
            externalId: 'pr-148',
            occurredAtUtc: '2026-11-12T09:15:00Z',
            summaryTitle: 'PR #148 merged next morning',
            linkType: 'retrospective_outcome',
            linkConfidence: 0.89,
            linkRationale: 'Next-day deliverable linked as outcome only',
          },
        ],
      },
    ]

    const result = evaluateCanonicalTimeline(slices, PHASE2_POLICY, 300)
    assert.equal(result.totals.elapsedMinutes, 240)
    assert.equal(result.totals.claimedMinutes, 240)
    assert.equal(result.totals.supportedMinutes, 240)
    assert.equal(result.segments[0].evidenceStatus, 'corroborated')
    assert.ok(result.segments[0].triggeredRules.some((r) => r.ruleCode === 'R-03'))
    assert.ok(result.segments[0].triggeredRules.some((r) => r.ruleCode === 'R-05'))
  })

  it('merges concurrent IDE and Desktop signals during the same 10m into 10m elapsed (Section 5.5)', () => {
    const slices: RawTimeSliceInput[] = [
      {
        id: 'desktop_10m',
        deviceId: 'dev_m4',
        deviceName: 'Desktop Agent',
        workDate: '2026-11-11',
        startMinuteOfDay: 780,
        endMinuteOfDay: 790,
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        artifacts: [],
      },
      {
        id: 'vscode_10m',
        deviceId: 'ext_vscode',
        deviceName: 'VS Code Extension',
        workDate: '2026-11-11',
        startMinuteOfDay: 780,
        endMinuteOfDay: 790,
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        artifacts: [],
      },
    ]

    const result = evaluateCanonicalTimeline(slices, PHASE2_POLICY, 240)
    assert.equal(result.segments.length, 1)
    assert.equal(result.totals.elapsedMinutes, 10)
    assert.equal(result.totals.claimedMinutes, 10)
  })

  it('records clock drift > 120s as technical anomaly notice R-08 without accusing developer', () => {
    const slices: RawTimeSliceInput[] = [
      {
        id: 'drift_1',
        deviceId: 'dev_thinkpad',
        deviceName: 'Linux ThinkPad',
        workDate: '2026-11-11',
        startMinuteOfDay: 540,
        endMinuteOfDay: 600,
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        clockDriftSeconds: 185,
        artifacts: [],
      },
    ]

    const result = evaluateCanonicalTimeline(slices, PHASE2_POLICY, 240)
    const r08 = result.segments[0].triggeredRules.find((r) => r.ruleCode === 'R-08')
    assert.ok(r08)
    assert.equal(r08.severity, 'warning')
    assert.equal(result.totals.elapsedMinutes, 60)
  })

  it('enforces D-003 and F2-005 privacy denylist on canonical event envelopes', () => {
    const blockedResult = validateEventEnvelope(
      {
        event_id: 'evt-privacy-1',
        schema_version: 1,
        tenant_id: 'tenant-northstar',
        user_id: 'usr-aria',
        device_id: 'dev-m4',
        session_id: 'sess-1',
        source: 'desktop',
        event_type: 'activity_rollup_1m',
        occurred_at_utc: '2026-11-11T10:00:00Z',
        local_sequence: 1,
        monotonic_elapsed_ms: 60000,
        consent_policy_version: 'v1.0-2026-11',
        metadata: {
          app_identifier: '1Password',
          raw_source_code: 'leak',
        },
        integrity: { agent_build: '0.2.0', batch_id: 'b1' },
      },
      ['1Password']
    )

    assert.equal(blockedResult.valid, false)
    assert.ok(blockedResult.blockedPrivacyKeys.includes('raw_source_code'))
    assert.ok(blockedResult.errors.some((e) => e.includes('Local Privacy Exclusion')))
  })
})
