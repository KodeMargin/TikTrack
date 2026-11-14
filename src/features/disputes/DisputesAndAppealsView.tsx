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
      <div className="rounded-2xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-6 space-y-2">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          Access Restricted
        </h2>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 max-w-2xl">
          Client Reviewers can only view finalized deliverables and approved hours.
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

      {/* Header + Audit Export */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            Disputes & Appeals
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleDownloadAuditBundle('json')}
            className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white font-semibold cursor-pointer"
          >
            Export Audit (.json)
          </button>
          <button
            type="button"
            onClick={() => handleDownloadAuditBundle('markdown')}
            className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold cursor-pointer"
          >
            Export Report (.md)
          </button>
        </div>
      </div>

      {/* Open Clarification Request / Appeal Form */}
      <form
        onSubmit={handleOpenDispute}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4 text-xs"
      >
        <div className="font-semibold uppercase tracking-wider text-[#6d25da] dark:text-[#a87ce9]">
          {isManagerOrAuditor
            ? 'Request Clarification'
            : 'Open Dispute'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="md:col-span-2 space-y-1">
            <span className="text-zinc-500 dark:text-zinc-400 block">Timesheet Line</span>
            <select
              value={selectedLineId || timesheetLines[0]?.id || ''}
              onChange={(e) => setSelectedLineId(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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
            <span className="text-zinc-500 dark:text-zinc-400 block">Disputed Minutes</span>
            <input
              type="number"
              min={5}
              max={480}
              value={disputedMinutes}
              onChange={(e) => setDisputedMinutes(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="text-zinc-500 dark:text-zinc-400 block">Due Date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white font-mono"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-zinc-500 dark:text-zinc-400 block">Requested Evidence</span>
            <input
              type="text"
              value={requestedEvidenceType}
              onChange={(e) => setRequestedEvidenceType(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-zinc-500 dark:text-zinc-400 block">Evidence Artifact (Optional)</span>
            <select
              value={selectedArtifactIds[0] ?? ''}
              onChange={(e) =>
                setSelectedArtifactIds(e.target.value ? [e.target.value] : [])
              }
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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
            placeholder="Reason (min 10 characters)..."
            value={openReason}
            onChange={(e) => setOpenReason(e.target.value)}
            className="flex-1 min-w-64 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-900 dark:text-white"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
          >
            {isManagerOrAuditor ? 'Send Request' : 'Submit Dispute'}
          </button>
        </div>
      </form>

      {/* Active & Resolved Disputes List */}
      <div className="space-y-4">
        {disputes.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
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
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                        {d.taskCode}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white">{d.taskTitle}</span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700">
                        {d.status.replace('_', ' ')}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        Disputed: {d.disputedMinutes}m • Policy: {d.policyVersionCode}
                      </span>
                      {d.dueDate && (
                        <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                          Due: {d.dueDate}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300">{d.reason}</p>
                    {d.escalatedReviewerName && (
                      <div className="text-amber-700 dark:text-amber-300 font-medium">
                        Second Reviewer: {d.escalatedReviewerName}
                      </div>
                    )}
                    {d.creditInvoiceId && (
                      <div className="text-zinc-800 dark:text-zinc-200 font-medium">
                        Adjustment Invoice Generated
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadAuditBundle('json', d.id)}
                    className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                  >
                    Export Audit (.json)
                  </button>
                </div>

                {/* Thread Messages */}
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 p-3 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Message History
                  </div>
                  {d.messages.map((m) => (
                    <div key={m.id} className="text-zinc-700 dark:text-zinc-300 space-y-0.5">
                      <div>
                        <span className="font-semibold text-zinc-900 dark:text-white">{m.authorName}</span>{' '}
                        <span className="text-[10px] font-mono text-[#6d25da] dark:text-[#c5a8f0]">
                          [{m.messageType}]
                        </span>{' '}
                        <span className="text-[10px] text-slate-500">{m.createdAt}</span>
                      </div>
                      <div className="pl-2 border-l-2 border-zinc-200 dark:border-zinc-700">{m.messageMarkdown}</div>
                      {m.attachedArtifactIds.length > 0 && (
                        <div className="pl-2 text-[11px] font-mono text-zinc-800 dark:text-zinc-200">
                          Attached artifacts: {m.attachedArtifactIds.length}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {!isResolved && (
                  <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    {/* Reply with artifact */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Reply..."
                        value={replyDrafts[d.id] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        className="flex-1 min-w-60 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
                      />
                      <select
                        value={replyArtifacts[d.id] ?? ''}
                        onChange={(e) =>
                          setReplyArtifacts((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white max-w-52"
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
                          className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white"
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
                          placeholder="Escalation reason..."
                          value={escalateReasonByDispute[d.id] ?? ''}
                          onChange={(e) =>
                            setEscalateReasonByDispute((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-56 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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
                          Escalate
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
                          className="w-20 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-zinc-900 dark:text-white font-mono"
                          title="Final approved minutes"
                        />
                        <input
                          type="text"
                          placeholder="Resolution note..."
                          value={resolveNoteByDispute[d.id] ?? ''}
                          onChange={(e) =>
                            setResolveNoteByDispute((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-56 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-zinc-900 dark:text-white"
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
                          className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold cursor-pointer"
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
                          className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 text-zinc-800 dark:text-zinc-200 font-semibold cursor-pointer"
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

