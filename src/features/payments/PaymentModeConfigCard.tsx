import { useState, type ReactNode } from 'react'
import {
  usePhase1Store,
  type PaymentCalculationMode,
} from '@/context/Phase1Store'

interface ModeOption {
  id: PaymentCalculationMode
  title: string
  tagline: string
  formula: string
  highlights: string[]
  icon: ReactNode
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'user_wise',
    title: 'User-Wise',
    tagline: 'Pay each team member by personal rate or salary',
    formula: 'Approved Hours × Personal Rate (or Monthly Salary) → Payout',
    highlights: ['Hourly or Monthly Salary', 'Personal bank / wallet details'],
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'task_wise',
    title: 'Task-Wise',
    tagline: 'Pay fixed bounties or rates assigned per task',
    formula: 'Completed Task Bounty or Task Hourly Rate → Payout',
    highlights: ['Fixed bounty per task', 'Task-specific hourly rate'],
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'hybrid',
    title: 'Hybrid (Both)',
    tagline: 'User rate by default, task rate overrides when set',
    formula: 'Task Rate (if set) else Personal Rate → Payout',
    highlights: ['Default personal rate', 'Custom bounty overrides'],
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
]

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d25da]/40 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${
        checked
          ? 'bg-[#6d25da]'
          : 'bg-zinc-200 dark:bg-white/15'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

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

  const activeOption =
    MODE_OPTIONS.find((m) => m.id === workspacePaymentPolicy.paymentMode) ??
    MODE_OPTIONS[0]

  function applyPatch(patch: Parameters<typeof updateWorkspacePaymentPolicy>[0]) {
    if (!canConfigure) return
    const res = updateWorkspacePaymentPolicy(patch)
    if (onSaved) {
      onSaved(res)
    } else {
      setNotice({ ok: res.ok, text: res.message })
    }
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 sm:p-6 space-y-5">
      {/* Top Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-zinc-900 dark:text-white">
          How Should Payments Be Calculated?
        </h3>
        <span className="text-[11px] font-mono text-zinc-400">
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

      {/* 3 Scannable Mode Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {MODE_OPTIONS.map((opt) => {
          const selected = workspacePaymentPolicy.paymentMode === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!canConfigure}
              onClick={() => applyPatch({ paymentMode: opt.id })}
              className={`group rounded-2xl p-4 sm:p-5 text-left space-y-3 transition-all duration-150 ${
                !canConfigure
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer hover:-translate-y-[1px] active:scale-[0.99]'
              } ${
                selected
                  ? 'bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/20 ring-2 ring-[#6d25da] dark:ring-[#a87ce9] shadow-[0_6px_20px_-8px_rgba(109,37,218,0.22)]'
                  : 'bg-zinc-50/90 dark:bg-white/[0.03] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.08] hover:ring-[#6d25da]/40'
              }`}
            >
              {/* Icon + Active Pill */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`h-10 w-10 rounded-xl flex items-center justify-center transition ${
                    selected
                      ? 'bg-[#6d25da] text-white shadow-sm shadow-[#6d25da]/30'
                      : 'bg-white dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] group-hover:text-[#6d25da]'
                  }`}
                >
                  {opt.icon}
                </span>

                {selected ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#6d25da] text-white text-[11px] font-semibold">
                    ✓ Active
                  </span>
                ) : (
                  <span className="h-4 w-4 rounded-full ring-1 ring-zinc-300 dark:ring-zinc-600 group-hover:ring-[#6d25da]/60 transition" />
                )}
              </div>

              {/* Title + Short Tagline */}
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-zinc-900 dark:text-white">
                  {opt.title}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {opt.tagline}
                </div>
              </div>

              {/* 2 Crisp Highlights */}
              <ul className="space-y-1 pt-1 text-xs text-zinc-700 dark:text-zinc-300">
                {opt.highlights.map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <span className="text-[#6d25da] dark:text-[#c5a8f0] font-bold">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      {/* Live Formula Bar */}
      <div className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-zinc-500 dark:text-zinc-400">
          Active Formula
        </span>
        <span className="font-mono font-semibold text-[#581eae] dark:text-[#c5a8f0]">
          {activeOption.formula}
        </span>
      </div>

      {/* Tactile Visibility Switches */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1 border-t border-zinc-100 dark:border-white/[0.06] text-xs">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-4 py-3.5">
          <div className="space-y-0.5">
            <div className="font-semibold text-zinc-900 dark:text-white">
              Hide Client Rates on Timesheets
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Developers only see hours &amp; status
            </div>
          </div>
          <ToggleSwitch
            label="Hide Client Rates on Timesheets"
            disabled={!canConfigure}
            checked={workspacePaymentPolicy.hideClientBillingRatesFromDevelopers}
            onChange={(next) =>
              applyPatch({ hideClientBillingRatesFromDevelopers: next })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-4 py-3.5">
          <div className="space-y-0.5">
            <div className="font-semibold text-zinc-900 dark:text-white">
              Show Task Breakdown in My Payments
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              List logged sessions inside read-only view
            </div>
          </div>
          <ToggleSwitch
            label="Show Task Breakdown in My Payments"
            disabled={!canConfigure}
            checked={workspacePaymentPolicy.showTaskBreakdownToUsers}
            onChange={(next) => applyPatch({ showTaskBreakdownToUsers: next })}
          />
        </div>
      </div>
    </section>
  )
}
