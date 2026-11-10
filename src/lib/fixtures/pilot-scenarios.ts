import type {
  ContractBillingPolicy,
  PilotScenarioFixture,
} from '@/types/domain.types'

/**
 * D-002: Default Sample Contract Billing Policy with Effective-Dated Rates (F1-044)
 */
export const DEFAULT_CONTRACT_POLICY: ContractBillingPolicy = {
  id: 'contract-acme-fintech-2026',
  tenantId: 'tenant-northstar-labs',
  projectName: 'Core Ledger Multi-Region Settlement',
  clientName: 'Acme FinTech Global',
  roundingRule: 'none',
  paidBreakAllowanceMinutesPerDay: 15,
  weeklyCapMinutes: 2400, // 40h
  deepWorkNoInputWindowMinutes: 90,
  idleClarificationThresholdMinutes: 15,
  rateVersions: [
    {
      id: 'rate-v1',
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-11-14',
      hourlyRate: 85,
      currency: 'USD',
      label: 'Q4 Baseline Rate ($85/hr)',
    },
    {
      id: 'rate-v2',
      effectiveFrom: '2026-11-15',
      effectiveTo: null,
      hourlyRate: 100,
      currency: 'USD',
      label: 'Senior Architecture Uplift ($100/hr)',
    },
  ],
}

/**
 * D-001: Summary of Stakeholder Discovery Findings (12 Agency Owners/PMs & 14 Senior Developers)
 */
export const STAKEHOLDER_INTERVIEW_FINDINGS = [
  {
    segment: 'Agency Owners & Project Managers (n = 12)',
    topPainPoint:
      'Clients question 3–5 hour invoice blocks that have only a 1-line commit message, forcing PMs to chase developers on Slack before billing.',
    unanimousRejection:
      '11 of 12 refused screenshot/keystroke trackers because senior engineers threaten to quit when spyware is mandated.',
    mustHaveRequirement:
      'Side-by-side view of Claimed Hours, Task Acceptance Criteria, Debug/Test/PR artifacts, and a 1-click "Ask Clarification" workflow.',
  },
  {
    segment: 'Senior Engineers & Freelancers (n = 14)',
    topPainPoint:
      'Legacy timers deduct time during whiteboarding, reading RFCs, debugging race conditions, or waiting on CI/test suites.',
    unanimousRejection:
      '14 of 14 rejected "activity percentage scores" that reward mouse jiggling over actual problem solving.',
    mustHaveRequirement:
      'Explicit "Deep Thinking / Architecture" mode, local privacy denylist, and full visibility into every JSON event before it leaves the laptop.',
  },
] as const

/**
 * D-005: Labeled Ground-Truth Pilot Protocol Scenarios (Section 9 Edge Cases)
 */
export const PILOT_SCENARIO_FIXTURES: PilotScenarioFixture[] = [
  {
    id: 'scenario-deep-thinking',
    code: 'PILOT-01',
    title: '90-Min Silent Architectural Thinking (Zero Keyboard Input)',
    category: 'Phase 1 Acceptance #1 & Section 9',
    taskCode: 'DEV-104',
    taskTitle: 'Design Multi-Tenant RLS & GiST Non-Overlap Exclusion Strategy',
    taskEstimateMinutes: 180,
    description:
      'Developer declares "Thinking / Architecture" mode for 90 minutes while whiteboarding PostgreSQL GiST exclusion constraints on paper, followed by 60 minutes of SQL migration coding.',
    expectedSafeBehavior:
      'Records 90m of declared thinking + architecture note as Context Added (Supported = 150m, Observed = 60m). Zero automatic idle deduction.',
    prohibitedSurveillanceBehavior:
      'Marking the 90-minute no-keyboard block as "0% productive idle time" or auto-deducting pay.',
    slices: [
      {
        id: 's1-think',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16" (Primary)',
        workDate: '2026-11-10',
        startMinuteOfDay: 540, // 09:00
        endMinuteOfDay: 630, // 10:30 (90m)
        workMode: 'thinking',
        provenance: 'desktop_timer',
        appCategory: 'unobserved',
        hasInputSignal: false,
        developerNote:
          'Whiteboarded btree_gist exclusion constraint on (tenant_id, user_id, segment_range) and evaluated composite FK trade-offs.',
        artifacts: [
          {
            id: 'art-adr-note',
            sourceType: 'design_doc',
            externalId: 'ADR-003-GiST-Constraints.md',
            occurredAtUtc: '2026-11-10T10:28:00Z',
            summaryTitle: 'ADR-003: Non-Overlapping Time Ledger GiST Schema',
            linkType: 'contemporaneous',
            linkConfidence: 0.96,
            linkRationale: 'Authored architecture decision note at end of thinking block.',
          },
        ],
      },
      {
        id: 's1-code',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16" (Primary)',
        workDate: '2026-11-10',
        startMinuteOfDay: 630, // 10:30
        endMinuteOfDay: 690, // 11:30 (60m)
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote: 'Implemented 0003_time_ledger_and_sessions.sql migration and pgTAP tests.',
        artifacts: [
          {
            id: 'art-commit-104',
            sourceType: 'github_commit',
            externalId: 'commit:8f31a9c',
            occurredAtUtc: '2026-11-10T11:25:00Z',
            summaryTitle: 'feat(db): add time_segments gist exclusion constraint [DEV-104]',
            linkType: 'contemporaneous',
            linkConfidence: 0.99,
            linkRationale: 'Branch feature/DEV-104 and commit message reference DEV-104.',
          },
        ],
      },
    ],
  },
  {
    id: 'scenario-zero-commit-debugging',
    code: 'PILOT-02',
    title: '4-Hour Deep Debugging Session With Zero Git Commits',
    category: 'Phase 2 Acceptance #1 & Rule R-03',
    taskCode: 'DEV-209',
    taskTitle: 'Investigate Intermittent Deadlock in Webhook Queue Consumer',
    taskEstimateMinutes: 240,
    description:
      'Developer spends 4 hours reproducing a concurrency deadlock using the VS Code debugger and local pgTAP test runner. Root cause is isolated and documented, with the fix committed the next morning.',
    expectedSafeBehavior:
      'Rule R-03 links VS Code debug lifecycle + local test runs + investigation note to mark all 240m as Corroborated despite 0 commits on that day.',
    prohibitedSurveillanceBehavior:
      'Flagging a 4-hour engineering session as "unproductive" because 0 lines of code were committed to GitHub.',
    slices: [
      {
        id: 's2-debug-1',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16" (Primary)',
        workDate: '2026-11-11',
        startMinuteOfDay: 600, // 10:00
        endMinuteOfDay: 720, // 12:00 (120m)
        workMode: 'debugging',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote:
          'Attached VS Code debugger to local Deno Edge Worker; stepped through pgmq visibility timeout race condition.',
        artifacts: [
          {
            id: 'art-vscode-dbg-1',
            sourceType: 'vscode_debug',
            externalId: 'dbg-session-9921',
            occurredAtUtc: '2026-11-11T10:15:00Z',
            summaryTitle: 'VS Code Debug Session: queue-worker.ts (14 breakpoint hits)',
            linkType: 'contemporaneous',
            linkConfidence: 0.95,
            linkRationale: 'Active workspace branch bugfix/DEV-209-queue-deadlock.',
          },
        ],
      },
      {
        id: 's2-debug-2',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16" (Primary)',
        workDate: '2026-11-11',
        startMinuteOfDay: 720, // 12:00
        endMinuteOfDay: 840, // 14:00 (120m)
        workMode: 'debugging',
        provenance: 'desktop_timer',
        appCategory: 'terminal',
        hasInputSignal: true,
        developerNote:
          'Isolated advisory lock ordering bug in batch consumer; documented reproduction steps in DEV-209 ticket.',
        artifacts: [
          {
            id: 'art-vscode-test-1',
            sourceType: 'vscode_test',
            externalId: 'test-run-4410',
            occurredAtUtc: '2026-11-11T13:42:00Z',
            summaryTitle: 'Vitest Concurrency Suite: 18 passed, 1 reproduced deadlock',
            linkType: 'contemporaneous',
            linkConfidence: 0.94,
            linkRationale: 'Executed in workspace mapped to DEV-209.',
          },
          {
            id: 'art-retro-pr',
            sourceType: 'github_pr',
            externalId: 'PR #142 (Next Day)',
            occurredAtUtc: '2026-11-12T09:30:00Z',
            summaryTitle: 'fix(queue): enforce deterministic lock order in batch consumer [DEV-209]',
            linkType: 'retrospective_outcome',
            linkConfidence: 0.92,
            linkRationale: 'R-05 Retrospective outcome linked from next-day PR #142.',
          },
        ],
      },
    ],
  },
  {
    id: 'scenario-dual-device-overlap',
    code: 'PILOT-03',
    title: 'Dual-Laptop Overlapping Timers (Zero Double Counting)',
    category: 'Phase 1 Acceptance #3 & Rule R-02',
    taskCode: 'DEV-312',
    taskTitle: 'Verify Cross-Platform Tauri Tray Indicator on macOS & Windows',
    taskEstimateMinutes: 120,
    description:
      'Developer runs timer on MacBook Pro from 10:00 to 11:00 (60m) and simultaneously runs timer on Windows Test Laptop from 10:30 to 11:30 (60m). Raw sum is 120m, but real-world elapsed time is 90m (10:00–11:30).',
    expectedSafeBehavior:
      'Canonical slicer partitions 10:00–10:30 (30m), 10:30–11:00 (30m deduplicated overlap), and 11:00–11:30 (30m) = 90m total billable claim. Never 120m.',
    prohibitedSurveillanceBehavior:
      'Either double-billing the client for 120 minutes OR accusing the developer of time-theft fraud for testing on two machines.',
    slices: [
      {
        id: 's3-mac',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16"',
        workDate: '2026-11-12',
        startMinuteOfDay: 600, // 10:00
        endMinuteOfDay: 660, // 11:00 (60m)
        workMode: 'testing',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote: 'Built and signed macOS Tauri tray binary.',
        artifacts: [],
      },
      {
        id: 's3-win',
        deviceId: 'dev-win11-surface',
        deviceName: 'Windows 11 Test Rig',
        workDate: '2026-11-12',
        startMinuteOfDay: 630, // 10:30 (Overlaps 10:30-11:00!)
        endMinuteOfDay: 690, // 11:30 (60m)
        workMode: 'testing',
        provenance: 'desktop_timer',
        appCategory: 'terminal',
        hasInputSignal: true,
        developerNote: 'Verified Windows 11 system tray DPI scaling and SQLite queue lock.',
        artifacts: [],
      },
    ],
  },
  {
    id: 'scenario-unexplained-gap-clarification',
    code: 'PILOT-04',
    title: 'Unexplained 25m Gap Triggers Clarification (Not Auto-Rejection)',
    category: 'Phase 1 Acceptance #4 & Rule R-01',
    taskCode: 'DEV-401',
    taskTitle: 'Implement Stripe Subscription Webhook Signature Verification',
    taskEstimateMinutes: 120,
    description:
      'Developer tracks 40m of active coding, has a 25m unobserved gap without switching to Deep-Work mode or adding a note, and then codes for another 35m.',
    expectedSafeBehavior:
      'Rule R-01 marks the 25m segment as "Needs Clarification" so the developer can explain whether it was an impromptu client call, reading docs, or an unpaid break.',
    prohibitedSurveillanceBehavior:
      'Silently deleting the 25 minutes or labeling the developer as "Absent / Fraudulent".',
    slices: [
      {
        id: 's4-code-1',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16"',
        workDate: '2026-11-13',
        startMinuteOfDay: 540, // 09:00
        endMinuteOfDay: 580, // 09:40 (40m)
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote: 'Scaffolded Deno HMAC-SHA256 verification handler.',
        artifacts: [],
      },
      {
        id: 's4-gap',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16"',
        workDate: '2026-11-13',
        startMinuteOfDay: 580, // 09:40
        endMinuteOfDay: 605, // 10:05 (25m unobserved gap, no note yet)
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'unobserved',
        hasInputSignal: false,
        artifacts: [],
      },
      {
        id: 's4-code-2',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16"',
        workDate: '2026-11-13',
        startMinuteOfDay: 605, // 10:05
        endMinuteOfDay: 640, // 10:40 (35m)
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote: 'Added replay-protection test cases for webhook delivery IDs.',
        artifacts: [],
      },
    ],
  },
  {
    id: 'scenario-historical-rate-transition',
    code: 'PILOT-05',
    title: 'Multi-Day Timesheet Across Contract Rate Change ($85/hr -> $100/hr)',
    category: 'Phase 1 Acceptance #6 & Effective-Dated Rates',
    taskCode: 'DEV-502',
    taskTitle: 'Optimize Supabase RLS Policies with Cached Subquery Predicates',
    taskEstimateMinutes: 180,
    description:
      'Developer logs 60m on Nov 14 (under $85/hr rate card) and 60m on Nov 15 (when new $100/hr rate card takes effect). Timesheet is reviewed and locked on Nov 17.',
    expectedSafeBehavior:
      'Nov 14 segment locks at $85.00/hr and Nov 15 segment locks at $100.00/hr ($185.00 total). Never retroactively overwrites Nov 14 with the newer rate.',
    prohibitedSurveillanceBehavior:
      'Applying a single mutable `user.hourly_rate` column that corrupts historical financial ledgers.',
    slices: [
      {
        id: 's5-day1',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16"',
        workDate: '2026-11-14',
        startMinuteOfDay: 600,
        endMinuteOfDay: 660, // 60m @ $85/hr
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote: 'Indexed tenant_id and project_id foreign keys across 12 tables.',
        artifacts: [],
      },
      {
        id: 's5-day2',
        deviceId: 'dev-macbook-pro-1',
        deviceName: 'MacBook Pro 16"',
        workDate: '2026-11-15',
        startMinuteOfDay: 600,
        endMinuteOfDay: 660, // 60m @ $100/hr
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        developerNote: 'Wrapped auth.uid() in scalar subqueries and verified EXPLAIN ANALYZE plans.',
        artifacts: [],
      },
    ],
  },
]

