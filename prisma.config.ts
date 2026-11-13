import path from 'node:path'
import dotenv from 'dotenv'
import { defineConfig } from 'prisma/config'

// Load .env.local first (Vite convention), then fallback to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

/**
 * DevProof (TikTrack) - Prisma Configuration for Supabase PostgreSQL
 *
 * Supabase Connection Best Practices:
 * - DIRECT_URL (port 5432, session pooler or direct connection) is used by Prisma CLI
 *   for schema migrations, introspection, and DDL operations.
 * - DATABASE_URL (port 6543, transaction pooler with ?pgbouncer=true) is used at runtime
 *   by PrismaClient.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --experimental-strip-types prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  },
})

