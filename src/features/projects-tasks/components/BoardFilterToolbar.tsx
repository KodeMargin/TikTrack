import type { SprintRecord, TaskIssueType, WorkspaceMember } from '@/context/Phase1Store'
import type { WorkMode } from '@/types/domain.types'
import {
  countActiveFilters,
  DEFAULT_BOARD_FILTERS,
  ISSUE_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  WORK_MODE_OPTIONS,
  type BoardFilters,
  type SwimlaneMode,
  type TaskPriority,
} from '../types'
import { MemberAvatar } from './StatusPriorityBadges'

export function BoardFilterToolbar({
  filters,
  onChangeFilters,
  activeMembers,
  sprints,
  showSwimlanes = false,
  swimlaneMode = 'none',
  onChangeSwimlaneMode,
  totalCount,
  filteredCount,
}: {
  filters: BoardFilters
  onChangeFilters: (next: BoardFilters) => void
  activeMembers: WorkspaceMember[]
  sprints: SprintRecord[]
  showSwimlanes?: boolean
  swimlaneMode?: SwimlaneMode
  onChangeSwimlaneMode?: (mode: SwimlaneMode) => void
  totalCount: number
  filteredCount: number
}) {
  const activeCount = countActiveFilters(filters)

  function toggleAssignee(memberId: string) {
    const exists = filters.assigneeIds.includes(memberId)
    onChangeFilters({
      ...filters,
      unassignedOnly: false,
      assigneeIds: exists
        ? filters.assigneeIds.filter((id) => id !== memberId)
        : [...filters.assigneeIds, memberId],
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-white/95 dark:bg-[#111117] px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,5,31,0.04),0_0_0_1px_rgba(15,5,31,0.07)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
      {/* Left: Search + Assignee Avatar Filter Stack + Quick Toggles */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <div className="relative w-48 sm:w-56">
          <svg
            className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
            placeholder="Search key, title, label..."
            className="w-full !pl-8 !pr-2.5 !py-1.5 text-xs"
          />
        </div>

        {/* Assignee Avatar Stack */}
        {activeMembers.length > 0 && (
          <div className="flex items-center -space-x-1.5 pl-0.5">
            {activeMembers.slice(0, 6).map((m) => {
              const selected = filters.assigneeIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleAssignee(m.id)}
                  title={`Filter by ${m.name}`}
                  className={`relative rounded-full transition hover:z-10 hover:scale-110 cursor-pointer ${
                    selected
                      ? 'z-10 ring-2 ring-[#6d25da] dark:ring-[#a87ce9] scale-105'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <MemberAvatar name={m.name} id={m.id} size="md" ring />
                </button>
              )
            })}
            {activeMembers.length > 6 && (
              <span className="h-7 w-7 rounded-full bg-zinc-100 dark:bg-white/[0.08] text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 flex items-center justify-center ring-2 ring-white dark:ring-[#111117]">
                +{activeMembers.length - 6}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            onChangeFilters({
              ...filters,
              onlyMyIssues: !filters.onlyMyIssues,
              unassignedOnly: false,
            })
          }
          className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition cursor-pointer ${
            filters.onlyMyIssues
              ? 'bg-[#6d25da] text-white'
              : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-white/[0.09]'
          }`}
        >
          Only My Issues
        </button>

        <button
          type="button"
          onClick={() =>
            onChangeFilters({
              ...filters,
              unassignedOnly: !filters.unassignedOnly,
              onlyMyIssues: false,
              assigneeIds: [],
            })
          }
          className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition cursor-pointer ${
            filters.unassignedOnly
              ? 'bg-[#6d25da] text-white'
              : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-white/[0.09]'
          }`}
        >
          Unassigned
        </button>

        <button
          type="button"
          onClick={() =>
            onChangeFilters({
              ...filters,
              overdueOnly: !filters.overdueOnly,
            })
          }
          className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition cursor-pointer ${
            filters.overdueOnly
              ? 'bg-rose-600 text-white'
              : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-white/[0.09]'
          }`}
        >
          Overdue
        </button>

        <button
          type="button"
          onClick={() =>
            onChangeFilters({
              ...filters,
              overEstimateOnly: !filters.overEstimateOnly,
            })
          }
          className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition cursor-pointer ${
            filters.overEstimateOnly
              ? 'bg-amber-600 text-white'
              : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-white/[0.09]'
          }`}
        >
          Over Est.
        </button>
      </div>

      {/* Right: Dropdown Filters + Swimlanes + Reset */}
      <div className="flex flex-wrap items-center gap-2">
        {sprints.length > 0 && (
          <select
            aria-label="Filter by sprint"
            value={filters.sprintFilter}
            onChange={(e) => onChangeFilters({ ...filters, sprintFilter: e.target.value })}
            className="!py-1 !pl-2.5 !pr-7 !text-xs"
          >
            <option value="all">All Sprints</option>
            <option value="active_sprint">Active Sprint</option>
            <option value="backlog_only">Backlog Only</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        )}

        <select
          aria-label="Filter by issue type"
          value={filters.issueTypes[0] ?? ''}
          onChange={(e) =>
            onChangeFilters({
              ...filters,
              issueTypes: e.target.value ? [e.target.value as TaskIssueType] : [],
            })
          }
          className="!py-1 !pl-2.5 !pr-7 !text-xs"
        >
          <option value="">All Types</option>
          {ISSUE_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by priority"
          value={filters.priorities[0] ?? ''}
          onChange={(e) =>
            onChangeFilters({
              ...filters,
              priorities: e.target.value ? [e.target.value as TaskPriority] : [],
            })
          }
          className="!py-1 !pl-2.5 !pr-7 !text-xs"
        >
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by work mode"
          value={filters.workModes[0] ?? ''}
          onChange={(e) =>
            onChangeFilters({
              ...filters,
              workModes: e.target.value ? [e.target.value as WorkMode] : [],
            })
          }
          className="!py-1 !pl-2.5 !pr-7 !text-xs capitalize"
        >
          <option value="">All Modes</option>
          {WORK_MODE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by billing status"
          value={filters.billable}
          onChange={(e) =>
            onChangeFilters({
              ...filters,
              billable: e.target.value as BoardFilters['billable'],
            })
          }
          className="!py-1 !pl-2.5 !pr-7 !text-xs"
        >
          <option value="all">Billing: All</option>
          <option value="billable">Billable Only</option>
          <option value="non_billable">Non-Billable</option>
        </select>

        {showSwimlanes && onChangeSwimlaneMode && (
          <select
            aria-label="Group board by swimlanes"
            value={swimlaneMode}
            onChange={(e) => onChangeSwimlaneMode(e.target.value as SwimlaneMode)}
            className="!py-1 !pl-2.5 !pr-7 !text-xs"
          >
            <option value="none">Group: None</option>
            <option value="assignee">Swimlanes: Assignee</option>
            <option value="priority">Swimlanes: Priority</option>
            <option value="parent">Swimlanes: Parent / Epic</option>
          </select>
        )}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChangeFilters(DEFAULT_BOARD_FILTERS)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
          >
            <span>Clear ({activeCount})</span>
            <span className="text-[10.5px] opacity-75 font-mono">
              {filteredCount}/{totalCount}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
