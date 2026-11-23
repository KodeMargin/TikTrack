import { useMemo, useState } from 'react'
import { notifyFeedback } from '@/lib/notify'
import { usePhase1Store } from '@/context/Phase1Store'
import type { RoundingRule } from '@/types/domain.types'
import { BudgetAndAccountingPanel } from '@/features/billing-contracts/BudgetAndAccountingPanel'

function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function BillingAndAdminView() {
  const {
    activeTenant,
    activeUser,
    updateTenantSettings,
    projects,
    contractPolicy,
    addContractRateVersion,
    invoices,
    generateInvoiceFromApproved,
    lockInvoice,
    issueCreditAdjustmentInvoice,
    hasPermission,
  } = usePhase1Store()

  const isSuperOrOwner =
    activeUser.role === 'super_admin' || activeUser.role === 'tenant_owner'
  const canManageRates = isSuperOrOwner || hasPermission('billing:manage_rates')
  const canCreateInvoice = isSuperOrOwner || hasPermission('invoice:create_draft')
  const canLockInvoice = isSuperOrOwner || hasPermission('invoice:lock_finalize')
  const canIssueCredit = isSuperOrOwner || hasPermission('invoice:credit_adjust')

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ''
  )
  const [taxPercent, setTaxPercent] = useState<number>(8.5)
  const [rateLabel, setRateLabel] = useState('')
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState('2026-11-16')
  const [rateEffectiveTo, setRateEffectiveTo] = useState('')
  const [rateHourly, setRateHourly] = useState<number>(155)
  const [showAddRateForm, setShowAddRateForm] = useState(false)
  const [creditInvoiceId, setCreditInvoiceId] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState<number>(125)
  const [creditReason, setCreditReason] = useState('')
  const [billingTab, setBillingTab] = useState<'invoicing' | 'accounting'>('invoicing')
  const setBanner = notifyFeedback

  const summary = useMemo(() => {
    const latestRate =
      contractPolicy.rateVersions[contractPolicy.rateVersions.length - 1] ?? null
    let totalInvoiced = 0
    let draftCount = 0
    let lockedCount = 0
    for (const inv of invoices) {
      totalInvoiced += inv.totalAmount
      if (inv.status === 'draft') draftCount += 1
      if (inv.status === 'finalized_locked') lockedCount += 1
    }
    return { latestRate, totalInvoiced, draftCount, lockedCount }
  }, [contractPolicy.rateVersions, invoices])

  function handleGenerateInvoice() {
    const projId = selectedProjectId || projects[0]?.id
    if (!projId) return
    const res = generateInvoiceFromApproved(projId, taxPercent)
    setBanner({ ok: res.ok, text: res.message })
  }

  function handleExportCsv(invoiceId: string) {
    const inv = invoices.find((i) => i.id === invoiceId)
    if (!inv) return

    const header =
      'Date,Task,Description,ApprovedMinutes,HourlyRate,Amount\n'
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
      setShowAddRateForm(false)
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
      {/* Header + Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            Client Billing &amp; Invoices
          </h2>
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
            {contractPolicy.clientName} · {activeTenant.currency}
          </span>
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900/90 p-1">
          {[
            { id: 'invoicing' as const, label: 'Rates & Invoices' },
            { id: 'accounting' as const, label: 'Budget & Accounting' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setBillingTab(t.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                billingTab === t.id
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {billingTab === 'accounting' ? (
        <BudgetAndAccountingPanel />
      ) : (
        <div className="space-y-6">
      {/* First-Sight 4-Card Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/20 dark:ring-[#8b51e1]/30 p-4 space-y-1">
          <div className="text-xs font-semibold text-[#581eae] dark:text-[#c5a8f0]">
            Active Client Rate
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            {summary.latestRate
              ? `$${summary.latestRate.hourlyRate}/hr`
              : 'Not set'}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Total Billed
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
            ${summary.totalInvoiced.toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Draft Invoices
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {summary.draftCount}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Locked Invoices
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {summary.lockedCount}
          </div>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Client Rates + Rounding Rules */}
        <div className="lg:col-span-5 space-y-5">
          {/* Client Rate Cards */}
          <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                Client Rate Cards
              </h3>
              {canManageRates && (
                <button
                  type="button"
                  onClick={() => setShowAddRateForm((v) => !v)}
                  className="px-3 py-1 rounded-lg bg-[#6d25da]/10 hover:bg-[#6d25da]/15 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] text-xs font-semibold transition cursor-pointer"
                >
                  {showAddRateForm ? 'Close' : '+ New Rate'}
                </button>
              )}
            </div>

            {showAddRateForm && canManageRates && (
              <form
                onSubmit={handleAddRateVersion}
                className="dp-view-enter rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3.5 space-y-2.5 text-xs"
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                      Rate Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Q1 2027 Rate"
                      value={rateLabel}
                      onChange={(e) => setRateLabel(e.target.value)}
                      className="w-full rounded-xl px-3 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                      Hourly Rate ({activeTenant.currency})
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={rateHourly}
                      onChange={(e) => setRateHourly(Number(e.target.value))}
                      className="w-full rounded-xl px-3 py-2 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={rateEffectiveFrom}
                      onChange={(e) => setRateEffectiveFrom(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                      End Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={rateEffectiveTo}
                      onChange={(e) => setRateEffectiveTo(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold cursor-pointer transition shadow-xs"
                >
                  Save Rate
                </button>
              </form>
            )}

            <div className="space-y-2">
              {contractPolicy.rateVersions.length === 0 ? (
                <p className="text-xs text-zinc-400 py-2">No client rates added yet.</p>
              ) : (
                contractPolicy.rateVersions.map((rv) => (
                  <div
                    key={rv.id}
                    className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-900 dark:text-white truncate">
                        {rv.label}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                        {rv.effectiveFrom} → {rv.effectiveTo ?? 'Ongoing'}
                      </div>
                    </div>
                    <span className="text-sm font-bold font-mono text-[#6d25da] dark:text-[#c5a8f0] shrink-0">
                      ${rv.hourlyRate}/hr
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Billing Rules */}
          <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5 text-xs">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Rounding &amp; Break Rules
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Time Rounding
                </label>
                <select
                  value={activeTenant.roundingRule}
                  disabled={!canManageRates}
                  onChange={(e) =>
                    updateTenantSettings({
                      roundingRule: e.target.value as RoundingRule,
                    })
                  }
                  className="w-full rounded-xl px-3 py-2"
                >
                  <option value="none">Exact Minutes</option>
                  <option value="nearest_5m">Nearest 5 mins</option>
                  <option value="nearest_6m">Nearest 6 mins (0.1h)</option>
                  <option value="nearest_15m">Nearest 15 mins</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Paid Break / Day (mins)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  disabled={!canManageRates}
                  value={activeTenant.paidBreakMinutesPerDay}
                  onChange={(e) =>
                    updateTenantSettings({
                      paidBreakMinutesPerDay: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl px-3 py-2 font-mono"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column (7 cols): Create Invoice + Invoice List */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Client Invoices
            </h3>
            <span className="text-xs font-mono text-zinc-400">
              {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
            </span>
          </div>

          {canCreateInvoice && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-4 text-xs">
              <div className="flex-1 min-w-44">
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-xl px-3 py-2"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name} ({p.clientName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Tax (%)
                </label>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={30}
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                  className="w-full rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateInvoice}
                className="px-4 py-2 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] font-semibold text-white cursor-pointer shadow-xs transition shrink-0"
              >
                + Create Invoice
              </button>
            </div>
          )}

          {invoices.length === 0 ? (
            <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No client invoices created yet.
            </div>
          ) : (
            <div className="space-y-3.5">
              {invoices.map((inv) => {
                const statusBadge =
                  inv.status === 'finalized_locked'
                    ? {
                        label: '🔒 Locked',
                        cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
                      }
                    : inv.status === 'credited_adjusted'
                      ? {
                          label: 'Credit Note',
                          cls: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
                        }
                      : {
                          label: 'Draft',
                          cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                        }

                return (
                  <article
                    key={inv.id}
                    className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-4 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                          {inv.invoiceNumber}
                        </span>
                        <span className="font-bold text-zinc-900 dark:text-white">
                          {inv.clientName} · {inv.projectName}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge.cls}`}
                        >
                          {statusBadge.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {inv.status === 'draft' && canLockInvoice && (
                          <button
                            type="button"
                            onClick={() => lockInvoice(inv.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer transition"
                          >
                            Finalize &amp; Lock
                          </button>
                        )}
                        {inv.status === 'finalized_locked' && canIssueCredit && (
                          <button
                            type="button"
                            onClick={() =>
                              setCreditInvoiceId(
                                creditInvoiceId === inv.id ? null : inv.id
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-200 font-semibold cursor-pointer transition"
                          >
                            Issue Credit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/[0.07] hover:bg-zinc-100 dark:hover:bg-white/[0.12] text-zinc-700 dark:text-zinc-200 font-medium cursor-pointer transition"
                        >
                          Print / PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportCsv(inv.id)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-white/[0.07] hover:bg-zinc-100 dark:hover:bg-white/[0.12] text-zinc-700 dark:text-zinc-200 font-medium cursor-pointer transition"
                        >
                          CSV
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-zinc-200/70 dark:divide-white/[0.06] border-t border-b border-zinc-200/70 dark:border-white/[0.06] py-1 font-mono text-[11px]">
                      {inv.lines.map((line) => (
                        <div
                          key={line.lineId}
                          className="py-1.5 flex items-center justify-between gap-2 text-zinc-700 dark:text-zinc-300"
                        >
                          <span className="truncate">
                            {line.workDate} · {line.taskCode}: {line.description}
                          </span>
                          <span className="shrink-0">
                            {formatDuration(line.approvedMinutes)} @ ${line.hourlyRate}/hr ={' '}
                            <strong className="text-zinc-900 dark:text-white">
                              ${line.amount.toFixed(2)}
                            </strong>
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Approved: {formatDuration(inv.totalApprovedMinutes)}
                      </span>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          Subtotal: ${inv.subtotalAmount.toFixed(2)}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          Tax ({inv.taxPercent}%): ${inv.taxAmount.toFixed(2)}
                        </span>
                        <span className="font-bold text-sm text-zinc-900 dark:text-white">
                          ${inv.totalAmount.toFixed(2)} {inv.currency}
                        </span>
                      </div>
                    </div>

                    {creditInvoiceId === inv.id && (
                      <div className="dp-view-enter rounded-xl bg-amber-500/10 ring-1 ring-amber-500/25 p-3.5 space-y-2.5 text-xs">
                        <div className="font-bold text-amber-800 dark:text-amber-200">
                          Issue Credit Note
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={creditAmount}
                            onChange={(e) => setCreditAmount(Number(e.target.value))}
                            placeholder="Amount"
                            className="rounded-xl px-3 py-2 font-mono"
                          />
                          <input
                            type="text"
                            value={creditReason}
                            onChange={(e) => setCreditReason(e.target.value)}
                            placeholder="Reason for credit adjustment"
                            className="sm:col-span-2 rounded-xl px-3 py-2"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setCreditInvoiceId(null)}
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-300 font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleIssueCredit(inv.id)}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                          >
                            Confirm Credit
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
        </div>
      )}
    </div>
  )
}
