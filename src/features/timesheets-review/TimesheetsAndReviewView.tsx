import { useMemo, useState } from 'react'
import { notifyFeedback } from '@/lib/notify'
import { usePhase1Store, type TimesheetLineItem } from '@/context/Phase1Store'
import { ActiveRulesSummaryBanner } from '@/features/verification-ai/ActiveRulesSummaryBanner'
import { PortableWorkReportPanel } from '@/features/timesheets-review/PortableWorkReportPanel'

function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

const STATUS_META: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  approved: {
    label: 'Approved',
    dot: 'bg-emerald-500',
    badge:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20',
  },
  observed: {
    label: 'Observed',
    dot: 'bg-sky-500',
    badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20',
  },
  context_added: {
    label: 'Context Added',
    dot: 'bg-[#6d25da] dark:bg-[#a87ce9]',
    badge:
      'bg-[#6d25da]/10 text-[#581eae] dark:text-[#c5a8f0] ring-1 ring-[#6d25da]/20',
  },
  needs_clarification: {
    label: 'Needs Clarification',
    dot: 'bg-amber-500',
    badge:
      'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/25',
  },
  disputed: {
    label: 'Disputed',
    dot: 'bg-rose-500',
    badge:
      'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/25',
  },
}

function getStatusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: status.replace(/_/g, ' '),
      dot: 'bg-zinc-400',
      badge:
        'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-500/20',
    }
  )
}

export function TimesheetsAndReviewView() {
  const {
    activeTenant,
    activeUser,
    projects,
    timesheetLines,
    workspacePaymentPolicy,
    submitTimesheetPeriod,
    respondToClarification,
    openDisputeOnLine,
    reviewTimesheetLine,
    approveUncontestedTimesheetLines,
    hasPermission,
  } = usePhase1Store()

  // Granular RBAC permissions (supports predefined roles, custom roles, and user overrides)
  const isSuperOrOwner =
    activeUser.role === 'super_admin' || activeUser.role === 'tenant_owner'
  const canViewTeam = isSuperOrOwner || hasPermission('timesheet:view_team')
  const canApprove =
    activeUser.role === 'super_admin' || hasPermission('timesheet:approve')
  const canReject =
    activeUser.role === 'super_admin' ||
    hasPermission('timesheet:reject') ||
    canApprove
  const canLock = isSuperOrOwner || hasPermission('timesheet:lock')
  const canReview = canApprove || canReject
  const isFinance = activeUser.role === 'finance' && !canReview
  const canSubmit =
    !isFinance && (hasPermission('timesheet:submit') || activeUser.role === 'developer')
  const canSeeClientBilling =
    !workspacePaymentPolicy.hideClientBillingRatesFromDevelopers ||
    isSuperOrOwner ||
    hasPermission('billing:view')

  // Scope lines based on view_team vs view_own permission
  const scopedLines = useMemo(() => {
    if (canViewTeam) return timesheetLines
    return timesheetLines.filter((line) => line.developerId === activeUser.id)
  }, [canViewTeam, timesheetLines, activeUser.id])

  // Filters & view state
  const [viewMode, setViewMode] = useState<'entries' | 'by_developer' | 'reports'>('entries')
  const [filterDeveloperId, setFilterDeveloperId] = useState<string>('all')
  const [filterProjectId, setFilterProjectId] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Period action controls
  const [submitProjectId, setSubmitProjectId] = useState<string>(
    projects[0]?.id ?? ''
  )
  const [lockOnApprove, setLockOnApprove] = useState<boolean>(false)

  // Progressive disclosure state per card
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({})
  const [openReviewId, setOpenReviewId] = useState<string | null>(null)
  const [openClarifyId, setOpenClarifyId] = useState<string | null>(null)
  const [collapsedDevGroups, setCollapsedDevGroups] = useState<Record<string, boolean>>({})

  // Form drafts
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<string, string>>({})
  const [managerReasons, setManagerReasons] = useState<Record<string, string>>({})
  const [managerAdjustMins, setManagerAdjustMins] = useState<Record<string, number>>({})
  const setBanner = notifyFeedback

  // Unique developers present in scoped lines (for quick filter strip)
  const developerSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string
        name: string
        claimedMinutes: number
        approvedMinutes: number
        pendingCount: number
        entryCount: number
        billableAmount: number
      }
    >()
    for (const line of scopedLines) {
      const existing = map.get(line.developerId) ?? {
        id: line.developerId,
        name: line.developerName,
        claimedMinutes: 0,
        approvedMinutes: 0,
        pendingCount: 0,
        entryCount: 0,
        billableAmount: 0,
      }
      existing.claimedMinutes += line.claimedMinutes
      existing.approvedMinutes += line.approvedBillableMinutes
      existing.entryCount += 1
      if (line.evidenceStatus !== 'approved') existing.pendingCount += 1
      existing.billableAmount +=
        (line.approvedBillableMinutes / 60) * line.snapshotHourlyRate
      map.set(line.developerId, existing)
    }
    return Array.from(map.values()).sort(
      (a, b) => b.claimedMinutes - a.claimedMinutes
    )
  }, [scopedLines])

  const projectMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>()
    for (const p of projects) map.set(p.id, { code: p.code, name: p.name })
    return map
  }, [projects])

  // Status counts for filter pills (computed before status filter, after dev/project/search)
  const baseFilteredLines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return scopedLines.filter((line) => {
      if (filterDeveloperId !== 'all' && line.developerId !== filterDeveloperId) {
        return false
      }
      if (filterProjectId !== 'all' && line.projectId !== filterProjectId) {
        return false
      }
      if (q) {
        const match =
          line.taskCode.toLowerCase().includes(q) ||
          line.taskTitle.toLowerCase().includes(q) ||
          line.developerName.toLowerCase().includes(q) ||
          line.developerNote.toLowerCase().includes(q) ||
          line.workMode.toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [scopedLines, filterDeveloperId, filterProjectId, searchQuery])

  const statusCounts = useMemo(() => {
    const counts = {
      all: baseFilteredLines.length,
      pending: 0,
      approved: 0,
      needs_clarification: 0,
      disputed: 0,
    }
    for (const l of baseFilteredLines) {
      if (l.evidenceStatus === 'approved') counts.approved += 1
      else counts.pending += 1
      if (l.evidenceStatus === 'needs_clarification') counts.needs_clarification += 1
      if (l.evidenceStatus === 'disputed') counts.disputed += 1
    }
    return counts
  }, [baseFilteredLines])

  const filteredLines = useMemo(() => {
    if (filterStatus === 'all') return baseFilteredLines
    if (filterStatus === 'pending') {
      return baseFilteredLines.filter((l) => l.evidenceStatus !== 'approved')
    }
    return baseFilteredLines.filter((l) => l.evidenceStatus === filterStatus)
  }, [baseFilteredLines, filterStatus])

  // Aggregate metrics
  const totals = useMemo(() => {
    return filteredLines.reduce(
      (acc, l) => {
        acc.elapsed += l.elapsedMinutes
        acc.claimed += l.claimedMinutes
        acc.observed += l.observedMinutes
        acc.supported += l.supportedMinutes
        acc.approved += l.approvedBillableMinutes
        acc.billableAmount += (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate
        if (l.evidenceStatus !== 'approved') acc.pendingCount += 1
        if (
          l.evidenceStatus === 'needs_clarification' ||
          l.evidenceStatus === 'disputed'
        ) {
          acc.attentionCount += 1
        }
        return acc
      },
      {
        elapsed: 0,
        claimed: 0,
        observed: 0,
        supported: 0,
        approved: 0,
        billableAmount: 0,
        pendingCount: 0,
        attentionCount: 0,
      }
    )
  }, [filteredLines])

  const weeklyCapPct = Math.min(
    100,
    Math.round((totals.claimed / Math.max(1, activeTenant.weeklyCapMinutes)) * 100)
  )
  const approvalPct =
    totals.claimed > 0
      ? Math.min(100, Math.round((totals.approved / totals.claimed) * 100))
      : 0

  const hasActiveFilters =
    filterDeveloperId !== 'all' ||
    filterProjectId !== 'all' ||
    filterStatus !== 'all' ||
    searchQuery.trim().length > 0

  function resetFilters() {
    setFilterDeveloperId('all')
    setFilterProjectId('all')
    setFilterStatus('all')
    setSearchQuery('')
  }

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
      canLock ? lockOnApprove : false
    )
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) {
      setOpenReviewId((prev) => (prev === lineId ? null : prev))
    }
  }

  function renderTimesheetCard(line: TimesheetLineItem) {
    const status = getStatusMeta(line.evidenceStatus)
    const proj = projectMap.get(line.projectId)
    const lineBillableValue =
      (line.approvedBillableMinutes / 60) * line.snapshotHourlyRate
    const isExpanded = Boolean(expandedDetails[line.id])
    const isReviewOpen = openReviewId === line.id
    const isClarifyOpen = openClarifyId === line.id
    const isOwnEntry = line.developerId === activeUser.id
    const canClarifyOwn =
      !line.isLocked &&
      (isOwnEntry || activeUser.role === 'developer') &&
      !isFinance

    return (
      <article
        key={line.id}
        className="group rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-[0_1px_2px_rgba(15,5,31,0.03),0_4px_14px_-6px_rgba(15,5,31,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_6px_18px_-8px_rgba(0,0,0,0.45)] hover:ring-[#6d25da]/25 dark:hover:ring-[#a87ce9]/30 transition-all duration-200 overflow-hidden"
      >
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Row 1: Primary Identity (Task + Developer) & Status */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {/* Developer Avatar */}
              <div
                title={line.developerName}
                className="h-9 w-9 rounded-xl bg-[#6d25da]/10 dark:bg-[#6d25da]/20 text-[#581eae] dark:text-[#c5a8f0] font-bold text-xs flex items-center justify-center shrink-0 ring-1 ring-[#6d25da]/15"
              >
                {getInitials(line.developerName)}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#6d25da] dark:text-[#c5a8f0] bg-[#6d25da]/[0.08] dark:bg-[#6d25da]/20 px-2 py-0.5 rounded-md">
                    {line.taskCode}
                  </span>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug">
                    {line.taskTitle}
                  </h3>
                  {line.isLocked && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
                      🔒 Locked
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {line.developerName}
                  </span>
                  {proj && (
                    <>
                      <span className="opacity-40">•</span>
                      <span className="truncate max-w-[180px]">{proj.name}</span>
                    </>
                  )}
                  <span className="opacity-40">•</span>
                  <span className="font-mono text-zinc-600 dark:text-zinc-300">
                    {line.workDate} · {line.startTime}–{line.endTime}
                  </span>
                  <span className="opacity-40">•</span>
                  <span className="capitalize text-[#6d25da] dark:text-[#c5a8f0] font-medium">
                    {line.workMode}
                  </span>
                  {line.provenance === 'manual_entry' && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
                      Manual
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Single Scannable Status Pill */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${status.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
          </div>

          {/* Row 2: Scannable Hours & Value Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-2.5">
            <div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Claimed</div>
              <div className="text-sm font-bold font-mono text-zinc-900 dark:text-white">
                {formatDuration(line.claimedMinutes)}
                <span className="ml-1 text-[11px] font-normal text-zinc-400">
                  ({line.claimedMinutes}m)
                </span>
              </div>
            </div>

            <div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Approved</div>
              <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-300">
                {formatDuration(line.approvedBillableMinutes)}
              </div>
            </div>

            {canSeeClientBilling ? (
              <>
                <div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Rate</div>
                  <div className="text-sm font-semibold font-mono text-zinc-800 dark:text-zinc-200">
                    ${line.snapshotHourlyRate}/hr
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Billable</div>
                  <div className="text-sm font-bold font-mono text-[#6d25da] dark:text-[#c5a8f0]">
                    ${lineBillableValue.toFixed(2)}{' '}
                    <span className="text-[10px] font-normal text-zinc-400">
                      {activeTenant.currency}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Observed</div>
                  <div className="text-sm font-semibold font-mono text-zinc-800 dark:text-zinc-200">
                    {formatDuration(line.observedMinutes)}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Supported</div>
                  <div className="text-sm font-bold font-mono text-[#6d25da] dark:text-[#c5a8f0]">
                    {formatDuration(line.supportedMinutes)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Row 3: Concise Note Preview (if not finance) */}
          {!isFinance && (line.developerNote || line.manualReason || line.managerComment) && (
            <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
              {line.developerNote && (
                <p className="line-clamp-2 leading-relaxed">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Note:{' '}
                  </span>
                  {line.developerNote}
                </p>
              )}
              {line.manualReason && (
                <p className="text-amber-700 dark:text-amber-300">
                  <span className="font-semibold">Manual reason: </span>
                  {line.manualReason}
                </p>
              )}
              {line.managerComment && (
                <p className="text-[#581eae] dark:text-[#c5a8f0]">
                  <span className="font-semibold">Reviewer: </span>
                  {line.managerComment}
                </p>
              )}
            </div>
          )}

          {/* Row 4: Clean Action Footer with Progressive Disclosure */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() =>
                setExpandedDetails((prev) => ({
                  ...prev,
                  [line.id]: !prev[line.id],
                }))
              }
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              <span>
                {isExpanded ? 'Hide' : 'Time breakdown'}
                {line.disputeMessages.length > 0
                  ? ` & history (${line.disputeMessages.length})`
                  : ''}
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {canClarifyOwn && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenClarifyId((prev) => (prev === line.id ? null : line.id))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isClarifyOpen
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] dark:text-zinc-200'
                  }`}
                >
                  {isClarifyOpen ? 'Close Note' : 'Add Clarification / Dispute'}
                </button>
              )}

              {canReview && !line.isLocked && (
                <>
                  {canApprove && line.evidenceStatus !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => handleManagerDecision(line.id, 'approve')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-xs font-semibold transition cursor-pointer shadow-xs"
                    >
                      ✓ Quick Approve ({formatDuration(line.claimedMinutes)})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setOpenReviewId((prev) => (prev === line.id ? null : line.id))
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isReviewOpen
                        ? 'bg-[#6d25da] text-white'
                        : 'bg-[#6d25da]/10 hover:bg-[#6d25da]/15 text-[#581eae] dark:bg-[#6d25da]/20 dark:hover:bg-[#6d25da]/30 dark:text-[#c5a8f0]'
                    }`}
                  >
                    {isReviewOpen ? 'Close Review' : 'Review / Adjust'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Expandable Details: 5 Time Concepts + Period Status + Review History */}
          {isExpanded && (
            <div className="dp-view-enter pt-3 border-t border-zinc-100 dark:border-white/[0.06] space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="rounded-lg bg-zinc-50 dark:bg-white/[0.03] px-3 py-2">
                  <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Elapsed</div>
                  <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                    {line.elapsedMinutes}m
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-50 dark:bg-white/[0.03] px-3 py-2">
                  <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Claimed</div>
                  <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                    {line.claimedMinutes}m
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-50 dark:bg-white/[0.03] px-3 py-2">
                  <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Observed</div>
                  <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                    {isFinance ? 'Restricted' : `${line.observedMinutes}m`}
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-50 dark:bg-white/[0.03] px-3 py-2">
                  <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Supported</div>
                  <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                    {line.supportedMinutes}m
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-50 dark:bg-white/[0.03] px-3 py-2">
                  <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">Period</div>
                  <div className="font-mono font-semibold capitalize text-zinc-900 dark:text-white">
                    {(line.timesheetStatus ?? 'draft').replace(/_/g, ' ')}
                  </div>
                </div>
              </div>

              {line.disputeMessages.length > 0 && (
                <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3 space-y-1.5 text-xs">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Review &amp; Clarification Thread
                  </div>
                  {line.disputeMessages.map((msg, idx) => (
                    <div key={idx} className="text-zinc-700 dark:text-zinc-300">
                      <span className="font-semibold text-zinc-900 dark:text-white">
                        {msg.author}
                      </span>{' '}
                      <span className="text-[10.5px] font-mono text-zinc-400">
                        ({msg.role.replace(/_/g, ' ')} · {msg.timestamp})
                      </span>
                      : {msg.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Expandable Developer Clarification / Dispute Drawer */}
          {isClarifyOpen && canClarifyOwn && (
            <div className="dp-view-enter rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3.5 space-y-2.5 text-xs">
              <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                Add Clarification or Open Dispute
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Explain the work interval or dispute reason..."
                  value={clarificationDrafts[line.id] ?? ''}
                  onChange={(e) =>
                    setClarificationDrafts((prev) => ({
                      ...prev,
                      [line.id]: e.target.value,
                    }))
                  }
                  className="flex-1 min-w-56 rounded-lg bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-white/10 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const text = (
                      clarificationDrafts[line.id] ||
                      'Spent interval inspecting logs and reproducing the issue locally.'
                    ).trim()
                    respondToClarification(line.id, text)
                    setClarificationDrafts((prev) => ({ ...prev, [line.id]: '' }))
                    setOpenClarifyId(null)
                    setBanner({ ok: true, text: 'Clarification note added to timesheet entry.' })
                  }}
                  className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold transition cursor-pointer"
                >
                  Send Clarification
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = (
                      clarificationDrafts[line.id] ||
                      `Disputing reduction: full session was spent on assigned task ${line.taskCode}.`
                    ).trim()
                    openDisputeOnLine(line.id, text)
                    setClarificationDrafts((prev) => ({ ...prev, [line.id]: '' }))
                    setOpenClarifyId(null)
                    setBanner({ ok: true, text: 'Dispute opened for second-level review.' })
                  }}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition cursor-pointer"
                >
                  Open Dispute
                </button>
              </div>
            </div>
          )}

          {/* Expandable Reviewer Decision Panel */}
          {isReviewOpen && canReview && !line.isLocked && (
            <div className="dp-view-enter rounded-xl bg-[#6d25da]/[0.04] dark:bg-[#6d25da]/10 ring-1 ring-[#6d25da]/15 p-3.5 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#581eae] dark:text-[#c5a8f0]">
                  Reviewer Decision
                </span>
                {canLock && (
                  <label className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lockOnApprove}
                      onChange={(e) => setLockOnApprove(e.target.checked)}
                    />
                    Lock period on approval
                  </label>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Enter audit reason (min 5 characters)..."
                  value={managerReasons[line.id] ?? ''}
                  onChange={(e) =>
                    setManagerReasons((prev) => ({
                      ...prev,
                      [line.id]: e.target.value,
                    }))
                  }
                  className="flex-1 min-w-56 rounded-lg bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-white/10 px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Mins:</span>
                  <input
                    type="number"
                    min={0}
                    max={480}
                    value={managerAdjustMins[line.id] ?? line.claimedMinutes}
                    onChange={(e) =>
                      setManagerAdjustMins((prev) => ({
                        ...prev,
                        [line.id]: Number(e.target.value),
                      }))
                    }
                    className="w-20 rounded-lg bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-white/10 px-2.5 py-2 text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
                    title="Adjusted billable minutes"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canApprove && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleManagerDecision(line.id, 'approve')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer"
                    >
                      ✓ Approve ({line.claimedMinutes}m)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManagerDecision(line.id, 'adjust_with_reason')}
                      className="px-3.5 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold transition cursor-pointer"
                    >
                      Approve Adjusted
                    </button>
                  </>
                )}
                {canReject && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleManagerDecision(line.id, 'ask_clarification')}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition cursor-pointer"
                    >
                      Ask Clarification
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManagerDecision(line.id, 'reject')}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition cursor-pointer"
                    >
                      Reject / Dispute
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </article>
    )
  }

  // Grouped entries for "By Developer" view
  const groupedByDeveloper = useMemo(() => {
    const groups = new Map<
      string,
      {
        developerId: string
        developerName: string
        lines: TimesheetLineItem[]
        claimed: number
        approved: number
        pending: number
        billable: number
      }
    >()
    for (const line of filteredLines) {
      const g = groups.get(line.developerId) ?? {
        developerId: line.developerId,
        developerName: line.developerName,
        lines: [],
        claimed: 0,
        approved: 0,
        pending: 0,
        billable: 0,
      }
      g.lines.push(line)
      g.claimed += line.claimedMinutes
      g.approved += line.approvedBillableMinutes
      if (line.evidenceStatus !== 'approved') g.pending += 1
      g.billable += (line.approvedBillableMinutes / 60) * line.snapshotHourlyRate
      groups.set(line.developerId, g)
    }
    return Array.from(groups.values()).sort((a, b) => b.claimed - a.claimed)
  }, [filteredLines])

  return (
    <div className="space-y-6">
      {/* Clean Header + Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            {canViewTeam
              ? 'Team Timesheets & Logged Tasks'
              : isFinance
                ? 'Approved Billing Hours'
                : `${activeUser.name}’s Logged Tasks`}
          </h2>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
            {filteredLines.length} {filteredLines.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {/* Period Submission & Bulk Approve Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {projects.length > 0 && (canSubmit || canApprove) && (
            <select
              value={submitProjectId || projects[0]?.id || ''}
              onChange={(e) => setSubmitProjectId(e.target.value)}
              aria-label="Select project for period action"
              className="rounded-xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-medium"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          )}

          {canSubmit && (
            <button
              type="button"
              onClick={() => {
                const targetProj = submitProjectId || projects[0]?.id
                if (!targetProj) return
                const res = submitTimesheetPeriod(targetProj)
                setBanner({ ok: res.ok, text: res.message })
              }}
              className="px-3.5 py-2 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] active:scale-[0.98] font-semibold text-white transition cursor-pointer shadow-xs"
            >
              Submit Period
            </button>
          )}

          {canApprove && (
            <button
              type="button"
              onClick={() => {
                const targetProj = submitProjectId || projects[0]?.id
                const res = approveUncontestedTimesheetLines(targetProj)
                setBanner({ ok: res.ok, text: res.message })
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] font-semibold text-white transition cursor-pointer shadow-xs"
              title="Approve all uncontested lines and hold disputed ones"
            >
              ✓ Approve Uncontested
            </button>
          )}
        </div>
      </div>

      {/* First-Sight 4-Card KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* KPI 1: Claimed Hours + Weekly Cap */}
        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-2.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Claimed Time</span>
            <span className="font-mono text-[11px] text-[#6d25da] dark:text-[#c5a8f0] font-semibold">
              {weeklyCapPct}% of cap
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-white">
              {formatDuration(totals.claimed)}
            </span>
            <span className="text-xs font-mono text-zinc-400">
              / {formatDuration(activeTenant.weeklyCapMinutes)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                totals.claimed > activeTenant.weeklyCapMinutes
                  ? 'bg-rose-500'
                  : 'bg-[#6d25da]'
              }`}
              style={{ width: `${weeklyCapPct}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Approved Hours */}
        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-2.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Approved Hours</span>
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {approvalPct}%
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-white">
              {formatDuration(totals.approved)}
            </span>
            <span className="text-xs font-mono text-zinc-400">
              ({totals.approved}m)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-white/[0.07] overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${approvalPct}%` }}
            />
          </div>
        </div>

        {/* KPI 3: Pending / Needs Attention */}
        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-2 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Awaiting Review</span>
            {totals.attentionCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                {totals.attentionCount} flagged
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-white">
              {totals.pendingCount}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {totals.pendingCount === 1 ? 'entry pending' : 'entries pending'}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
            Observed: {isFinance ? 'Restricted' : formatDuration(totals.observed)} · Supported:{' '}
            {formatDuration(totals.supported)}
          </div>
        </div>

        {/* KPI 4: Approved Billable Value (or Elapsed Summary when client rates hidden) */}
        <div className="rounded-2xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/20 dark:ring-[#8b51e1]/30 p-4 space-y-2 shadow-[0_1px_2px_rgba(109,37,218,0.06)]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#581eae] dark:text-[#c5a8f0]">
              {canSeeClientBilling ? 'Approved Billable' : 'Total Elapsed'}
            </span>
            <span className="font-mono text-[11px] text-[#6d25da] dark:text-[#c5a8f0]">
              {canSeeClientBilling ? activeTenant.currency : 'Tracked'}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tracking-tight text-zinc-900 dark:text-white">
            {canSeeClientBilling
              ? `$${totals.billableAmount.toFixed(2)}`
              : formatDuration(totals.elapsed)}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
            {canSeeClientBilling
              ? `Elapsed total: ${formatDuration(totals.elapsed)}`
              : 'View personal pay in Payments'}
          </div>
        </div>
      </div>

      {/* Active Workspace Review Rules Strip (Read-Only Transparency) */}
      <ActiveRulesSummaryBanner />

      {/* Team Developer Quick-Filter Strip (visible for Tenant Owner / Team Viewers) */}
      {canViewTeam && developerSummaries.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Filter by Developer
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterDeveloperId('all')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filterDeveloperId === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs'
                  : 'bg-white dark:bg-[#131319] text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] hover:ring-[#6d25da]/30'
              }`}
            >
              <span>All Developers</span>
              <span className="font-mono opacity-75">({developerSummaries.length})</span>
            </button>

            {developerSummaries.map((dev) => {
              const selected = filterDeveloperId === dev.id
              return (
                <button
                  key={dev.id}
                  type="button"
                  onClick={() =>
                    setFilterDeveloperId((prev) => (prev === dev.id ? 'all' : dev.id))
                  }
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                    selected
                      ? 'bg-[#6d25da] text-white shadow-xs'
                      : 'bg-white dark:bg-[#131319] text-zinc-700 dark:text-zinc-200 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] hover:ring-[#6d25da]/30'
                  }`}
                >
                  <span
                    className={`h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      selected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]'
                    }`}
                  >
                    {getInitials(dev.name)}
                  </span>
                  <span className="font-semibold">{dev.name}</span>
                  <span
                    className={`font-mono text-[11px] ${
                      selected ? 'text-white/85' : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    {formatDuration(dev.claimedMinutes)}
                  </span>
                  {dev.pendingCount > 0 && (
                    <span
                      className={`h-2 w-2 rounded-full ${
                        selected ? 'bg-amber-300' : 'bg-amber-500'
                      }`}
                      title={`${dev.pendingCount} pending`}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter & View Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'all', label: 'All', count: statusCounts.all },
            { id: 'pending', label: 'Pending Review', count: statusCounts.pending },
            { id: 'approved', label: 'Approved', count: statusCounts.approved },
            {
              id: 'needs_clarification',
              label: 'Clarification',
              count: statusCounts.needs_clarification,
            },
            { id: 'disputed', label: 'Disputed', count: statusCounts.disputed },
          ].map((tab) => {
            const active = filterStatus === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition cursor-pointer ${
                  active
                    ? 'bg-[#6d25da]/12 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] font-semibold ring-1 ring-[#6d25da]/25'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.05]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="font-mono text-[11px] opacity-75">{tab.count}</span>
              </button>
            )
          })}
        </div>

        {/* Search, Project Filter & View Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="text"
            placeholder="Search task, developer, note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-52 sm:w-60 rounded-xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-1.5 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
          />

          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            aria-label="Filter by project"
            className="rounded-xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-1.5 text-zinc-900 dark:text-white"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-xl bg-zinc-100 dark:bg-white/[0.05] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('entries')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'entries'
                  ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Entries
            </button>
            {canViewTeam && (
              <button
                type="button"
                onClick={() => setViewMode('by_developer')}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  viewMode === 'by_developer'
                    ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                By Developer
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewMode('reports')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                viewMode === 'reports'
                  ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Work Reports
            </button>
          </div>
        </div>
      </div>

      {/* Verified Work Reports, Entries List, or Grouped By Developer */}
      {viewMode === 'reports' ? (
        <PortableWorkReportPanel onFeedback={setBanner} />
      ) : filteredLines.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.02] ring-1 ring-dashed ring-zinc-300 dark:ring-white/10 p-10 text-center space-y-2.5">
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            No logged task entries match your filters
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {scopedLines.length === 0
              ? 'Sessions logged via Focus Timer or Manual Time Entry will appear here automatically.'
              : 'Try adjusting the developer, project, status filter, or search query.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-1 px-3.5 py-1.5 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-white text-xs font-semibold transition cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'by_developer' && canViewTeam ? (
        <div className="space-y-4">
          {groupedByDeveloper.map((group) => {
            const collapsed = Boolean(collapsedDevGroups[group.developerId])
            return (
              <section
                key={group.developerId}
                className="rounded-2xl bg-zinc-50/70 dark:bg-white/[0.02] ring-1 ring-zinc-950/[0.05] dark:ring-white/[0.06] p-3 sm:p-4 space-y-3"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedDevGroups((prev) => ({
                      ...prev,
                      [group.developerId]: !prev[group.developerId],
                    }))
                  }
                  className="w-full flex flex-wrap items-center justify-between gap-3 px-1 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[#6d25da] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                      {getInitials(group.developerName)}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <span>{group.developerName}</span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
                          {group.lines.length} {group.lines.length === 1 ? 'log' : 'logs'}
                        </span>
                        {group.pending > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {group.pending} pending
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        Claimed {formatDuration(group.claimed)} · Approved{' '}
                        {formatDuration(group.approved)}
                        {canSeeClientBilling
                          ? ` · $${group.billable.toFixed(2)} ${activeTenant.currency}`
                          : ''}
                      </div>
                    </div>
                  </div>
                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {!collapsed && (
                  <div className="space-y-3">
                    {group.lines.map((line) => renderTimesheetCard(line))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLines.map((line) => renderTimesheetCard(line))}
        </div>
      )}
    </div>
  )
}
