/**
 * DevProof (TikTrack) — System Reference Seed Script for Supabase PostgreSQL
 *
 * Ensures system-level PlanEntitlement reference tiers exist without inserting
 * any dummy companies, fake users, or synthetic activity records.
 *
 * Usage:
 *   npm run db:seed
 */

import path from 'node:path'
import dotenv from 'dotenv'
import { prisma } from '../src/lib/prisma.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function main() {
  console.log('Ensuring system plan_entitlements tiers in Supabase PostgreSQL...')

  const entitlements = [
    {
      planTier: 'starter',
      maxSeats: 5,
      maxActiveProjects: 3,
      retentionDays: 90,
      githubIdeEnabled: false,
      clientPortalEnabled: false,
      aiAssistanceAvailable: false,
      monthlyEventQuota: 50000,
      monthlyAiTokenQuota: 0,
      storageQuotaMb: 512,
      apiRateLimitPerMin: 30,
      outboundWebhooksEnabled: false,
      accountingConnectorsEnabled: false,
      externalPmEnabled: false,
      whiteLabelEnabled: false,
      baseMonthlyPriceCents: 0,
      perSeatPriceCents: 0,
    },
    {
      planTier: 'team',
      maxSeats: 25,
      maxActiveProjects: 25,
      retentionDays: 365,
      githubIdeEnabled: true,
      clientPortalEnabled: false,
      aiAssistanceAvailable: true,
      monthlyEventQuota: 500000,
      monthlyAiTokenQuota: 150000,
      storageQuotaMb: 5120,
      apiRateLimitPerMin: 120,
      outboundWebhooksEnabled: true,
      accountingConnectorsEnabled: false,
      externalPmEnabled: true,
      whiteLabelEnabled: false,
      baseMonthlyPriceCents: 4900,
      perSeatPriceCents: 1200,
    },
    {
      planTier: 'agency',
      maxSeats: 100,
      maxActiveProjects: 100,
      retentionDays: 730,
      githubIdeEnabled: true,
      clientPortalEnabled: true,
      aiAssistanceAvailable: true,
      monthlyEventQuota: 2500000,
      monthlyAiTokenQuota: 750000,
      storageQuotaMb: 25600,
      apiRateLimitPerMin: 600,
      outboundWebhooksEnabled: true,
      accountingConnectorsEnabled: true,
      externalPmEnabled: true,
      whiteLabelEnabled: true,
      baseMonthlyPriceCents: 14900,
      perSeatPriceCents: 1800,
    },
    {
      planTier: 'enterprise',
      maxSeats: 10000,
      maxActiveProjects: 10000,
      retentionDays: 2555,
      githubIdeEnabled: true,
      clientPortalEnabled: true,
      aiAssistanceAvailable: true,
      monthlyEventQuota: 25000000,
      monthlyAiTokenQuota: 5000000,
      storageQuotaMb: 256000,
      apiRateLimitPerMin: 2400,
      outboundWebhooksEnabled: true,
      accountingConnectorsEnabled: true,
      externalPmEnabled: true,
      whiteLabelEnabled: true,
      baseMonthlyPriceCents: 49900,
      perSeatPriceCents: 2400,
    },
  ]

  for (const plan of entitlements) {
    await prisma.planEntitlement.upsert({
      where: { planTier: plan.planTier },
      update: plan,
      create: plan,
    })
  }

  console.log('System plan entitlements ready (0 dummy workspace records inserted).')
}

main()
  .catch((err) => {
    console.error('Prisma seed error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
