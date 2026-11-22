import { useState } from 'react'
import { usePhase3Store } from '@/context/Phase3Store'
import type { VerificationRuleCode } from '@/types/domain.types'

const RULE_SUMMARIES: Record<
  VerificationRuleCode,
  { title: string; summary: string }
> = {
  'R-01': {
    title: 'Quiet Gap Reminder',
    summary: 'Quiet periods in standard modes ask for a quick note - zero automatic pay cuts.',
  },
  'R-02': {
    title: 'Overlap Cleanup',
    summary: 'Overlapping activity across tools is merged automatically so time is never double-counted.',
  },
  'R-03': {
    title: 'Zero-Commit Debugging',
    summary: 'Debugging and local tests count as real work even without Git commits.',
  },
  'R-04': {
    title: 'Docs & Research Match',
    summary: 'Reading documentation matches Research mode without tracking reading speed.',
  },
  'R-05': {
    title: 'Later PR & Commit Link',
    summary: 'Commits or PRs merged later can link back as context to earlier sessions.',
  },
  'R-06': {
    title: 'Over-Estimate Heads-Up',
    summary: 'Alerts managers when a task passes its time estimate for budget planning.',
  },
  'R-07': {
    title: 'Manual Time Review',
    summary: 'Manual entries include your note for quick reviewer verification.',
  },
  'R-08': {
    title: 'Device Clock Sync Check',
    summary: 'Flags clock drift as a technical sync issue - never tampering.',
  },
}

const RULE_CODES: VerificationRuleCode[] = [
  'R-01',
  'R-02',
  'R-03',
  'R-04',
  'R-05',
  'R-06',
  'R-07',
  'R-08',
]

export function ActiveRulesSummaryBanner() {
  const { activeRuleSet } = usePhase3Store()
  const [expanded, setExpanded] = useState(false)

  const cfg = activeRuleSet.rulesConfig
  const enabledCodes = RULE_CODES.filter((code) => cfg.enabledRules[code])

  return (
    <section className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] px-4 py-3.5 sm:px-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#6d25da]/10 dark:bg-[#6d25da]/25 text-[#581eae] dark:text-[#c5a8f0] text-[11px] font-semibold">
            🛡 Active Review Rules (v{activeRuleSet.versionNumber})
          </span>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-600 dark:text-zinc-300">
            <span>
              Quiet gap reminder:{' '}
              <strong className="font-mono text-zinc-900 dark:text-white">
                &gt;{cfg.idleClarificationThresholdMinutes}m
              </strong>
            </span>
            <span className="opacity-40">•</span>
            <span>
              Deep-work grace:{' '}
              <strong className="font-mono text-zinc-900 dark:text-white">
                {cfg.deepWorkNoInputWindowMinutes}m
              </strong>
            </span>
            <span className="opacity-40">•</span>
            <span>
              Over-estimate alert:{' '}
              <strong className="font-mono text-zinc-900 dark:text-white">
                {cfg.estimateVarianceAlertPercent}%
              </strong>
            </span>
            <span className="opacity-40 hidden sm:inline">•</span>
            <span className="text-emerald-700 dark:text-emerald-300 font-medium hidden sm:inline">
              No auto pay cuts
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6d25da] dark:text-[#c5a8f0] hover:underline shrink-0 cursor-pointer"
        >
          <span>
            {expanded
              ? 'Hide details'
              : `View ${enabledCodes.length} active checks`}
          </span>
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="dp-view-enter pt-3 border-t border-zinc-100 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {enabledCodes.map((code) => {
            const info = RULE_SUMMARIES[code]
            return (
              <div
                key={code}
                className="rounded-xl bg-zinc-50/90 dark:bg-white/[0.03] p-3 space-y-1"
              >
                <div className="font-bold text-zinc-900 dark:text-white flex items-center justify-between gap-1.5">
                  <span className="truncate">{info.title}</span>
                  <span className="font-mono text-[10px] text-[#6d25da] dark:text-[#c5a8f0] shrink-0">
                    {code}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                  {info.summary}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
