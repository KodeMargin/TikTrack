import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase2Store } from '@/context/Phase2Store'
import { usePhase4Store } from '@/context/Phase4Store'
import { PHASE4_PLAN_CATALOG } from '@/lib/phase4/saasBilling'

export function ClientPortalView() {
  const {
    activeTenant,
    activeUser,
    projects,
    tasks,
    timesheetLines,
    invoices,
  } = usePhase1Store()
  const { evidenceArtifacts } = usePhase2Store()
  const { subscription, whiteLabelBranding } = usePhase4Store()

  const isClientRole = activeUser.role === 'client_reviewer'
  const scopedProjects =
    isClientRole && activeUser.assignedProjectIds.length > 0
      ? projects.filter((p) => activeUser.assignedProjectIds.includes(p.id))
      : projects

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => scopedProjects[0]?.id ?? ''
  )

  const activeProjectId =
    scopedProjects.find((p) => p.id === selectedProjectId)?.id ??
    scopedProjects[0]?.id ??
    ''
  const activeProject = scopedProjects.find((p) => p.id === activeProjectId)

  const planSupportsPortal = PHASE4_PLAN_CATALOG[subscription.planTier].clientPortalEnabled

  // Strictly approved commercial lines only — never observedMinutes, developerNote,
  // managerComment, activity rollups, AI drafts, or internal dispute threads.
  const approvedLines = timesheetLines.filter(
    (l) =>
      l.projectId === activeProjectId &&
      l.evidenceStatus === 'approved' &&
      l.approvedBillableMinutes > 0
  )

  const projectTasks = tasks.filter((t) => t.projectId === activeProjectId)
  const completedOrReviewTasks = projectTasks.filter(
    (t) => t.status === 'done' || t.status === 'review'
  )

  // Deliverable summaries only (PRs, Commits, CI, Reviews) — never workstation buckets
  const deliverableArtifacts = evidenceArtifacts.filter(
    (a) =>
      a.projectId === activeProjectId &&
      ['github_pr', 'github_commit', 'github_ci', 'github_review', 'gitlab_mr', 'design_doc'].includes(
        a.sourceType
      )
  )

  const clientInvoices = invoices.filter(
    (inv) =>
      inv.projectId === activeProjectId &&
      (isClientRole ? inv.status === 'finalized_locked' : true)
  )

  const totalApprovedHours =
    approvedLines.reduce((sum, l) => sum + l.approvedBillableMinutes, 0) / 60
  const totalApprovedAmount = approvedLines.reduce(
    (sum, l) => sum + (l.approvedBillableMinutes / 60) * l.snapshotHourlyRate,
    0
  )

  return (
    <div className="space-y-6">
      {/* White-Label Branded Header (F4-005 & F4-012) */}
      <div
        className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 space-y-4"
        style={{ borderTopWidth: '4px', borderTopColor: whiteLabelBranding.accentColorHex }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: whiteLabelBranding.accentColorHex }}
            >
              {whiteLabelBranding.logoText}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {whiteLabelBranding.agencyBrandName}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Read-Only Client Portal
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {whiteLabelBranding.portalWelcomeMessage}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-[11px] text-slate-400">
              <div className="font-mono">{whiteLabelBranding.customDomain}</div>
              <div>Support: {whiteLabelBranding.supportEmail}</div>
            </div>
            {scopedProjects.length > 0 && (
              <select
                value={activeProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                aria-label="Client portal project"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              >
                {scopedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name} ({p.clientName})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Strict Boundary Guarantee */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-300">
            <strong className="text-emerald-300">Boundary Enforced:</strong> Displays only
            approved billable work, verified deliverable outcomes, and finalized client invoices.
            Raw workstation telemetry, internal developer notes, AI drafts, and dispute threads
            are excluded.
          </span>
          {!whiteLabelBranding.hideDevProofWatermark && (
            <span className="text-[11px] font-mono text-slate-500">
              Verified by DevProof
            </span>
          )}
        </div>

        {!planSupportsPortal && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-200">
            Plan Notice: Current plan is <strong className="uppercase">{subscription.planTier}</strong>.
            External client portal publishing is included on <strong>Agency</strong> and{' '}
            <strong>Enterprise</strong> plans (preview shown for workspace owner).
          </div>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Scoped Project
          </div>
          <div className="text-base font-bold text-white mt-1 truncate">
            {activeProject ? `${activeProject.code} · ${activeProject.name}` : 'No project'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Client: {activeProject?.clientName ?? '—'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Approved Hours
          </div>
          <div className="text-2xl font-bold text-emerald-300 mt-1 font-mono">
            {totalApprovedHours.toFixed(2)}h
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {approvedLines.length} approved ledger line(s)
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Accepted Value
          </div>
          <div className="text-2xl font-bold text-white mt-1 font-mono">
            {activeTenant.currency} {totalApprovedAmount.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Snapshot contract rates applied
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Verified Deliverables
          </div>
          <div className="text-2xl font-bold text-indigo-300 mt-1 font-mono">
            {completedOrReviewTasks.length} / {projectTasks.length}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {deliverableArtifacts.length} PR/CI/commit milestone(s)
          </div>
        </div>
      </div>

      {/* Approved Work Ledger & Deliverables */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              Approved Billable Work (`client_portal_project_timesheets_v`)
            </h3>
            <p className="text-xs text-slate-400">
              Only manager-approved hours are visible here. Pending or disputed entries remain internal.
            </p>
          </div>

          {approvedLines.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
              No approved billable hours published for this project yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Task Outcome</th>
                    <th className="py-2 pr-3 text-right">Approved</th>
                    <th className="py-2 pr-3 text-right">Rate</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {approvedLines.map((line) => {
                    const hrs = line.approvedBillableMinutes / 60
                    const amt = hrs * line.snapshotHourlyRate
                    return (
                      <tr key={line.id} className="text-slate-200">
                        <td className="py-2.5 pr-3 font-mono">{line.workDate}</td>
                        <td className="py-2.5 pr-3">
                          <span className="font-mono text-indigo-300 mr-1.5">
                            {line.taskCode}
                          </span>
                          <span>{line.taskTitle}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-emerald-300">
                          {hrs.toFixed(2)}h
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono">
                          ${line.snapshotHourlyRate}/hr
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold text-white">
                          {activeTenant.currency} {amt.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Deliverables & Finalized Client Invoices */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">
              Deliverable Outcomes (`client_portal_deliverables_v`)
            </h3>
            {deliverableArtifacts.length === 0 && completedOrReviewTasks.length === 0 ? (
              <p className="text-xs text-slate-400">
                No completed tasks or linked PR/CI deliverables yet.
              </p>
            ) : (
              <div className="space-y-2">
                {completedOrReviewTasks.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono text-indigo-300 mr-2">{t.code}</span>
                      <span className="text-white">{t.title}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] uppercase font-semibold">
                      {t.status}
                    </span>
                  </div>
                ))}
                {deliverableArtifacts.map((art) => (
                  <div
                    key={art.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-cyan-300">
                        {art.sourceType} · {art.externalId}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {art.occurredAtUtc.slice(0, 10)}
                      </span>
                    </div>
                    <div className="text-slate-200">{art.summaryTitle}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">
              Client Work Invoices
            </h3>
            {clientInvoices.length === 0 ? (
              <p className="text-xs text-slate-400">
                No finalized client invoices issued for this project yet.
              </p>
            ) : (
              <div className="space-y-2">
                {clientInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-white">
                        {inv.invoiceNumber}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {(inv.totalApprovedMinutes / 60).toFixed(2)}h · {inv.status}
                      </div>
                    </div>
                    <div className="text-sm font-bold font-mono text-emerald-300">
                      {inv.currency} {inv.totalAmount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

