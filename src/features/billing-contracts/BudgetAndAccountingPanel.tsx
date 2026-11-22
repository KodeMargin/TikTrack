import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase4Store } from '@/context/Phase4Store'
import {
  buildQuickBooksInvoicePayload,
  buildXeroInvoiceCsv,
} from '@/lib/phase4/ecosystemConnectors'

const RISK_BADGE: Record<string, { label: string; cls: string }> = {
  on_track: {
    label: 'On Track',
    cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20',
  },
  watch: {
    label: 'Watch',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20',
  },
  over_estimate: {
    label: 'Over Budget',
    cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20',
  },
}

const CARD_CLS =
  'rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-sm p-5'

export function BudgetAndAccountingPanel({
  onFeedback,
}: {
  onFeedback?: (msg: { ok: boolean; text: string }) => void
}) {
  const { activeTenant, invoices } = usePhase1Store()
  const { connectors, projectForecasts, toggleEcosystemConnector } = usePhase4Store()
  const [accountingPreview, setAccountingPreview] = useState('')

  function downloadTextFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Project Budget Forecast */}
      <section className={`${CARD_CLS} space-y-4`}>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          Project Budget Forecast
        </h3>

        {projectForecasts.length === 0 ? (
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No projects yet. Create a project in Projects &amp; Tasks to track budget forecasts.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 pr-4">Project</th>
                  <th className="py-2.5 pr-4 text-right">Estimate Accuracy</th>
                  <th className="py-2.5 pr-4 text-right">Approved Cost</th>
                  <th className="py-2.5 pr-4 text-right">Pending Review</th>
                  <th className="py-2.5 pr-4 text-right">Remaining Estimate</th>
                  <th className="py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {projectForecasts.map((f) => {
                  const badge = RISK_BADGE[f.riskLevel] ?? RISK_BADGE.on_track
                  return (
                    <tr key={f.projectId} className="text-zinc-800 dark:text-zinc-200">
                      <td className="py-3 pr-4">
                        <span className="font-mono font-semibold text-[#6d25da] dark:text-[#c5a8f0] mr-2">
                          {f.projectCode}
                        </span>
                        <span className="font-medium text-zinc-900 dark:text-white">
                          {f.projectName}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {f.estimateAccuracyPercent}%
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {activeTenant.currency} {f.approvedSpendAmount.toFixed(2)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-amber-700 dark:text-amber-300">
                        {activeTenant.currency} {f.unreviewedExposureAmount.toFixed(2)} (
                        {(f.unreviewedExposureMinutes / 60).toFixed(1)}h)
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {activeTenant.currency} {f.projectedRemainingCost.toFixed(2)}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Accounting Software & Exports */}
      <section className={`${CARD_CLS} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Accounting Software &amp; Exports
          </h3>
          <div className="flex items-center gap-2">
            {(['xero', 'quickbooks'] as const).map((prov) => {
              const connected = connectors.some(
                (c) => c.provider === prov && c.status === 'connected'
              )
              return (
                <button
                  key={prov}
                  type="button"
                  onClick={() => {
                    const res = toggleEcosystemConnector({
                      category: 'accounting',
                      provider: prov,
                      displayName: prov === 'xero' ? 'Xero Accounting' : 'QuickBooks Online',
                      syncConfig: { accountCode: '200', taxType: 'OUTPUT' },
                    })
                    onFeedback?.({ ok: res.ok, text: res.message })
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition cursor-pointer ${
                    connected
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30'
                      : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      connected ? 'bg-emerald-500' : 'bg-zinc-400'
                    }`}
                  />
                  {prov === 'xero' ? 'Xero' : 'QuickBooks'}: {connected ? 'Connected' : 'Connect'}
                </button>
              )
            })}
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No client invoices yet. Generate an invoice in the Rates &amp; Invoices tab to export it to Xero or QuickBooks.
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    {inv.invoiceNumber}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {' '}
                    · {inv.clientName} · {inv.currency} {inv.totalAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const csv = buildXeroInvoiceCsv(inv)
                      setAccountingPreview(csv)
                      downloadTextFile(`${inv.invoiceNumber}-xero.csv`, csv, 'text/csv')
                    }}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 font-semibold transition cursor-pointer"
                  >
                    Xero CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const qb = JSON.stringify(buildQuickBooksInvoicePayload(inv), null, 2)
                      setAccountingPreview(qb)
                      downloadTextFile(
                        `${inv.invoiceNumber}-quickbooks.json`,
                        qb,
                        'application/json'
                      )
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white font-semibold transition cursor-pointer"
                  >
                    QuickBooks JSON
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {accountingPreview && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              <span>Last Export Preview</span>
              <button
                type="button"
                onClick={() => setAccountingPreview('')}
                className="underline cursor-pointer"
              >
                Hide
              </button>
            </div>
            <pre className="rounded-xl bg-zinc-50 dark:bg-zinc-950 ring-1 ring-zinc-200 dark:ring-zinc-800 p-3 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 overflow-x-auto max-h-48">
              {accountingPreview}
            </pre>
          </div>
        )}
      </section>
    </div>
  )
}
