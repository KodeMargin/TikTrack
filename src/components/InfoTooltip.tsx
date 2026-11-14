import type { ReactNode } from 'react'

export function InfoTooltip({
  text,
  children,
  align = 'center',
}: {
  text: string
  children?: ReactNode
  align?: 'left' | 'center' | 'right'
}) {
  const alignClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'

  return (
    <span className="relative inline-flex items-center group">
      {children ?? (
        <span
          tabIndex={0}
          aria-label={text}
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-zinc-400 hover:text-[#6d25da] dark:text-zinc-500 dark:hover:text-[#c5a8f0] transition-colors cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d25da]/40"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      )}
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full mb-2 ${alignClass} z-50 w-56 rounded-lg bg-zinc-900 dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal leading-snug text-zinc-100 shadow-lg opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100`}
      >
        {text}
      </span>
    </span>
  )
}
