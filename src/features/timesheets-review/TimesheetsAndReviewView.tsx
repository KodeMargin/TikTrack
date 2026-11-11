import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'

export function TimesheetsAndReviewView() {
  const {
    activeTenant,
    activeUser,
    projects,
    timesheetLines,
    submitTimesheetPeriod,
    respondToClarification,
    openDisputeOnLine,
    reviewTimesheetLine,
  } = usePhase1Store()

  const [submitProjectId, setSubmitProjectId] = useState<string>(
    projects[0]?.id ?? ''
  )

  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<string, string>>({})
  const [managerReasons, setManagerReasons] = useState<Record<string, string>>({})
  const [managerAdjustMins, setManagerAdjustMins] = useState<Record<string, number>>({})
  const [lockOnApprove, setLockOnApprove] = useState<boolean>(false)
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  const isManagerOrOwner =
    activeUser.role === 'project_manager' || activeUser.role === 'tenant_owner'
  const isFinance = activeUser.role === 'finance'

  const filteredLines = timesheetLines.filter((line) => {
    if (filterStatus === 'all') return true
    return line.evidenceStatus === filterStatus
  })

  // Aggregate the Five Separate Time Concepts across visible lines (F1-041)
  const totals = filteredLines.reduce(
    (acc, l) => {
      acc.elapsed += l.elapsedMinutes
      acc.claimed += l.claimedMinutes
      acc.observed += l.observedMinutes
      acc.supported += l.supportedMinutes
      acc.approved += l.approvedBillableMinutes
      acc.billableAmount += (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate
      return acc
    },
    {
      elapsed: 0,
      claimed: 0,
      observed: 0,
      supported: 0,
      approved: 0,
      billableAmount: 0,
    }
  )

  function handleManagerDecision(
    lineId: string,
    decision: 'approve' | 'ask_clarification' | 'adjust_with_reason' | 'reject'
  ) {
    const defaultReason =
      decision === 'approve'
        ? 'Verified against task acceptance criteria and developer notes.'
        : decision === 'ask_clarification'
          ? 'Please add a brief note explaining the unobserved interval before billing close.'
          : ''
    const reason = (managerReasons[lineId] ?? defaultReason).trim()
    const adjusted = managerAdjustMins[lineId]
    const res = reviewTimesheetLine(
      lineId,
      decision,
      reason,
      adjusted,
      lockOnApprove
    )
    setBanner({ ok: res.ok, text: res.message })
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            banner.ok
              ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200'
              : 'border-rose-700 bg-rose-950/60 text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Role-Specific Boundary Notice (Section 1.4 & 12.4) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Milestone 1.4 • Timesheets, Five Time Concepts & Fair Review (F1-040 – F1-048)
          </span>
          <h2 className="text-base font-bold text-white mt-0.5">
            {isManagerOrOwner
              ? 'Project Manager Timesheet Review Inbox'
              : isFinance
                ? 'Finance Approved Hours Ledger (Raw Workstation Evidence Redacted by RLS)'
                : `Developer Daily & Weekly Timesheet (${activeUser.name})`}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isManagerOrOwner && (
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={lockOnApprove}
                onChange={(e) => setLockOnApprove(e.target.checked)}
              />
              Lock Approved Lines (F1-047)
            </label>
          )}

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
          >
            <option value="all">All Statuses ({timesheetLines.length})</option>
            <option value="approved">Approved</option>
            <option value="needs_clarification">Needs Clarification</option>
            <option value="context_added">Context Added</option>
            <option value="observed">Observed</option>
            <option value="disputed">Disputed</option>
          </select>
        </div>
      </div>

      {/* Five Separate Time Concepts Banner (F1-041) */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5">
          <div className="text-[11px] text-slate-400">1. Elapsed Time</div>
          <div className="text-xl font-bold font-mono text-slate-200 mt-1">
            {totals.elapsed}m
          </div>
          <div className="text-[10px] text-slate-500">Wall / Monotonic</div>
        </div>
        <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-3.5">
          <div className="text-[11px] text-blue-300">2. Claimed Time</div>
          <div className="text-xl font-bold font-mono text-blue-200 mt-1">
            {totals.claimed}m
          </div>
          <div className="text-[10px] text-blue-400/80">Submitted by Dev</div>
        </div>
        <div className="rounded-xl border border-sky-900/60 bg-sky-950/20 p-3.5">
          <div className="text-[11px] text-sky-300">3. Observed Time</div>
          <div className="text-xl font-bold font-mono text-sky-200 mt-1">
            {isFinance ? 'Redacted (RLS)' : `${totals.observed}m`}
          </div>
          <div className="text-[10px] text-sky-400/80">Tool metadata signal</div>
        </div>
        <div className="rounded-xl border border-teal-900/60 bg-teal-950/20 p-3.5">
          <div className="text-[11px] text-teal-300">4. Supported Time</div>
          <div className="text-xl font-bold font-mono text-teal-200 mt-1">
            {totals.supported}m
          </div>
          <div className="text-[10px] text-teal-400/80">
            Observed + Deep-Work/Notes
          </div>
        </div>
        <div className="rounded-xl border border-emerald-800/80 bg-emerald-950/25 p-3.5">
          <div className="text-[11px] text-emerald-300">5. Approved Billable</div>
          <div className="text-xl font-bold font-mono text-emerald-200 mt-1">
            {totals.approved}m
          </div>
          <div className="text-[10px] text-emerald-400/80">
            Rounding: {activeTenant.roundingRule}
          </div>
        </div>
        <div className="rounded-xl border border-indigo-800/80 bg-indigo-950/30 p-3.5">
          <div className="text-[11px] text-indigo-300">Rate-Locked Value</div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            ${totals.billableAmount.toFixed(2)}
          </div>
          <div className="text-[10px] text-indigo-300/80">
            {activeTenant.currency} Snapshot
          </div>
        </div>
      </div>

      {/* Timesheet Period Submission & Weekly Cap Progress (F1-040) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 min-w-64 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">
              Weekly Cap Progress (F1-040)
            </span>
            <span className="font-mono text-indigo-300">
              {(totals.claimed / 60).toFixed(2)}h / {(activeTenant.weeklyCapMinutes / 60).toFixed(1)}h cap ({Math.min(100, Math.round((totals.claimed / Math.max(1, activeTenant.weeklyCapMinutes)) * 100))}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all ${
                totals.claimed > activeTenant.weeklyCapMinutes
                  ? 'bg-rose-500'
                  : 'bg-indigo-500'
              }`}
              style={{
                width: `${Math.min(100, Math.round((totals.claimed / Math.max(1, activeTenant.weeklyCapMinutes)) * 100))}%`,
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={submitProjectId || projects[0]?.id || ''}
            onChange={(e) => setSubmitProjectId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isFinance}
            onClick={() => {
              const targetProj = submitProjectId || projects[0]?.id
              if (!targetProj) return
              const res = submitTimesheetPeriod(targetProj)
              setBanner({ ok: res.ok, text: res.message })
            }}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold text-white cursor-pointer"
          >
            Submit Timesheet Period (F1-040)
          </button>
        </div>
      </div>

      {/* Timesheet Lines List */}
      <div className="space-y-4">
        {filteredLines.map((line) => {
          const lineBillableValue =
            (line.approvedBillableMinutes / 60) * line.snapshotHourlyRate

          return (
            <div
              key={line.id}
              className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white bg-slate-800 px-2.5 py-0.5 rounded">
                      {line.workDate} • {line.startTime}–{line.endTime}
                    </span>
                    <span className="font-mono text-xs font-bold text-indigo-300">
                      {line.taskCode}
                    </span>
                    <span className="text-xs font-semibold text-white">
                      {line.taskTitle}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 uppercase font-mono">
                      Mode: {line.workMode}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      Provenance: {line.provenance}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded font-mono uppercase border ${
                        line.timesheetStatus === 'submitted'
                          ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
                          : 'bg-slate-900 text-slate-400 border-slate-700'
                      }`}
                    >
                      Period: {line.timesheetStatus ?? 'draft'}
                    </span>
                    {line.isLocked && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-semibold">
                        🔒 Locked Billing Period (F1-047)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Developer: <strong className="text-slate-200">{line.developerName}</strong> •
                    Snapshot Contract Rate:{' '}
                    <span className="font-mono text-emerald-300">
                      ${line.snapshotHourlyRate}/hr {activeTenant.currency}
                    </span>{' '}
                    ({line.rateLabel})
                  </p>
                </div>

                {/* Status Badge & 5-Time Metrics Pill */}
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      line.evidenceStatus === 'approved'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : line.evidenceStatus === 'needs_clarification'
                          ? 'bg-amber-950 text-amber-300 border-amber-700'
                          : line.evidenceStatus === 'disputed'
                            ? 'bg-rose-950 text-rose-300 border-rose-700'
                            : 'bg-teal-950 text-teal-300 border-teal-700'
                    }`}
                  >
                    {line.evidenceStatus.replace('_', ' ').toUpperCase()}
                  </span>

                  <div className="flex items-center gap-3 font-mono text-xs bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Elapsed</span>
                      <span>{line.elapsedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-blue-400 block">Claimed</span>
                      <span>{line.claimedMinutes}m</span>
                    </div>
                    {!isFinance && (
                      <div>
                        <span className="text-[10px] text-sky-400 block">Observed</span>
                        <span>{line.observedMinutes}m</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] text-teal-400 block">Supported</span>
                      <span>{line.supportedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-400 block">Approved</span>
                      <span className="font-bold text-emerald-300">
                        {line.approvedBillableMinutes}m (${lineBillableValue.toFixed(2)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Developer Context Note & Manual Entry Reason */}
              {!isFinance && (
                <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3 space-y-1 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold">
                      Developer Work Context Note:{' '}
                    </span>
                    <span className="text-slate-200">{line.developerNote}</span>
                  </div>
                  {line.manualReason && (
                    <div className="text-amber-300">
                      <span className="font-semibold">Manual Entry Audit Reason (F1-028): </span>
                      {line.manualReason}
                    </div>
                  )}
                  {line.managerComment && (
                    <div className="text-indigo-300 pt-1">
                      <span className="font-semibold">Reviewer Trail: </span>
                      {line.managerComment}
                    </div>
                  )}
                </div>
              )}

              {/* Dispute / Clarification Conversation Log */}
              {line.disputeMessages.length > 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-1.5 text-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Traceable Review & Clarification History (F1-042 / F1-043)
                  </div>
                  {line.disputeMessages.map((msg, idx) => (
                    <div key={idx} className="text-slate-300">
                      <span className="font-semibold text-white">{msg.author}</span>{' '}
                      <span className="text-[10px] font-mono text-slate-400">
                        ({msg.role} • {msg.timestamp})
                      </span>
                      : {msg.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Developer Clarification Response / Dispute Controls (F1-043) */}
              {activeUser.role === 'developer' && !line.isLocked && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80 text-xs">
                  <input
                    type="text"
                    placeholder="Add explanation note for manager clarification or enter dispute reason..."
                    value={clarificationDrafts[line.id] ?? ''}
                    onChange={(e) =>
                      setClarificationDrafts((prev) => ({
                        ...prev,
                        [line.id]: e.target.value,
                      }))
                    }
                    className="flex-1 min-w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const text = (
                        clarificationDrafts[line.id] ||
                        '25m interval was spent inspecting pgmq visibility timeout logs and reproducing the deadlock locally.'
                      ).trim()
                      respondToClarification(line.id, text)
                      setClarificationDrafts((prev) => ({ ...prev, [line.id]: '' }))
                    }}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer"
                  >
                    Reply with Clarification (F1-043)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const text = (
                        clarificationDrafts[line.id] ||
                        'Disputing reduction: full session was spent on assigned debugging task DEV-209.'
                      ).trim()
                      openDisputeOnLine(line.id, text)
                      setClarificationDrafts((prev) => ({ ...prev, [line.id]: '' }))
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 font-semibold cursor-pointer"
                  >
                    Submit Dispute
                  </button>
                </div>
              )}

              {/* Manager Review Action Bar (F1-042) */}
              {isManagerOrOwner && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
                  <input
                    type="text"
                    placeholder="Mandatory review reason (e.g. 'Deliverable verified in PR #142' or 'Clarify 25m gap')..."
                    value={managerReasons[line.id] ?? ''}
                    onChange={(e) =>
                      setManagerReasons((prev) => ({
                        ...prev,
                        [line.id]: e.target.value,
                      }))
                    }
                    className="flex-1 min-w-60 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
                  />
                  <input
                    type="number"
                    min={0}
                    max={480}
                    placeholder={`${line.claimedMinutes}m`}
                    value={managerAdjustMins[line.id] ?? line.claimedMinutes}
                    onChange={(e) =>
                      setManagerAdjustMins((prev) => ({
                        ...prev,
                        [line.id]: Number(e.target.value),
                      }))
                    }
                    className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                    title="Adjusted billable minutes"
                  />
                  <button
                    type="button"
                    onClick={() => handleManagerDecision(line.id, 'approve')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                  >
                    ✓ Approve Claim ({line.claimedMinutes}m)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManagerDecision(line.id, 'ask_clarification')}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                  >
                    ? Ask Clarification
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManagerDecision(line.id, 'adjust_with_reason')}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                  >
                    Adjust Minutes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManagerDecision(line.id, 'reject')}
                    className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 font-semibold cursor-pointer"
                  >
                    Reject / Dispute
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

