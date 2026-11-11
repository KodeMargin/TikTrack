import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store } from '@/context/Phase2Store'
import { usePhase3Store } from '@/context/Phase3Store'
import { buildContractualAuditBundle } from '@/lib/phase3/auditExport'

export function DisputesAndAppealsView() {
  const { activeTenant, activeUser, members, timesheetLines } = usePhase1Store()
  const { evidenceArtifacts } = usePhase2Store()
  const {
    activeRuleSet,
    correlationEdges,
    aiGenerations,
    disputes,
    openStructuredDispute,
    replyToStructuredDispute,
    escalateStructuredDispute,
    resolveStructuredDispute,
  } = usePhase3Store()

  const [selectedLineId, setSelectedLineId] = useState<string>(
    () => timesheetLines[0]?.id ?? ''
  )
  const [disputedMinutes, setDisputedMinutes] = useState<number>(30)
  const [dueDate, setDueDate] = useState<string>('2026-11-18')
  const [requestedEvidenceType, setRequestedEvidenceType] = useState<string>(
    'Investigation note or PR/debug artifact'
  )
  const [openReason, setOpenReason] = useState<string>('')
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([])

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyArtifacts, setReplyArtifacts] = useState<Record<string, string>>({})
  const [escalateReviewerByDispute, setEscalateReviewerByDispute] = useState<
    Record<string, string>
  >({})
  const [escalateReasonByDispute, setEscalateReasonByDispute] = useState<
    Record<string, string>
  >({})
  const [resolveMinsByDispute, setResolveMinsByDispute] = useState<
    Record<string, number>
  >({})
  const [resolveNoteByDispute, setResolveNoteByDispute] = useState<
    Record<string, string>
  >({})
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  const isClientReviewer = activeUser.role === 'client_reviewer'
  if (isClientReviewer) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-amber-300 font-bold">
          Role Boundary Enforced (Section 12.4)
        </div>
        <h2 className="text-lg font-bold text-white">
          Internal Dispute & Clarification Threads Restricted
        </h2>
        <p className="text-xs text-slate-300 max-w-2xl">
          External Client Reviewers only see finalized approved deliverables and hours—never
          internal developer/manager dispute appeals.
        </p>
      </div>
    )
  }

  const isManagerOrAuditor =
    activeUser.role === 'project_manager' ||
    activeUser.role === 'tenant_owner' ||
    activeUser.role === 'auditor'

  function handleOpenDispute(e: React.FormEvent) {
    e.preventDefault()
    const targetLineId = selectedLineId || timesheetLines[0]?.id
    if (!targetLineId) {
      setBanner({ ok: false, text: 'No timesheet lines available to open a dispute on.' })
      return
    }

    const res = openStructuredDispute({
      timesheetLineId: targetLineId,
      disputedMinutes,
      reason: openReason,
      dueDate,
      requestedEvidenceType,
      messageType: isManagerOrAuditor ? 'clarification_request' : 'developer_appeal',
      attachedArtifactIds: selectedArtifactIds,
    })

    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) {
      setOpenReason('')
      setSelectedArtifactIds([])
    }
  }

  function handleDownloadAuditBundle(format: 'json' | 'markdown', disputeId?: string) {
    const dispute = disputes.find((d) => d.id === disputeId)
    const bundle = buildContractualAuditBundle({
      tenantName: activeTenant.name,
      policyVersion: activeTenant.policyVersion,
      ruleSet: activeRuleSet,
      dispute,
      timesheetLines,
      artifacts: evidenceArtifacts,
      correlationEdges,
      aiGenerations,
    })

    const content =
      format === 'json'
        ? JSON.stringify(bundle.jsonBundle, null, 2)
        : bundle.markdown
    const mime =
      format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8'
    const ext = format === 'json' ? 'json' : 'md'
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeTenant.slug || 'devproof'}-audit-bundle.${ext}`
    link.click()
    URL.revokeObjectURL(url)
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

      {/* Header + Contractual Audit Export (F3-035) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-rose-400 font-semibold">
            Phase 3 Milestone 3.3 • Fair Dispute, Independent Review & Appeals
          </div>
          <h2 className="text-lg font-bold text-white mt-0.5">
            Structured Disputes, Escalations & Contractual Audit Exports
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Uncontested hours bill via Partial Approval while disputed entries follow a transparent,
            immutable appeal and independent second-review workflow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleDownloadAuditBundle('json')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold cursor-pointer"
          >
            Export Audit Bundle (.json) (F3-035)
          </button>
          <button
            type="button"
            onClick={() => handleDownloadAuditBundle('markdown')}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
          >
            Export Audit Report (.md)
          </button>
        </div>
      </div>

      {/* Open Clarification Request / Appeal Form (F3-030, F3-031) */}
      <form
        onSubmit={handleOpenDispute}
        className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4 text-xs"
      >
        <div className="font-semibold uppercase tracking-wider text-indigo-400">
          {isManagerOrAuditor
            ? 'F3-030 • Open Reviewer Clarification Request'
            : 'F3-031 • Submit Developer Appeal / Dispute'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="md:col-span-2 space-y-1">
            <span className="text-slate-400 block">Target Timesheet Line</span>
            <select
              value={selectedLineId || timesheetLines[0]?.id || ''}
              onChange={(e) => setSelectedLineId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
            >
              {timesheetLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.workDate} • {l.taskCode} ({l.claimedMinutes}m claimed / {l.evidenceStatus}
                  {l.isLocked ? ' · LOCKED' : ''})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-slate-400 block">Disputed Minutes</span>
            <input
              type="number"
              min={5}
              max={480}
              value={disputedMinutes}
              onChange={(e) => setDisputedMinutes(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="text-slate-400 block">Response Due Date (F3-030)</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white font-mono"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-slate-400 block">Requested Evidence / Context Type</span>
            <input
              type="text"
              value={requestedEvidenceType}
              onChange={(e) => setRequestedEvidenceType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-slate-400 block">Attach Evidence Artifact (Optional)</span>
            <select
              value={selectedArtifactIds[0] ?? ''}
              onChange={(e) =>
                setSelectedArtifactIds(e.target.value ? [e.target.value] : [])
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
            >
              <option value="">None attached</option>
              {evidenceArtifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.sourceType}: {a.summaryTitle}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            required
            placeholder="Explain clarification question or developer appeal reason (>= 10 characters)..."
            value={openReason}
            onChange={(e) => setOpenReason(e.target.value)}
            className="flex-1 min-w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
          >
            {isManagerOrAuditor ? 'Send Clarification Request' : 'Open Structured Appeal'}
          </button>
        </div>
      </form>

      {/* Active & Resolved Disputes List */}
      <div className="space-y-4">
        {disputes.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
            No structured disputes or clarification threads yet.
          </div>
        ) : (
          disputes.map((d) => {
            const isResolved = d.status.startsWith('resolved_')
            const eligibleSecondReviewers = members.filter(
              (m) =>
                (m.role === 'project_manager' ||
                  m.role === 'tenant_owner' ||
                  m.role === 'auditor') &&
                m.id !== d.assignedReviewerId &&
                m.id !== d.openedByUserId
            )

            return (
              <div
                key={d.id}
                className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-indigo-300">
                        {d.taskCode}
                      </span>
                      <span className="font-semibold text-white">{d.taskTitle}</span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-rose-950 text-rose-300 border border-rose-700">
                        {d.status.replace('_', ' ')}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Disputed: {d.disputedMinutes}m • Policy: {d.policyVersionCode}
                      </span>
                      {d.dueDate && (
                        <span className="font-mono text-[11px] text-amber-300">
                          Due: {d.dueDate}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300">{d.reason}</p>
                    {d.escalatedReviewerName && (
                      <div className="text-amber-300 font-medium">
                        Independent Second Reviewer (F3-033): {d.escalatedReviewerName}
                      </div>
                    )}
                    {d.creditInvoiceId && (
                      <div className="text-emerald-300 font-medium">
                        Post-Lock Adjustment Invoice Generated (F1-047 / F3-032)
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadAuditBundle('json', d.id)}
                    className="px-2.5 py-1 rounded border border-slate-700 bg-slate-950 text-slate-300 hover:text-white cursor-pointer"
                  >
                    Export Dispute Audit (.json)
                  </button>
                </div>

                {/* Immutable Thread Messages (F3-032) */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Immutable Decision & Message History (F3-032)
                  </div>
                  {d.messages.map((m) => (
                    <div key={m.id} className="text-slate-300 space-y-0.5">
                      <div>
                        <span className="font-semibold text-white">{m.authorName}</span>{' '}
                        <span className="text-[10px] font-mono text-indigo-300">
                          [{m.messageType}]
                        </span>{' '}
                        <span className="text-[10px] text-slate-500">{m.createdAt}</span>
                      </div>
                      <div className="pl-2 border-l-2 border-slate-700">{m.messageMarkdown}</div>
                      {m.attachedArtifactIds.length > 0 && (
                        <div className="pl-2 text-[11px] font-mono text-teal-300">
                          Attached artifacts: {m.attachedArtifactIds.length}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {!isResolved && (
                  <div className="space-y-3 pt-2 border-t border-slate-800">
                    {/* Reply with artifact */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Reply with context, explanation, or disagreement reason..."
                        value={replyDrafts[d.id] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        className="flex-1 min-w-60 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
                      />
                      <select
                        value={replyArtifacts[d.id] ?? ''}
                        onChange={(e) =>
                          setReplyArtifacts((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white max-w-52"
                      >
                        <option value="">No artifact</option>
                        {evidenceArtifacts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.sourceType}: {a.summaryTitle}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const res = replyToStructuredDispute({
                            disputeId: d.id,
                            messageMarkdown: replyDrafts[d.id] ?? '',
                            attachedArtifactIds: replyArtifacts[d.id]
                              ? [replyArtifacts[d.id]]
                              : [],
                          })
                          setBanner({ ok: res.ok, text: res.message })
                          if (res.ok) {
                            setReplyDrafts((prev) => ({ ...prev, [d.id]: '' }))
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer"
                      >
                        Post Reply
                      </button>
                    </div>

                    {/* Independent Second Review Escalation (F3-033) */}
                    {d.status !== 'escalated' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={
                            escalateReviewerByDispute[d.id] ??
                            eligibleSecondReviewers[0]?.id ??
                            ''
                          }
                          onChange={(e) =>
                            setEscalateReviewerByDispute((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                        >
                          {eligibleSecondReviewers.length === 0 ? (
                            <option value="">No distinct second reviewer in workspace</option>
                          ) : (
                            eligibleSecondReviewers.map((m) => (
                              <option key={m.id} value={m.id}>
                                Escalate to: {m.name} ({m.role})
                              </option>
                            ))
                          )}
                        </select>
                        <input
                          type="text"
                          placeholder="Escalation reason for independent second review (F3-033)..."
                          value={escalateReasonByDispute[d.id] ?? ''}
                          onChange={(e) =>
                            setEscalateReasonByDispute((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const revId =
                              escalateReviewerByDispute[d.id] ??
                              eligibleSecondReviewers[0]?.id ??
                              ''
                            const res = escalateStructuredDispute({
                              disputeId: d.id,
                              escalatedReviewerId: revId,
                              reason: escalateReasonByDispute[d.id] ?? '',
                            })
                            setBanner({ ok: res.ok, text: res.message })
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                        >
                          Escalate to 2nd Reviewer (F3-033)
                        </button>
                      </div>
                    )}

                    {/* Resolution Actions for Manager / Auditor */}
                    {isManagerOrAuditor && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={480}
                          value={resolveMinsByDispute[d.id] ?? d.disputedMinutes}
                          onChange={(e) =>
                            setResolveMinsByDispute((prev) => ({
                              ...prev,
                              [d.id]: Number(e.target.value),
                            }))
                          }
                          className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                          title="Final approved minutes"
                        />
                        <input
                          type="text"
                          placeholder="Final resolution rationale (immutable audit entry)..."
                          value={resolveNoteByDispute[d.id] ?? ''}
                          onChange={(e) =>
                            setResolveNoteByDispute((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const res = resolveStructuredDispute({
                              disputeId: d.id,
                              resolutionStatus: 'resolved_accepted',
                              adjustedApprovedMinutes:
                                resolveMinsByDispute[d.id] ?? d.disputedMinutes,
                              resolutionSummary:
                                resolveNoteByDispute[d.id] ||
                                'Accepted developer explanation and supporting artifacts.',
                            })
                            setBanner({ ok: res.ok, text: res.message })
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                        >
                          Accept Claim
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const res = resolveStructuredDispute({
                              disputeId: d.id,
                              resolutionStatus: 'resolved_adjusted',
                              adjustedApprovedMinutes:
                                resolveMinsByDispute[d.id] ?? d.disputedMinutes,
                              resolutionSummary:
                                resolveNoteByDispute[d.id] ||
                                'Adjusted approved minutes after joint review.',
                            })
                            setBanner({ ok: res.ok, text: res.message })
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                        >
                          Resolve Adjusted
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const res = resolveStructuredDispute({
                              disputeId: d.id,
                              resolutionStatus: 'resolved_upheld',
                              adjustedApprovedMinutes: 0,
                              resolutionSummary:
                                resolveNoteByDispute[d.id] ||
                                'Upheld original review decision per contract policy.',
                            })
                            setBanner({ ok: res.ok, text: res.message })
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold cursor-pointer"
                        >
                          Uphold Original
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

