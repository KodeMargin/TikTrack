import { useState } from 'react'
import { Phase1StoreProvider, usePhase1Store } from '@/context/Phase1Store'
import { ProjectsTasksView } from '@/features/projects-tasks/ProjectsTasksView'
import { WorkSessionTimerView } from '@/features/sessions-timer/WorkSessionTimerView'
import { TimesheetsAndReviewView } from '@/features/timesheets-review/TimesheetsAndReviewView'
import { BillingAndAdminView } from '@/features/billing-contracts/BillingAndAdminView'
import { GroundTruthSimulator } from '@/features/phase0-workbench/GroundTruthSimulator'
import { PrivacyDpiaInspector } from '@/features/phase0-workbench/PrivacyDpiaInspector'

type NavSection =
  | 'timer-sessions'
  | 'projects-tasks'
  | 'timesheets-review'
  | 'billing-admin'
  | 'phase0-simulator'

const NAV_ITEMS: {
  id: NavSection
  badge: string
  label: string
  subtitle: string
}[] = [
    {
      id: 'timer-sessions',
      badge: 'F1-020..030',
      label: 'Work Session Timer & Deep Work',
      subtitle: 'Visible timer, 8 work modes, offline queue & manual entry',
    },
    {
      id: 'projects-tasks',
      badge: 'F1-010..016',
      label: 'Projects & Task Board',
      subtitle: 'Kanban/list views, acceptance criteria & task assignments',
    },
    {
      id: 'timesheets-review',
      badge: 'F1-040..043',
      label: 'Timesheets & Manager Review',
      subtitle: '5 time concepts, clarification requests & dispute trail',
    },
    {
      id: 'billing-admin',
      badge: 'F1-001..007 / F1-044..047',
      label: 'Contracts, Invoices & Tenancy',
      subtitle: 'Effective-dated rates, locked invoices, RBAC & audit log',
    },
    {
      id: 'phase0-simulator',
      badge: 'D-001..006',
      label: 'Phase 0 Simulator & DPIA Gate',
      subtitle: 'Ground-truth pilot fixtures & live privacy schema validator',
    },
  ]

function DevProofShell() {
  const {
    tenants,
    activeTenant,
    setActiveTenantId,
    members,
    activeUser,
    setActiveUserId,
    timer,
    setTimerTaskAndMode,
    transitionTimer,
    prismaStatus,
    refreshPrismaConnection,
  } = usePhase1Store()

  const [activeSection, setActiveSection] =
    useState<NavSection>('timesheets-review')

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Persistent Top Governing Principle & Live Timer Tray (F1-027) */}
      <div className="bg-indigo-950/90 border-b border-indigo-800/70 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-indigo-200">
          <span
            className={`h-2.5 w-2.5 rounded-full ${timer.lifecycle === 'running'
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-amber-400'
              }`}
          />
          <span className="font-semibold text-white">
            Tray Indicator (F1-027):
          </span>
          <span className="font-mono">
            {timer.lifecycle === 'running'
              ? `RECORDING [${timer.workMode.toUpperCase()}]`
              : timer.lifecycle.toUpperCase()}
          </span>
          <span className="hidden md:inline text-indigo-300">
            • Distinguished metrics: Elapsed | Claimed | Observed | Supported | Approved
          </span>
        </div>

        {/* Multi-Tenant & Role Persona Switcher (Tests F1-001, F1-004 & Scenario 7) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 rounded-lg px-2.5 py-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Tenant:
            </span>
            <select
              value={activeTenant.id}
              onChange={(e) => setActiveTenantId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900">
                  {t.name} ({t.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-indigo-500/50 rounded-lg px-2.5 py-1">
            <span className="text-[10px] uppercase tracking-wider text-indigo-300 font-semibold">
              Active Role:
            </span>
            <select
              value={activeUser.id}
              onChange={(e) => setActiveUserId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-emerald-300 focus:outline-none cursor-pointer"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id} className="bg-slate-900">
                  {m.name} — {m.role.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Header & Phase 1 Navigation */}
      <header className="border-b border-slate-800/90 bg-slate-950/75 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-inner">
                DP
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-white">
                    DevProof <span className="text-slate-400 font-normal">(TikTrack)</span>
                  </h1>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Phase 1 — Commercially Usable MVP
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Supabase-First Multi-Tenant Work Verification & Contract Billing SaaS
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => void refreshPrismaConnection()}
                title={prismaStatus.message}
                className={`px-2.5 py-1 rounded border flex items-center gap-1.5 cursor-pointer transition ${
                  prismaStatus.connected
                    ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    prismaStatus.connected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>
                  {prismaStatus.connected
                    ? `Prisma ORM: Connected (${prismaStatus.projectRef ?? 'Supabase'})`
                    : 'Prisma ORM: Set DATABASE_URL in .env.local'}
                </span>
              </button>
              <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                Plan: {activeTenant.planTier.toUpperCase()}
              </span>
              <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                Policy: {activeTenant.policyVersion}
              </span>
              <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-emerald-300">
                Rounding: {activeTenant.roundingRule}
              </span>
            </div>
          </div>

          <nav className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {NAV_ITEMS.map((item) => {
              const selected = item.id === activeSection
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`text-left p-3 rounded-xl border transition cursor-pointer ${selected
                      ? 'border-indigo-500 bg-indigo-950/50 text-white shadow-sm'
                      : 'border-slate-800/90 bg-slate-900/50 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/80">
                      {item.badge}
                    </span>
                    {selected && (
                      <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    )}
                  </div>
                  <div className="text-xs font-semibold mt-1.5">{item.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    {item.subtitle}
                  </div>
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeSection === 'timer-sessions' && <WorkSessionTimerView />}
        {activeSection === 'projects-tasks' && (
          <ProjectsTasksView
            onLaunchTimerForTask={(projectId, taskId, mode) => {
              setTimerTaskAndMode(projectId, taskId, mode)
              transitionTimer('running')
              setActiveSection('timer-sessions')
            }}
          />
        )}
        {activeSection === 'timesheets-review' && <TimesheetsAndReviewView />}
        {activeSection === 'billing-admin' && <BillingAndAdminView />}
        {activeSection === 'phase0-simulator' && (
          <div className="space-y-8">
            <GroundTruthSimulator />
            <PrivacyDpiaInspector />
          </div>
        )}
      </main>
    </div>
  )
}

export function App() {
  return (
    <Phase1StoreProvider>
      <DevProofShell />
    </Phase1StoreProvider>
  )
}

export default App
