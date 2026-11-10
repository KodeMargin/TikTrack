import type {
  CanonicalEventEnvelope,
  ContractBillingPolicy,
  TrackingPolicySpec,
} from '@/types/domain.types'

/**
 * D-003 & Section 15.1: Hard-Denied Surveillance Keys
 * Any event envelope containing these keys in `metadata` is rejected on-device
 * and at the Supabase Edge Function boundary.
 */
export const PROHIBITED_METADATA_KEYS = [
  'keystrokes',
  'key_log',
  'typed_text',
  'password',
  'clipboard',
  'clipboard_text',
  'raw_source_code',
  'file_contents',
  'git_diff_raw',
  'terminal_output',
  'private_message',
  'email_body',
  'chat_transcript',
  'screenshot_bytes',
  'screen_recording',
  'webcam_frame',
  'microphone_audio',
  'window_title_raw',
  'full_url_with_query',
] as const

export interface ValidationResult<T> {
  valid: boolean
  data?: T
  errors: string[]
  blockedPrivacyKeys: string[]
}

/**
 * Validates a CanonicalEventEnvelope (Section 11.5) and enforces D-003 privacy boundaries.
 */
export function validateEventEnvelope(
  payload: unknown,
  excludedApps: string[] = []
): ValidationResult<CanonicalEventEnvelope> {
  const errors: string[] = []
  const blockedPrivacyKeys: string[] = []

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null JSON object.'], blockedPrivacyKeys }
  }

  const candidate = payload as Partial<CanonicalEventEnvelope>

  if (!candidate.event_id || typeof candidate.event_id !== 'string') {
    errors.push('Missing or invalid `event_id` (UUIDv7/ULID required).')
  }
  if (candidate.schema_version !== 1) {
    errors.push('Unsupported `schema_version` (expected version 1).')
  }
  if (!candidate.tenant_id || !candidate.user_id || !candidate.device_id || !candidate.session_id) {
    errors.push('Missing required identity/tenancy fields (`tenant_id`, `user_id`, `device_id`, `session_id`).')
  }
  if (typeof candidate.monotonic_elapsed_ms !== 'number' || candidate.monotonic_elapsed_ms < 0) {
    errors.push('`monotonic_elapsed_ms` must be a non-negative monotonic counter.')
  }
  if (!candidate.consent_policy_version) {
    errors.push('Missing `consent_policy_version` acknowledgment reference (F1-030).')
  }

  // Inspect metadata for prohibited surveillance fields (D-003)
  if (candidate.metadata && typeof candidate.metadata === 'object') {
    for (const key of Object.keys(candidate.metadata)) {
      const normalizedKey = key.toLowerCase()
      const matchedProhibited = PROHIBITED_METADATA_KEYS.find((blocked) =>
        normalizedKey.includes(blocked)
      )
      if (matchedProhibited) {
        blockedPrivacyKeys.push(key)
        errors.push(
          `Privacy Guardrail Violation (D-003): Metadata field "${key}" matches prohibited surveillance category "${matchedProhibited}".`
        )
      }
    }

    // Enforce local per-app privacy denylist (F2-005)
    const appName = String(candidate.metadata.app_identifier ?? '').toLowerCase()
    if (
      appName &&
      excludedApps.some((excluded) => appName.includes(excluded.toLowerCase().trim()))
    ) {
      errors.push(
        `Local Privacy Exclusion (F2-005): Application "${String(candidate.metadata.app_identifier)}" is on the developer's local denylist and is suppressed from transmission.`
      )
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (candidate as CanonicalEventEnvelope) : undefined,
    errors,
    blockedPrivacyKeys,
  }
}

/**
 * Validates Contract Billing Policy (D-002 & F1-044) ensuring rate versions do not overlap.
 */
export function validateContractPolicy(
  policy: ContractBillingPolicy
): ValidationResult<ContractBillingPolicy> {
  const errors: string[] = []

  if (policy.weeklyCapMinutes <= 0) {
    errors.push('Weekly cap minutes must be greater than 0.')
  }
  if (policy.deepWorkNoInputWindowMinutes < 15) {
    errors.push(
      'Deep-work no-input window must be at least 15 minutes to protect legitimate engineering reasoning.'
    )
  }

  // Check rate version overlap
  const sortedRates = [...policy.rateVersions].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  )
  for (let i = 0; i < sortedRates.length - 1; i++) {
    const current = sortedRates[i]
    const next = sortedRates[i + 1]
    if (!current.effectiveTo || current.effectiveTo >= next.effectiveFrom) {
      errors.push(
        `Overlapping rate versions detected between "${current.label}" (${current.effectiveFrom}..${current.effectiveTo ?? 'open'}) and "${next.label}" (starts ${next.effectiveFrom}).`
      )
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? policy : undefined,
    errors,
    blockedPrivacyKeys: [],
  }
}

export const DEFAULT_TRACKING_POLICY_SPEC: TrackingPolicySpec = {
  version: 'v1.0-2026-11',
  effectiveDate: '2026-11-01',
  collectSessionLifecycle: true,
  collectCoarseAppCategory: true,
  collectIdeWorkspaceMetadata: true,
  collectGitWebhookMetadata: true,
  neverCollectKeystrokes: true,
  neverCollectClipboard: true,
  neverCollectPrivateMessages: true,
  neverCollectRawSourceCode: true,
  neverCollectWebcamOrMic: true,
  screenshotsDisabledByDefault: true,
}

