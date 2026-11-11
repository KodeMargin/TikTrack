import type {
  LegalHoldRecord,
  ResidencyRegion,
  RetentionJobRecord,
  RetentionPolicyRecord,
  SiemFormat,
  TenantResidencyConfigRecord,
} from '../../types/domain.types.ts'
import { sha256Hex } from '../phase4/publicApiAndWebhooks.ts'

const PROHIBITED_SIEM_KEYS = new Set([
  'keystroke',
  'keystrokes',
  'clipboard',
  'clipboard_text',
  'raw_code',
  'source_code',
  'diff',
  'window_title_raw',
  'screenshot',
  'webcam',
  'password',
])

export interface RetentionCandidateEvent {
  eventId: string
  userId: string
  timesheetId?: string
  projectId?: string
  occurredAtUtc: string
}

export function planRetentionSweepWithLegalHolds(input: {
  tenantId: string
  policy: RetentionPolicyRecord
  legalHolds: LegalHoldRecord[]
  candidates: RetentionCandidateEvent[]
  nowIso?: string
}): {
  scannedCount: number
  eligiblePurgeIds: string[]
  skippedLegalHoldIds: string[]
  jobStatus: RetentionJobRecord['status']
} {
  const nowMs = new Date(input.nowIso ?? new Date().toISOString()).getTime()
  const cutoffMs = nowMs - input.policy.rawActivityDays * 86_400_000

  const activeHolds = input.legalHolds.filter(
    (h) => h.tenantId === input.tenantId && h.holdStatus === 'active'
  )

  const tenantWideHold = activeHolds.some((h) => h.scopeType === 'tenant')
  const heldUsers = new Set(activeHolds.filter((h) => h.scopeType === 'user').map((h) => h.targetId))
  const heldTimesheets = new Set(
    activeHolds.filter((h) => h.scopeType === 'timesheet' || h.scopeType === 'dispute').map((h) => h.targetId)
  )
  const heldProjects = new Set(activeHolds.filter((h) => h.scopeType === 'project').map((h) => h.targetId))

  const expired = input.candidates.filter((c) => new Date(c.occurredAtUtc).getTime() < cutoffMs)
  const eligiblePurgeIds: string[] = []
  const skippedLegalHoldIds: string[] = []

  for (const item of expired) {
    const isHeld =
      tenantWideHold ||
      heldUsers.has(item.userId) ||
      (item.timesheetId ? heldTimesheets.has(item.timesheetId) : false) ||
      (item.projectId ? heldProjects.has(item.projectId) : false)

    if (isHeld) {
      skippedLegalHoldIds.push(item.eventId)
    } else {
      eligiblePurgeIds.push(item.eventId)
    }
  }

  const jobStatus: RetentionJobRecord['status'] =
    skippedLegalHoldIds.length > 0 ? 'partial_legal_hold' : 'completed'

  return {
    scannedCount: expired.length,
    eligiblePurgeIds,
    skippedLegalHoldIds,
    jobStatus,
  }
}

export function evaluateDsarErasureAllowed(input: {
  tenantId: string
  userId: string
  legalHolds: LegalHoldRecord[]
}): { allowed: boolean; blockingHoldReason?: string } {
  const blocker = input.legalHolds.find(
    (h) =>
      h.tenantId === input.tenantId &&
      h.holdStatus === 'active' &&
      (h.scopeType === 'tenant' || (h.scopeType === 'user' && h.targetId === input.userId))
  )
  if (blocker) {
    return {
      allowed: false,
      blockingHoldReason: `Blocked by active legal hold (${blocker.scopeType}: ${blocker.reason}).`,
    }
  }
  return { allowed: true }
}

export function sanitizeSiemEventObject(raw: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (PROHIBITED_SIEM_KEYS.has(key.toLowerCase())) continue
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeSiemEventObject(value as Record<string, unknown>)
    } else {
      clean[key] = value
    }
  }
  return clean
}

export async function formatSanitizedSiemBatch(input: {
  format: SiemFormat
  events: Array<{
    eventId: string
    category: string
    resourceType: string
    resourceId: string
    correlationId: string
    occurredAtUtc: string
    metadata: Record<string, unknown>
  }>
}): Promise<{
  serialized: string
  payloadDigestSha256: string
  sanitizedCount: number
  preview: Record<string, unknown>
}> {
  const cleaned = input.events.map((ev) => ({
    eventId: ev.eventId,
    category: ev.category,
    resourceType: ev.resourceType,
    resourceId: ev.resourceId,
    correlationId: ev.correlationId,
    occurredAtUtc: ev.occurredAtUtc,
    metadata: sanitizeSiemEventObject(ev.metadata),
  }))

  let serialized: string
  if (input.format === 'cef') {
    serialized = cleaned
      .map(
        (ev) =>
          `CEF:0|DevProof|EnterpriseCompliance|5.0|${ev.category}|${ev.resourceType}|3|externalId=${ev.eventId} cs1=${ev.correlationId} rt=${ev.occurredAtUtc}`
      )
      .join('\n')
  } else if (input.format === 'ocsf') {
    serialized = cleaned
      .map((ev) =>
        JSON.stringify({
          class_uid: 6003,
          category_name: 'Audit Activity',
          activity_name: ev.category,
          time: ev.occurredAtUtc,
          metadata: { correlation_uid: ev.correlationId, product: { name: 'DevProof' } },
          resources: [{ type: ev.resourceType, uid: ev.resourceId }],
          unmapped: ev.metadata,
        })
      )
      .join('\n')
  } else {
    serialized = cleaned.map((ev) => JSON.stringify(ev)).join('\n')
  }

  const payloadDigestSha256 = await sha256Hex(serialized || '[]')
  return {
    serialized,
    payloadDigestSha256,
    sanitizedCount: cleaned.length,
    preview: {
      format: input.format,
      event_count: cleaned.length,
      first_event: cleaned[0] ?? null,
    },
  }
}

export function validateResidencyTransfer(input: {
  config: TenantResidencyConfigRecord
  targetRegion: ResidencyRegion
}): { allowed: boolean; reason?: string } {
  if (input.config.dataResidencyLocked && input.targetRegion !== input.config.primaryRegion) {
    return {
      allowed: false,
      reason: `Data residency lock active (F5-003): tenant data pinned to ${input.config.primaryRegion}; transfer to ${input.targetRegion} denied.`,
    }
  }
  return { allowed: true }
}
