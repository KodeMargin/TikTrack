import { useRef, useState } from 'react'
import type { TaskIssueType } from '@/context/Phase1Store'
import { IssueTypeBadge } from './StatusPriorityBadges'

const QUICK_TYPES: TaskIssueType[] = ['task', 'story', 'bug', 'epic']

export function InlineQuickCreate({
  placeholder = 'What needs to be done?',
  buttonLabel = 'Create issue',
  defaultIssueType = 'task',
  compact = false,
  onCreate,
}: {
  placeholder?: string
  buttonLabel?: string
  defaultIssueType?: TaskIssueType
  compact?: boolean
  onCreate: (title: string, issueType: TaskIssueType) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [issueType, setIssueType] = useState<TaskIssueType>(defaultIssueType)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleOpen() {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onCreate(trimmed, issueType)
    setTitle('')
    inputRef.current?.focus()
  }

  function cycleType() {
    const idx = QUICK_TYPES.indexOf(issueType)
    setIssueType(QUICK_TYPES[(idx + 1) % QUICK_TYPES.length])
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className={`w-full flex items-center gap-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition cursor-pointer ${
          compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
        }`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>{buttonLabel}</span>
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-white dark:bg-[#16161d] p-2.5 space-y-2 shadow-[0_2px_10px_rgba(15,5,31,0.08),0_0_0_1.5px_rgba(109,37,218,0.45)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.45),0_0_0_1.5px_rgba(168,124,233,0.45)]"
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            setTitle('')
          }
        }}
        placeholder={placeholder}
        className="w-full !px-2.5 !py-1.5 text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={cycleType}
          title="Click to switch issue type"
          className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition cursor-pointer"
        >
          <IssueTypeBadge type={issueType} showLabel size="xs" />
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setTitle('')
            }}
            className="px-2 py-1 rounded-md text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/[0.06] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="px-2.5 py-1 rounded-md bg-[#6d25da] hover:bg-[#581eae] disabled:opacity-45 text-[11px] font-semibold text-white cursor-pointer"
          >
            Add
          </button>
        </div>
      </div>
    </form>
  )
}
