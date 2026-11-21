import { useState } from 'react'
import {
  usePhase1Store,
  type PaymentCalculationMode,
} from '@/context/Phase1Store'

const MODE_OPTIONS: {
  id: PaymentCalculationMode
  title: string
  badge: string
  description: string
}[] = [
  {
    id: 'user_wise',
    title: 'User-Wise Payments',
    badge: 'Salary / Personal Rate',
    description:
      'Each developer has their own configured hourly rate, monthly retainer, or milestone plan. No client billing rates leak to staff.',
  },
  {
    id: 'task_wise',
    title: 'Task-Wise Payments',
    badge: 'Per-Task Bounty / Rate',
    description:
      'Configure a fixed bounty or dedicated hourly rate per task. Developers earn based on the specific tasks they complete or log approved time on.',
  },
  {
    id: 'hybrid',
    title: 'Hybrid (User + Task)',
    badge: 'Flexible Override',
    description:
      'Uses each developer’s personal rate by default, while allowing task-specific bounties or rates to override when configured.',
  },
]

export function PaymentModeConfigCard({
  onSaved,
}: {
  onSaved?: (res: { ok: boolean; message: string }) => void
}) {
  const {
    activeUser,
    workspacePaymentPolicy,
    updateWorkspacePaymentPolicy,
    hasPermission,
  } = usePhase1Store()

  const canConfigure =
    activeUser.role === 'super_admin' ||
    activeUser.role === 'tenant_owner' ||
    hasPermission('payment:configure')

  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  function applyPatch(patch: Parameters<typeof updateWorkspacePaymentPolicy>[0]) {
    if (!canConfigure) return
    const res = updateWorkspacePaymentPolicy(patch)
    setNotice({ ok: res.ok, text: res.message })
    onSaved?.(res)
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            Payment Calculation Mode &amp; Visibility
          </h3>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]">
            Workspace Config
          </span>
        </div>

        <span className="text-[11px] text-zinc-400 font-mono">
          Updated by {workspacePaymentPolicy.updatedBy}
        </span>
      </div>

      {notice && (
        <div
          className={`dp-view-enter rounded-xl px-3.5 py-2.5 text-xs font-medium flex items-center justify-between ring-1 ${
            notice.ok
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 ring-emerald-500/25'
              : 'bg-rose-500/10 text-rose-800 dark:text-rose-200 ring-rose-500/25'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-3 underline font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3 Interactive Mode Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {MODE_OPTIONS.map((opt) => {
          const selected = workspacePaymentPolicy.paymentMode === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!canConfigure}
              onClick={() => applyPatch({ paymentMode: opt.id })}
              className={`group rounded-2xl p-4 text-left space-y-2 transition-all duration-150 ${
                !canConfigure ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-[0.99]'
              } ${
                selected
                  ? 'bg-[#6d25da]/[0.07] dark:bg-[#6d25da]/20 ring-2 ring-[#6d25da] dark:ring-[#a87ce9] shadow-xs'
                  : 'bg-zinc-50/90 dark:bg-white/[0.03] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] hover:ring-[#6d25da]/35'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-900 dark:text-white">
                  {opt.title}
                </span>
                <span
                  className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 transition ${
                    selected
                      ? 'bg-[#6d25da] text-white'
                      : 'ring-1 ring-zinc-300 dark:ring-zinc-600'
                  }`}
                >
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div className="inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-white/90 dark:bg-white/[0.07] text-[#581eae] dark:text-[#c5a8f0]">
                {opt.badge}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {opt.description}
              </p>
            </button>
          )
        })}
      </div>

      {/* Feature Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zinc-100 dark:border-white/[0.06] text-xs">
        <label
          className={`flex items-start justify-between gap-3 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-3 ${
            canConfigure ? 'cursor-pointer hover:bg-zinc-100/80 dark:hover:bg-white/[0.05]' : 'opacity-60'
          } transition`}
        >
          <div className="space-y-0.5">
            <div className="font-semibold text-zinc-900 dark:text-white">
              Hide Client Billing Rates from Developers
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Developers without billing permission see hours &amp; status on Timesheets, never client charge rates.
            </div>
          </div>
          <input
            type="checkbox"
            disabled={!canConfigure}
            checked={workspacePaymentPolicy.hideClientBillingRatesFromDevelopers}
            onChange={(e) =>
              applyPatch({
                hideClientBillingRatesFromDevelopers: e.target.checked,
              })
            }
            className="mt-1 h-4 w-4 accent-[#6d25da] cursor-pointer"
          />
        </label>

        <label
          className={`flex items-start justify-between gap-3 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-3 ${
            canConfigure ? 'cursor-pointer hover:bg-zinc-100/80 dark:hover:bg-white/[0.05]' : 'opacity-60'
          } transition`}
        >
          <div className="space-y-0.5">
            <div className="font-semibold text-zinc-900 dark:text-white">
              Show Per-Task Breakdown in My Payments
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Display individual logged task lines &amp; calculated payouts in the user&apos;s read-only statement.
            </div>
          </div>
          <input
            type="checkbox"
            disabled={!canConfigure}
            checked={workspacePaymentPolicy.showTaskBreakdownToUsers}
            onChange={(e) =>
              applyPatch({ showTaskBreakdownToUsers: e.target.checked })
            }
            className="mt-1 h-4 w-4 accent-[#6d25da] cursor-pointer"
          />
        </label>
      </div>
    </section>
  )
}
