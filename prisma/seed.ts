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
    },
    {
      planTier: 'team',
      maxSeats: 25,
      maxActiveProjects: 25,
      retentionDays: 365,
      githubIdeEnabled: true,
      clientPortalEnabled: false,
      aiAssistanceAvailable: true,
    },
    {
      planTier: 'agency',
      maxSeats: 100,
      maxActiveProjects: 100,
      retentionDays: 730,
      githubIdeEnabled: true,
      clientPortalEnabled: true,
      aiAssistanceAvailable: true,
    },
    {
      planTier: 'enterprise',
      maxSeats: 10000,
      maxActiveProjects: 10000,
      retentionDays: 2555,
      githubIdeEnabled: true,
      clientPortalEnabled: true,
      aiAssistanceAvailable: true,
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
