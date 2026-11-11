import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  evaluateTwoPersonPolicyApproval,
  generateScimBearerToken,
  validateSsoProviderConfig,
} from '../../phase5/ssoAndGovernance.ts'
import {
  evaluateDsarErasureAllowed,
  formatSanitizedSiemBatch,
  planRetentionSweepWithLegalHolds,
  validateResidencyTransfer,
} from '../../phase5/retentionAndSiem.ts'
import {
  buildWarehouseExportManifest,
  computeSecurityAssessmentScore,
  evaluateDrAndLoadReadiness,
  evaluateFleetReleaseCompliance,
  processQueueBatchWithDlq,
} from '../../phase5/fleetAndWarehouse.ts'
import { normalizeActivityEventsToBuckets } from '../../../worker/detachableQueueWorker.ts'
import {
  formatMinutesLocalized,
  getEnterpriseLocaleStrings,
} from '../../phase5/accessibilityAndI18n.ts'
import type {
  LegalHoldRecord,
  PolicyChangeRequestRecord,
  RetentionPolicyRecord,
  TenantResidencyConfigRecord,
} from '../../../types/domain.types.ts'

describe('Phase 5 SSO, SCIM & Two-Person Policy Governance (F5-001, F5-006)', () => {
  it('validates SAML/OIDC provider config and generates hashed SCIM bearer tokens', async () => {
    const bad = validateSsoProviderConfig({
      providerType: 'saml',
      domain: 'invalid',
      entityIdOrIssuer: 'http://insecure.dev',
      ssoUrl: 'https://idp.acme.dev/sso',
    })
    assert.equal(bad.valid, false)
    assert.ok(bad.errors.length >= 2)

    const good = validateSsoProviderConfig({
      providerType: 'saml',
      domain: 'acme.dev',
      entityIdOrIssuer: 'https://idp.acme.dev/entity',
      ssoUrl: 'https://idp.acme.dev/sso/saml',
      certificateFingerprint: 'SHA256:AB:CD',
    })
    assert.equal(good.valid, true)

    const scim = await generateScimBearerToken()
    assert.ok(scim.plaintextToken.startsWith('dp_scim_'))
    assert.equal(scim.tokenHashSha256.length, 64)
  })

  it('enforces two distinct admins for policy changes and prevents retroactive activation (F5-006)', () => {
    const req: PolicyChangeRequestRecord = {
      id: 'req-1',
      tenantId: 't-1',
      proposedVersionCode: 'v2.1-2026',
      changeSummary: 'Enable coarse IDE branch correlation',
      scopeDiff: { collect_ide_branch_context: true },
      expandsCollectionScope: true,
      status: 'pending_second_approval',
      proposedBy: 'owner-1',
      approvedByFirst: 'owner-1',
      effectiveFrom: '2020-01-01T00:00:00.000Z',
      createdAt: '2026-11-11T10:00:00.000Z',
    }

    const selfAttempt = evaluateTwoPersonPolicyApproval({
      request: req,
      secondApproverUserId: 'owner-1',
      secondApproverRole: 'tenant_owner',
    })
    assert.equal(selfAttempt.allowed, false)

    const devAttempt = evaluateTwoPersonPolicyApproval({
      request: req,
      secondApproverUserId: 'dev-1',
      secondApproverRole: 'developer',
    })
    assert.equal(devAttempt.allowed, false)

    const validSecond = evaluateTwoPersonPolicyApproval({
      request: req,
      secondApproverUserId: 'auditor-1',
      secondApproverRole: 'auditor',
      requestedEffectiveFrom: '2020-01-01T00:00:00.000Z',
    })
    assert.equal(validSecond.allowed, true)
    // Clamped to >= now so policies never apply retroactively
    assert.ok(new Date(validSecond.nonRetroactiveEffectiveFrom).getTime() >= Date.now() - 5000)

    const prohibitedReq: PolicyChangeRequestRecord = {
      ...req,
      scopeDiff: { keystrokes: true },
    }
    const privacyBlocked = evaluateTwoPersonPolicyApproval({
      request: prohibitedReq,
      secondApproverUserId: 'auditor-1',
      secondApproverRole: 'auditor',
    })
    assert.equal(privacyBlocked.allowed, false)
  })
})

describe('Phase 5 Legal Holds, Retention, Residency & Sanitized SIEM (F5-002..F5-005)', () => {
  it('skips records under active legal hold during retention sweeps and blocks DSAR erasure (F5-002)', () => {
    const policy: RetentionPolicyRecord = {
      id: 'rp-1',
      tenantId: 't-1',
      name: '90d Raw',
      rawActivityDays: 90,
      rollupDays: 365,
      evidenceArtifactDays: 730,
      auditLogDays: 2555,
      archiveStorageTier: 'cold_s3',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const holds: LegalHoldRecord[] = [
      {
        id: 'lh-1',
        tenantId: 't-1',
        scopeType: 'user',
        targetId: 'u-held',
        reason: 'Pending dispute appeal',
        holdStatus: 'active',
        placedAt: '2026-10-01T00:00:00.000Z',
      },
    ]

    const plan = planRetentionSweepWithLegalHolds({
      tenantId: 't-1',
      policy,
      legalHolds: holds,
      nowIso: '2026-11-11T00:00:00.000Z',
      candidates: [
        { eventId: 'ev-held', userId: 'u-held', occurredAtUtc: '2026-01-10T00:00:00.000Z' },
        { eventId: 'ev-free', userId: 'u-free', occurredAtUtc: '2026-01-10T00:00:00.000Z' },
      ],
    })
    assert.deepEqual(plan.skippedLegalHoldIds, ['ev-held'])
    assert.deepEqual(plan.eligiblePurgeIds, ['ev-free'])
    assert.equal(plan.jobStatus, 'partial_legal_hold')

    const dsarHeld = evaluateDsarErasureAllowed({
      tenantId: 't-1',
      userId: 'u-held',
      legalHolds: holds,
    })
    assert.equal(dsarHeld.allowed, false)

    const dsarFree = evaluateDsarErasureAllowed({
      tenantId: 't-1',
      userId: 'u-free',
      legalHolds: holds,
    })
    assert.equal(dsarFree.allowed, true)
  })

  it('enforces regional data residency locks and strips prohibited keys from SIEM payloads (F5-003, F5-005)', async () => {
    const residency: TenantResidencyConfigRecord = {
      tenantId: 't-1',
      primaryRegion: 'eu-central-1',
      failoverRegion: 'eu-west-1',
      dataResidencyLocked: true,
      isolationTier: 'dedicated_schema',
      encryptionKeyMode: 'byok_kms',
      dedicatedWorkerPool: true,
      egressAllowlistCidrs: ['198.51.100.0/24'],
      updatedAt: '2026-11-11T00:00:00.000Z',
    }

    const blockedTransfer = validateResidencyTransfer({
      config: residency,
      targetRegion: 'us-east-1',
    })
    assert.equal(blockedTransfer.allowed, false)

    const allowedTransfer = validateResidencyTransfer({
      config: residency,
      targetRegion: 'eu-central-1',
    })
    assert.equal(allowedTransfer.allowed, true)

    const batch = await formatSanitizedSiemBatch({
      format: 'json_lines',
      events: [
        {
          eventId: 'evt-1',
          category: 'policy_approval',
          resourceType: 'policy_versions',
          resourceId: 'pv-1',
          correlationId: 'cor-123',
          occurredAtUtc: '2026-11-11T12:00:00Z',
          metadata: {
            version: 'v2.1',
            keystrokes: 'SECRET_SHOULD_STRIP',
            raw_code: 'const x = 1',
          },
        },
      ],
    })
    assert.equal(batch.sanitizedCount, 1)
    assert.equal(batch.serialized.includes('keystrokes'), false)
    assert.equal(batch.serialized.includes('raw_code'), false)
    assert.equal(batch.payloadDigestSha256.length, 64)
  })
})

describe('Phase 5 Fleet, Warehouse, Queue Worker, DR/Load & Accessibility (F5-007..F5-011)', () => {
  it('routes failed queue jobs to DLQ after maxAttempts and builds warehouse Parquet manifests (F5-008)', async () => {
    const workerRes = processQueueBatchWithDlq([
      { id: 'm1', queueName: 'ingestion_normalization_queue', attemptCount: 0, maxAttempts: 3, latencyMs: 30 },
      { id: 'm2', queueName: 'webhook_processing_queue', attemptCount: 0, maxAttempts: 3, shouldFail: true, latencyMs: 80 },
      { id: 'm3', queueName: 'ai_summary_queue', attemptCount: 2, maxAttempts: 3, shouldFail: true, latencyMs: 120 },
    ])
    assert.deepEqual(workerRes.processedIds, ['m1'])
    assert.deepEqual(workerRes.retriedIds, ['m2'])
    assert.deepEqual(workerRes.deadLetterIds, ['m3'])
    assert.ok(workerRes.p95ProcessingMs <= 120)

    const manifest = await buildWarehouseExportManifest({
      tenantId: 't-1',
      targetSink: 'parquet_object_storage',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      rowCount: 10000,
    })
    assert.ok(manifest.objectPathUri.endsWith('.parquet'))
    assert.equal(manifest.checksumSha256.length, 64)
  })

  it('evaluates signed fleet rollout, 1000-dev DR/load SLAs, security score & i18n formatting', () => {
    const fleetCheck = evaluateFleetReleaseCompliance({
      release: {
        id: 'rel-1',
        tenantId: 't-1',
        version: '1.5.0',
        platform: 'macos_universal',
        channel: 'staged_25',
        installerSha256: 'abc',
        codeSigningThumbprint: 'CERT-123',
        notarizationStatus: 'notarized',
        minOsVersion: 'macOS 14+',
        rolloutPercentage: 25,
        releaseNotes: 'Signed',
        isActive: true,
        createdAt: '2026-11-11T00:00:00Z',
      },
      deviceHashSeed: 10,
    })
    assert.equal(fleetCheck.verifiedSignature, true)
    assert.equal(fleetCheck.eligibleForRollout, true)

    const drPass = evaluateDrAndLoadReadiness({
      id: 'dr-1',
      tenantId: 't-1',
      exerciseType: 'load_test_1000_devs',
      targetRpoMinutes: 15,
      measuredRpoMinutes: 5,
      targetRtoMinutes: 60,
      measuredRtoMinutes: 22,
      p95CrudMs: 185,
      simulatedConcurrentDevs: 1000,
      passed: true,
      findingsSummary: 'Passed',
      conductedAt: '2026-11-11T00:00:00Z',
    })
    assert.equal(drPass.overallPass, true)

    const secScore = computeSecurityAssessmentScore([
      {
        id: 'sa-1',
        tenantId: 't-1',
        assessmentName: 'Pen Test',
        assessorFirm: 'TrailSec',
        assessmentType: 'penetration_test',
        status: 'signed_off',
        criticalFindings: 0,
        highFindings: 1,
        remediatedFindings: 1,
        assessedAt: '2026-11-11T00:00:00Z',
      },
    ])
    assert.equal(secScore.enterpriseReady, true)
    assert.equal(secScore.openHigh, 0)

    const deStrings = getEnterpriseLocaleStrings('de-DE')
    assert.ok(deStrings.twoPersonBadge.includes('Vier-Augen'))
    assert.ok(formatMinutesLocalized(90, 'en-US').includes('1.5'))
  })
})

describe('Phase 5 Detachable Queue Worker Normalization', () => {
  it('merges concurrent desktop + vscode events into one bucket and flags observation gaps', () => {
    const buckets = normalizeActivityEventsToBuckets([
      {
        eventId: 'evt-1',
        eventType: 'app_focus',
        source: 'desktop',
        occurredAtUtc: '2026-11-11T10:01:00.000Z',
        metadata: {
          app_category: 'browser',
          has_input_signal: false,
        },
      },
      {
        eventId: 'evt-2',
        eventType: 'ide_heartbeat',
        source: 'vscode',
        occurredAtUtc: '2026-11-11T10:03:00.000Z',
        metadata: {
          app_category: 'ide',
          has_input_signal: true,
        },
      },
      {
        eventId: 'evt-3',
        eventType: 'idle_gap_detected',
        source: 'desktop',
        occurredAtUtc: '2026-11-11T10:07:00.000Z',
        metadata: {
          app_category: 'other',
          has_input_signal: false,
        },
      },
    ])

    assert.equal(buckets.length, 2)
    const first = buckets[0]
    assert.equal(first.bucketMinutes, 5)
    assert.equal(first.appCategory, 'ide')
    assert.equal(first.hasInputSignal, true)
    assert.deepEqual(first.concurrentSources, ['desktop', 'vscode'])
    assert.equal(first.isObservationGap, false)

    const second = buckets[1]
    assert.equal(second.bucketMinutes, 5)
    assert.equal(second.isObservationGap, true)
    assert.equal(second.hasInputSignal, false)
  })
})

