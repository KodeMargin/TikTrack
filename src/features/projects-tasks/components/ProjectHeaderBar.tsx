import { useEffect, useRef, useState } from 'react'
import type { ProjectRecord, SprintRecord } from '@/context/Phase1Store'
import type { ProjectPermissions, ProjectTab } from '../types'

const TABS: {
  id: ProjectTab
  label: string
  iconPath: string
  requiresSettingsPerm?: boolean
}[] = [
  {
    id: 'board',
    label: 'Board',
    iconPath: 'M3 4h5v16H3V4Zm7 0h5v10h-5V4Zm7 0h4v14h-4V4Z',
  },
  {
    id: 'backlog',
    label: 'Backlog & Sprints',
    iconPath: 'M4 6h16M4 10h16M4 14h10M4 18h10',
  },
  {
    id: 'list',
    label: 'List',
    iconPath: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  },
  {
    id: 'summary',
    label: 'Summary',
    iconPath: 'M4 19h16M6 16V9m4 7V5m4 11v-4m4 4V8',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    iconPath: 'M3 7h8m-4 5h12m-8 5h10M3 4v16',
  },
  {
    id: 'settings',
    label: 'Settings',
    iconPath:
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
    requiresSettingsPerm: true,
  },
]

export function ProjectHeaderBar({
  tenantName,
  projects,
  currentProject,
  activeSprint,
  taskCountByProject,
  activeTab,
  onSelectTab,
  onSelectProject,
  onOpenNewProject,
  onOpenNewIssue,
  permissions,
  projectTaskCount,
  backlogTaskCount,
}: {
  tenantName: string
  projects: ProjectRecord[]
  currentProject: ProjectRecord | undefined
  activeSprint: SprintRecord | undefined
  taskCountByProject: Map<string, number>
  activeTab: ProjectTab
  onSelectTab: (tab: ProjectTab) => void
  onSelectProject: (projectId: string) => void
  onOpenNewProject: () => void
  onOpenNewIssue: () => void
  permissions: ProjectPermissions
  projectTaskCount: number
  backlogTaskCount: number
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const filteredProjects = projects.filter((p) => {
    const q = projectSearch.trim().toLowerCase()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.clientName.toLowerCase().includes(q)
    )
  })

  const visibleTabs = TABS.filter(
    (tab) =>
      !tab.requiresSettingsPerm ||
      permissions.canEditProject ||
      permissions.canDeleteProject
  )

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111117] px-5 pt-4 pb-0 space-y-3.5">
      {/* Top Row: Project Switcher + Context + Primary CTAs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {/* Searchable Project Switcher Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setSwitcherOpen((v) => !v)}
              className="group inline-flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl bg-zinc-100/80 hover:bg-zinc-200/70 dark:bg-white/[0.05] dark:hover:bg-white/[0.09] transition cursor-pointer"
            >
              <span className="h-8 w-8 rounded-lg bg-[#6d25da] text-white font-mono text-xs font-bold flex items-center justify-center shadow-xs shrink-0">
                {(currentProject?.code || 'PRJ').slice(0, 3)}
              </span>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white truncate max-w-[220px]">
                    {currentProject?.name ?? 'No Project Selected'}
                  </span>
                  {currentProject && (
                    <span className="font-mono text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-white/[0.08] text-[#6d25da] dark:text-[#c5a8f0]">
                      {currentProject.code}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[260px]">
                  {currentProject
                    ? `${currentProject.clientName} · ${tenantName}`
                    : `${tenantName} Workspace`}
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-zinc-400 transition-transform duration-150 ${switcherOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {switcherOpen && (
              <div className="dp-popover-enter absolute left-0 mt-2 w-80 rounded-2xl bg-white dark:bg-[#15151d] shadow-(--dp-shadow-popover) p-2 z-40 border border-zinc-200/80 dark:border-white/[0.08]">
                <div className="px-2 pb-2">
                  <input
                    type="search"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Switch project or search client..."
                    className="w-full !px-2.5 !py-1.5 text-xs"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {filteredProjects.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-400">
                      No matching projects
                    </div>
                  ) : (
                    filteredProjects.map((proj) => {
                      const selected = proj.id === currentProject?.id
                      const count = taskCountByProject.get(proj.id) ?? 0
                      return (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            onSelectProject(proj.id)
                            setSwitcherOpen(false)
                            setProjectSearch('')
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition cursor-pointer ${
                            selected
                              ? 'bg-[#6d25da]/12 dark:bg-[#6d25da]/22 text-[#581eae] dark:text-[#d8c4f8]'
                              : 'hover:bg-zinc-100/80 dark:hover:bg-white/[0.05] text-zinc-800 dark:text-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="h-7 w-7 rounded-lg bg-[#6d25da]/12 dark:bg-[#6d25da]/25 text-[#6d25da] dark:text-[#c5a8f0] font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                              {proj.code.slice(0, 3)}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{proj.name}</div>
                              <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">
                                {proj.code} · {proj.clientName}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {proj.status !== 'active' && (
                              <span className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">
                                {proj.status}
                              </span>
                            )}
                            <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.07] text-zinc-500 dark:text-zinc-400">
                              {count}
                            </span>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
                {permissions.canCreateProject && (
                  <div className="pt-2 mt-1.5 border-t border-zinc-100 dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => {
                        setSwitcherOpen(false)
                        onOpenNewProject()
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:bg-[#6d25da]/10 transition cursor-pointer"
                    >
                      + Create New Project
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project Status & Active Sprint Indicator Pills */}
          {currentProject && (
            <div className="hidden md:flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${
                  currentProject.status === 'active'
                    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                    : currentProject.status === 'paused'
                      ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                      : 'bg-zinc-200/80 text-zinc-600 dark:bg-white/10 dark:text-zinc-400'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    currentProject.status === 'active'
                      ? 'bg-emerald-500'
                      : currentProject.status === 'paused'
                        ? 'bg-amber-500'
                        : 'bg-zinc-400'
                  }`}
                />
                {currentProject.status}
              </span>

              {activeSprint && (
                <button
                  type="button"
                  onClick={() => onSelectTab('backlog')}
                  title={activeSprint.goal || 'View Active Sprint'}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#6d25da]/10 text-[#581eae] dark:bg-[#6d25da]/22 dark:text-[#d8c4f8] hover:bg-[#6d25da]/18 transition cursor-pointer"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#6d25da] dark:bg-[#a87ce9] animate-pulse" />
                  <span>{activeSprint.name}</span>
                  {activeSprint.endDate && (
                    <span className="opacity-70 font-normal">· ends {activeSprint.endDate}</span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Primary Actions */}
        <div className="flex items-center gap-2">
          {permissions.canCreateProject && (
            <button
              type="button"
              onClick={onOpenNewProject}
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 hover:bg-zinc-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition cursor-pointer"
            >
              + New Project
            </button>
          )}
          {permissions.canCreateTask && currentProject && (
            <button
              type="button"
              onClick={onOpenNewIssue}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6d25da] hover:bg-[#581eae] text-xs font-semibold text-white shadow-sm shadow-[#6d25da]/25 transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Create Issue</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Row: Jira-Style Project Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto -mb-px">
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id
          const badge =
            tab.id === 'board' || tab.id === 'list'
              ? projectTaskCount
              : tab.id === 'backlog'
                ? backlogTaskCount
                : null
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`relative inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'text-[#6d25da] dark:text-[#c5a8f0]'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={tab.iconPath} />
              </svg>
              <span>{tab.label}</span>
              {badge !== null && (
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-[#6d25da]/12 text-[#6d25da] dark:bg-[#6d25da]/25 dark:text-[#d8c4f8]'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400'
                  }`}
                >
                  {badge}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#6d25da] dark:bg-[#a87ce9]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
