import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import type { RoundingRule } from '@/types/domain.types'
import { RolesAndPermissionsManager } from './RolesAndPermissionsManager'

export function BillingAndAdminView() {
  const {
    activeTenant,
    updateTenantSettings,
    projects,
    contractPolicy,
    addContractRateVersion,
    invoices,
    generateInvoiceFromApproved,
    lockInvoice,
    issueCreditAdjustmentInvoice,
    auditLogs,
  } = usePhase1Store()

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ''
  )
  const [taxPercent, setTaxPercent] = useState<number>(8.5)
  const [rateLabel, setRateLabel] = useState('')
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState('2026-11-16')
  const [rateEffectiveTo, setRateEffectiveTo] = useState('')
  const [rateHourly, setRateHourly] = useState<number>(155)
  const [creditInvoiceId, setCreditInvoiceId] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState<number>(125)
  const [creditReason, setCreditReason] = useState('')
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  function handleGenerateInvoice() {
    const projId = selectedProjectId || projects[0]?.id
    if (!projId) return
    const res = generateInvoiceFromApproved(projId, taxPercent)
    setBanner({ ok: res.ok, text: res.message })
  }

  function handleExportCsv(invoiceId: string) {
    const inv = invoices.find((i) => i.id === invoiceId)
    if (!inv) return

    const header = 'WorkDate,TaskCode,Description,ApprovedMinutes,HourlyRate,LineAmount\n'
    const rows = inv.lines
      .map(
        (l) =>
          `${l.workDate},${l.taskCode},"${l.description}",${l.approvedMinutes},${l.hourlyRate},${l.amount.toFixed(2)}`
      )
      .join('\n')

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${inv.invoiceNumber}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleAddRateVersion(e: React.FormEvent) {
    e.preventDefault()
    if (!rateLabel.trim() || !rateEffectiveFrom) return
    const res = addContractRateVersion({
      label: rateLabel.trim(),
      effectiveFrom: rateEffectiveFrom,
      effectiveTo: rateEffectiveTo.trim() || null,
      hourlyRate: rateHourly,
      currency: activeTenant.currency,
    })
    if (res.ok) {
      setRateLabel('')
      setRateEffectiveTo('')
    }
    setBanner({ ok: res.ok, text: res.message })
  }

  function handleIssueCredit(invoiceId: string) {
    const res = issueCreditAdjustmentInvoice(
      invoiceId,
      creditAmount,
      creditReason.trim()
    )
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) {
      setCreditInvoiceId(null)
      setCreditReason('')
    }
  }

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${banner.ok
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

      {/* Top Row: Effective-Dated Contracts & Invoice Draft Generator (F1-044..F1-047) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              F1-044 • Contract Terms & Effective-Dated Rate Versions
            </span>
            <h3 className="text-sm font-bold text-white mt-0.5">
              {contractPolicy.clientName} - Master Services Rate Card
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Billing closes using the historical rate in effect on each segment's work date (Acceptance Scenario 6).
            </p>
          </div>

          <div className="space-y-2">
            {contractPolicy.rateVersions.map((rv) => (
              <div
                key={rv.id}
                className="rounded-lg border border-slate-800 bg-slate-950/90 p-3 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <div className="text-white font-semibold">{rv.label}</div>
                  <div className="text-[11px] text-slate-400">
                    Effective: {rv.effectiveFrom} → {rv.effectiveTo ?? 'Open-Ended'}
                  </div>
                </div>
                <span className="text-sm font-bold text-emerald-300">
                  ${rv.hourlyRate}/hr {rv.currency}
                </span>
              </div>
            ))}
          </div>

          {/* Add Effective-Dated Rate Version Form (F1-044) */}
          <form
            onSubmit={handleAddRateVersion}
            className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2 text-xs"
          >
            <div className="font-semibold text-emerald-300">
              + Add Effective-Dated Rate Version (F1-044)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Label (e.g. Q4 Amendment)"
                value={rateLabel}
                onChange={(e) => setRateLabel(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white"
                required
              />
              <input
                type="number"
                min={1}
                placeholder="Hourly Rate"
                value={rateHourly}
                onChange={(e) => setRateHourly(Number(e.target.value))}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white font-mono"
                required
              />
              <input
                type="date"
                value={rateEffectiveFrom}
                onChange={(e) => setRateEffectiveFrom(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white font-mono"
                required
              />
              <input
                type="date"
                placeholder="End Date (optional)"
                value={rateEffectiveTo}
                onChange={(e) => setRateEffectiveTo(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-semibold cursor-pointer"
            >
              Add Contract Rate Snapshot
            </button>
          </form>

          {/* Workspace Billing & Rounding Policy (F1-005) */}
          <div className="pt-2 border-t border-slate-800 space-y-2.5 text-xs">
            <div className="font-semibold text-slate-300">
              Workspace Invoice & Rounding Configuration (F1-005)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Time Rounding Rule
                </label>
                <select
                  value={activeTenant.roundingRule}
                  onChange={(e) =>
                    updateTenantSettings({
                      roundingRule: e.target.value as RoundingRule,
                    })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                >
                  <option value="none">Exact Minutes (none)</option>
                  <option value="nearest_5m">Nearest 5 Minutes</option>
                  <option value="nearest_6m">Nearest 6 Minutes (0.1h)</option>
                  <option value="nearest_15m">Nearest 15 Minutes (0.25h)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Paid Break / Day (Mins)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={activeTenant.paidBreakMinutesPerDay}
                  onChange={(e) =>
                    updateTenantSettings({
                      paidBreakMinutesPerDay: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Invoice Draft Generator & Locked Invoices (F1-045, F1-046, F1-047) */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                F1-045 / F1-046 / F1-047 • Invoice Drafts, Locking & Export
              </span>
              <h3 className="text-sm font-bold text-white mt-0.5">
                Approved Time × Snapshot Contract Rate Ledger
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs">
            <div className="flex-1 min-w-48">
              <label className="block text-[11px] text-slate-400 mb-1">
                Select Project to Invoice
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name} ({p.clientName})
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="block text-[11px] text-slate-400 mb-1">
                Tax Rate (%)
              </label>
              <input
                type="number"
                step={0.5}
                min={0}
                max={30}
                value={taxPercent}
                onChange={(e) => setTaxPercent(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerateInvoice}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white cursor-pointer"
            >
              + Generate Invoice Draft
            </button>
          </div>

          {invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
              Click <strong>+ Generate Invoice Draft</strong> above to compile approved timesheet lines using their historical contract rate snapshots.
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-indigo-300 mr-2">
                        {inv.invoiceNumber}
                      </span>
                      <span className="font-semibold text-white">
                        {inv.clientName} - {inv.projectName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${inv.status === 'finalized_locked'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                            : 'bg-amber-950 text-amber-300 border-amber-700'
                          }`}
                      >
                        {inv.status === 'finalized_locked'
                          ? '🔒 Finalized & Period Locked'
                          : 'Draft Invoice'}
                      </span>
                      {inv.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => lockInvoice(inv.id)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                        >
                          Lock Period & Finalize (F1-047)
                        </button>
                      )}
                      {inv.status === 'finalized_locked' && (
                        <button
                          type="button"
                          onClick={() =>
                            setCreditInvoiceId(
                              creditInvoiceId === inv.id ? null : inv.id
                            )
                          }
                          className="px-2.5 py-1 rounded border border-amber-700 bg-amber-950/60 hover:bg-amber-900/60 text-amber-200 font-semibold cursor-pointer"
                        >
                          Credit / Rebill (F1-047)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-2.5 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium cursor-pointer"
                      >
                        🖨 Print / PDF (F1-046)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportCsv(inv.id)}
                        className="px-2.5 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium cursor-pointer"
                      >
                        ⬇ Export CSV (F1-046)
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800/70 border-t border-b border-slate-800 py-1 font-mono text-[11px]">
                    {inv.lines.map((line) => (
                      <div
                        key={line.lineId}
                        className="py-1.5 flex items-center justify-between text-slate-300"
                      >
                        <span>
                          {line.workDate} • {line.taskCode}: {line.description}
                        </span>
                        <span>
                          {line.approvedMinutes}m @ ${line.hourlyRate}/hr ={' '}
                          <strong className="text-white">
                            ${line.amount.toFixed(2)}
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between font-mono text-xs pt-1">
                    <span className="text-slate-400">
                      Total Approved: {inv.totalApprovedMinutes} mins
                    </span>
                    <div className="space-x-4">
                      <span className="text-slate-400">
                        Subtotal: ${inv.subtotalAmount.toFixed(2)}
                      </span>
                      <span className="text-slate-400">
                        Tax ({inv.taxPercent}%): ${inv.taxAmount.toFixed(2)}
                      </span>
                      <span className="text-emerald-300 font-bold text-sm">
                        Total: ${inv.totalAmount.toFixed(2)} {inv.currency}
                      </span>
                    </div>
                  </div>

                  {creditInvoiceId === inv.id && (
                    <div className="rounded-lg border border-amber-800/80 bg-amber-950/25 p-3 space-y-2 text-xs">
                      <div className="font-semibold text-amber-200">
                        Issue Credit Note Against Locked Invoice (F1-047)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(Number(e.target.value))}
                          placeholder="Credit USD"
                          className="rounded border border-amber-700 bg-slate-900 px-2.5 py-1.5 text-white font-mono"
                        />
                        <input
                          type="text"
                          value={creditReason}
                          onChange={(e) => setCreditReason(e.target.value)}
                          placeholder="Mandatory adjustment reason"
                          className="sm:col-span-2 rounded border border-amber-700 bg-slate-900 px-2.5 py-1.5 text-white"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCreditInvoiceId(null)}
                          className="px-3 py-1 rounded border border-slate-700 text-slate-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleIssueCredit(inv.id)}
                          className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                        >
                          Confirm Credit Adjustment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Team, Roles & Granular Permissions (RBAC) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <RolesAndPermissionsManager />
      </div>

      <div className="grid grid-cols-1 gap-6">

        {/* Immutable Security & Governance Audit Log (F1-007) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                F1-007 • Immutable Security & Governance Audit Log
              </span>
              <h3 className="text-sm font-bold text-white mt-0.5">
                Append-Only Traceability Ledger (`audit_entries`)
              </h3>
            </div>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              {auditLogs.length} entries
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {auditLogs.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-slate-800 bg-slate-950/90 p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="font-bold text-indigo-300">
                    {entry.actionType}
                  </span>
                  <span className="text-slate-500">{entry.timestamp}</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Actor: <span className="text-slate-200">{entry.actorName}</span> ({entry.actorRole}) • Target:{' '}
                  <span className="text-emerald-300">{entry.targetEntity}</span>
                </div>
                <p className="text-slate-300 text-xs">{entry.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

