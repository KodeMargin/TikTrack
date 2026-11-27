import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import test from 'node:test'
import { canActorAccessTenant, type VerifiedServerActor } from '../../../server/serverAuthGuard.ts'
import { getConnectorRequiredFeature } from '../../../server/planEntitlementGuard.ts'
import { handlePrismaApiRequest } from '../../../server/prismaApiPlugin.ts'
import { PHASE4_PLAN_CATALOG, calculateSaasSubscriptionTotals } from '../../phase4/saasBilling.ts'
import { evaluateCanonicalTimeline } from '../index.ts'
import { generateSignedPortableWorkReport, verifyPortableWorkReportSignature } from '../../phase4/portableReport.ts'

function createMockRequest(options: {
  method: string
  url: string
  headers?: Record<string, string>
  body?: unknown
}): IncomingMessage {
  const emitter = new EventEmitter() as IncomingMessage & { body?: unknown }
  emitter.method = options.method
  emitter.url = options.url
  emitter.headers = options.headers ?? {}
  if (options.body !== undefined) {
    emitter.body = options.body
  }
  return emitter
}

function createMockResponse(): {
  res: ServerResponse
  getResult: () => { statusCode: number; body: Record<string, unknown> }
} {
  let statusCode = 200
  let raw = ''
  const headers: Record<string, string> = {}

  const res = {
    get statusCode() {
      return statusCode
    },
    set statusCode(code: number) {
      statusCode = code
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value
    },
    end(chunk?: string) {
      if (chunk) raw += chunk
    },
  } as unknown as ServerResponse

  return {
    res,
    getResult: () => ({
      statusCode,
      body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
    }),
  }
}

test('P3 Smoke 1: Server Auth Guard enforces tenant isolation and Super Admin privilege', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111'
  const tenantB = '22222222-2222-4222-8222-222222222222'

  const unauthActor: VerifiedServerActor = {
    authEnforced: true,
    authenticated: false,
    userId: null,
    email: null,
    isSuperAdmin: false,
    tenantIds: new Set(),
    tenantRoles: new Map(),
  }
  assert.equal(canActorAccessTenant(unauthActor, tenantA), false)

  const memberActor: VerifiedServerActor = {
    authEnforced: true,
    authenticated: true,
    userId: '33333333-3333-4333-8333-333333333333',
    email: 'dev@acme.dev',
    isSuperAdmin: false,
    tenantIds: new Set([tenantA]),
    tenantRoles: new Map([[tenantA, new Set(['developer'])]]),
  }
  assert.equal(canActorAccessTenant(memberActor, tenantA), true)
  assert.equal(canActorAccessTenant(memberActor, tenantB), false)

  const superAdminActor: VerifiedServerActor = {
    authEnforced: true,
    authenticated: true,
    userId: '44444444-4444-4444-8444-444444444444',
    email: 'admin@tiktrack.dev',
    isSuperAdmin: true,
    tenantIds: new Set(),
    tenantRoles: new Map(),
  }
  assert.equal(canActorAccessTenant(superAdminActor, tenantA), true)
  assert.equal(canActorAccessTenant(superAdminActor, tenantB), true)
})

test('P3 Smoke 2: Unauthenticated portal API mutations return 401 when Supabase Auth is configured', async () => {
  const prevUrl = process.env.VITE_SUPABASE_URL
  const prevKey = process.env.VITE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_URL = 'https://smoke-test.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.smoke'

  try {
    // 1. Unauthenticated checkout attempt must be rejected with 401
    const req1 = createMockRequest({
      method: 'POST',
      url: '/api/prisma/phase4/subscription/checkout',
      body: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        planTier: 'enterprise',
      },
    })
    const mock1 = createMockResponse()
    await handlePrismaApiRequest(req1, mock1.res)
    const out1 = mock1.getResult()
    assert.equal(out1.statusCode, 401)
    assert.equal(out1.body.ok, false)

    // 2. Unauthenticated platform reports attempt (even spoofing actorRole='super_admin') must be rejected with 401
    const req2 = createMockRequest({
      method: 'POST',
      url: '/api/prisma/reports/platform',
      body: { actorRole: 'super_admin' },
    })
    const mock2 = createMockResponse()
    await handlePrismaApiRequest(req2, mock2.res)
    const out2 = mock2.getResult()
    assert.equal(out2.statusCode, 401)
    assert.equal(out2.body.ok, false)

    // 3. Unauthenticated workspace creation must be rejected with 401
    const req3 = createMockRequest({
      method: 'POST',
      url: '/api/prisma/tenants',
      body: {
        name: 'Rogue Co',
        slug: 'rogue-co',
        timezone: 'UTC',
        currency: 'USD',
        ownerName: 'Attacker',
        ownerEmail: 'attacker@example.com',
      },
    })
    const mock3 = createMockResponse()
    await handlePrismaApiRequest(req3, mock3.res)
    const out3 = mock3.getResult()
    assert.equal(out3.statusCode, 401)
    assert.equal(out3.body.ok, false)
  } finally {
    if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL
    else process.env.VITE_SUPABASE_URL = prevUrl
    if (prevKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY
    else process.env.VITE_SUPABASE_ANON_KEY = prevKey
  }
})

test('P3 Smoke 3: Plan entitlement matrix & connector feature mapping stay consistent across tiers', () => {
  assert.equal(PHASE4_PLAN_CATALOG.starter.aiAssistanceAvailable, false)
  assert.equal(PHASE4_PLAN_CATALOG.starter.outboundWebhooksEnabled, false)
  assert.equal(PHASE4_PLAN_CATALOG.starter.externalPmEnabled, false)
  assert.equal(PHASE4_PLAN_CATALOG.starter.githubIdeEnabled, false)
  assert.equal(PHASE4_PLAN_CATALOG.starter.whiteLabelEnabled, false)

  assert.equal(PHASE4_PLAN_CATALOG.team.aiAssistanceAvailable, true)
  assert.equal(PHASE4_PLAN_CATALOG.team.outboundWebhooksEnabled, true)
  assert.equal(PHASE4_PLAN_CATALOG.team.externalPmEnabled, true)
  assert.equal(PHASE4_PLAN_CATALOG.team.whiteLabelEnabled, false)
  assert.equal(PHASE4_PLAN_CATALOG.team.accountingConnectorsEnabled, false)

  assert.equal(PHASE4_PLAN_CATALOG.agency.whiteLabelEnabled, true)
  assert.equal(PHASE4_PLAN_CATALOG.agency.accountingConnectorsEnabled, true)
  assert.equal(PHASE4_PLAN_CATALOG.agency.clientPortalEnabled, true)

  assert.equal(getConnectorRequiredFeature('xero'), 'accounting_connectors')
  assert.equal(getConnectorRequiredFeature('quickbooks'), 'accounting_connectors')
  assert.equal(getConnectorRequiredFeature('jira'), 'external_pm')
  assert.equal(getConnectorRequiredFeature('linear', 'external_pm'), 'external_pm')
  assert.equal(getConnectorRequiredFeature('github'), 'github_ide')
  assert.equal(getConnectorRequiredFeature('slack'), null)

  // Verify pricing math for Agency 5 seats annual (15% discount)
  const totals = calculateSaasSubscriptionTotals('agency', 5, 'annual')
  assert.ok(totals.discountCents > 0)
  assert.equal(totals.totalCents, totals.subtotalCents - totals.discountCents)
})

test('P3 Smoke 4: End-to-end session -> deduplication -> signed portable verification report', async () => {
  // Overlapping desktop + VS Code signals over 1 hour must NEVER double count
  const evaluation = evaluateCanonicalTimeline(
    [
      {
        id: 'slice-desktop',
        deviceId: 'dev_macbook',
        deviceName: 'MacBook Pro',
        workDate: '2026-11-28',
        startMinuteOfDay: 540,
        endMinuteOfDay: 600,
        workMode: 'coding',
        provenance: 'desktop_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        artifacts: [
          {
            id: 'art-1',
            sourceType: 'github_commit',
            externalId: 'sha-p3-smoke',
            occurredAtUtc: '2026-11-28T09:50:00Z',
            summaryTitle: 'feat: p3 release hardening',
            linkType: 'contemporaneous',
            linkConfidence: 0.98,
            linkRationale: 'Matched branch task key',
          },
        ],
      },
      {
        id: 'slice-vscode',
        deviceId: 'dev_vscode',
        deviceName: 'VS Code Extension',
        workDate: '2026-11-28',
        startMinuteOfDay: 545,
        endMinuteOfDay: 595,
        workMode: 'coding',
        provenance: 'web_timer',
        appCategory: 'ide',
        hasInputSignal: true,
        artifacts: [],
      },
    ],
    {
      id: 'pol-smoke',
      tenantId: 'tenant-smoke',
      projectName: 'TikTrack Core',
      clientName: 'KodeMargin',
      roundingRule: 'none',
      paidBreakAllowanceMinutesPerDay: 15,
      weeklyCapMinutes: 2400,
      deepWorkNoInputWindowMinutes: 90,
      idleClarificationThresholdMinutes: 20,
      rateVersions: [
        {
          id: 'rv-1',
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          hourlyRate: 100,
          currency: 'USD',
          label: 'Standard',
        },
      ],
    },
    120
  )

  assert.equal(evaluation.totals.elapsedMinutes, 60)
  assert.equal(evaluation.totals.claimedMinutes, 60)
  assert.equal(evaluation.totals.supportedMinutes, 60)

  const report = await generateSignedPortableWorkReport({
    tenantId: 'tenant-smoke',
    tenantName: 'KodeMargin',
    developerUserId: 'dev-smoke',
    developerName: 'Pathum',
    reportTitle: 'P3 Smoke Portable Proof',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-28',
    signingKey: 'tiktrack-p3-smoke-secret',
    lines: [
      {
        id: 'line-smoke-1',
        developerId: 'dev-smoke',
        projectId: 'proj-smoke',
        taskCode: 'KM-101',
        taskTitle: 'Release hardening & E2E verification',
        workDate: '2026-11-28',
        workMode: 'coding',
        claimedMinutes: 60,
        supportedMinutes: 60,
        approvedBillableMinutes: 60,
        evidenceStatus: 'approved',
      },
    ],
    deliverables: [
      {
        id: 'art-smoke-1',
        sourceType: 'github_pr',
        externalId: 'PR-420',
        summaryTitle: 'Release P0-P3 hardening',
        occurredAtUtc: '2026-11-28T01:00:00Z',
      },
    ],
  })

  const verified = await verifyPortableWorkReportSignature(
    report,
    'tiktrack-p3-smoke-secret'
  )
  assert.equal(verified, true)
})
