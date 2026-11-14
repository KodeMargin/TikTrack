import { useState } from 'react'
import {
  DEFAULT_TRACKING_POLICY_SPEC,
  PROHIBITED_METADATA_KEYS,
  validateEventEnvelope,
} from '@/lib/schemas'

const PRESET_PAYLOADS = [
  {
    id: 'valid-deep-work',
    label: '✓ Valid Deep-Work Mode Envelope',
    json: JSON.stringify(
      {
        event_id: '01J9Z9001-DEEP-WORK',
        schema_version: 1,
        tenant_id: 'tenant-northstar-labs',
        user_id: 'usr-dev-aria',
        device_id: 'dev-macbook-pro-1',
        session_id: 'ses-20261110-001',
        source: 'desktop',
        event_type: 'work_mode_changed',
        occurred_at_utc: '2026-11-10T09:45:00Z',
        local_sequence: 128,
        monotonic_elapsed_ms: 2700000,
        consent_policy_version: DEFAULT_TRACKING_POLICY_SPEC.version,
        metadata: {
          mode: 'thinking',
          task_id: 'DEV-104',
          app_category: 'ide',
        },
        integrity: {
          agent_build: '1.0.0',
          batch_id: 'batch-204',
        },
      },
      null,
      2
    ),
  },
  {
    id: 'invalid-keystroke-leak',
    label: '✗ Attempted Keystroke & Clipboard Surveillance Leak (Blocked)',
    json: JSON.stringify(
      {
        event_id: '01J9Z9002-INVASIVE',
        schema_version: 1,
        tenant_id: 'tenant-northstar-labs',
        user_id: 'usr-dev-aria',
        device_id: 'dev-macbook-pro-1',
        session_id: 'ses-20261110-001',
        source: 'desktop',
        event_type: 'activity_rollup_1m',
        occurred_at_utc: '2026-11-10T09:46:00Z',
        local_sequence: 129,
        monotonic_elapsed_ms: 2760000,
        consent_policy_version: DEFAULT_TRACKING_POLICY_SPEC.version,
        metadata: {
          app_category: 'ide',
          keystrokes: 'const secretKey = ...',
          clipboard_text: 'postgres://admin:pass@db.internal',
          window_title_raw: 'Private Bank Portal - Chrome',
        },
        integrity: {
          agent_build: '1.0.0',
          batch_id: 'batch-205',
        },
      },
      null,
      2
    ),
  },
  {
    id: 'invalid-excluded-app',
    label: '✗ Local Privacy Denylist App ("Signal") Suppressed',
    json: JSON.stringify(
      {
        event_id: '01J9Z9003-DENYLIST',
        schema_version: 1,
        tenant_id: 'tenant-northstar-labs',
        user_id: 'usr-dev-aria',
        device_id: 'dev-macbook-pro-1',
        session_id: 'ses-20261110-001',
        source: 'desktop',
        event_type: 'activity_rollup_1m',
        occurred_at_utc: '2026-11-10T09:47:00Z',
        local_sequence: 130,
        monotonic_elapsed_ms: 2820000,
        consent_policy_version: DEFAULT_TRACKING_POLICY_SPEC.version,
        metadata: {
          app_category: 'communication',
          app_identifier: 'Signal Desktop Messenger',
        },
        integrity: {
          agent_build: '1.0.0',
          batch_id: 'batch-206',
        },
      },
      null,
      2
    ),
  },
]

export function PrivacyDpiaInspector() {
  const [rawJson, setRawJson] = useState(PRESET_PAYLOADS[0].json)
  const [excludedApps] = useState(['1Password', 'Signal', 'WhatsApp'])

  let parsedPayload: unknown = null
  let parseError: string | null = null
  try {
    parsedPayload = JSON.parse(rawJson)
  } catch (err) {
    parseError = err instanceof Error ? err.message : 'Invalid JSON syntax'
  }

  const validation = parseError
    ? { valid: false, errors: [`JSON Parse Error: ${parseError}`], blockedPrivacyKeys: [] }
    : validateEventEnvelope(parsedPayload, excludedApps)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Event Envelope Validator
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESET_PAYLOADS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setRawJson(preset.json)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 hover:border-[#6d25da] text-xs text-zinc-800 dark:text-zinc-200 transition cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <textarea
          rows={16}
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3 font-mono text-xs text-zinc-800 dark:text-zinc-200 focus:border-[#6d25da] focus:outline-none"
        />
      </div>

      <div className="lg:col-span-5 space-y-4">
        <div
          className={`rounded-xl border p-5 space-y-3 ${
            validation.valid
              ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70'
              : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Ingestion Gate Verdict
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                validation.valid
                  ? 'bg-emerald-500/20 text-zinc-800 dark:text-zinc-200 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
              }`}
            >
              {validation.valid ? '202 ACCEPTED (ALLOWLISTED)' : '422 REJECTED BY GUARDRAIL'}
            </span>
          </div>

          {validation.valid ? (
            <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
              Envelope conforms to canonical schema v1, carries an active policy consent version, and contains zero prohibited surveillance fields.
            </p>
          ) : (
            <ul className="space-y-2 text-xs text-rose-800 dark:text-rose-200">
              {validation.errors.map((err, idx) => (
                <li
                  key={idx}
                  className="rounded-lg bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800/80 p-2.5 font-mono text-[11px]"
                >
                  {err}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Blocked Surveillance Keys
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {PROHIBITED_METADATA_KEYS.map((key) => (
              <span
                key={key}
                className="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-rose-700 dark:text-rose-300"
              >
                {key}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

