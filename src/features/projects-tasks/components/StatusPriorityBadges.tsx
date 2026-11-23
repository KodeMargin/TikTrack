import type { TaskIssueType, TaskRecord } from '@/context/Phase1Store'
import { getMemberInitials } from '../types'

export function IssueTypeBadge({
  type = 'task',
  showLabel = false,
  size = 'sm',
}: {
  type?: TaskIssueType
  showLabel?: boolean
  size?: 'xs' | 'sm'
}) {
  const iconSize = size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const config: Record<
    TaskIssueType,
    { label: string; bg: string; color: string; svg: React.ReactNode }
  > = {
    epic: {
      label: 'Epic',
      bg: 'bg-[#6d25da]/14 dark:bg-[#6d25da]/25',
      color: 'text-[#6d25da] dark:text-[#c5a8f0]',
      svg: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </svg>
      ),
    },
    story: {
      label: 'Story',
      bg: 'bg-emerald-500/14 dark:bg-emerald-500/20',
      color: 'text-emerald-600 dark:text-emerald-400',
      svg: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
        </svg>
      ),
    },
    task: {
      label: 'Task',
      bg: 'bg-sky-500/14 dark:bg-sky-500/20',
      color: 'text-sky-600 dark:text-sky-400',
      svg: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="m8.5 12.2 2.3 2.3 4.7-5" />
        </svg>
      ),
    },
    bug: {
      label: 'Bug',
      bg: 'bg-rose-500/14 dark:bg-rose-500/20',
      color: 'text-rose-600 dark:text-rose-400',
      svg: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      ),
    },
    subtask: {
      label: 'Subtask',
      bg: 'bg-zinc-500/12 dark:bg-white/[0.08]',
      color: 'text-zinc-600 dark:text-zinc-300',
      svg: (
        <svg className={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 5v9a2 2 0 0 0 2 2h10" />
          <path d="m15 12 4 4-4 4" />
        </svg>
      ),
    },
  }

  const c = config[type] ?? config.task

  return (
    <span
      title={c.label}
      className={`inline-flex items-center gap-1 rounded-md shrink-0 ${
        showLabel ? `px-1.5 py-0.5 text-[11px] font-semibold ${c.bg}` : `p-0.5 ${c.bg}`
      } ${c.color}`}
    >
      {c.svg}
      {showLabel && <span>{c.label}</span>}
    </span>
  )
}

export function PriorityBadge({
  priority,
  compact = false,
}: {
  priority: TaskRecord['priority']
  compact?: boolean
}) {
  const map: Record<
    TaskRecord['priority'],
    { label: string; badgeClass: string; icon: React.ReactNode }
  > = {
    urgent: {
      label: 'Urgent',
      badgeClass:
        'bg-rose-500/12 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="m17 11-5-5-5 5" />
          <path d="m17 18-5-5-5 5" />
        </svg>
      ),
    },
    high: {
      label: 'High',
      badgeClass:
        'bg-amber-500/14 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="m18 15-6-6-6 6" />
        </svg>
      ),
    },
    medium: {
      label: 'Medium',
      badgeClass:
        'bg-indigo-500/12 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
          <path d="M5 9h14M5 15h14" />
        </svg>
      ),
    },
    low: {
      label: 'Low',
      badgeClass:
        'bg-zinc-500/12 text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      ),
    },
  }

  const p = map[priority] ?? map.medium

  return (
    <span
      title={`Priority: ${p.label}`}
      className={`inline-flex items-center gap-1 rounded-md font-semibold shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${p.badgeClass}`}
    >
      {p.icon}
      {!compact && <span>{p.label}</span>}
    </span>
  )
}

export function StatusPill({ status }: { status: TaskRecord['status'] }) {
  const styles: Record<TaskRecord['status'], { label: string; cls: string; dot: string }> = {
    backlog: {
      label: 'Backlog',
      cls: 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-300',
      dot: 'bg-zinc-400',
    },
    active: {
      label: 'Active Work',
      cls: 'bg-[#6d25da]/12 text-[#581eae] dark:bg-[#6d25da]/25 dark:text-[#c5a8f0]',
      dot: 'bg-[#6d25da] dark:bg-[#a87ce9]',
    },
    review: {
      label: 'In Review',
      cls: 'bg-amber-500/14 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
      dot: 'bg-amber-500',
    },
    done: {
      label: 'Done',
      cls: 'bg-emerald-500/14 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    },
  }
  const s = styles[status] ?? styles.backlog
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

const AVATAR_TONES = [
  'bg-[#6d25da]/15 text-[#581eae] dark:bg-[#6d25da]/30 dark:text-[#d8c4f8]',
  'bg-sky-500/15 text-sky-700 dark:bg-sky-500/25 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-800 dark:bg-amber-500/25 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:bg-rose-500/25 dark:text-rose-300',
  'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-300',
]

function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function MemberAvatar({
  name,
  id,
  size = 'sm',
  ring = false,
}: {
  name: string
  id?: string
  size?: 'xs' | 'sm' | 'md'
  ring?: boolean
}) {
  const tone = AVATAR_TONES[hashString(id || name) % AVATAR_TONES.length]
  const dim =
    size === 'xs'
      ? 'h-5 w-5 text-[9.5px]'
      : size === 'md'
        ? 'h-7 w-7 text-[11px]'
        : 'h-6 w-6 text-[10px]'

  return (
    <span
      title={name}
      className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 select-none ${dim} ${tone} ${
        ring ? 'ring-2 ring-white dark:ring-[#131319]' : ''
      }`}
    >
      {getMemberInitials(name)}
    </span>
  )
}
