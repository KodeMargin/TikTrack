import { useState } from 'react'
import { usePhase1Store } from '@/context/Phase1Store'
import { usePhase4Store } from '@/context/Phase4Store'
import {
  formatPortableReportMarkdown,
  verifyPortableWorkReportSignature,
} from '@/lib/phase4/portableReport'

const INPUT_CLS =
  'w-full rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#702fe3]/30 focus:border-[#702fe3] transition'

const LABEL_CLS = 'block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1'

const CARD_CLS =
  'rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-sm p-5'

export function PortableWorkReportPanel({
  onFeedback,
}: {
  onFeedback?: (msg: { ok: boolean; text: string }) => void
}) {
  const { activeUser } = usePhase1Store()
  const { portableReports, generateDeveloperPortableReport } = usePhase4Store()

  const [reportTitle, setReportTitle] = useState(`${activeUser.name} - Verified Work Summary`)
  const [periodStart, setPeriodStart] = useState('2026-11-01')
  const [periodEnd, setPeriodEnd] = useState('2026-11-30')
  const [verifiedReportIds, setVerifiedReportIds] = useState<Record<string, boolean>>({})

  const myReports = portableReports.filter((r) => r.developerUserId === activeUser.id)

  function downloadTextFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    const res = await generateDeveloperPortableReport({
      reportTitle,
      periodStart,
      periodEnd,
    })
    onFeedback?.({ ok: res.ok, text: res.message })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className={`lg:col-span-5 ${CARD_CLS} space-y-4`}>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          Create Verified Work Report
        </h3>

        <form onSubmit={(e) => void handleGenerate(e)} className="space-y-3">
          <div>
            <label className={LABEL_CLS}>Report Title</label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className={INPUT_CLS}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Start Date</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className={`${INPUT_CLS} font-mono`}
                required
              />
            </div>
            <div>
              <label className={LABEL_CLS}>End Date</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className={`${INPUT_CLS} font-mono`}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition cursor-pointer"
          >
            Generate Signed Report
          </button>
        </form>
      </div>

      <div className={`lg:col-span-7 ${CARD_CLS} space-y-4`}>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          Your Generated Reports
        </h3>

        {myReports.length === 0 ? (
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
            No verified work reports generated for {activeUser.name} yet.
          </div>
        ) : (
          <div className="space-y-3">
            {myReports.map((r) => {
              const isVerified = verifiedReportIds[r.id]
              return (
                <div
                  key={r.id}
                  className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] p-4 space-y-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-zinc-900 dark:text-white">
                        {r.reportTitle}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                        {r.periodStart} → {r.periodEnd} ·{' '}
                        {(r.totalApprovedMinutes / 60).toFixed(2)}h approved ·{' '}
                        {r.deliverablesCount} deliverable(s)
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          void verifyPortableWorkReportSignature(r).then((valid) => {
                            setVerifiedReportIds((prev) => ({ ...prev, [r.id]: valid }))
                          })
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 transition cursor-pointer ${
                          isVerified
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30'
                            : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 ring-zinc-200 dark:ring-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {isVerified ? 'Verified ✓' : 'Verify'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            `${r.id}.json`,
                            JSON.stringify(r.reportPayload, null, 2),
                            'application/json'
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#702fe3] hover:bg-[#5f21cc] text-white text-[11px] font-semibold cursor-pointer"
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            `${r.id}.md`,
                            formatPortableReportMarkdown(r),
                            'text/markdown'
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 text-[11px] font-semibold cursor-pointer"
                      >
                        Markdown
                      </button>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                    Verification Hash: {r.payloadDigestSha256}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
