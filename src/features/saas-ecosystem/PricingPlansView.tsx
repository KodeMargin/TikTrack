import { useState } from 'react'
import { notifyFeedback } from '@/lib/notify'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase4Store } from '@/context/Phase4Store'
import {
  calculateSaasSubscriptionTotals,
  PHASE4_PLAN_CATALOG,
} from '@/lib/phase4/saasBilling'
import type { BillingProvider, SaasPlanTier } from '@/types/domain.types'
import { UsageAndReceiptsPanel } from '@/features/saas-ecosystem/UsageAndReceiptsPanel'

const TIERS_ORDER: SaasPlanTier[] = ['starter', 'team', 'agency', 'enterprise']

const TIER_HIGHLIGHTS: Record<SaasPlanTier, { label: string; highlight?: boolean }[]> = {
  starter: [
    { label: 'Core Focus Timer & Timesheets' },
    { label: 'Activity Timeline & Annotations' },
    { label: 'Disputes & 2nd Review Workflow' },
    { label: 'Privacy Denylist & DPIA Protection' },
    { label: 'Up to 5 Team Seats & 3 Projects' },
  ],
  team: [
    { label: 'Everything in Starter, plus:', highlight: true },
    { label: 'VS Code & JetBrains IDE Telemetry' },
    { label: 'GitHub Commit & Branch Correlation' },
    { label: 'Automated Rules Engine' },
    { label: 'AI Timesheet Drafts (150k tokens)' },
    { label: 'Outbound Webhooks & Jira/Linear Sync' },
  ],
  agency: [
    { label: 'Everything in Team, plus:', highlight: true },
    { label: 'Custom Workspace Branding' },
    { label: 'QuickBooks & Xero Accounting Sync' },
    { label: 'Signed Developer Work Reports' },
    { label: 'Priority Support (730d Retention)' },
  ],
  enterprise: [
    { label: 'Everything in Agency, plus:', highlight: true },
    { label: 'Unlimited Projects & 10,000+ Seats' },
    { label: 'Custom Granular Roles & Permissions' },
    { label: 'Dedicated API Rate Limits & Webhooks' },
    { label: 'Extended 7-Year Activity Retention' },
    { label: '99.99% SLA + Dedicated Support' },
  ],
}

interface FeatureRow {
  category: string
  name: string
  description?: string
  starter: string | boolean
  team: string | boolean
  agency: string | boolean
  enterprise: string | boolean
}

const COMPARISON_FEATURES: FeatureRow[] = [
  // Quotas & Capacity
  {
    category: 'Quotas & Retention',
    name: 'Team Seats Included',
    starter: 'Up to 5',
    team: 'Up to 25',
    agency: 'Up to 100',
    enterprise: '10,000+ (Custom)',
  },
  {
    category: 'Quotas & Retention',
    name: 'Active Projects',
    starter: '3 active',
    team: '25 active',
    agency: '100 active',
    enterprise: 'Unlimited',
  },
  {
    category: 'Quotas & Retention',
    name: 'Evidence Retention Window',
    starter: '90 Days',
    team: '365 Days (1 Year)',
    agency: '730 Days (2 Years)',
    enterprise: '2,555 Days (7 Years)',
  },
  {
    category: 'Quotas & Retention',
    name: 'Storage Quota',
    starter: '512 MB',
    team: '5 GB',
    agency: '25 GB',
    enterprise: '256 GB+',
  },
  {
    category: 'Quotas & Retention',
    name: 'Monthly Telemetry Events',
    starter: '50,000',
    team: '500,000',
    agency: '2,500,000',
    enterprise: '25,000,000',
  },

  // Telemetry & Evidence
  {
    category: 'Telemetry & Tracking',
    name: 'Core Focus Timer & Clock-In',
    starter: true,
    team: true,
    agency: true,
    enterprise: true,
  },
  {
    category: 'Telemetry & Tracking',
    name: 'Timesheet Approvals & Notes',
    starter: true,
    team: true,
    agency: true,
    enterprise: true,
  },
  {
    category: 'Telemetry & Tracking',
    name: 'VS Code & JetBrains Telemetry',
    starter: false,
    team: true,
    agency: true,
    enterprise: true,
  },
  {
    category: 'Telemetry & Tracking',
    name: 'GitHub Commit Correlation',
    starter: false,
    team: true,
    agency: true,
    enterprise: true,
  },
  {
    category: 'Telemetry & Tracking',
    name: 'Dispute & 2nd Review Workflow',
    starter: true,
    team: true,
    agency: true,
    enterprise: true,
  },

  // Verification & AI
  {
    category: 'Verification & AI',
    name: 'Automated Verification Rules',
    starter: 'Basic',
    team: 'Full Automated',
    agency: 'Full Automated',
    enterprise: 'Custom Rule Profiles',
  },
  {
    category: 'Verification & AI',
    name: 'AI Timesheet Draft Summaries (Gemini)',
    starter: false,
    team: '150k tokens/mo',
    agency: '750k tokens/mo',
    enterprise: '5M tokens/mo',
  },
  {
    category: 'Verification & AI',
    name: 'Developer Payout & Bank Tracking',
    starter: true,
    team: true,
    agency: true,
    enterprise: true,
  },

  // Client & Agency Operations
  {
    category: 'Client & Agency Tools',
    name: 'Custom Workspace Branding',
    starter: false,
    team: false,
    agency: true,
    enterprise: true,
  },
  {
    category: 'Client & Agency Tools',
    name: 'QuickBooks & Xero Invoicing',
    starter: false,
    team: false,
    agency: true,
    enterprise: true,
  },
  {
    category: 'Client & Agency Tools',
    name: 'Outbound Webhooks (Zapier/ERP)',
    starter: false,
    team: true,
    agency: true,
    enterprise: true,
  },

  // Security & Support
  {
    category: 'Access & Support',
    name: 'Custom RBAC Roles & Permissions',
    starter: false,
    team: true,
    agency: true,
    enterprise: true,
  },
  {
    category: 'Access & Support',
    name: 'Public API Keys & Rate Limits',
    starter: false,
    team: '120 req/min',
    agency: '600 req/min',
    enterprise: 'Custom',
  },
  {
    category: 'Access & Support',
    name: 'Workspace Privacy & Audit Log',
    starter: true,
    team: true,
    agency: true,
    enterprise: true,
  },
  {
    category: 'Access & Support',
    name: 'Dedicated SLA & Support',
    starter: 'Email',
    team: 'Standard',
    agency: 'Priority Email',
    enterprise: '99.99% SLA + Dedicated Manager',
  },
]

const FAQS = [
  {
    q: 'Can we switch between Monthly and Annual billing anytime?',
    a: 'Yes. When upgrading or switching to Annual billing, you immediately receive a 15% discount (equivalent to nearly 2 months free). Any unused credit from your previous cycle is prorated automatically.',
  },
  {
    q: 'How does per-seat pricing work?',
    a: 'Each active team member invited to your workspace counts towards your seat allocation. You only pay for active seats. Inactive or archived developers do not incur recurring seat fees.',
  },
  {
    q: 'What is Evidence Retention and why is it important?',
    a: 'Evidence retention guarantees that ground-truth telemetry (Git commit hashes, focus sessions, editor window titles, timesheet signatures) remains fully queryable and cryptographically auditable for client reviews, dispute resolution, or compliance.',
  },
  {
    q: 'What payment methods do you support?',
    a: 'We support Stripe (all major credit/debit cards), Paddle, and Wire Transfer / ACH invoicing for Agency and Enterprise annual accounts.',
  },
  {
    q: 'Do you offer custom Enterprise agreements?',
    a: 'Yes. For large organizations requiring custom seat limits, tailored invoicing terms, or dedicated support SLAs, our team can configure a custom plan.',
  },
]

export function PricingPlansView() {
  const { activeTenant, activeUser, isSuperAdminAccount } = usePhase1Store()
  const {
    subscription,
    usageSnapshot,
    checkoutSubscriptionPlan,
    requestSubscriptionUpgrade,
  } = usePhase4Store()

  const [pricingTab, setPricingTab] = useState<'plans' | 'usage'>('plans')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [calculatorSeats, setCalculatorSeats] = useState<number>(() =>
    Math.max(5, usageSnapshot.activeSeats || 5)
  )
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Upgrade Modal State
  const [modalTier, setModalTier] = useState<SaasPlanTier | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<BillingProvider>('paddle')
  const [requestMethod, setRequestMethod] = useState<'paddle' | 'payhere' | 'wire_transfer'>('paddle')
  const [upgradeNote, setUpgradeNote] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const setActionMessage = notifyFeedback

  const isOwnerOrAdmin =
    isSuperAdminAccount ||
    activeUser.role === 'super_admin' ||
    activeUser.role === 'tenant_owner' ||
    activeUser.role === 'finance'

  const canActivateDirectly = (tier: SaasPlanTier) =>
    isSuperAdminAccount || activeUser.role === 'super_admin' || tier === 'starter'

  const currentPlan = (activeTenant.planTier || 'starter') as SaasPlanTier

  function handleOpenCheckout(tier: SaasPlanTier) {
    if (!isOwnerOrAdmin) {
      setActionMessage({
        ok: false,
        text: 'Only Workspace Owners or Finance Administrators can change subscription plans.',
      })
      return
    }
    setUpgradeNote('')
    setModalTier(tier)
  }

  async function handleConfirmSubscription() {
    if (!modalTier) return
    setIsProcessing(true)
    try {
      if (canActivateDirectly(modalTier)) {
        const res = await checkoutSubscriptionPlan({
          planTier: modalTier,
          billingProvider: selectedProvider,
          billingCycle,
        })
        setActionMessage({
          ok: res.ok,
          text: res.ok
            ? `Successfully updated ${activeTenant.name} to ${modalTier.toUpperCase()} (${billingCycle})!`
            : res.message,
        })
        if (res.ok) setModalTier(null)
      } else {
        const res = await requestSubscriptionUpgrade({
          requestedPlanTier: modalTier,
          billingProvider: requestMethod,
          billingCycle,
          contactNote: upgradeNote,
        })
        setActionMessage({ ok: res.ok, text: res.message })
        if (res.ok) setModalTier(null)
      }
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Top Bar: Title + Plans vs Usage Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            Plan &amp; Usage
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/25 px-2.5 py-0.5 text-[11px] font-semibold text-[#581eae] dark:text-[#c5a8f0]">
            {PHASE4_PLAN_CATALOG[currentPlan].displayName} Plan · {usageSnapshot.activeSeats}/{PHASE4_PLAN_CATALOG[currentPlan].maxSeats} seats
          </span>
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900/90 p-1">
          {[
            { id: 'plans' as const, label: 'Plans & Upgrade' },
            { id: 'usage' as const, label: 'Usage & Receipts' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPricingTab(t.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                pricingTab === t.id
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {pricingTab === 'usage' ? (
        <UsageAndReceiptsPanel />
      ) : (
        <div className="space-y-10">
      {/* Header & Subtitle */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-300">
          <span className="w-2 h-2 rounded-full bg-[#702fe3] animate-pulse" />
          TikTrack Plans &amp; Subscriptions
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Predictable Pricing for High-Trust Engineering
        </h1>

        {/* Current Workspace Plan Pill */}
        <div className="pt-2">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 dark:bg-white/5 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 shadow-sm">
            <span>Workspace: <strong>{activeTenant.name}</strong></span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span>Current Tier: <strong className="uppercase text-indigo-600 dark:text-indigo-400">{currentPlan}</strong></span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span>Active Seats: <strong>{usageSnapshot.activeSeats}</strong> / {PHASE4_PLAN_CATALOG[currentPlan].maxSeats}</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="capitalize text-[#6d25da] dark:text-[#a87ce9] font-medium">
              {subscription.status} ({subscription.billingCycle})
            </span>
          </div>
        </div>

        {/* Billing Cycle Toggle */}
        <div className="pt-4 flex items-center justify-center gap-3">
          <span
            className={`text-xs sm:text-sm font-semibold cursor-pointer ${billingCycle === 'monthly'
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
              }`}
            onClick={() => setBillingCycle('monthly')}
          >
            Monthly Billing
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={billingCycle === 'annual'}
            onClick={() => setBillingCycle((prev) => (prev === 'monthly' ? 'annual' : 'monthly'))}
            className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#6d25da] ${billingCycle === 'annual' ? 'bg-[#702fe3]' : 'bg-slate-300 dark:bg-slate-700'
              }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${billingCycle === 'annual' ? 'translate-x-6' : 'translate-x-0'
                }`}
            />
          </button>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs sm:text-sm font-semibold cursor-pointer ${billingCycle === 'annual'
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
                }`}
              onClick={() => setBillingCycle('annual')}
            >
              Annual Billing
            </span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-bold tracking-wide">
              Save 15% (2 Mo Free)
            </span>
          </div>
        </div>
      </div>

      {/* 4 Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch pt-4">
        {TIERS_ORDER.map((tierKey) => {
          const spec = PHASE4_PLAN_CATALOG[tierKey]
          const isCurrent = currentPlan === tierKey
          const isTeam = tierKey === 'team'
          const isEnterprise = tierKey === 'enterprise'

          // Calculate price for 1 seat baseline or team's active seats
          const effectiveSeats = Math.max(1, usageSnapshot.activeSeats || 1)
          const totals = calculateSaasSubscriptionTotals(tierKey, effectiveSeats, billingCycle)

          // Monthly display base & per-seat
          const baseMonthly = (spec.baseMonthlyPriceCents / 100)
          const perSeatMonthly = (spec.perSeatPriceCents / 100)

          return (
            <div
              key={tierKey}
              className={`relative rounded-2xl flex flex-col justify-between transition-all duration-200 ${isTeam
                  ? 'border-2 border-[#6d25da] bg-white dark:bg-[#141418] shadow-xl shadow-[#6d25da]/10 dark:shadow-[#6d25da]/5'
                  : isCurrent
                    ? 'border-2 border-[#6d25da]/50 bg-zinc-50/60 dark:bg-zinc-900/40 shadow-md'
                    : 'border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141418] hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm'
                }`}
            >
              {/* Most Popular Badge */}
              {isTeam && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#6d25da] to-[#8b51e1] px-3 py-0.5 text-[10px] font-bold text-white shadow-sm uppercase tracking-wider z-10 pointer-events-none">
                  Most Popular
                </div>
              )}

              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white capitalize">
                      {spec.displayName}
                    </h3>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#6d25da]/10 text-[#6d25da] border border-[#6d25da]/30 dark:bg-[#6d25da]/20 dark:text-[#a87ce9] uppercase tracking-wide shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8b51e1]" />
                        Current Plan
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 h-9 leading-snug">
                    {spec.tagline}
                  </p>
                </div>

                {/* Price */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                      ${baseMonthly === 0 ? '0' : baseMonthly}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {baseMonthly === 0 ? 'forever' : '/month base'}
                    </span>
                  </div>
                  <div className="h-4 text-xs font-medium">
                    {perSeatMonthly > 0 ? (
                      <span className="text-indigo-600 dark:text-indigo-400">
                        + ${perSeatMonthly}/dev/month
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">Free forever</span>
                    )}
                  </div>
                  <div className="h-4 text-[11px]">
                    {billingCycle === 'annual' && baseMonthly > 0 ? (
                      <span className="text-[#6d25da] dark:text-[#a87ce9] font-semibold">
                        Billed annually (15% savings applied)
                      </span>
                    ) : null}
                  </div>
                  {effectiveSeats > 1 && baseMonthly > 0 && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                      Est. ${(totals.totalCents / 100).toFixed(0)}/{billingCycle === 'annual' ? 'yr' : 'mo'} for your {effectiveSeats} seats
                    </div>
                  )}
                </div>

                {/* Quick Quota Metrics */}
                <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] p-3 space-y-2 border border-slate-100 dark:border-white/5 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Max Team Seats:</span>
                    <strong className="font-semibold">{spec.maxSeats.toLocaleString()} seats</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Active Projects:</span>
                    <strong className="font-semibold">{spec.maxActiveProjects.toLocaleString()}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Evidence Retention:</span>
                    <strong className="font-semibold">{spec.retentionDays} Days</strong>
                  </div>
                </div>

                {/* Key Bullet Features */}
                <div className="space-y-2.5 text-xs">
                  <div className="font-semibold uppercase tracking-wider text-[10px] text-slate-400 dark:text-slate-500">
                    Included Capabilities
                  </div>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                    {TIER_HIGHLIGHTS[tierKey].map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2">
                        {feat.highlight ? (
                          <span className="font-bold text-slate-900 dark:text-white block pt-1 text-[11px] uppercase tracking-wider">
                            {feat.label}
                          </span>
                        ) : (
                          <>
                            <svg
                              className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            <span className="leading-tight">{feat.label}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Button */}
              <div className="p-6 pt-0">
                {isCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 text-xs font-bold text-center cursor-default"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenCheckout(tierKey)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${isTeam
                        ? 'bg-[#702fe3] hover:bg-[#5f21cc] text-white shadow-xs'
                        : isEnterprise
                          ? 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100'
                          : 'border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-white'
                      }`}
                  >
                    {isOwnerOrAdmin
                      ? `Select ${spec.displayName}`
                      : 'Ask Admin to Select'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Interactive Seat Calculator */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-[#0d111b] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-[#6d25da] dark:text-[#a87ce9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Team Cost Calculator
            </h2>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
              {calculatorSeats} Developers
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Active billable seats
            </div>
          </div>
        </div>

        {/* Range Slider */}
        <div className="space-y-2">
          <input
            type="range"
            min={1}
            max={150}
            value={calculatorSeats}
            onChange={(e) => setCalculatorSeats(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
            <span>1 seat</span>
            <span>25 seats</span>
            <span>50 seats</span>
            <span>100 seats</span>
            <span>150+ seats</span>
          </div>
        </div>

        {/* Calculated Tier Output Table */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS_ORDER.map((tierKey) => {
            const spec = PHASE4_PLAN_CATALOG[tierKey]
            const totals = calculateSaasSubscriptionTotals(tierKey, calculatorSeats, billingCycle)
            const isExceeded = calculatorSeats > spec.maxSeats

            return (
              <div
                key={tierKey}
                className={`p-4 rounded-xl border text-xs space-y-2 ${isExceeded
                    ? 'border-slate-200 bg-slate-100/50 opacity-50 dark:border-white/5 dark:bg-white/[0.02]'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold capitalize text-slate-900 dark:text-white">
                    {spec.displayName}
                  </span>
                  {isExceeded && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                      Max {spec.maxSeats} seats
                    </span>
                  )}
                </div>
                <div className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                  ${(totals.totalCents / 100).toFixed(0)}
                  <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                    /{billingCycle === 'annual' ? 'yr' : 'mo'}
                  </span>
                </div>
                {billingCycle === 'annual' && totals.discountCents > 0 && (
                  <div className="text-[10px] text-[#6d25da] dark:text-[#a87ce9]">
                    Includes ${(totals.discountCents / 100).toFixed(0)} annual discount
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Feature Comparison Matrix */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Feature Comparison
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d111b] shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                <th className="p-4 font-bold text-slate-700 dark:text-slate-200 w-1/3">
                  Capability / Feature
                </th>
                <th className="p-4 font-bold text-slate-700 dark:text-slate-200 text-center">
                  Starter
                </th>
                <th className="p-4 font-bold text-indigo-600 dark:text-indigo-400 text-center">
                  Team
                </th>
                <th className="p-4 font-bold text-[#6d25da] dark:text-[#a87ce9] text-center">
                  Agency
                </th>
                <th className="p-4 font-bold text-slate-900 dark:text-white text-center">
                  Enterprise
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {COMPARISON_FEATURES.map((row, idx) => {
                const isFirstOfCategory =
                  idx === 0 || COMPARISON_FEATURES[idx - 1].category !== row.category

                function renderCell(val: string | boolean) {
                  if (typeof val === 'boolean') {
                    return val ? (
                      <svg className="w-4 h-4 text-emerald-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 font-bold">-</span>
                    )
                  }
                  return <span className="font-medium text-slate-700 dark:text-slate-300">{val}</span>
                }

                return (
                  <tr
                    key={row.name}
                    className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition"
                  >
                    <td className="p-4">
                      {isFirstOfCategory && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
                          {row.category}
                        </div>
                      )}
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {row.name}
                      </div>
                    </td>
                    <td className="p-4 text-center">{renderCell(row.starter)}</td>
                    <td className="p-4 text-center bg-indigo-50/20 dark:bg-indigo-950/10">{renderCell(row.team)}</td>
                    <td className="p-4 text-center">{renderCell(row.agency)}</td>
                    <td className="p-4 text-center">{renderCell(row.enterprise)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Frequently Asked Questions (FAQ) Accordion */}
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => {
            const isOpen = openFaq === i
            return (
              <div
                key={faq.q}
                className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d111b] overflow-hidden transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="w-full p-4 text-left flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <svg
                    className={`w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#6d25da] dark:text-[#a87ce9]' : ''
                      }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-white/5 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
        </div>
      )}

      {/* Checkout / Upgrade Confirmation Modal */}
      {modalTier && (() => {
        const directMode = canActivateDirectly(modalTier)
        const isDowngradeToStarter = modalTier === 'starter'
        return (
          <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-[#6d25da]/30 bg-white dark:bg-[#13131a] p-6 shadow-2xl space-y-5 text-zinc-900 dark:text-white">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[#6d25da] dark:text-[#c5a8f0] font-bold">
                    {directMode
                      ? isSuperAdminAccount && !isDowngradeToStarter
                        ? 'Super Admin Direct Plan Activation'
                        : 'Confirm Subscription Change'
                      : 'Request Plan Upgrade'}
                  </div>
                  {isSuperAdminAccount && !isDowngradeToStarter && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#6d25da]/15 text-[#6d25da] dark:text-[#c5a8f0]">
                      Super Admin
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold">
                  {directMode
                    ? isDowngradeToStarter
                      ? 'Switch to Starter Plan ($0)'
                      : `Activate ${PHASE4_PLAN_CATALOG[modalTier].displayName} Plan`
                    : `Request ${PHASE4_PLAN_CATALOG[modalTier].displayName} Plan Upgrade`}
                </h3>
                {!directMode && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Paid plans are activated via invoice or verified billing transfer while online card checkout is in rollout. Submit your request and our team will activate <strong className="text-zinc-800 dark:text-zinc-200">{activeTenant.name}</strong> promptly.
                  </p>
                )}
              </div>

              {/* Price Summary Breakdown */}
              {(() => {
                const seats = Math.max(1, usageSnapshot.activeSeats || 1)
                const totals = calculateSaasSubscriptionTotals(modalTier, seats, billingCycle)

                return (
                  <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-4 border border-zinc-200 dark:border-white/10 space-y-2 text-xs">
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>Base Tier Monthly Fee:</span>
                      <span>${(totals.baseCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>Active Seats ({seats} × ${(PHASE4_PLAN_CATALOG[modalTier].perSeatPriceCents / 100).toFixed(2)}):</span>
                      <span>${(totals.seatCents / 100).toFixed(2)}</span>
                    </div>
                    {billingCycle === 'annual' && totals.discountCents > 0 && (
                      <div className="flex justify-between text-[#6d25da] dark:text-[#a87ce9] font-medium">
                        <span>Annual 15% Pre-payment Discount:</span>
                        <span>-${(totals.discountCents / 100).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-zinc-200 dark:border-white/10 flex justify-between font-bold text-sm text-zinc-900 dark:text-white">
                      <span>Estimated Total ({billingCycle}):</span>
                      <span className="font-mono text-[#6d25da] dark:text-[#c5a8f0]">
                        ${(totals.totalCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Billing Method Selection */}
              {directMode ? (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Billing Record Provider
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['paddle', 'stripe', 'wire_transfer'] as BillingProvider[]).map((prov) => (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => setSelectedProvider(prov)}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold uppercase tracking-wider transition cursor-pointer text-center ${
                          selectedProvider === prov
                            ? 'border-[#6d25da] bg-[#6d25da]/10 text-[#581eae] dark:bg-[#8b51e1]/20 dark:text-[#d8c4f8]'
                            : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5'
                        }`}
                      >
                        {prov.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Preferred Payment Method
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'paddle', label: 'Paddle (USD)' },
                          { id: 'payhere', label: 'PayHere (LKR)' },
                          { id: 'wire_transfer', label: 'Bank Transfer' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setRequestMethod(opt.id)}
                          className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition cursor-pointer text-center ${
                            requestMethod === opt.id
                              ? 'border-[#6d25da] bg-[#6d25da]/10 text-[#581eae] dark:bg-[#8b51e1]/20 dark:text-[#d8c4f8]'
                              : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Billing Contact / Note (Optional)
                    </label>
                    <input
                      type="text"
                      value={upgradeNote}
                      onChange={(e) => setUpgradeNote(e.target.value)}
                      placeholder="e.g. Company invoice email or expected team size"
                      className="w-full px-3 py-2 text-xs rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalTier(null)}
                  className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => void handleConfirmSubscription()}
                  className="px-5 py-2 rounded-lg bg-[#6d25da] hover:bg-[#581eae] text-white text-xs font-bold shadow-md shadow-[#6d25da]/25 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing
                    ? 'Processing...'
                    : directMode
                      ? isDowngradeToStarter
                        ? 'Confirm Downgrade'
                        : 'Activate Plan Now'
                      : 'Submit Upgrade Request'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
