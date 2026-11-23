import { useState } from 'react'
import { notifyFeedback } from '@/lib/notify'
import { usePhase4Store } from '@/context/Phase4Store'
import { PHASE4_PLAN_CATALOG } from '@/lib/phase4/saasBilling'

const INPUT_CLS =
  'w-full rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#702fe3]/30 focus:border-[#702fe3] transition'

const LABEL_CLS = 'block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1'

export function WorkspaceBrandingCard() {
  const { subscription, whiteLabelBranding, updateWhiteLabelBranding } = usePhase4Store()
  const [brandDraft, setBrandDraft] = useState(() => whiteLabelBranding)
  const setNotice = notifyFeedback

  const currentPlanSpec = PHASE4_PLAN_CATALOG[subscription.planTier]

  return (
    <div className="rounded-2xl bg-white dark:bg-[#131319] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
          Workspace Branding
        </h3>
        {!currentPlanSpec.whiteLabelEnabled && (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
            Agency+ Plan
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className={LABEL_CLS}>Brand Name</label>
          <input
            type="text"
            value={brandDraft.agencyBrandName}
            onChange={(e) =>
              setBrandDraft((b) => ({ ...b, agencyBrandName: e.target.value }))
            }
            placeholder="Your Company Name"
            className={INPUT_CLS}
          />
        </div>

        <div>
          <label className={LABEL_CLS}>Custom Domain</label>
          <input
            type="text"
            value={brandDraft.customDomain}
            onChange={(e) =>
              setBrandDraft((b) => ({ ...b, customDomain: e.target.value }))
            }
            placeholder="app.yourdomain.com"
            className={`${INPUT_CLS} font-mono`}
          />
        </div>

        <div>
          <label className={LABEL_CLS}>Logo Monogram (max 4 chars)</label>
          <input
            type="text"
            value={brandDraft.logoText}
            maxLength={4}
            onChange={(e) =>
              setBrandDraft((b) => ({ ...b, logoText: e.target.value.toUpperCase() }))
            }
            placeholder="TT"
            className={`${INPUT_CLS} font-mono`}
          />
        </div>

        <div>
          <label className={LABEL_CLS}>Accent Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandDraft.accentColorHex}
              onChange={(e) =>
                setBrandDraft((b) => ({ ...b, accentColorHex: e.target.value }))
              }
              className="h-9 w-12 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-1 cursor-pointer shrink-0"
            />
            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">
              {brandDraft.accentColorHex}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          role="switch"
          aria-checked={brandDraft.hideDevProofWatermark}
          onClick={() =>
            setBrandDraft((b) => ({
              ...b,
              hideDevProofWatermark: !b.hideDevProofWatermark,
            }))
          }
          className="flex-1 min-w-64 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 ring-1 ring-zinc-950/[0.04] dark:ring-white/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <div>
            <div className="text-xs font-semibold text-zinc-900 dark:text-white">
              Hide TikTrack Watermark
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Remove platform branding from exported reports and invoices
            </div>
          </div>
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              brandDraft.hideDevProofWatermark
                ? 'bg-[#702fe3]'
                : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                brandDraft.hideDevProofWatermark ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            const res = updateWhiteLabelBranding(brandDraft)
            setNotice({ ok: res.ok, text: res.message })
          }}
          className="px-5 py-2.5 rounded-xl bg-[#702fe3] hover:bg-[#5f21cc] text-white text-xs font-semibold transition cursor-pointer shrink-0"
        >
          Save Branding
        </button>
      </div>
    </div>
  )
}
