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
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Phase 0 Release Gate & Acceptance Criteria Matrix (Section 3.2)
            </h3>
            <p className="text-xs text-slate-400">
              All P0/P1 discovery, privacy governance, and ground-truth simulation gates are codified.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            6 / 6 Criteria Satisfied
          </span>
        </div>

        <div className="divide-y divide-slate-800 text-xs">
          {PHASE_0_ACCEPTANCE_MATRIX.map((row) => (
            <div
              key={row.id}
              className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-indigo-300">{row.id}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                    {row.priority}
                  </span>
                  <span className="font-semibold text-white">{row.title}</span>
                </div>
                <p className="text-slate-400">{row.artifact}</p>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-medium">
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
            className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              D-001 Discovery Cohort
            </div>
            <h4 className="text-sm font-bold text-white">{finding.segment}</h4>
            <div className="space-y-2 text-xs">
              <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3">
                <span className="text-slate-400 font-semibold block mb-0.5">
                  Primary Operational Pain Point:
                </span>
                <span className="text-slate-200">{finding.topPainPoint}</span>
              </div>
              <div className="rounded-lg bg-rose-950/25 border border-rose-900/60 p-3">
                <span className="text-rose-300 font-semibold block mb-0.5">
                  What They Unanimously Rejected:
                </span>
                <span className="text-slate-200">{finding.unanimousRejection}</span>
              </div>
              <div className="rounded-lg bg-emerald-950/25 border border-emerald-900/60 p-3">
                <span className="text-emerald-300 font-semibold block mb-0.5">
                  Must-Have Product Capability:
                </span>
                <span className="text-slate-200">{finding.mustHaveRequirement}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

