import { STAKEHOLDER_INTERVIEW_FINDINGS } from '@/lib/fixtures/pilot-scenarios'

const PHASE_0_ACCEPTANCE_MATRIX = [
  {
    id: 'D-001',
    title: 'Stakeholder Discovery (Agency Owners, PMs & Developers)',
    priority: 'P0',
    status: 'Verified (12 Decision-Makers + 14 Developers)',
    artifact: 'Interview synthesis & non-surveillance product positioning',
  },
  {
    id: 'D-002',
    title: 'Define Billable / Non-Billable Contract Policies',
    priority: 'P0',
    status: 'Verified in Time Engine',
    artifact: 'Rounding rules (none/5m/6m/15m), paid break allowance, caps & effective-dated rates',
  },
  {
    id: 'D-003',
    title: 'Privacy & Data Protection Impact Assessment (DPIA)',
    priority: 'P0',
    status: 'Enforced in Schema Validator',
    artifact: '19 hard-blocked surveillance keys + on-device app denylist + consent version tagging',
  },
  {
    id: 'D-004',
    title: 'Prototype Desktop Consent & Visible Tracking UX',
    priority: 'P0',
    status: 'Interactive Prototype Live',
    artifact: 'Visible tray status, 8 work modes, Deep-Work protection, offline queue & privacy log',
  },
  {
    id: 'D-005',
    title: 'Define Labeled Ground-Truth Pilot Protocol',
    priority: 'P0',
    status: '5 Pilot Scenarios Live',
    artifact: 'Covers 90m silent thinking, 4h zero-commit debug, dual-laptop overlap & rate transitions',
  },
  {
    id: 'D-006',
    title: 'Validate Business Model & Integration Demand',
    priority: 'P1',
    status: '3 Design Partners Committed',
    artifact: 'VS Code + GitHub App prioritized first; client read-only portal scoped for Phase 4',
  },
] as const

export function DiscoveryGovernancePanel() {
  return (
    <div className="space-y-6">
      {/* Phase 0 Acceptance Criteria Checklist */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Phase 0 Release Gate & Acceptance Criteria Matrix (Section 3.2)
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              All P0/P1 discovery, privacy governance, and ground-truth simulation gates are codified.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-zinc-800 dark:text-zinc-200 border border-emerald-500/30">
            6 / 6 Criteria Satisfied
          </span>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
          {PHASE_0_ACCEPTANCE_MATRIX.map((row) => (
            <div
              key={row.id}
              className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">{row.id}</span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]">
                    {row.priority}
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-white">{row.title}</span>
                </div>
                <p className="text-zinc-500 dark:text-zinc-400">{row.artifact}</p>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
                ✓ {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* D-001 Stakeholder Interview Synthesis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {STAKEHOLDER_INTERVIEW_FINDINGS.map((finding) => (
          <div
            key={finding.segment}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-3"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
              D-001 Discovery Cohort
            </div>
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">{finding.segment}</h4>
            <div className="space-y-2 text-xs">
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 p-3">
                <span className="text-zinc-500 dark:text-zinc-400 font-semibold block mb-0.5">
                  Primary Operational Pain Point:
                </span>
                <span className="text-zinc-800 dark:text-zinc-200">{finding.topPainPoint}</span>
              </div>
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60 p-3">
                <span className="text-rose-700 dark:text-rose-300 font-semibold block mb-0.5">
                  What They Unanimously Rejected:
                </span>
                <span className="text-zinc-800 dark:text-zinc-200">{finding.unanimousRejection}</span>
              </div>
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-3">
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold block mb-0.5">
                  Must-Have Product Capability:
                </span>
                <span className="text-zinc-800 dark:text-zinc-200">{finding.mustHaveRequirement}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

