import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyTimeRounding,
  evaluateCanonicalTimeline,
  formatMinuteOfDay,
  resolveEffectiveRate,
} from '../index.ts'
import {
  validateContractPolicy,
  validateEventEnvelope,
} from '../../schemas/index.ts'
import type {
  ContractBillingPolicy,
  RawTimeSliceInput,
} from '../../../types/domain.types.ts'

const BASE_POLICY: ContractBillingPolicy = {
  id: 'policy_test',
  tenantId: 'tenant_test',
  projectName: 'Core Payments Engine',
  clientName: 'Acme Corp',
  roundingRule: 'none',
  paidBreakAllowanceMinutesPerDay: 15,
  weeklyCapMinutes: 2400,
  deepWorkNoInputWindowMinutes: 90,
  idleClarificationThresholdMinutes: 20,
  rateVersions: [
    {
      id: 'rv_1',
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-10-31',
      hourlyRate: 120,
      currency: 'USD',
      label: 'October Rate ($120/hr)',
    },
    {
      id: 'rv_2',
      effectiveFrom: '2026-11-01',
      effectiveTo: null,
      hourlyRate: 140,
      currency: 'USD',
      label: 'November Rate ($140/hr)',
    },
  ],
}

describe('Time Rounding & Formatting', () => {
  it('applies exact, 5m, 6m, and 15m rounding rules accurately', () => {
    assert.equal(applyTimeRounding(0, 'nearest_15m'), 0)
    assert.equal(applyTimeRounding(-5, 'nearest_5m'), 0)
    assert.equal(applyTimeRounding(42.5, 'none'), 42.5)
    assert.equal(applyTimeRounding(43, 'nearest_5m'), 45)
    assert.equal(applyTimeRounding(41, 'nearest_6m'), 42)
    assert.equal(applyTimeRounding(52, 'nearest_15m'), 45)
    assert.equal(applyTimeRounding(53, 'nearest_15m'), 60)
  })

  it('formats minute of day safely across bounds', () => {
    assert.equal(formatMinuteOfDay(0), '00:00')
    assert.equal(formatMinuteOfDay(545), '09:05')
    assert.equal(formatMinuteOfDay(1500), '24:00')
  })
})

describe('Effective-Dated Contract Rate Resolution (F1-044)', () => {
  it('resolves historical vs current workDate contract rates cleanly', () => {
    const octRate = resolveEffectiveRate('2026-10-20', BASE_POLICY.rateVersions)
    const novRate = resolveEffectiveRate('2026-11-10', BASE_POLICY.rateVersions)

    assert.equal(octRate.hourlyRate, 120)
    assert.equal(novRate.hourlyRate, 140)
  })
})

describe('Canonical Verification Engine (D-002 / Principles 1-5)', () => {
  it('deduplicates concurrent multi-device overlaps so real time is never double billed (R-02)', () => {
    const slices: RawTimeSliceInput[] = [
      {
        id: 's1',
        deviceId: 'dev_macbook',
        deviceName: 'MacBook Pro',
        workDate: '2026-11-10',
        startMinuteOfDay: 540,
        endMinuteOfDay: 600,
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        artifacts: [],
      },
      {
        id: 's2',
        deviceId: 'dev_linux',
        deviceName: 'Linux Box',
        workDate: '2026-11-10',
        startMinuteOfDay: 540,
        endMinuteOfDay: 600,
        workMode: 'coding',
        provenance: 'web_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        artifacts: [],
      },
    ]

    const result = evaluateCanonicalTimeline(slices, BASE_POLICY, 240)
    assert.equal(result.segments.length, 1)
    assert.equal(result.segments[0].wasDeduplicatedOverlap, true)
    assert.equal(result.totals.elapsedMinutes, 60)
    assert.equal(result.totals.claimedMinutes, 60)
    assert.ok(result.segments[0].triggeredRules.some((r) => r.ruleCode === 'R-02'))
  })

  it('supports declared silent deep-work / thinking without flagging fraud or deduction', () => {
    const slices: RawTimeSliceInput[] = [
      {
        id: 's_think',
        deviceId: 'dev_macbook',
        deviceName: 'MacBook Pro',
        workDate: '2026-11-10',
        startMinuteOfDay: 600,
        endMinuteOfDay: 660,
        workMode: 'thinking',
        provenance: 'desktop_timer',
        appCategory: 'unobserved',
        hasInputSignal: false,
        artifacts: [],
      },
    ]

    const result = evaluateCanonicalTimeline(slices, BASE_POLICY, 240)
    assert.equal(result.totals.observedMinutes, 0)
    assert.equal(result.totals.supportedMinutes, 60)
    assert.equal(result.totals.approvedBillableMinutes, 60)
    assert.equal(result.segments[0].evidenceStatus, 'context_added')
  })

  it('corroborates zero-commit debugging sessions via debugger/test artifacts (R-03)', () => {
    const slices: RawTimeSliceInput[] = [
      {
        id: 's_debug',
        deviceId: 'dev_macbook',
        deviceName: 'MacBook Pro',
        workDate: '2026-11-10',
        startMinuteOfDay: 660,
        endMinuteOfDay: 720,
        workMode: 'debugging',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote: 'Isolated race condition in connection pooler',
        artifacts: [
          {
            id: 'art_1',
            sourceType: 'vscode_debug',
            externalId: 'dbg_01',
            occurredAtUtc: '2026-11-10T11:30:00Z',
            summaryTitle: 'Attached Node inspector',
            linkType: 'contemporaneous',
            linkConfidence: 0.95,
            linkRationale: 'Same work session window',
          },
        ],
      },
    ]

    const result = evaluateCanonicalTimeline(slices, BASE_POLICY, 240)
    assert.equal(result.segments[0].evidenceStatus, 'corroborated')
    assert.ok(result.segments[0].triggeredRules.some((r) => r.ruleCode === 'R-03'))
  })

  it('marks unexplained zero-input coding gap (>20m) as needs_clarification (R-01) and preserves raw elapsed', () => {
    const slices: RawTimeSliceInput[] = [
      {
        id: 's_gap',
        deviceId: 'dev_macbook',
        deviceName: 'MacBook Pro',
        workDate: '2026-11-10',
        startMinuteOfDay: 720,
        endMinuteOfDay: 750,
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'unobserved',
        hasInputSignal: false,
        artifacts: [],
      },
    ]

    const result = evaluateCanonicalTimeline(slices, BASE_POLICY, 240)
    assert.equal(result.segments[0].evidenceStatus, 'needs_clarification')
    assert.equal(result.totals.elapsedMinutes, 30)
    assert.equal(result.totals.approvedBillableMinutes, 0)
    assert.ok(result.segments[0].triggeredRules.some((r) => r.ruleCode === 'R-01'))
  })

  it('credits paid breaks up to daily allowance and excludes excess unpaid breaks', () => {
    const slices: RawTimeSliceInput[] = [
      {
        id: 'b_paid',
        deviceId: 'dev_macbook',
        deviceName: 'MacBook Pro',
        workDate: '2026-11-10',
        startMinuteOfDay: 750,
        endMinuteOfDay: 765,
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'other',
        hasInputSignal: false,
        isBreak: true,
        breakType: 'paid',
        artifacts: [],
      },
      {
        id: 'b_unpaid',
        deviceId: 'dev_macbook',
        deviceName: 'MacBook Pro',
        workDate: '2026-11-10',
        startMinuteOfDay: 765,
        endMinuteOfDay: 795,
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'other',
        hasInputSignal: false,
        isBreak: true,
        breakType: 'unpaid',
        artifacts: [],
      },
    ]

    const result = evaluateCanonicalTimeline(slices, BASE_POLICY, 240)
    assert.equal(result.totals.elapsedMinutes, 45)
    assert.equal(result.totals.claimedMinutes, 15)
  })
})

describe('DPIA Event Schema & Contract Policy Validation (D-003)', () => {
  it('blocks prohibited surveillance metadata keys and excluded local apps', () => {
    const res = validateEventEnvelope(
      {
        event_id: 'evt_1',
        schema_version: 1,
        tenant_id: 'tenant_1',
        user_id: 'usr_1',
        device_id: 'dev_1',
        session_id: 'sess_1',
        source: 'desktop',
        event_type: 'activity_rollup_1m',
        occurred_at_utc: '2026-11-10T10:00:00Z',
        local_sequence: 1,
        monotonic_elapsed_ms: 60000,
        consent_policy_version: 'v1.0-2026-11',
        metadata: {
          keystrokes: 420,
          window_title_raw: 'Secrets - 1Password',
          app_identifier: '1Password',
        },
        integrity: { agent_build: '0.1.0', batch_id: 'batch_1' },
      },
      ['1password', 'signal']
    )

    assert.equal(res.valid, false)
    assert.deepEqual(res.blockedPrivacyKeys, ['keystrokes', 'window_title_raw'])
    assert.ok(res.errors.some((e) => e.includes('Local Privacy Exclusion')))
  })

  it('validates non-overlapping contract rate versions', () => {
    assert.equal(validateContractPolicy(BASE_POLICY).valid, true)

    const overlapping = validateContractPolicy({
      ...BASE_POLICY,
      rateVersions: [
        {
          id: 'r1',
          effectiveFrom: '2026-10-01',
          effectiveTo: '2026-11-05',
          hourlyRate: 100,
          currency: 'USD',
          label: 'R1',
        },
        {
          id: 'r2',
          effectiveFrom: '2026-11-01',
          effectiveTo: null,
          hourlyRate: 120,
          currency: 'USD',
          label: 'R2',
        },
      ],
    })

    assert.equal(overlapping.valid, false)
    assert.ok(overlapping.errors.some((e) => e.includes('Overlapping rate versions')))
  })
})

