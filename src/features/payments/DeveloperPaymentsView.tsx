import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  usePhase1Store,
  type DeveloperPaymentConfig,
  type DeveloperPayoutRecord,
  type PaymentCalculationMode,
  type TaskPaymentConfig,
  type TaskRecord,
  type WorkspaceMember,
} from '@/context/Phase1Store'
import { PaymentModeConfigCard } from '@/features/payments/PaymentModeConfigCard'

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

const MODE_BADGE: Record<
  PaymentCalculationMode,
  { label: string; cls: string }
> = {
  user_wise: {
    label: 'Mode: User-Wise',
    cls: 'bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]',
  },
  task_wise: {
    label: 'Mode: Task-Wise',
    cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  hybrid: {
    label: 'Mode: Hybrid (User + Task)',
    cls: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  },
}

const PAY_MODEL_LABEL: Record<DeveloperPaymentConfig['payModel'], string> = {
  hourly: 'Hourly Rate',
  monthly_retainer: 'Monthly Retainer',
  fixed_milestone: 'Fixed Milestone',
}

const FREQUENCY_LABEL: Record<DeveloperPaymentConfig['payoutFrequency'], string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
}

const METHOD_LABEL: Record<DeveloperPaymentConfig['payoutMethod'], string> = {
  bank_transfer: 'Bank Transfer',
  wise: 'Wise',
  payoneer: 'Payoneer',
  stripe_connect: 'Stripe Connect',
  crypto_usdc: 'USDC (Crypto)',
}

const PAYOUT_STATUS_META: Record<
  DeveloperPayoutRecord['status'],
  { label: string; dot: string; badge: string }
> = {
  scheduled: {
    label: 'Scheduled',
    dot: 'bg-sky-500',
    badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20',
  },
  processing: {
    label: 'Processing',
    dot: 'bg-amber-500',
    badge:
      'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/25',
  },
  paid: {
    label: 'Paid',
    dot: 'bg-emerald-500',
    badge:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/25',
  },
}

export function DeveloperPaymentsView() {
  const {
    activeTenant,
    activeUser,
    members,
    projects,
    tasks,
    timesheetLines,
    workspacePaymentPolicy,
    taskPaymentConfigs,
    saveTaskPaymentConfig,
    deleteTaskPaymentConfig,
    developerPaymentConfigs,
    developerPayouts,
    saveDeveloperPaymentConfig,
    recordDeveloperPayout,
    updatePayoutStatus,
    hasPermission,
  } = usePhase1Store()

  // Granular permissions
  const isOwnerOrSuper =
    activeUser.role === 'super_admin' || activeUser.role === 'tenant_owner'
  const canConfigure = isOwnerOrSuper || hasPermission('payment:configure')
  const canRecordPayout =
    isOwnerOrSuper || hasPermission('payment:record_payout') || canConfigure
  const canViewTeam =
    isOwnerOrSuper ||
    hasPermission('payment:view_team') ||
    canConfigure ||
    canRecordPayout

  const paymentMode = workspacePaymentPolicy.paymentMode
  const usesTaskConfig = paymentMode === 'task_wise' || paymentMode === 'hybrid'
  const usesUserConfig = paymentMode === 'user_wise' || paymentMode === 'hybrid'

  type TabId = 'team' | 'tasks' | 'ledger' | 'settings' | 'mine'
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    canViewTeam ? (paymentMode === 'task_wise' ? 'tasks' : 'team') : 'mine'
  )
  const [memberSearch, setMemberSearch] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskProjectFilter, setTaskProjectFilter] = useState('all')
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<string>('all')
  const [ledgerMemberFilter, setLedgerMemberFilter] = useState<string>('all')
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  // Modal 1: Configure User Payment
  const [configMember, setConfigMember] = useState<WorkspaceMember | null>(null)
  const [cfgPayModel, setCfgPayModel] =
    useState<DeveloperPaymentConfig['payModel']>('hourly')
  const [cfgHourlyRate, setCfgHourlyRate] = useState<number>(65)
  const [cfgMonthlyRetainer, setCfgMonthlyRetainer] = useState<number>(4000)
  const [cfgCurrency, setCfgCurrency] = useState<string>(activeTenant.currency || 'USD')
  const [cfgFrequency, setCfgFrequency] =
    useState<DeveloperPaymentConfig['payoutFrequency']>('biweekly')
  const [cfgMethod, setCfgMethod] =
    useState<DeveloperPaymentConfig['payoutMethod']>('bank_transfer')
  const [cfgAccount, setCfgAccount] = useState<string>('')
  const [cfgBankName, setCfgBankName] = useState<string>('')
  const [cfgBranchName, setCfgBranchName] = useState<string>('')
  const [cfgAccountHolder, setCfgAccountHolder] = useState<string>('')
  const [cfgAccountNumber, setCfgAccountNumber] = useState<string>('')
  const [cfgSwiftCode, setCfgSwiftCode] = useState<string>('')
  const [cfgTaxPct, setCfgTaxPct] = useState<number>(0)
  const [cfgEffectiveFrom, setCfgEffectiveFrom] = useState<string>(
    new Date().toISOString().slice(0, 10)
  )
  const [cfgNotes, setCfgNotes] = useState<string>('')

  // Modal 2: Configure Task Payment
  const [configTask, setConfigTask] = useState<TaskRecord | null>(null)
  const [taskPayType, setTaskPayType] =
    useState<TaskPaymentConfig['payType']>('fixed_bounty')
  const [taskPayAmount, setTaskPayAmount] = useState<number>(150)
  const [taskPayCurrency, setTaskPayCurrency] = useState<string>(
    activeTenant.currency || 'USD'
  )
  const [taskPayNotes, setTaskPayNotes] = useState<string>('')

  // Modal 3: Record Payout
  const [payoutMember, setPayoutMember] = useState<WorkspaceMember | null>(null)
  const [payPeriodLabel, setPayPeriodLabel] = useState<string>('')
  const [payApprovedMins, setPayApprovedMins] = useState<number>(0)
  const [payGrossAmount, setPayGrossAmount] = useState<number>(0)
  const [payTaxPct, setPayTaxPct] = useState<number>(0)
  const [payCurrency, setPayCurrency] = useState<string>(activeTenant.currency || 'USD')
  const [payMethod, setPayMethod] =
    useState<DeveloperPaymentConfig['payoutMethod']>('bank_transfer')
  const [payRefCode, setPayRefCode] = useState<string>('')
  const [payStatus, setPayStatus] =
    useState<DeveloperPayoutRecord['status']>('scheduled')
  const [payNotes, setPayNotes] = useState<string>('')

  // Lookup maps
  const configByMember = useMemo(() => {
    const map = new Map<string, DeveloperPaymentConfig>()
    for (const c of developerPaymentConfigs) map.set(c.memberId, c)
    return map
  }, [developerPaymentConfigs])

  const configByTask = useMemo(() => {
    const map = new Map<string, TaskPaymentConfig>()
    for (const c of taskPaymentConfigs) map.set(c.taskId, c)
    return map
  }, [taskPaymentConfigs])

  const projectById = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>()
    for (const p of projects) map.set(p.id, { code: p.code, name: p.name })
    return map
  }, [projects])

  // Mode-aware live accrued earnings per member (zero client billing rate leak!)
  const memberMetrics = useMemo(() => {
    const map = new Map<
      string,
      {
        approvedMinutes: number
        pendingMinutes: number
        approvedAmount: number
        pendingAmount: number
        paidTotal: number
        scheduledTotal: number
        entryCount: number
        bountyTasksCount: number
      }
    >()

    for (const m of members) {
      map.set(m.id, {
        approvedMinutes: 0,
        pendingMinutes: 0,
        approvedAmount: 0,
        pendingAmount: 0,
        paidTotal: 0,
        scheduledTotal: 0,
        entryCount: 0,
        bountyTasksCount: 0,
      })
    }

    // Track which (memberId, taskId) fixed bounties were already counted
    const countedBounties = new Set<string>()

    // 1. Add fixed task bounties (in task_wise or hybrid mode)
    if (usesTaskConfig) {
      for (const task of tasks) {
        const tCfg = configByTask.get(task.id)
        if (!tCfg || tCfg.payType !== 'fixed_bounty') continue

        // Determine credit recipients: assigned active members (split evenly if > 1)
        const recipients =
          task.assignedMemberIds.length > 0 ? task.assignedMemberIds : []
        if (recipients.length === 0) continue

        const share = tCfg.amount / recipients.length
        const hasApprovedLog = timesheetLines.some(
          (l) => l.taskId === task.id && l.evidenceStatus === 'approved'
        )
        const isEarned = task.status === 'done' || hasApprovedLog

        for (const memberId of recipients) {
          const stat = map.get(memberId)
          if (!stat) continue
          countedBounties.add(`${memberId}:${task.id}`)
          stat.bountyTasksCount += 1
          if (isEarned) stat.approvedAmount += share
          else stat.pendingAmount += share
        }
      }
    }

    // 2. Process timesheet lines according to active paymentMode
    for (const line of timesheetLines) {
      const mStat = map.get(line.developerId) ?? {
        approvedMinutes: 0,
        pendingMinutes: 0,
        approvedAmount: 0,
        pendingAmount: 0,
        paidTotal: 0,
        scheduledTotal: 0,
        entryCount: 0,
        bountyTasksCount: 0,
      }
      const userCfg = configByMember.get(line.developerId)
      const taskCfg = configByTask.get(line.taskId)

      mStat.entryCount += 1
      const isApproved =
        line.evidenceStatus === 'approved' && line.approvedBillableMinutes > 0
      const mins = isApproved ? line.approvedBillableMinutes : line.claimedMinutes

      if (isApproved) mStat.approvedMinutes += mins
      else mStat.pendingMinutes += mins

      // Resolve hourly rate strictly from payment configs (NEVER client snapshotHourlyRate)
      let effectiveHourlyRate = 0
      if (paymentMode === 'task_wise') {
        if (taskCfg?.payType === 'hourly_rate') {
          effectiveHourlyRate = taskCfg.amount
        }
        // fixed_bounty already handled above
      } else if (paymentMode === 'hybrid') {
        if (taskCfg?.payType === 'fixed_bounty') {
          // Fixed bounty overrides hourly for this task
          if (!countedBounties.has(`${line.developerId}:${line.taskId}`)) {
            countedBounties.add(`${line.developerId}:${line.taskId}`)
            mStat.bountyTasksCount += 1
            if (isApproved) mStat.approvedAmount += taskCfg.amount
            else mStat.pendingAmount += taskCfg.amount
          }
          effectiveHourlyRate = 0
        } else if (taskCfg?.payType === 'hourly_rate') {
          effectiveHourlyRate = taskCfg.amount
        } else if (userCfg?.payModel === 'hourly') {
          effectiveHourlyRate = userCfg.hourlyRate
        }
      } else {
        // user_wise
        if (userCfg?.payModel === 'hourly') {
          effectiveHourlyRate = userCfg.hourlyRate
        }
      }

      if (effectiveHourlyRate > 0) {
        const amt = (mins / 60) * effectiveHourlyRate
        if (isApproved) mStat.approvedAmount += amt
        else mStat.pendingAmount += amt
      }

      map.set(line.developerId, mStat)
    }

    // 3. Monthly retainer users (user_wise or hybrid): fixed monthly salary amount
    if (usesUserConfig) {
      for (const m of members) {
        const userCfg = configByMember.get(m.id)
        const stat = map.get(m.id)
        if (userCfg?.payModel === 'monthly_retainer' && stat) {
          stat.approvedAmount += userCfg.monthlyRetainerAmount
        }
      }
    }

    // 4. Add recorded payout totals
    for (const payout of developerPayouts) {
      const mStat = map.get(payout.memberId)
      if (!mStat) continue
      if (payout.status === 'paid') mStat.paidTotal += payout.netAmount
      else mStat.scheduledTotal += payout.netAmount
    }

    return map
  }, [
    members,
    tasks,
    timesheetLines,
    configByMember,
    configByTask,
    developerPayouts,
    paymentMode,
    usesTaskConfig,
    usesUserConfig,
  ])

  // Workspace payroll KPIs
  const teamTotals = useMemo(() => {
    let configuredUsers = 0
    let approvedPayroll = 0
    let pendingPayroll = 0
    let totalPaid = 0

    for (const m of members) {
      if (configByMember.has(m.id)) configuredUsers += 1
      const stat = memberMetrics.get(m.id)
      if (stat) {
        approvedPayroll += stat.approvedAmount
        pendingPayroll += stat.pendingAmount
        totalPaid += stat.paidTotal
      }
    }

    return {
      configuredUsers,
      configuredTasks: taskPaymentConfigs.length,
      totalMembers: members.length,
      totalTasks: tasks.length,
      approvedPayroll,
      pendingPayroll,
      totalPaid,
    }
  }, [members, tasks.length, configByMember, taskPaymentConfigs.length, memberMetrics])

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
    )
  }, [members, memberSearch])

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase()
    return tasks.filter((t) => {
      if (taskProjectFilter !== 'all' && t.projectId !== taskProjectFilter) {
        return false
      }
      if (q) {
        return (
          t.code.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [tasks, taskProjectFilter, taskSearch])

  const filteredLedgerPayouts = useMemo(() => {
    return developerPayouts.filter((p) => {
      if (ledgerStatusFilter !== 'all' && p.status !== ledgerStatusFilter) return false
      if (ledgerMemberFilter !== 'all' && p.memberId !== ledgerMemberFilter) return false
      return true
    })
  }, [developerPayouts, ledgerStatusFilter, ledgerMemberFilter])

  // Personal (own) data
  const myConfig = configByMember.get(activeUser.id) ?? null
  const myStats = memberMetrics.get(activeUser.id) ?? {
    approvedMinutes: 0,
    pendingMinutes: 0,
    approvedAmount: 0,
    pendingAmount: 0,
    paidTotal: 0,
    scheduledTotal: 0,
    entryCount: 0,
    bountyTasksCount: 0,
  }
  const myLines = useMemo(
    () => timesheetLines.filter((l) => l.developerId === activeUser.id),
    [timesheetLines, activeUser.id]
  )
  const myAssignedTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.assignedMemberIds.includes(activeUser.id) ||
          myLines.some((l) => l.taskId === t.id)
      ),
    [tasks, activeUser.id, myLines]
  )
  const myPayouts = useMemo(
    () => developerPayouts.filter((p) => p.memberId === activeUser.id),
    [developerPayouts, activeUser.id]
  )

  function openConfigModal(member: WorkspaceMember) {
    if (!canConfigure) return
    const existing = configByMember.get(member.id)
    setConfigMember(member)
    setCfgPayModel(existing?.payModel ?? 'hourly')
    setCfgHourlyRate(existing?.hourlyRate ?? 65)
    setCfgMonthlyRetainer(existing?.monthlyRetainerAmount ?? 4000)
    setCfgCurrency(existing?.currency ?? activeTenant.currency ?? 'USD')
    setCfgFrequency(existing?.payoutFrequency ?? 'biweekly')
    setCfgMethod(existing?.payoutMethod ?? 'bank_transfer')
    setCfgAccount(existing?.accountSummary ?? '')
    setCfgBankName(existing?.bankDetails?.bankName ?? (existing?.payoutMethod === 'bank_transfer' ? existing.accountSummary : ''))
    setCfgBranchName(existing?.bankDetails?.branchName ?? '')
    setCfgAccountHolder(existing?.bankDetails?.accountHolderName ?? member.name)
    setCfgAccountNumber(existing?.bankDetails?.accountNumber ?? '')
    setCfgSwiftCode(existing?.bankDetails?.swiftOrRoutingCode ?? '')
    setCfgTaxPct(existing?.taxWithholdingPercent ?? 0)
    setCfgEffectiveFrom(
      existing?.effectiveFrom ?? new Date().toISOString().slice(0, 10)
    )
    setCfgNotes(existing?.notes ?? '')
  }

  function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!configMember) return
    const res = saveDeveloperPaymentConfig({
      memberId: configMember.id,
      payModel: cfgPayModel,
      hourlyRate: cfgHourlyRate,
      monthlyRetainerAmount: cfgMonthlyRetainer,
      currency: cfgCurrency,
      payoutFrequency: cfgFrequency,
      payoutMethod: cfgMethod,
      accountSummary: cfgAccount,
      bankDetails:
        cfgMethod === 'bank_transfer'
          ? {
            bankName: cfgBankName,
            branchName: cfgBranchName,
            accountHolderName: cfgAccountHolder,
            accountNumber: cfgAccountNumber,
            swiftOrRoutingCode: cfgSwiftCode,
          }
          : undefined,
      taxWithholdingPercent: cfgTaxPct,
      effectiveFrom: cfgEffectiveFrom,
      notes: cfgNotes,
    })
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) setConfigMember(null)
  }

  function openTaskPayModal(task: TaskRecord) {
    if (!canConfigure) return
    const existing = configByTask.get(task.id)
    setConfigTask(task)
    setTaskPayType(existing?.payType ?? 'fixed_bounty')
    setTaskPayAmount(existing?.amount ?? 150)
    setTaskPayCurrency(existing?.currency ?? activeTenant.currency ?? 'USD')
    setTaskPayNotes(existing?.notes ?? '')
  }

  function handleSaveTaskPay(e: React.FormEvent) {
    e.preventDefault()
    if (!configTask) return
    const res = saveTaskPaymentConfig({
      taskId: configTask.id,
      payType: taskPayType,
      amount: taskPayAmount,
      currency: taskPayCurrency,
      notes: taskPayNotes,
    })
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) setConfigTask(null)
  }

  function openPayoutModal(member: WorkspaceMember) {
    if (!canRecordPayout) return
    const cfg = configByMember.get(member.id)
    const stat = memberMetrics.get(member.id)
    const defaultGross = Math.round((stat?.approvedAmount ?? 0) * 100) / 100

    setPayoutMember(member)
    setPayPeriodLabel(`Nov 2026 Payout · ${member.name.split(' ')[0]}`)
    setPayApprovedMins(stat?.approvedMinutes ?? 0)
    setPayGrossAmount(defaultGross > 0 ? defaultGross : cfg?.hourlyRate ?? 500)
    setPayTaxPct(cfg?.taxWithholdingPercent ?? 0)
    setPayCurrency(cfg?.currency ?? activeTenant.currency ?? 'USD')
    setPayMethod(cfg?.payoutMethod ?? 'bank_transfer')
    setPayRefCode(`PAY-${new Date().getFullYear()}-${String(developerPayouts.length + 101)}`)
    setPayStatus('scheduled')
    setPayNotes('')
  }

  function handleRecordPayout(e: React.FormEvent) {
    e.preventDefault()
    if (!payoutMember) return
    const res = recordDeveloperPayout({
      memberId: payoutMember.id,
      periodLabel: payPeriodLabel,
      approvedMinutes: payApprovedMins,
      grossAmount: payGrossAmount,
      taxWithholdingPercent: payTaxPct,
      currency: payCurrency,
      payoutMethod: payMethod,
      referenceCode: payRefCode,
      status: payStatus,
      notes: payNotes,
    })
    setBanner({ ok: res.ok, text: res.message })
    if (res.ok) setPayoutMember(null)
  }

  function formatUserRate(cfg: DeveloperPaymentConfig | null | undefined): string {
    if (!cfg) return 'Not configured'
    if (cfg.payModel === 'hourly') return `${cfg.currency} ${cfg.hourlyRate}/hr`
    if (cfg.payModel === 'monthly_retainer') {
      return `${cfg.currency} ${cfg.monthlyRetainerAmount.toLocaleString()}/mo`
    }
    return `Fixed (${cfg.currency})`
  }

  function formatTaskRate(cfg: TaskPaymentConfig | null | undefined): string {
    if (!cfg) return paymentMode === 'hybrid' ? 'Uses User Rate' : 'Not configured'
    if (cfg.payType === 'fixed_bounty') return `${cfg.currency} ${cfg.amount.toLocaleString()} bounty`
    return `${cfg.currency} ${cfg.amount}/hr`
  }

  // Ensure active tab is valid for current mode & permissions
  const effectiveTab: TabId = !canViewTeam
    ? 'mine'
    : activeTab === 'tasks' && !usesTaskConfig
      ? 'team'
      : activeTab === 'settings' && !canConfigure
        ? 'team'
        : activeTab

  const modeBadge = MODE_BADGE[paymentMode]

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {banner && (
        <div
          className={`dp-view-enter rounded-xl px-4 py-3 text-xs font-medium flex items-center justify-between ring-1 ${banner.ok
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 ring-emerald-500/25'
              : 'bg-rose-500/10 text-rose-800 dark:text-rose-200 ring-rose-500/25'
            }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="ml-4 font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
            {effectiveTab === 'mine' ? 'My Payments & Earnings' : 'Developer Payments & Payouts'}
          </h2>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${modeBadge.cls}`}>
            {modeBadge.label}
          </span>
          {!canConfigure && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
              🔒 Read-Only
            </span>
          )}
        </div>

        {canViewTeam && (
          <div className="inline-flex flex-wrap rounded-xl bg-zinc-100 dark:bg-white/[0.05] p-1 text-xs gap-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('team')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${effectiveTab === 'team'
                  ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
            >
              User Payments
            </button>

            {usesTaskConfig && (
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${effectiveTab === 'tasks'
                    ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
              >
                Task Payments ({taskPaymentConfigs.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${effectiveTab === 'ledger'
                  ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
            >
              Payout Ledger ({developerPayouts.length})
            </button>

            {canConfigure && (
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${effectiveTab === 'settings'
                    ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
              >
                ⚙ Mode Settings
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('mine')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${effectiveTab === 'mine'
                  ? 'bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
            >
              My Payments
            </button>
          </div>
        )}
      </div>

      {/* =================================================================
          TAB: MODE SETTINGS (Admin / Tenant Owner / payment:configure)
         ================================================================= */}
      {effectiveTab === 'settings' && canConfigure && (
        <PaymentModeConfigCard
          onSaved={(res) => setBanner({ ok: res.ok, text: res.message })}
        />
      )}

      {/* =================================================================
          TAB: USER PAYMENTS (User-Wise & Payout Destinations)
         ================================================================= */}
      {effectiveTab === 'team' && canViewTeam && (
        <div className="space-y-6">
          {/* 4-Card Payroll KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {paymentMode === 'task_wise' ? 'Configured Tasks' : 'Configured Users'}
              </div>
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
                {paymentMode === 'task_wise'
                  ? teamTotals.configuredTasks
                  : teamTotals.configuredUsers}{' '}
                <span className="text-xs font-normal text-zinc-400">
                  / {paymentMode === 'task_wise' ? teamTotals.totalTasks : teamTotals.totalMembers}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400">
                {paymentMode === 'hybrid'
                  ? `${teamTotals.configuredTasks} task overrides active`
                  : `${teamTotals.totalMembers} workspace members`}
              </div>
            </div>

            <div className="rounded-2xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/20 dark:ring-[#8b51e1]/30 p-4 space-y-1.5">
              <div className="text-xs font-semibold text-[#581eae] dark:text-[#c5a8f0]">
                Approved Accrued Payroll
              </div>
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
                ${teamTotals.approvedPayroll.toFixed(2)}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Calculated via {modeBadge.label.replace('Mode: ', '')}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Pending / In Progress
              </div>
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                ${teamTotals.pendingPayroll.toFixed(2)}
              </div>
              <div className="text-[11px] text-zinc-400">
                Awaiting task / timesheet approval
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Total Paid to Date
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                ${teamTotals.totalPaid.toFixed(2)}
              </div>
              <div className="text-[11px] text-zinc-400">
                {developerPayouts.filter((p) => p.status === 'paid').length} completed payouts
              </div>
            </div>
          </div>

          {paymentMode === 'task_wise' && (
            <div className="rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20 px-4 py-3 text-xs text-sky-900 dark:text-sky-200 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>Task-Wise Mode Active:</strong> Earnings are calculated from configured Task Bounties &amp; Task Rates. Use User Payment Config here to store each developer&apos;s payout method &amp; bank details.
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                className="font-semibold underline cursor-pointer shrink-0"
              >
                Open Task Payments →
              </button>
            </div>
          )}

          {/* Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Team Member Payment Profiles ({filteredMembers.length})
            </div>
            <input
              type="text"
              placeholder="Search member by name, email or role..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="w-64 rounded-xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
            />
          </div>

          {/* Member Payment Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMembers.map((member) => {
              const cfg = configByMember.get(member.id)
              const stat = memberMetrics.get(member.id) ?? {
                approvedMinutes: 0,
                pendingMinutes: 0,
                approvedAmount: 0,
                pendingAmount: 0,
                paidTotal: 0,
                scheduledTotal: 0,
                entryCount: 0,
                bountyTasksCount: 0,
              }

              return (
                <article
                  key={member.id}
                  className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-[0_1px_2px_rgba(15,5,31,0.03),0_4px_14px_-6px_rgba(15,5,31,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_6px_18px_-8px_rgba(0,0,0,0.45)] hover:ring-[#6d25da]/25 transition-all duration-200 p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-[#6d25da]/10 dark:bg-[#6d25da]/20 text-[#581eae] dark:text-[#c5a8f0] font-bold text-xs flex items-center justify-center shrink-0 ring-1 ring-[#6d25da]/15">
                        {getInitials(member.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                            {member.name}
                          </h3>
                          <span className="text-[10.5px] font-semibold capitalize px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300 shrink-0">
                            {member.role.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {member.email}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-sm font-bold font-mono ${paymentMode === 'task_wise'
                            ? 'text-sky-600 dark:text-sky-400'
                            : cfg
                              ? 'text-[#6d25da] dark:text-[#c5a8f0]'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                      >
                        {paymentMode === 'task_wise'
                          ? `${stat.bountyTasksCount} bounty tasks`
                          : formatUserRate(cfg)}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {cfg ? FREQUENCY_LABEL[cfg.payoutFrequency] : 'Setup needed'}
                      </div>
                    </div>
                  </div>

                  {/* Metrics Strip */}
                  <div className="grid grid-cols-3 gap-2.5 rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-2.5 text-xs">
                    <div>
                      <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                        Approved
                      </div>
                      <div className="font-mono font-bold text-zinc-900 dark:text-white">
                        ${stat.approvedAmount.toFixed(2)}
                      </div>
                      <div className="text-[10.5px] font-mono text-zinc-400">
                        {formatDuration(stat.approvedMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                        Pending
                      </div>
                      <div className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                        ${stat.pendingAmount.toFixed(2)}
                      </div>
                      <div className="text-[10.5px] font-mono text-zinc-400">
                        {formatDuration(stat.pendingMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                        Paid Total
                      </div>
                      <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${stat.paidTotal.toFixed(2)}
                      </div>
                      <div className="text-[10.5px] font-mono text-zinc-400">
                        {cfg ? METHOD_LABEL[cfg.payoutMethod] : '-'}
                      </div>
                    </div>
                  </div>

                  {cfg && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate">
                        <strong className="text-zinc-700 dark:text-zinc-300">Payout to:</strong>{' '}
                        {cfg.accountSummary}
                      </span>
                      {cfg.taxWithholdingPercent > 0 && (
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">
                          Tax {cfg.taxWithholdingPercent}%
                        </span>
                      )}
                    </div>
                  )}

                  {(canConfigure || canRecordPayout) && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                      {canConfigure && (
                        <button
                          type="button"
                          onClick={() => openConfigModal(member)}
                          className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition active:scale-[0.98] cursor-pointer"
                        >
                          {cfg ? '✎ Edit Payment Config' : '+ Configure Payment'}
                        </button>
                      )}
                      {canRecordPayout && (
                        <button
                          type="button"
                          onClick={() => openPayoutModal(member)}
                          className="px-3 py-1.5 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-xs font-semibold text-white transition active:scale-[0.98] cursor-pointer shadow-xs"
                        >
                          + Record Payout
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      )}

      {/* =================================================================
          TAB: TASK PAYMENTS (Visible when Task-Wise or Hybrid mode is active)
         ================================================================= */}
      {effectiveTab === 'tasks' && canViewTeam && usesTaskConfig && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-sm font-bold text-zinc-900 dark:text-white">
              Task-Wise Bounties &amp; Hourly Rates ({filteredTasks.length})
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search task code or title..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="w-52 rounded-xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-1.5 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#6d25da]"
              />
              <select
                value={taskProjectFilter}
                onChange={(e) => setTaskProjectFilter(e.target.value)}
                className="rounded-xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-1.5 text-zinc-900 dark:text-white"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.02] ring-1 ring-dashed ring-zinc-300 dark:ring-white/10 p-10 text-center text-xs text-zinc-500">
              No tasks match your filters. Create tasks in Projects &amp; Tasks first.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredTasks.map((task) => {
                const tCfg = configByTask.get(task.id)
                const proj = projectById.get(task.projectId)
                const assignedNames = members
                  .filter((m) => task.assignedMemberIds.includes(m.id))
                  .map((m) => m.name)
                const taskLoggedMins = timesheetLines
                  .filter((l) => l.taskId === task.id)
                  .reduce((sum, l) => sum + l.claimedMinutes, 0)

                return (
                  <article
                    key={task.id}
                    className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 sm:p-5 space-y-3 shadow-[0_1px_2px_rgba(15,5,31,0.03)] hover:ring-[#6d25da]/25 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#6d25da] dark:text-[#c5a8f0] bg-[#6d25da]/[0.08] dark:bg-[#6d25da]/20 px-2 py-0.5 rounded-md">
                            {task.code}
                          </span>
                          <span className="text-[11px] font-semibold capitalize px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-zinc-600 dark:text-zinc-300">
                            {task.status}
                          </span>
                          {proj && (
                            <span className="text-[11px] text-zinc-400 truncate">
                              {proj.name}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">
                          {task.title}
                        </h3>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`text-sm font-bold font-mono ${tCfg
                              ? 'text-[#6d25da] dark:text-[#c5a8f0]'
                              : paymentMode === 'hybrid'
                                ? 'text-zinc-500 dark:text-zinc-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                        >
                          {formatTaskRate(tCfg)}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {formatDuration(taskLoggedMins)} logged
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                      <span className="truncate">
                        {assignedNames.length > 0
                          ? `Assigned: ${assignedNames.join(', ')}`
                          : 'Unassigned'}
                      </span>

                      {canConfigure && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {tCfg && (
                            <button
                              type="button"
                              onClick={() => {
                                const res = deleteTaskPaymentConfig(task.id)
                                setBanner({ ok: res.ok, text: res.message })
                              }}
                              className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-rose-50 text-zinc-500 hover:text-rose-600 dark:bg-white/[0.06] dark:hover:bg-rose-950/50 dark:text-zinc-400 dark:hover:text-rose-300 text-xs font-medium transition cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openTaskPayModal(task)}
                            className="px-3 py-1 rounded-lg bg-[#6d25da]/10 hover:bg-[#6d25da] text-[#581eae] hover:text-white dark:bg-[#6d25da]/20 dark:text-[#c5a8f0] dark:hover:bg-[#6d25da] dark:hover:text-white text-xs font-semibold transition cursor-pointer"
                          >
                            {tCfg ? '✎ Edit Task Pay' : '+ Set Task Pay'}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================
          TAB: PAYOUT LEDGER
         ================================================================= */}
      {effectiveTab === 'ledger' && canViewTeam && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'scheduled', 'processing', 'paid'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setLedgerStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl font-semibold capitalize transition cursor-pointer ${ledgerStatusFilter === st
                      ? 'bg-[#6d25da]/12 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0] ring-1 ring-[#6d25da]/25'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.05]'
                    }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <select
              value={ledgerMemberFilter}
              onChange={(e) => setLedgerMemberFilter(e.target.value)}
              className="rounded-xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-1.5 text-zinc-900 dark:text-white"
            >
              <option value="all">All Members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {filteredLedgerPayouts.length === 0 ? (
            <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.02] ring-1 ring-dashed ring-zinc-300 dark:ring-white/10 p-10 text-center space-y-1.5">
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                No payouts recorded yet
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Use &ldquo;Record Payout&rdquo; on any member card in User Payments to log disbursements.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLedgerPayouts.map((payout) => {
                const st = PAYOUT_STATUS_META[payout.status]
                return (
                  <div
                    key={payout.id}
                    className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-[0_1px_2px_rgba(15,5,31,0.03)]"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                          {payout.referenceCode}
                        </span>
                        <span className="text-sm font-bold text-zinc-900 dark:text-white">
                          {payout.memberName}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${st.badge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {payout.periodLabel} · {formatDuration(payout.approvedMinutes)} ·{' '}
                        {METHOD_LABEL[payout.payoutMethod]}
                        {payout.paidAt && <span> · Paid {payout.paidAt.slice(0, 10)}</span>}
                      </div>
                      {payout.notes && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                          {payout.notes}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="text-right font-mono">
                        <div className="text-base font-bold text-zinc-900 dark:text-white">
                          {payout.currency} {payout.netAmount.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Gross {payout.grossAmount.toFixed(2)}
                          {payout.taxWithheldAmount > 0
                            ? ` · Tax -${payout.taxWithheldAmount.toFixed(2)}`
                            : ''}
                        </div>
                      </div>

                      {canRecordPayout && payout.status !== 'paid' && (
                        <div className="flex items-center gap-1.5 text-xs">
                          {payout.status === 'scheduled' && (
                            <button
                              type="button"
                              onClick={() => {
                                const res = updatePayoutStatus(payout.id, 'processing')
                                setBanner({ ok: res.ok, text: res.message })
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 font-semibold transition cursor-pointer"
                            >
                              Mark Processing
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const res = updatePayoutStatus(payout.id, 'paid')
                              setBanner({ ok: res.ok, text: res.message })
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer shadow-xs"
                          >
                            ✓ Mark Paid
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================
          TAB: MY PAYMENTS (Strictly Read-Only Personal Statement)
         ================================================================= */}
      {effectiveTab === 'mine' && (
        <div className="space-y-6">
          {/* 4-Card Personal KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            <div className="rounded-2xl bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/15 ring-1 ring-[#6d25da]/20 dark:ring-[#8b51e1]/30 p-4 space-y-1.5">
              <div className="text-xs font-semibold text-[#581eae] dark:text-[#c5a8f0]">
                {paymentMode === 'task_wise' ? 'Compensation Model' : 'My Configured Rate'}
              </div>
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
                {paymentMode === 'task_wise'
                  ? 'Per-Task'
                  : formatUserRate(myConfig)}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {paymentMode === 'task_wise'
                  ? `${myAssignedTasks.filter((t) => configByTask.has(t.id)).length} priced tasks assigned`
                  : myConfig
                    ? `${PAY_MODEL_LABEL[myConfig.payModel]} · ${FREQUENCY_LABEL[myConfig.payoutFrequency]}`
                    : 'Configured by Workspace Owner'}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Approved Earnings
              </div>
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-white">
                ${myStats.approvedAmount.toFixed(2)}
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                {formatDuration(myStats.approvedMinutes)} approved
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Pending / In Progress
              </div>
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                ${myStats.pendingAmount.toFixed(2)}
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                {formatDuration(myStats.pendingMinutes)} awaiting approval
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-4 space-y-1.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Total Paid to Me
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                ${myStats.paidTotal.toFixed(2)}
              </div>
              <div className="text-[11px] text-zinc-400">
                {myPayouts.filter((p) => p.status === 'paid').length} completed payouts
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Read-Only Payment Terms Card */}
            <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-4 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  My Payment Profile
                </h3>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-white/[0.07] text-zinc-500 dark:text-zinc-400">
                  Read-Only
                </span>
              </div>

              {!myConfig ? (
                <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-4 text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Personal payment profile not configured yet
                  </div>
                  <p>
                    Your Tenant Owner manages your payout method, schedule, and compensation terms. Once configured, they will appear here automatically.
                  </p>
                </div>
              ) : (
                <dl className="space-y-3 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                    <dt className="text-zinc-500 dark:text-zinc-400">Workspace Mode</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-white">
                      {modeBadge.label.replace('Mode: ', '')}
                    </dd>
                  </div>
                  {usesUserConfig && (
                    <>
                      <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                        <dt className="text-zinc-500 dark:text-zinc-400">Pay Model</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {PAY_MODEL_LABEL[myConfig.payModel]}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                        <dt className="text-zinc-500 dark:text-zinc-400">Configured Rate</dt>
                        <dd className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                          {formatUserRate(myConfig)}
                        </dd>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                    <dt className="text-zinc-500 dark:text-zinc-400">Payout Schedule</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-white">
                      {FREQUENCY_LABEL[myConfig.payoutFrequency]}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                    <dt className="text-zinc-500 dark:text-zinc-400">Payout Method</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-white">
                      {METHOD_LABEL[myConfig.payoutMethod]}
                    </dd>
                  </div>
                  {myConfig.payoutMethod === 'bank_transfer' && myConfig.bankDetails ? (
                    <>
                      <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                        <dt className="text-zinc-500 dark:text-zinc-400">Bank Name</dt>
                        <dd className="font-semibold text-zinc-900 dark:text-white">
                          {myConfig.bankDetails.bankName}
                        </dd>
                      </div>
                      {myConfig.bankDetails.branchName && (
                        <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                          <dt className="text-zinc-500 dark:text-zinc-400">Branch</dt>
                          <dd className="text-zinc-800 dark:text-zinc-200">
                            {myConfig.bankDetails.branchName}
                          </dd>
                        </div>
                      )}
                      <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                        <dt className="text-zinc-500 dark:text-zinc-400">Account Holder</dt>
                        <dd className="text-zinc-800 dark:text-zinc-200">
                          {myConfig.bankDetails.accountHolderName}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                        <dt className="text-zinc-500 dark:text-zinc-400">Account Number</dt>
                        <dd className="font-mono text-zinc-800 dark:text-zinc-200">
                          {myConfig.bankDetails.accountNumber}
                        </dd>
                      </div>
                      {myConfig.bankDetails.swiftOrRoutingCode && (
                        <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                          <dt className="text-zinc-500 dark:text-zinc-400">SWIFT / Routing</dt>
                          <dd className="font-mono text-zinc-800 dark:text-zinc-200">
                            {myConfig.bankDetails.swiftOrRoutingCode}
                          </dd>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                      <dt className="text-zinc-500 dark:text-zinc-400">Destination</dt>
                      <dd className="font-mono text-zinc-800 dark:text-zinc-200">
                        {myConfig.accountSummary}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-white/[0.06]">
                    <dt className="text-zinc-500 dark:text-zinc-400">Tax Withholding</dt>
                    <dd className="font-mono text-zinc-800 dark:text-zinc-200">
                      {myConfig.taxWithholdingPercent}%
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <dt className="text-zinc-500 dark:text-zinc-400">Effective From</dt>
                    <dd className="font-mono text-zinc-800 dark:text-zinc-200">
                      {myConfig.effectiveFrom}
                    </dd>
                  </div>
                  {myConfig.notes && (
                    <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3 text-zinc-600 dark:text-zinc-300">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        Owner Note:{' '}
                      </span>
                      {myConfig.notes}
                    </div>
                  )}
                </dl>
              )}
            </div>

            {/* Right Column: Payout History + Mode-Appropriate Breakdown */}
            <div className="lg:col-span-7 space-y-5">
              {/* My Payout History */}
              <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    My Payout History
                  </h3>
                  <span className="text-xs font-mono text-zinc-400">
                    {myPayouts.length} {myPayouts.length === 1 ? 'record' : 'records'}
                  </span>
                </div>

                {myPayouts.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 py-3">
                    No payouts recorded for your account yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {myPayouts.map((p) => {
                      const st = PAYOUT_STATUS_META[p.status]
                      return (
                        <div
                          key={p.id}
                          className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                                {p.referenceCode}
                              </span>
                              <span className="font-semibold text-zinc-900 dark:text-white">
                                {p.periodLabel}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {formatDuration(p.approvedMinutes)} · {METHOD_LABEL[p.payoutMethod]}
                              {p.paidAt ? ` · Paid ${p.paidAt.slice(0, 10)}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right font-mono">
                              <div className="font-bold text-zinc-900 dark:text-white">
                                {p.currency} {p.netAmount.toFixed(2)}
                              </div>
                              {p.taxWithheldAmount > 0 && (
                                <div className="text-[10.5px] text-zinc-400">
                                  Gross {p.grossAmount.toFixed(2)}
                                </div>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${st.badge}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                              {st.label}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Task Rates & Bounties (Read-Only) when Task-Wise or Hybrid */}
              {usesTaskConfig && (
                <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                      My Assigned Task Rates &amp; Bounties
                    </h3>
                    <span className="text-xs font-mono text-zinc-400">
                      {myAssignedTasks.length} tasks
                    </span>
                  </div>

                  {myAssignedTasks.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 py-3">
                      No assigned tasks found yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {myAssignedTasks.map((task) => {
                        const tCfg = configByTask.get(task.id)
                        return (
                          <div
                            key={task.id}
                            className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                                  {task.code}
                                </span>
                                <span className="font-semibold text-zinc-900 dark:text-white truncate">
                                  {task.title}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize">
                                Status: {task.status}
                                {tCfg?.notes ? ` · ${tCfg.notes}` : ''}
                              </div>
                            </div>
                            <div className="text-right shrink-0 font-mono font-bold text-zinc-900 dark:text-white">
                              {formatTaskRate(tCfg)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Optional Per-Task Logged Breakdown (controlled by workspacePaymentPolicy.showTaskBreakdownToUsers) */}
              {workspacePaymentPolicy.showTaskBreakdownToUsers && (
                <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] p-5 space-y-3.5 shadow-[0_1px_2px_rgba(15,5,31,0.03)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                      Logged Sessions Summary
                    </h3>
                    <span className="text-xs font-mono text-zinc-400">
                      {myLines.length} {myLines.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>

                  {myLines.length === 0 ? (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 py-3">
                      Log time on tasks in Focus Timer to see your work log breakdown here.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {myLines.map((line) => {
                        const tCfg = configByTask.get(line.taskId)
                        const mins =
                          line.evidenceStatus === 'approved'
                            ? line.approvedBillableMinutes
                            : line.claimedMinutes

                        let rateLabel = ''
                        let amountDisplay = ''
                        if (
                          (paymentMode === 'task_wise' || paymentMode === 'hybrid') &&
                          tCfg?.payType === 'fixed_bounty'
                        ) {
                          rateLabel = 'Fixed Bounty'
                          amountDisplay = `${tCfg.currency} ${tCfg.amount.toFixed(2)}`
                        } else if (
                          (paymentMode === 'task_wise' || paymentMode === 'hybrid') &&
                          tCfg?.payType === 'hourly_rate'
                        ) {
                          rateLabel = `${tCfg.currency} ${tCfg.amount}/hr`
                          amountDisplay = `$${((mins / 60) * tCfg.amount).toFixed(2)}`
                        } else if (
                          usesUserConfig &&
                          myConfig?.payModel === 'monthly_retainer'
                        ) {
                          rateLabel = 'Included in Monthly Retainer'
                          amountDisplay = 'Retainer'
                        } else if (usesUserConfig && myConfig?.payModel === 'hourly') {
                          rateLabel = `${myConfig.currency} ${myConfig.hourlyRate}/hr`
                          amountDisplay = `$${((mins / 60) * myConfig.hourlyRate).toFixed(2)}`
                        } else {
                          rateLabel = 'Rate not set'
                          amountDisplay = '-'
                        }

                        return (
                          <div
                            key={line.id}
                            className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#6d25da] dark:text-[#c5a8f0]">
                                  {line.taskCode}
                                </span>
                                <span className="font-semibold text-zinc-900 dark:text-white truncate">
                                  {line.taskTitle}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                                {line.workDate} · {formatDuration(mins)} · {rateLabel}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-zinc-900 dark:text-white">
                                {amountDisplay}
                              </div>
                              <div
                                className={`text-[10.5px] font-semibold capitalize ${line.evidenceStatus === 'approved'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                  }`}
                              >
                                {line.evidenceStatus.replace(/_/g, ' ')}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================
          MODAL 1: CONFIGURE USER PAYMENT (Owner / payment:configure)
         ================================================================= */}
      {configMember &&
        canConfigure &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
            onClick={() => setConfigMember(null)}
          >
            <form
              onSubmit={handleSaveConfig}
              onClick={(e) => e.stopPropagation()}
              className="dp-popover-enter w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#131319] shadow-(--dp-shadow-popover) p-6 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Configure Payment · {configMember.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setConfigMember(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Pay Model
                  </label>
                  <select
                    value={cfgPayModel}
                    onChange={(e) =>
                      setCfgPayModel(e.target.value as DeveloperPaymentConfig['payModel'])
                    }
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                  >
                    <option value="hourly">Hourly Rate</option>
                    <option value="monthly_retainer">Monthly Retainer</option>
                    <option value="fixed_milestone">Fixed Milestone</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Currency
                  </label>
                  <select
                    value={cfgCurrency}
                    onChange={(e) => setCfgCurrency(e.target.value)}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="LKR">LKR</option>
                    <option value="AUD">AUD</option>
                    <option value="CAD">CAD</option>
                  </select>
                </div>

                {cfgPayModel === 'hourly' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                      Hourly Rate ({cfgCurrency})
                    </label>
                    <input
                      type="number"
                      min={1}
                      step="0.5"
                      value={cfgHourlyRate}
                      onChange={(e) => setCfgHourlyRate(Number(e.target.value))}
                      className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                      required
                    />
                  </div>
                )}

                {cfgPayModel === 'monthly_retainer' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                      Monthly Retainer ({cfgCurrency})
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={cfgMonthlyRetainer}
                      onChange={(e) => setCfgMonthlyRetainer(Number(e.target.value))}
                      className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Payout Schedule
                  </label>
                  <select
                    value={cfgFrequency}
                    onChange={(e) =>
                      setCfgFrequency(
                        e.target.value as DeveloperPaymentConfig['payoutFrequency']
                      )
                    }
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Payout Method
                  </label>
                  <select
                    value={cfgMethod}
                    onChange={(e) =>
                      setCfgMethod(
                        e.target.value as DeveloperPaymentConfig['payoutMethod']
                      )
                    }
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="wise">Wise</option>
                    <option value="payoneer">Payoneer</option>
                    <option value="stripe_connect">Stripe Connect</option>
                    <option value="crypto_usdc">USDC (Crypto)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Tax Withholding (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    step="0.5"
                    value={cfgTaxPct}
                    onChange={(e) => setCfgTaxPct(Number(e.target.value))}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Effective From
                  </label>
                  <input
                    type="date"
                    value={cfgEffectiveFrom}
                    onChange={(e) => setCfgEffectiveFrom(e.target.value)}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {cfgMethod === 'bank_transfer' ? (
                <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-4 space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Bank Account Details
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Commercial Bank"
                        value={cfgBankName}
                        onChange={(e) => setCfgBankName(e.target.value)}
                        className="w-full rounded-xl px-3 py-2"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                        Branch Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Colombo Fort"
                        value={cfgBranchName}
                        onChange={(e) => setCfgBranchName(e.target.value)}
                        className="w-full rounded-xl px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                        Account Holder Name
                      </label>
                      <input
                        type="text"
                        placeholder="Full name on account"
                        value={cfgAccountHolder}
                        onChange={(e) => setCfgAccountHolder(e.target.value)}
                        className="w-full rounded-xl px-3 py-2"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 100023456789"
                        value={cfgAccountNumber}
                        onChange={(e) => setCfgAccountNumber(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 font-mono"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                        SWIFT / Routing Code (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. CCEYLKLX"
                        value={cfgSwiftCode}
                        onChange={(e) => setCfgSwiftCode(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    {cfgMethod === 'wise'
                      ? 'Wise Email / Account ID'
                      : cfgMethod === 'payoneer'
                        ? 'Payoneer Account Email'
                        : cfgMethod === 'stripe_connect'
                          ? 'Stripe Account ID'
                          : 'USDC Wallet Address & Network'}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      cfgMethod === 'crypto_usdc'
                        ? 'e.g. 0x... (Base / Polygon)'
                        : 'e.g. dev@company.com'
                    }
                    value={cfgAccount}
                    onChange={(e) => setCfgAccount(e.target.value)}
                    className="w-full rounded-xl px-3 py-2"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid every 2nd Friday upon timesheet approval"
                  value={cfgNotes}
                  onChange={(e) => setCfgNotes(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfigMember(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-white font-semibold cursor-pointer shadow-xs"
                >
                  Save Payment Config
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {/* =================================================================
          MODAL 2: CONFIGURE TASK PAYMENT (Owner / payment:configure)
         ================================================================= */}
      {configTask &&
        canConfigure &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
            onClick={() => setConfigTask(null)}
          >
            <form
              onSubmit={handleSaveTaskPay}
              onClick={(e) => e.stopPropagation()}
              className="dp-popover-enter w-full max-w-md rounded-2xl bg-white dark:bg-[#131319] shadow-(--dp-shadow-popover) p-6 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                    Task Payment · {configTask.code}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {configTask.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfigTask(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Task Compensation Type
                  </label>
                  <select
                    value={taskPayType}
                    onChange={(e) =>
                      setTaskPayType(e.target.value as TaskPaymentConfig['payType'])
                    }
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                  >
                    <option value="fixed_bounty">Fixed Task Bounty (on completion / approval)</option>
                    <option value="hourly_rate">Task-Specific Hourly Rate</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    {taskPayType === 'fixed_bounty' ? 'Bounty Amount' : 'Hourly Rate'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.5"
                    value={taskPayAmount}
                    onChange={(e) => setTaskPayAmount(Number(e.target.value))}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Currency
                  </label>
                  <select
                    value={taskPayCurrency}
                    onChange={(e) => setTaskPayCurrency(e.target.value)}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="LKR">LKR</option>
                    <option value="AUD">AUD</option>
                    <option value="CAD">CAD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid upon QA sign-off and PR merge"
                  value={taskPayNotes}
                  onChange={(e) => setTaskPayNotes(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfigTask(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-white font-semibold cursor-pointer shadow-xs"
                >
                  Save Task Payment
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {/* =================================================================
          MODAL 3: RECORD PAYOUT (Owner / payment:record_payout)
         ================================================================= */}
      {payoutMember &&
        canRecordPayout &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
            onClick={() => setPayoutMember(null)}
          >
            <form
              onSubmit={handleRecordPayout}
              onClick={(e) => e.stopPropagation()}
              className="dp-popover-enter w-full max-w-lg rounded-2xl bg-white dark:bg-[#131319] shadow-(--dp-shadow-popover) p-6 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Record Payout · {payoutMember.name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Log a scheduled or completed disbursement to the developer&apos;s statement.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPayoutMember(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Period Label
                  </label>
                  <input
                    type="text"
                    value={payPeriodLabel}
                    onChange={(e) => setPayPeriodLabel(e.target.value)}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Gross Amount ({payCurrency})
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={payGrossAmount}
                    onChange={(e) => setPayGrossAmount(Number(e.target.value))}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Approved Mins
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={payApprovedMins}
                    onChange={(e) => setPayApprovedMins(Number(e.target.value))}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Status
                  </label>
                  <select
                    value={payStatus}
                    onChange={(e) =>
                      setPayStatus(e.target.value as DeveloperPayoutRecord['status'])
                    }
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="processing">Processing</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                    Reference Code
                  </label>
                  <input
                    type="text"
                    value={payRefCode}
                    onChange={(e) => setPayRefCode(e.target.value)}
                    className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] px-3.5 py-2.5 flex items-center justify-between font-mono">
                <span className="text-zinc-500">Net Payout (after {payTaxPct}% tax)</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {payCurrency}{' '}
                  {(payGrossAmount - payGrossAmount * (payTaxPct / 100)).toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Transfer reference or remarks..."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04] ring-1 ring-zinc-950/[0.08] dark:ring-white/[0.1] px-3 py-2 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayoutMember(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.07] text-zinc-700 dark:text-zinc-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer shadow-xs"
                >
                  Record Payout
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  )
}
