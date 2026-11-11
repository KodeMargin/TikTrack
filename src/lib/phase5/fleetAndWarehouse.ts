import type {
  DrExerciseRecord,
  FleetReleaseRecord,
  SecurityAssessmentRecord,
  WarehouseSink,
} from '../../types/domain.types.ts'
import { sha256Hex } from '../phase4/publicApiAndWebhooks.ts'

export interface QueueMessageEnvelope {
  id: string
  queueName:
    | 'ingestion_normalization_queue'
    | 'webhook_processing_queue'
    | 'correlation_rules_queue'
    | 'ai_summary_queue'
  attemptCount: number
  maxAttempts: number
  shouldFail?: boolean
  latencyMs?: number
}

export interface QueueWorkerBatchResult {
  processedIds: string[]
  retriedIds: string[]
  deadLetterIds: string[]
  p95ProcessingMs: number
}

/**
 * F5-008: Detachable horizontally scalable worker simulation / processor.
 * Implements bounded retry + dead-letter queue isolation without dropping core sessions.
 */
export function processQueueBatchWithDlq(
  messages: QueueMessageEnvelope[]
): QueueWorkerBatchResult {
  const processedIds: string[] = []
  const retriedIds: string[] = []
  const deadLetterIds: string[] = []
  const latencies: number[] = []

  for (const msg of messages) {
    latencies.push(msg.latencyMs ?? 42)
    if (!msg.shouldFail) {
      processedIds.push(msg.id)
      continue
    }
    const nextAttempt = msg.attemptCount + 1
    if (nextAttempt >= msg.maxAttempts) {
      deadLetterIds.push(msg.id)
    } else {
      retriedIds.push(msg.id)
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b)
  const idx = sorted.length === 0 ? 0 : Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
  return {
    processedIds,
    retriedIds,
    deadLetterIds,
    p95ProcessingMs: sorted[idx] ?? 0,
  }
}

export async function buildWarehouseExportManifest(input: {
  tenantId: string
  targetSink: WarehouseSink
  periodStart: string
  periodEnd: string
  rowCount: number
}): Promise<{
  objectPathUri: string
  compressedBytes: number
  checksumSha256: string
}> {
  const ext = input.targetSink === 'parquet_object_storage' ? 'parquet' : 'ndjson.zst'
  const objectPathUri = `s3://devproof-warehouse/${input.tenantId}/${input.periodStart}_${input.periodEnd}.${ext}`
  const compressedBytes = Math.max(1024, input.rowCount * 184)
  const checksumSha256 = await sha256Hex(
    `${input.tenantId}:${input.targetSink}:${input.periodStart}:${input.periodEnd}:${input.rowCount}`
  )
  return { objectPathUri, compressedBytes, checksumSha256 }
}

export function evaluateFleetReleaseCompliance(input: {
  release: FleetReleaseRecord
  deviceHashSeed: number
}): { eligibleForRollout: boolean; verifiedSignature: boolean } {
  const verifiedSignature =
    input.release.notarizationStatus === 'notarized' || input.release.notarizationStatus === 'signed'
  const bucket = Math.abs(input.deviceHashSeed) % 100
  const eligibleForRollout =
    input.release.isActive && verifiedSignature && bucket < input.release.rolloutPercentage
  return { eligibleForRollout, verifiedSignature }
}

/**
 * F5-009: Evaluates whether DR drills & 1,000-developer scale targets satisfy exit gates
 * (RPO <= target, RTO <= target, p95 CRUD < 500ms at >= 1,000 concurrent devs).
 */
export function evaluateDrAndLoadReadiness(exercise: DrExerciseRecord): {
  rpoMet: boolean
  rtoMet: boolean
  crudLatencyMet: boolean
  overallPass: boolean
} {
  const rpoMet = exercise.measuredRpoMinutes <= exercise.targetRpoMinutes
  const rtoMet = exercise.measuredRtoMinutes <= exercise.targetRtoMinutes
  const crudLatencyMet = exercise.p95CrudMs < 500
  return {
    rpoMet,
    rtoMet,
    crudLatencyMet,
    overallPass: rpoMet && rtoMet && crudLatencyMet,
  }
}

export function computeSecurityAssessmentScore(assessments: SecurityAssessmentRecord[]): {
  openCritical: number
  openHigh: number
  signedOffCount: number
  enterpriseReady: boolean
} {
  let openCritical = 0
  let openHigh = 0
  let signedOffCount = 0

  for (const a of assessments) {
    if (a.status === 'signed_off') signedOffCount += 1
    const totalSevere = a.criticalFindings + a.highFindings
    const remaining = Math.max(0, totalSevere - a.remediatedFindings)
    if (a.criticalFindings > 0 && remaining > 0) {
      openCritical += Math.min(a.criticalFindings, remaining)
    }
    const remainingHigh = Math.max(0, remaining - Math.min(a.criticalFindings, remaining))
    openHigh += Math.min(a.highFindings, remainingHigh)
  }

  return {
    openCritical,
    openHigh,
    signedOffCount,
    enterpriseReady: signedOffCount > 0 && openCritical === 0 && openHigh === 0,
  }
}
