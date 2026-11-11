import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSaasSubscriptionInvoiceDraft,
  calculateSaasSubscriptionTotals,
  evaluateUsageQuotas,
} from '../../phase4/saasBilling.ts'
import {
  authorizePublicApiRequest,
  createSignedOutboundWebhookDelivery,
  generateScopedApiKey,
  verifyOutboundWebhookSignature,
} from '../../phase4/publicApiAndWebhooks.ts'
import {
  buildQuickBooksInvoicePayload,
  buildXeroInvoiceCsv,
  mapExternalPmIssueToTaskDraft,
  sanitizeCalendarMeetingEvent,
} from '../../phase4/ecosystemConnectors.ts'
import { computeProjectForecasts } from '../../phase4/forecasting.ts'
import {
  formatPortableReportMarkdown,
  generateSignedPortableWorkReport,
  verifyPortableWorkReportSignature,
} from '../../phase4/portableReport.ts'

describe('Phase 4 SaaS Subscriptions, Usage Metering & Graceful Degradation (F4-001..F4-004)', () => {
  it('computes annual 15% discount and generates separate SAAS subscription invoice', () => {
    const monthly = calculateSaasSubscriptionTotals('agency', 10, 'monthly')
    assert.equal(monthly.totalCents, 14900 + 1800 * 10)

    const annual = calculateSaasSubscriptionTotals('agency', 10, 'annual')
    assert.equal(annual.discountCents, Math.round(monthly.totalCents * 12 * 0.15))
    assert.ok(annual.totalCents < monthly.totalCents * 12)

    const inv = buildSaasSubscriptionInvoiceDraft({
      tenantId: 't-1',
      subscriptionAccountId: 'sub-1',
      planTier: 'agency',
      seatsBilled: 10,
      billingCycle: 'monthly',
      currency: 'USD',
      sequenceNumber: 1,
    })
    assert.ok(inv.invoiceNumber.startsWith('SAAS-'))
    assert.equal(inv.totalCents, monthly.totalCents)
    assert.equal(inv.status, 'paid')
  })

  it('never blocks core time tracking on event/AI quota overage (F4-004)', () => {
    const report = evaluateUsageQuotas('starter', {
      id: 'u-1',
      tenantId: 't-1',
      metricDate: '2026-11-11',
      activeSeats: 6,
      activeProjects: 3,
      activityEventsCount: 75_000,
      storageBytes: 600 * 1024 * 1024,
      aiTokensUsed: 500,
      apiRequestsCount: 10,
      webhookDeliveriesCount: 0,
    })

    assert.equal(report.coreTimeTrackingAllowed, true)
    assert.equal(report.aiLlmAllowed, false)
    assert.equal(report.highFreqTelemetryMode, 'sampled_graceful')
    assert.ok(report.alerts.length >= 3)
  })
})

describe('Phase 4 Public API Keys & Outbound Signed Webhooks (F4-006, F4-007)', () => {
  it('creates SHA-256 hashed dp_live_ keys, enforces scopes, and rejects revoked keys', async () => {
    const { plaintextKey, record } = await generateScopedApiKey({
      tenantId: 't-1',
      name: 'BI Sync',
      scopes: ['projects:read', 'timesheets:read'],
      rateLimitPerMin: 120,
    })

    assert.ok(plaintextKey.startsWith('dp_live_'))
    assert.equal(record.keyHashSha256.length, 64)
    assert.notEqual(record.keyHashSha256, plaintextKey)

    const okRes = await authorizePublicApiRequest({
      authorizationHeader: `Bearer ${plaintextKey}`,
      requiredScope: 'projects:read',
      keys: [record],
    })
    assert.equal(okRes.authorized, true)

    const forbiddenRes = await authorizePublicApiRequest({
      authorizationHeader: `Bearer ${plaintextKey}`,
      requiredScope: 'invoices:read',
      keys: [record],
    })
    assert.equal(forbiddenRes.authorized, false)
    if (!forbiddenRes.authorized) {
      assert.equal(forbiddenRes.statusCode, 403)
    }

    const revokedRes = await authorizePublicApiRequest({
      authorizationHeader: `Bearer ${plaintextKey}`,
      requiredScope: 'projects:read',
      keys: [{ ...record, revokedAt: '2026-11-11T10:00:00Z' }],
    })
    assert.equal(revokedRes.authorized, false)
    if (!revokedRes.authorized) {
      assert.equal(revokedRes.statusCode, 401)
    }
  })

  it('signs outbound webhooks with X-DevProof-Signature-256 and detects tampering', async () => {
    const secret = 'whsec_test_super_secret'
    const signed = await createSignedOutboundWebhookDelivery({
      tenantId: 't-1',
      endpoint: {
        id: 'ep-1',
        tenantId: 't-1',
        name: 'ERP Listener',
        targetUrl: 'https://erp.example.com/hook',
        signingSecretPrefix: 'whsec_test_sup',
        subscribedEvents: ['invoice.finalized'],
        isActive: true,
        createdAt: '2026-11-11T00:00:00Z',
      },
      signingSecret: secret,
      eventType: 'invoice.finalized',
      payloadData: { invoiceNumber: 'INV-101', total: 1200 },
      timestampUnix: 1762860000,
    })

    assert.ok(signed.signatureHeader.startsWith('t=1762860000,v1='))

    const rawBody = JSON.stringify(signed.envelope)
    const valid = await verifyOutboundWebhookSignature({
      signatureHeader: signed.signatureHeader,
      rawBody,
      signingSecret: secret,
    })
    assert.equal(valid, true)

    const tampered = await verifyOutboundWebhookSignature({
      signatureHeader: signed.signatureHeader,
      rawBody: rawBody.replace('1200', '9999'),
      signingSecret: secret,
    })
    assert.equal(tampered, false)
  })
})

describe('Phase 4 Ecosystem Connectors, Forecasting & Portable Report (F4-008..F4-013)', () => {
  it('exports Xero CSV and QuickBooks JSON cleanly and sanitizes calendar meetings', () => {
    const invoice = {
      invoiceNumber: 'INV-2026-01',
      clientName: 'Acme Corp',
      currency: 'USD',
      createdAt: '2026-11-11T00:00:00Z',
      taxPercent: 0,
      lines: [
        {
          workDate: '2026-11-10',
          taskCode: 'DEV-101',
          description: 'Auth RLS Migration',
          approvedMinutes: 120,
          hourlyRate: 150,
          amount: 300,
        },
      ],
    }

    const csv = buildXeroInvoiceCsv(invoice)
    assert.ok(csv.includes('*ContactName,*InvoiceNumber'))
    assert.ok(csv.includes('Acme Corp,INV-2026-01'))
    assert.ok(csv.includes('2.00,150.00,200,OUTPUT'))

    const qb = buildQuickBooksInvoicePayload(invoice)
    assert.equal(qb.DocNumber, 'INV-2026-01')
    assert.equal(qb.Line[0].Amount, 300)

    const metaOnly = sanitizeCalendarMeetingEvent({
      tenantId: 't-1',
      userId: 'u-1',
      externalEventId: 'gcal-1',
      rawTitle: '1:1 with ceo@acme.com https://meet.google.com/abc',
      startedAtUtc: '2026-11-11T09:00:00Z',
      endedAtUtc: '2026-11-11T09:45:00Z',
      syncPermissionScope: 'metadata_only',
    })
    assert.equal(metaOnly.durationMinutes, 45)
    assert.ok(!metaOnly.meetingTitleSanitized.includes('ceo@acme.com'))

    const titleScoped = sanitizeCalendarMeetingEvent({
      tenantId: 't-1',
      userId: 'u-1',
      externalEventId: 'gcal-2',
      rawTitle: 'Design Sync alice@acme.com https://zoom.us/j/123',
      startedAtUtc: '2026-11-11T10:00:00Z',
      endedAtUtc: '2026-11-11T10:30:00Z',
      syncPermissionScope: 'title_and_duration',
    })
    assert.ok(titleScoped.meetingTitleSanitized.includes('[redacted-email]'))
    assert.ok(titleScoped.meetingTitleSanitized.includes('[meeting-link]'))

    const mappedTask = mapExternalPmIssueToTaskDraft({
      externalKey: 'lin-408',
      provider: 'linear',
      title: 'Harden webhook DLQ',
      acceptanceCriteria: '',
      estimateMinutes: 180,
      priority: 'high',
    })
    assert.equal(mappedTask.code, 'LIN-408')
  })

  it('computes project forecasts and unreviewed billing exposure (F4-011)', () => {
    const forecasts = computeProjectForecasts({
      projects: [{ id: 'p-1', code: 'ACME', name: 'Acme Portal', clientName: 'Acme' }],
      tasks: [
        { id: 't-1', projectId: 'p-1', estimateMinutes: 120, status: 'active', isBillable: true },
        { id: 't-2', projectId: 'p-1', estimateMinutes: 240, status: 'active', isBillable: true },
      ],
      timesheetLines: [
        {
          projectId: 'p-1',
          taskId: 't-1',
          claimedMinutes: 120,
          approvedBillableMinutes: 120,
          snapshotHourlyRate: 150,
          evidenceStatus: 'approved',
        },
        {
          projectId: 'p-1',
          taskId: 't-2',
          claimedMinutes: 180,
          approvedBillableMinutes: 0,
          snapshotHourlyRate: 150,
          evidenceStatus: 'observed',
        },
      ],
    })

    assert.equal(forecasts.length, 1)
    assert.equal(forecasts[0].approvedSpendAmount, 300)
    assert.equal(forecasts[0].unreviewedExposureAmount, 450)
    assert.equal(forecasts[0].riskLevel, 'watch')
  })

  it('generates and verifies developer-scoped signed portable work report (F4-013)', async () => {
    const report = await generateSignedPortableWorkReport({
      tenantId: 't-1',
      tenantName: 'Northstar Agency',
      developerUserId: 'dev-1',
      developerName: 'Aria Dev',
      reportTitle: 'Nov Portable Summary',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      lines: [
        {
          id: 'l-1',
          developerId: 'dev-1',
          projectId: 'p-1',
          taskCode: 'DEV-101',
          taskTitle: 'Auth RLS',
          workDate: '2026-11-10',
          workMode: 'coding',
          claimedMinutes: 120,
          supportedMinutes: 120,
          approvedBillableMinutes: 120,
          evidenceStatus: 'approved',
        },
        {
          id: 'l-2',
          developerId: 'dev-2',
          projectId: 'p-1',
          taskCode: 'DEV-102',
          taskTitle: 'Other Dev Line',
          workDate: '2026-11-10',
          workMode: 'coding',
          claimedMinutes: 240,
          supportedMinutes: 240,
          approvedBillableMinutes: 240,
          evidenceStatus: 'approved',
        },
      ],
      deliverables: [
        {
          id: 'art-1',
          sourceType: 'github_pr',
          externalId: 'PR #12',
          summaryTitle: 'Add tenant RLS',
          occurredAtUtc: '2026-11-10T17:00:00Z',
        },
      ],
    })

    // Strictly scoped to dev-1 (120m), excluding dev-2 (240m)
    assert.equal(report.totalApprovedMinutes, 120)
    assert.equal(report.deliverablesCount, 1)
    assert.equal(await verifyPortableWorkReportSignature(report), true)

    const tamperedReport = { ...report, signatureHmacSha256: '0'.repeat(64) }
    assert.equal(await verifyPortableWorkReportSignature(tamperedReport), false)

    const md = formatPortableReportMarkdown(report)
    assert.ok(md.includes('2.00 hrs'))
    assert.ok(md.includes(report.payloadDigestSha256))
  })
})

