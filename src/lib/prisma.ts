/**
 * DevProof (TikTrack) — Prisma ORM Client for Supabase PostgreSQL
 *
 * Uses @prisma/adapter-pg (Prisma 7 Driver Adapter) connected to Supabase's
 * Supavisor transaction pooler (DATABASE_URL, port 6543, ?pgbouncer=true).
 *
 * Security Boundary:
 * This module runs ONLY in a Node.js / server environment (Vite server middleware,
 * API routes, CLI scripts, seed scripts). Never import this module directly in
 * browser-only components; browser code uses `src/lib/prismaApiClient.ts`.
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  )
}

export function isPrismaDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL
  if (!url) return false
  if (
    url.includes('[YOUR-PASSWORD]') ||
    url.includes('your-db-password') ||
    url.includes('your-password')
  ) {
    return false
  }
  return true
}

function createPrismaClient(): PrismaClient {
  const connectionString = getDatabaseUrl()
  const adapter = new PrismaPg({ connectionString })

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  })
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export async function checkPrismaConnection(): Promise<{
  connected: boolean
  configured: boolean
  projectRef: string | null
  message: string
}> {
  const configured = isPrismaDatabaseConfigured()
  const supaUrl = process.env.VITE_SUPABASE_URL ?? ''
  const refMatch = supaUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)
  const projectRef = refMatch ? refMatch[1] : null

  if (!configured) {
    return {
      connected: false,
      configured: false,
      projectRef,
      message:
        'DATABASE_URL in .env.local contains placeholder password ([YOUR-PASSWORD]). Replace with your Supabase Postgres password to enable live Prisma queries.',
    }
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    return {
      connected: true,
      configured: true,
      projectRef,
      message: 'Connected to Supabase PostgreSQL via Prisma ORM.',
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      connected: false,
      configured: true,
      projectRef,
      message: `Prisma connection error: ${errorMsg}`,
    }
  }
}

export default prisma

