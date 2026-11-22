import { usePhase4Store } from '@/context/Phase4Store'
import { PHASE4_PLAN_CATALOG } from '@/lib/phase4/saasBilling'

const CARD_CLS =
  'rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-sm p-5'

export function UsageAndReceiptsPanel() {
  const { subscription, saasInvoices, usageSnapshot, quotaReport } = usePhase4Store()
  const currentPlanSpec = PHASE4_PLAN_CATALOG[subscription.planTier]

  return (
    <div className="space-y-6">
      {/* Top Usage KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={CARD_CLS}>
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            Current Plan
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-lg font-bold text-zinc-900 dark:text-white">
              {currentPlanSpec.displayName}
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-emerald-700 dark:text-emerald-300">
              {subscription.status}
            </span>
          </div>
        </div>

        <div className={CARD_CLS}>
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            Active Seats
          </div>
          <div className="mt-1.5 text-lg font-bold font-mono text-zinc-900 dark:text-white">
            {usageSnapshot.activeSeats}{' '}
            <span className="text-xs font-normal text-zinc-400">
              / {currentPlanSpec.maxSeats}
            </span>
          </div>
        </div>

        <div className={CARD_CLS}>
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            Active Projects
          </div>
          <div className="mt-1.5 text-lg font-bold font-mono text-zinc-900 dark:text-white">
            {usageSnapshot.activeProjects}{' '}
            <span className="text-xs font-normal text-zinc-400">
              / {currentPlanSpec.maxActiveProjects}
            </span>
          </div>
        </div>

        <div className={CARD_CLS}>
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            API &amp; Webhooks Today
          </div>
          <div className="mt-1.5 text-lg font-bold font-mono text-zinc-900 dark:text-white">
            {usageSnapshot.apiRequestsCount}{' '}
            <span className="text-xs font-normal text-zinc-400">
              calls · {usageSnapshot.webhookDeliveriesCount} webhooks
            </span>
          </div>
        </div>
      </div>

      {quotaReport.alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-1 text-xs text-amber-800 dark:text-amber-200">
          {quotaReport.alerts.map((a, idx) => (
            <div key={idx}>{a}</div>
          ))}
        </div>
      )}

      {/* Usage Limits + Platform Receipts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`lg:col-span-6 ${CARD_CLS} space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Workspace Usage Limits
            </h3>
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              Quota Protection On
            </span>
          </div>

          <div className="space-y-3.5">
            {quotaReport.metrics.map((m) => (
              <div key={m.key} className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {m.label}
                  </span>
                  <span className="font-mono text-zinc-600 dark:text-zinc-400">
                    {m.used.toLocaleString()} / {m.limit.toLocaleString()} ({m.percent}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      m.state === 'overage_graceful'
                        ? 'bg-rose-500'
                        : m.state === 'warning_80'
                          ? 'bg-amber-400'
                          : 'bg-[#702fe3]'
                    }`}
                    style={{ width: `${Math.min(100, m.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`lg:col-span-6 ${CARD_CLS} space-y-4`}>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Platform Billing Receipts
          </h3>

          {saasInvoices.length === 0 ? (
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-6 text-xs text-zinc-500 dark:text-zinc-400 text-center">
              No subscription receipts yet. Switch or renew a plan in Plans &amp; Upgrade to generate one.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {saasInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3.5 py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-zinc-900 dark:text-white">
                        {inv.invoiceNumber}
                      </span>
                      <span className="rounded-md bg-[#6d25da]/10 dark:bg-[#6d25da]/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#581eae] dark:text-[#c5a8f0]">
                        {inv.planTier}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {inv.billingPeriodLabel} · {inv.seatsBilled} seat(s) · {inv.status}
                    </div>
                  </div>
                  <div className="text-sm font-bold font-mono text-zinc-900 dark:text-white shrink-0">
                    {inv.currency} {(inv.totalCents / 100).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
