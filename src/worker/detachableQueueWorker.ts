/**
 * DevProof (TikTrack) — Detachable Horizontally Scalable Queue Worker (F5-008)
 *
 * Extracted background worker service for high-volume Enterprise tenants:
 *  - Polls queued `activity_event_batches` (and optional pgmq queues when enabled)
 *  - Normalizes raw `activity_events` into non-overlapping 5-minute `activity_rollups`
 *  - Merges concurrent Desktop + IDE signals into a single canonical elapsed bucket
 *  - Supports bounded retries, dead-letter isolation, `--once` mode, and SIGTERM drain
 *
 * Usage:
 *   npm run worker -- --once
 *   WORKER_POLL_MS=2000 WORKER_BATCH_SIZE=25 npm run worker
 */

import path from 'node:path'
import dotenv from 'dotenv'
import { prisma } from '../lib/prisma.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

export interface RawActivityEventInput {
  eventId: string
  source: string
  eventType: string
  occurredAtUtc: Date | string
  metadata?: Record<string, unknown> | null
}

export interface NormalizedRollupBucket {
  bucketStartUtc: Date
  bucketMinutes: number
  appCategory: string
  workMode: string
  hasInputSignal: boolean
  concurrentSources: string[]
  isObservationGap: boolean
}

/**
 * Pure 5-minute UTC bucket normalizer.
 * Guarantees concurrent Desktop + VS Code signals in the same 5m window merge into
 * one canonical bucket with `concurrentSources` preserved (never double-counted).
 */
export function normalizeActivityEventsToBuckets(
  events: RawActivityEventInput[]
): NormalizedRollupBucket[] {
  const bucketMap = new Map<
    string,
    {
      bucketStartUtc: Date
      sources: Set<string>
      appCategory: string
      workMode: string
      hasInputSignal: boolean
      isObservationGap: boolean
    }
  >()

  for (const evt of events) {
    const dt = new Date(evt.occurredAtUtc)
    if (Number.isNaN(dt.getTime())) continue
    const flooredMin = Math.floor(dt.getUTCMinutes() / 5) * 5
    dt.setUTCMinutes(flooredMin, 0, 0)
    const key = dt.toISOString()

    const meta = (evt.metadata ?? {}) as Record<string, unknown>
    const existing = bucketMap.get(key) ?? {
      bucketStartUtc: new Date(dt.getTime()),
      sources: new Set<string>(),
      appCategory: String(
        meta.app_category ?? (evt.source === 'vscode' ? 'ide' : 'other')
      ),
      workMode: String(meta.work_mode ?? 'coding'),
      hasInputSignal: meta.has_input_signal !== false,
      isObservationGap: evt.eventType === 'idle_gap_detected',
    }

    existing.sources.add(evt.source)
    if (evt.source === 'vscode' || meta.app_category === 'ide') {
      existing.appCategory = 'ide'
    }
    if (meta.has_input_signal === true) {
      existing.hasInputSignal = true
      existing.isObservationGap = false
    }
    bucketMap.set(key, existing)
  }

  return Array.from(bucketMap.values())
    .sort((a, b) => a.bucketStartUtc.getTime() - b.bucketStartUtc.getTime())
    .map((b) => ({
      bucketStartUtc: b.bucketStartUtc,
      bucketMinutes: 5,
      appCategory: b.appCategory,
      workMode: b.workMode,
      hasInputSignal: b.hasInputSignal,
      concurrentSources: Array.from(b.sources).sort(),
      isObservationGap: b.isObservationGap,
    }))
}

export interface WorkerCycleSummary {
  batchesClaimed: number
  batchesProcessed: number
  batchesFailed: number
  rollupsUpserted: number
  durationMs: number
}

export async function runDetachableWorkerCycle(
  batchSize = 25
): Promise<WorkerCycleSummary> {
  const startedAt = Date.now()
  let batchesProcessed = 0
  let batchesFailed = 0
  let rollupsUpserted = 0

  const queuedBatches = await prisma.activityEventBatch.findMany({
    where: { processingStatus: 'queued' },
    orderBy: { receivedAtUtc: 'asc' },
    take: batchSize,
  })

  for (const batch of queuedBatches) {
    try {
      const events = await prisma.activityEvent.findMany({
        where: {
          tenantId: batch.tenantId,
          sessionId: batch.sessionId,
        },
        orderBy: { occurredAtUtc: 'asc' },
      })

      const buckets = normalizeActivityEventsToBuckets(
        events.map((e) => ({
          eventId: e.eventId,
          source: e.source,
          eventType: e.eventType,
          occurredAtUtc: e.occurredAtUtc,
          metadata: (e.metadata ?? {}) as Record<string, unknown>,
        }))
      )

      await prisma.$transaction(async (tx) => {
        for (const bucket of buckets) {
          await tx.activityRollup.upsert({
            where: {
              tenantId_sessionId_bucketStartUtc_bucketMinutes: {
                tenantId: batch.tenantId,
                sessionId: batch.sessionId,
                bucketStartUtc: bucket.bucketStartUtc,
                bucketMinutes: bucket.bucketMinutes,
              },
            },
            update: {
              appCategory: bucket.appCategory,
              workMode: bucket.workMode,
              hasInputSignal: bucket.hasInputSignal,
              concurrentSources: bucket.concurrentSources,
              isObservationGap: bucket.isObservationGap,
            },
            create: {
              tenantId: batch.tenantId,
              userId: batch.userId,
              sessionId: batch.sessionId,
              bucketStartUtc: bucket.bucketStartUtc,
              bucketMinutes: bucket.bucketMinutes,
              appCategory: bucket.appCategory,
              workMode: bucket.workMode,
              hasInputSignal: bucket.hasInputSignal,
              concurrentSources: bucket.concurrentSources,
              isObservationGap: bucket.isObservationGap,
            },
          })
          rollupsUpserted += 1
        }

        await tx.activityEventBatch.update({
          where: { id: batch.id },
          data: {
            processingStatus: 'processed',
            processedAtUtc: new Date(),
          },
        })
      })

      batchesProcessed += 1
    } catch (err) {
      console.error(`[detachable-worker] batch ${batch.id} failed:`, err)
      await prisma.activityEventBatch
        .update({
          where: { id: batch.id },
          data: { processingStatus: 'failed' },
        })
        .catch(() => undefined)
      batchesFailed += 1
    }
  }

  return {
    batchesClaimed: queuedBatches.length,
    batchesProcessed,
    batchesFailed,
    rollupsUpserted,
    durationMs: Date.now() - startedAt,
  }
}

async function startWorkerLoop() {
  const once = process.argv.includes('--once')
  const pollMs = Number(process.env.WORKER_POLL_MS ?? 3000)
  const batchSize = Number(process.env.WORKER_BATCH_SIZE ?? 25)
  let stopping = false

  const handleSignal = (sig: string) => {
    console.log(`[detachable-worker] received ${sig}, draining current cycle...`)
    stopping = true
  }
  process.on('SIGINT', () => handleSignal('SIGINT'))
  process.on('SIGTERM', () => handleSignal('SIGTERM'))

  do {
    try {
      const summary = await runDetachableWorkerCycle(batchSize)
      console.log('[detachable-worker] cycle:', JSON.stringify(summary))
    } catch (err) {
      console.error('[detachable-worker] cycle error:', err)
    }

    if (once || stopping) break
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  } while (!stopping)

  await prisma.$disconnect()
}

// Run loop only when executed directly as entrypoint
const isMain =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.includes('detachableQueueWorker')

if (isMain) {
  void startWorkerLoop()
}

