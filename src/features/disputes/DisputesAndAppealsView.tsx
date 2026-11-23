import { useState } from 'react'
import { notifyFeedback } from '@/lib/notify'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store } from '@/context/Phase2Store'
import { usePhase3Store } from '@/context/Phase3Store'
import { buildContractualAuditBundle } from '@/lib/phase3/auditExport'

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: {
    label: 'Open',
    cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20',
  },
  awaiting_developer: {
    label: 'Waiting for Developer',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20',
  },
  under_review: {
    label: 'Under Review',
    cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20',
  },
  escalated: {
    label: '2nd Review',
    cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 ring-1 ring-amber-500/30',
  },
  resolved_accepted: {
    label: 'Accepted',
    cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20',
  },
  resolved_adjusted: {
    label: 'Adjusted',
    cls: 'bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] ring-1 ring-[#6d25da]/25',
  },
  resolved_upheld: {
    label: 'Original Upheld',
    cls: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-500/20',
  },
}

const MESSAGE_TYPE_LABEL: Record<string, string> = {
  clarification_request: 'Clarification Request',
  developer_appeal: 'Developer Appeal',
  developer_response: 'Reply',
  escalation_note: 'Escalation',
  resolution_decision: 'Decision',
}

const CARD_CLS =
  'rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-sm p-5'

const INPUT_CLS =
  'w-full rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#702fe3]/30 focus:border-[#702fe3] transition'

const LABEL_CLS = 'block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1'

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
    'Investigation note or PR/commit link'
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
  const setBanner = notifyFeedback

  const isClientReviewer = activeUser.role === 'client_reviewer'
  if (isClientReviewer) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-6 space-y-2">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          Restricted Area
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xl">
          Your role does not have access to internal time disputes and appeals.
        </p>
      </div>
    )
  }

  const isManagerOrAuditor =
    activeUser.role === 'super_admin' ||
    activeUser.role === 'project_manager' ||
    activeUser.role === 'tenant_owner' ||
    activeUser.role === 'auditor'

  function handleOpenDispute(e: React.FormEvent) {
    e.preventDefault()
    const targetLineId = selectedLineId || timesheetLines[0]?.id
    if (!targetLineId) {
      setBanner({ ok: false, text: 'No timesheet entries available to open a dispute on.' })
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
    link.download = `${activeTenant.slug || 'tiktrack'}-dispute-report.${ext}`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header + Export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            Disputes &amp; Appeals
          </h2>
          <span className="rounded-full bg-zinc-200/70 dark:bg-white/[0.08] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
            {disputes.length} {disputes.length === 1 ? 'case' : 'cases'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleDownloadAuditBundle('json')}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 ring-1 ring-zinc-200 dark:ring-zinc-700 text-zinc-900 dark:text-white font-semibold cursor-pointer transition"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => handleDownloadAuditBundle('markdown')}
            className="px-3 py-1.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold cursor-pointer transition"
          >
            Export Report (.md)
          </button>
        </div>
      </div>

      {/* Open Clarification / Appeal Form */}
      <form onSubmit={handleOpenDispute} className={`${CARD_CLS} space-y-4`}>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          {isManagerOrAuditor ? 'Request Clarification' : 'Open Time Dispute'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className={LABEL_CLS}>Timesheet Entry</label>
            <select
              value={selectedLineId || timesheetLines[0]?.id || ''}
              onChange={(e) => setSelectedLineId(e.target.value)}
              className={INPUT_CLS}
            >
              {timesheetLines.length === 0 ? (
                <option value="">No timesheet entries yet</option>
              ) : (
                timesheetLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.workDate} · {l.taskCode} ({l.claimedMinutes}m
                    {l.isLocked ? ' · Locked' : ''})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Minutes in Question</label>
            <input
              type="number"
              min={5}
              max={480}
              value={disputedMinutes}
              onChange={(e) => setDisputedMinutes(Number(e.target.value))}
              className={`${INPUT_CLS} font-mono`}
            />
          </div>

          <div>
            <label className={LABEL_CLS}>Response Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`${INPUT_CLS} font-mono`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Supporting Details Needed</label>
            <input
              type="text"
              value={requestedEvidenceType}
              onChange={(e) => setRequestedEvidenceType(e.target.value)}
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className={LABEL_CLS}>Attach Work Proof (Optional)</label>
            <select
              value={selectedArtifactIds[0] ?? ''}
              onChange={(e) =>
                setSelectedArtifactIds(e.target.value ? [e.target.value] : [])
              }
              className={INPUT_CLS}
            >
              <option value="">None attached</option>
              {evidenceArtifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.sourceType}: {a.summaryTitle}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-64">
            <label className={LABEL_CLS}>Reason</label>
            <input
              type="text"
              required
              placeholder="Explain what needs review (min 10 characters)..."
              value={openReason}
              onChange={(e) => setOpenReason(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer transition"
          >
            {isManagerOrAuditor ? 'Send Request' : 'Submit Dispute'}
          </button>
        </div>
      </form>

      {/* Active & Resolved Disputes List */}
      <div className="space-y-4">
        {disputes.length === 0 ? (
          <div className={`${CARD_CLS} py-10 text-center text-xs text-zinc-500 dark:text-zinc-400`}>
            No open or resolved disputes yet.
          </div>
        ) : (
          disputes.map((d) => {
            const isResolved = d.status.startsWith('resolved_')
            const statusBadge = STATUS_META[d.status] ?? {
              label: d.status.replace(/_/g, ' '),
              cls: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
            }
            const eligibleSecondReviewers = members.filter(
              (m) =>
                (m.role === 'super_admin' ||
                  m.role === 'project_manager' ||
                  m.role === 'tenant_owner' ||
                  m.role === 'auditor') &&
                m.id !== d.assignedReviewerId &&
                m.id !== d.openedByUserId
            )

            return (
              <div key={d.id} className={`${CARD_CLS} space-y-4 text-xs`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-[#581eae] dark:text-[#c5a8f0]">
                        {d.taskCode}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white">
                        {d.taskTitle}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge.cls}`}
                      >
                        {statusBadge.label}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {d.disputedMinutes}m in question
                      </span>
                      {d.dueDate && (
                        <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                          Due {d.dueDate}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300">{d.reason}</p>
                    {d.escalatedReviewerName && (
                      <div className="text-amber-700 dark:text-amber-300 font-medium">
                        2nd Reviewer: {d.escalatedReviewerName}
                      </div>
                    )}
                    {d.creditInvoiceId && (
                      <div className="text-emerald-700 dark:text-emerald-300 font-medium">
                        Credit adjustment invoice created
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadAuditBundle('json', d.id)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold cursor-pointer transition shrink-0"
                  >
                    Export Case (.json)
                  </button>
                </div>

                {/* Thread Messages */}
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-3.5 space-y-2.5">
                  <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                    Discussion History
                  </div>
                  {d.messages.map((m) => (
                    <div key={m.id} className="text-zinc-700 dark:text-zinc-300 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          {m.authorName}
                        </span>
                        <span className="rounded-md bg-[#6d25da]/10 dark:bg-[#6d25da]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#581eae] dark:text-[#c5a8f0]">
                          {MESSAGE_TYPE_LABEL[m.messageType] ?? m.messageType}
                        </span>
                        <span className="text-[10px] text-zinc-400">{m.createdAt}</span>
                      </div>
                      <div className="pl-3 border-l-2 border-zinc-200 dark:border-zinc-700">
                        {m.messageMarkdown}
                      </div>
                      {m.attachedArtifactIds.length > 0 && (
                        <div className="pl-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {m.attachedArtifactIds.length} work proof item(s) attached
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {!isResolved && (
                  <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    {/* Reply */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Write a reply..."
                        value={replyDrafts[d.id] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        className="flex-1 min-w-60 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
                      />
                      <select
                        value={replyArtifacts[d.id] ?? ''}
                        onChange={(e) =>
                          setReplyArtifacts((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white max-w-52"
                      >
                        <option value="">No attachment</option>
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
                        className="px-3.5 py-1.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 font-semibold cursor-pointer transition"
                      >
                        Post Reply
                      </button>
                    </div>

                    {/* Escalate to 2nd Reviewer */}
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
                          className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white"
                        >
                          {eligibleSecondReviewers.length === 0 ? (
                            <option value="">No 2nd reviewer available</option>
                          ) : (
                            eligibleSecondReviewers.map((m) => (
                              <option key={m.id} value={m.id}>
                                Escalate to: {m.name}
                              </option>
                            ))
                          )}
                        </select>
                        <input
                          type="text"
                          placeholder="Reason for 2nd review..."
                          value={escalateReasonByDispute[d.id] ?? ''}
                          onChange={(e) =>
                            setEscalateReasonByDispute((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-56 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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
                          className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer transition"
                        >
                          Request 2nd Review
                        </button>
                      </div>
                    )}

                    {/* Resolution Actions */}
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
                          className="w-20 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                          title="Approved minutes"
                        />
                        <input
                          type="text"
                          placeholder="Decision note..."
                          value={resolveNoteByDispute[d.id] ?? ''}
                          onChange={(e) =>
                            setResolveNoteByDispute((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-56 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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
                                'Accepted developer explanation and supporting details.',
                            })
                            setBanner({ ok: res.ok, text: res.message })
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer transition"
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
                                'Adjusted approved time after review.',
                            })
                            setBanner({ ok: res.ok, text: res.message })
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold cursor-pointer transition"
                        >
                          Adjust Time
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
                                'Kept original review decision.',
                            })
                            setBanner({ ok: res.ok, text: res.message })
                          }}
                          className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold cursor-pointer transition"
                        >
                          Keep Original
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
