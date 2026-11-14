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
    approveUncontestedTimesheetLines,
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
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${banner.ok
              ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200'
              : 'border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200'
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

      {/* Page Header */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            {isManagerOrOwner
              ? 'Team Timesheet Review'
              : isFinance
                ? 'Approved Billing Hours'
                : `${activeUser.name}’s Timesheet`}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isManagerOrOwner && (
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={lockOnApprove}
                onChange={(e) => setLockOnApprove(e.target.checked)}
              />
              Lock on approval
            </label>
          )}

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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

      {/* Five Separate Time Concepts Banner */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Elapsed</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.elapsed}m
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Claimed</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.claimed}m
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Observed</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {isFinance ? 'Restricted' : `${totals.observed}m`}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Supported</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.supported}m
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-[#141418] p-3.5 shadow-xs">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Approved</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100 mt-1">
            {totals.approved}m
          </div>
        </div>
        <div className="rounded-xl border border-[#6d25da]/30 bg-[#6d25da]/5 dark:border-[#6d25da]/40 dark:bg-[#6d25da]/10 p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-[#6d25da] dark:text-[#a87ce9]">Billable Value</div>
          <div className="text-xl font-bold font-mono text-zinc-900 dark:text-white mt-1">
            ${totals.billableAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Timesheet Period Submission & Weekly Cap Progress */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 min-w-64 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              Weekly Cap
            </span>
            <span className="font-mono text-[#6d25da] dark:text-[#c5a8f0]">
              {(totals.claimed / 60).toFixed(2)}h / {(activeTenant.weeklyCapMinutes / 60).toFixed(1)}h cap ({Math.min(100, Math.round((totals.claimed / Math.max(1, activeTenant.weeklyCapMinutes)) * 100))}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div
              className={`h-full transition-all ${totals.claimed > activeTenant.weeklyCapMinutes
                  ? 'bg-rose-500'
                  : 'bg-[#702fe3]'
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
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} - {p.name}
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
            className="px-3.5 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] disabled:opacity-40 font-semibold text-white cursor-pointer"
          >
            Submit Timesheet
          </button>

          {isManagerOrOwner && (
            <button
              type="button"
              onClick={() => {
                const targetProj = submitProjectId || projects[0]?.id
                const res = approveUncontestedTimesheetLines(targetProj)
                setBanner({ ok: res.ok, text: res.message })
              }}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-white cursor-pointer"
              title="Approve uncontested lines and hold disputed ones"
            >
              Approve Uncontested
            </button>
          )}
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
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded">
                      {line.workDate} • {line.startTime}–{line.endTime}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                      {line.taskCode}
                    </span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                      {line.taskTitle}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border border-[#c5a8f0] dark:border-[#6d25da]/50 uppercase font-mono">
                      Mode: {line.workMode}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
                      Provenance: {line.provenance}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded font-mono uppercase border ${line.timesheetStatus === 'submitted'
                          ? 'bg-[#f0e9fb] dark:bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0] border-[#c5a8f0] dark:border-[#6d25da]/50'
                          : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                        }`}
                    >
                      Period: {line.timesheetStatus ?? 'draft'}
                    </span>
                    {line.isLocked && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 font-semibold">
                        🔒 Locked
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    <strong className="text-zinc-800 dark:text-zinc-200">{line.developerName}</strong> •{' '}
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      ${line.snapshotHourlyRate}/hr {activeTenant.currency}
                    </span>{' '}
                    ({line.rateLabel})
                  </div>
                </div>

                {/* Status Badge & 5-Time Metrics Pill */}
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${line.evidenceStatus === 'approved'
                        ? 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800'
                        : line.evidenceStatus === 'needs_clarification'
                          ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700'
                          : line.evidenceStatus === 'disputed'
                            ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700'
                            : 'bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800'
                      }`}
                  >
                    {line.evidenceStatus.replace('_', ' ').toUpperCase()}
                  </span>

                  <div className="flex items-center gap-3 font-mono text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 rounded-lg">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Elapsed</span>
                      <span>{line.elapsedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6d25da] dark:text-[#a87ce9] block">Claimed</span>
                      <span>{line.claimedMinutes}m</span>
                    </div>
                    {!isFinance && (
                      <div>
                        <span className="text-[10px] text-[#6d25da] dark:text-[#a87ce9] block">Observed</span>
                        <span>{line.observedMinutes}m</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] text-[#6d25da] dark:text-[#a87ce9] block">Supported</span>
                      <span>{line.supportedMinutes}m</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6d25da] dark:text-[#a87ce9] block">Approved</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {line.approvedBillableMinutes}m (${lineBillableValue.toFixed(2)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Developer Context Note & Manual Entry Reason */}
              {!isFinance && (
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 p-3 space-y-1 text-xs">
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400 font-semibold">
                      Note:{' '}
                    </span>
                    <span className="text-zinc-800 dark:text-zinc-200">{line.developerNote}</span>
                  </div>
                  {line.manualReason && (
                    <div className="text-amber-700 dark:text-amber-300">
                      <span className="font-semibold">Manual Reason: </span>
                      {line.manualReason}
                    </div>
                  )}
                  {line.managerComment && (
                    <div className="text-[#6d25da] dark:text-[#c5a8f0] pt-1">
                      <span className="font-semibold">Reviewer: </span>
                      {line.managerComment}
                    </div>
                  )}
                </div>
              )}

              {/* Dispute / Clarification Conversation Log */}
              {line.disputeMessages.length > 0 && (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-3 space-y-1.5 text-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Review History
                  </div>
                  {line.disputeMessages.map((msg, idx) => (
                    <div key={idx} className="text-zinc-700 dark:text-zinc-300">
                      <span className="font-semibold text-zinc-900 dark:text-white">{msg.author}</span>{' '}
                      <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                        ({msg.role} • {msg.timestamp})
                      </span>
                      : {msg.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Developer Clarification Response / Dispute Controls (F1-043) */}
              {activeUser.role === 'developer' && !line.isLocked && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800/80 text-xs">
                  <input
                    type="text"
                    placeholder="Add clarification or dispute reason..."
                    value={clarificationDrafts[line.id] ?? ''}
                    onChange={(e) =>
                      setClarificationDrafts((prev) => ({
                        ...prev,
                        [line.id]: e.target.value,
                      }))
                    }
                    className="flex-1 min-w-64 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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
                    Send Clarification
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
                    className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 font-semibold cursor-pointer"
                  >
                    Dispute
                  </button>
                </div>
              )}

              {/* Manager Review Action Bar */}
              {isManagerOrOwner && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/80 text-xs">
                  <input
                    type="text"
                    placeholder="Review reason..."
                    value={managerReasons[line.id] ?? ''}
                    onChange={(e) =>
                      setManagerReasons((prev) => ({
                        ...prev,
                        [line.id]: e.target.value,
                      }))
                    }
                    className="flex-1 min-w-60 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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
                    className="w-20 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                    title="Adjusted billable minutes"
                  />
                  <button
                    type="button"
                    onClick={() => handleManagerDecision(line.id, 'approve')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                  >
                    ✓ Approve ({line.claimedMinutes}m)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManagerDecision(line.id, 'ask_clarification')}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                  >
                    Ask Clarification
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManagerDecision(line.id, 'adjust_with_reason')}
                    className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold cursor-pointer"
                  >
                    Adjust Minutes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManagerDecision(line.id, 'reject')}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800 font-semibold cursor-pointer"
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

