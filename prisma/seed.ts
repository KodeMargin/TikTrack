/**
 * DevProof (TikTrack) — Prisma ORM Seed Script for Supabase PostgreSQL
 *
 * Seeds initial multi-tenant workspace records (Tenants, Settings, Policy Versions,
 * User Profiles, Memberships, Role Grants, Projects, Tasks, Contracts & Audit Entries).
 *
 * Usage:
 *   npm run db:seed
 */

import path from 'node:path'
import dotenv from 'dotenv'
import { prisma } from '../src/lib/prisma.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const IDS = {
  tenantNorthstar: '11111111-1111-4111-8111-111111111101',
  tenantVertex: '11111111-1111-4111-8111-111111111102',
  policyNorthstar: '22222222-2222-4222-8222-222222222201',
  policyVertex: '22222222-2222-4222-8222-222222222202',
  userAria: '33333333-3333-4333-8333-333333333301',
  userMarcus: '33333333-3333-4333-8333-333333333302',
  userElena: '33333333-3333-4333-8333-333333333303',
  userDevon: '33333333-3333-4333-8333-333333333304',
  projectSettle: '44444444-4444-4444-8444-444444444401',
  projectVault: '44444444-4444-4444-8444-444444444402',
  task104: '55555555-5555-4555-8555-555555555501',
  task209: '55555555-5555-4555-8555-555555555502',
  contractAcme: '66666666-6666-4666-8666-666666666601',
}

async function main() {
  console.log('Seeding DevProof (TikTrack) database via Prisma ORM...')

  // 1. Upsert Tenants
  const northstar = await prisma.tenant.upsert({
    where: { slug: 'northstar-labs' },
    update: {
      name: 'Northstar Labs',
      defaultTimezone: 'America/New_York',
      defaultCurrency: 'USD',
      planTier: 'team',
    },
    create: {
      id: IDS.tenantNorthstar,
      name: 'Northstar Labs',
      slug: 'northstar-labs',
      defaultTimezone: 'America/New_York',
      defaultCurrency: 'USD',
      planTier: 'team',
      status: 'active',
    },
  })

  await prisma.tenantSettings.upsert({
    where: { tenantId: northstar.id },
    update: {
      roundingRule: 'none',
      paidBreakAllowanceMinutes: 15,
      weeklyCapMinutes: 2400,
    },
    create: {
      tenantId: northstar.id,
      roundingRule: 'none',
      paidBreakAllowanceMinutes: 15,
      weeklyCapMinutes: 2400,
    },
  })

  await prisma.policyVersion.upsert({
    where: {
      tenantId_versionCode: {
        tenantId: northstar.id,
        versionCode: 'v1.0-2026-11',
      },
    },
    update: {},
    create: {
      id: IDS.policyNorthstar,
      tenantId: northstar.id,
      versionCode: 'v1.0-2026-11',
      summaryMarkdown:
        'Privacy-first tracking policy v1.0: collects declared session lifecycle and coarse work mode; never collects keystrokes, clipboard, or screenshots.',
    },
  })

  const vertex = await prisma.tenant.upsert({
    where: { slug: 'vertex-agency' },
    update: {
      name: 'Vertex Cloud Agency',
      defaultTimezone: 'Europe/Berlin',
      defaultCurrency: 'EUR',
      planTier: 'agency',
    },
    create: {
      id: IDS.tenantVertex,
      name: 'Vertex Cloud Agency',
      slug: 'vertex-agency',
      defaultTimezone: 'Europe/Berlin',
      defaultCurrency: 'EUR',
      planTier: 'agency',
      status: 'active',
    },
  })

  await prisma.tenantSettings.upsert({
    where: { tenantId: vertex.id },
    update: {
      roundingRule: 'nearest_5m',
      paidBreakAllowanceMinutes: 15,
      weeklyCapMinutes: 2400,
    },
    create: {
      tenantId: vertex.id,
      roundingRule: 'nearest_5m',
      paidBreakAllowanceMinutes: 15,
      weeklyCapMinutes: 2400,
    },
  })

  // 2. Upsert Projects
  const projSettle = await prisma.project.upsert({
    where: {
      tenantId_code: {
        tenantId: northstar.id,
        code: 'SETTLE-CORE',
      },
    },
    update: {
      name: 'Multi-Region Settlement Ledger',
      clientName: 'Acme FinTech Global',
    },
    create: {
      id: IDS.projectSettle,
      tenantId: northstar.id,
      code: 'SETTLE-CORE',
      name: 'Multi-Region Settlement Ledger',
      clientName: 'Acme FinTech Global',
      status: 'active',
      description:
        'High-integrity PostgreSQL ledger, RLS policies, and webhook settlement pipeline.',
    },
  })

  await prisma.project.upsert({
    where: {
      tenantId_code: {
        tenantId: northstar.id,
        code: 'VAULT-SDK',
      },
    },
    update: {
      name: 'Zero-Knowledge Tokenization SDK',
      clientName: 'Horizon Banking Group',
    },
    create: {
      id: IDS.projectVault,
      tenantId: northstar.id,
      code: 'VAULT-SDK',
      name: 'Zero-Knowledge Tokenization SDK',
      clientName: 'Horizon Banking Group',
      status: 'active',
      description: 'Rust/Tauri local encryption queue and key-rotation client SDK.',
    },
  })

  // 3. Upsert Tasks
  await prisma.task.upsert({
    where: {
      tenantId_code: {
        tenantId: northstar.id,
        code: 'DEV-104',
      },
    },
    update: {
      title: 'Design & Implement GiST Non-Overlap Time Ledger Constraint',
    },
    create: {
      id: IDS.task104,
      tenantId: northstar.id,
      projectId: projSettle.id,
      code: 'DEV-104',
      title: 'Design & Implement GiST Non-Overlap Time Ledger Constraint',
      acceptanceCriteria:
        '1. Exclude overlapping intervals per (tenant_id, user_id). 2. Pass pgTAP negative tests.',
      status: 'active',
      priority: 'high',
      estimateMinutes: 240,
      isBillable: true,
      defaultWorkMode: 'thinking',
      dueDate: new Date('2026-11-16'),
    },
  })

  await prisma.task.upsert({
    where: {
      tenantId_code: {
        tenantId: northstar.id,
        code: 'DEV-209',
      },
    },
    update: {
      title: 'Investigate Queue Worker Visibility Timeout Race Condition',
    },
    create: {
      id: IDS.task209,
      tenantId: northstar.id,
      projectId: projSettle.id,
      code: 'DEV-209',
      title: 'Investigate Queue Worker Visibility Timeout Race Condition',
      acceptanceCriteria:
        '1. Reproduce deadlock in local test runner. 2. Ensure idempotent batch acknowledgment.',
      status: 'review',
      priority: 'urgent',
      estimateMinutes: 180,
      isBillable: true,
      defaultWorkMode: 'debugging',
      dueDate: new Date('2026-11-14'),
    },
  })

  // 4. Record Seed Audit Log
  await prisma.auditEntry.create({
    data: {
      tenantId: northstar.id,
      actionType: 'PRISMA_SEED_COMPLETED',
      targetEntity: 'tenants:northstar-labs',
      reason: 'Seeded initial DevProof workspace records via Prisma ORM.',
    },
  })

  console.log('Seed completed successfully!')
}

main()
  .catch((err) => {
    console.error('Prisma seed error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

