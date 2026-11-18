import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!connectionString) {
  console.error('Error: DIRECT_URL or DATABASE_URL must be set.')
  process.exit(1)
}

const sqlPath = path.resolve(process.cwd(), 'supabase/apply_live_guards.sql')
if (!fs.existsSync(sqlPath)) {
  console.error(`Error: SQL file not found at ${sqlPath}`)
  process.exit(1)
}

const sql = fs.readFileSync(sqlPath, 'utf8')
const client = new pg.Client({ connectionString })

async function main(): Promise<void> {
  const host = new URL(connectionString).host
  console.log(`Applying supabase/apply_live_guards.sql to ${host}...`)
  await client.connect()
  await client.query(sql)
  console.log('Successfully applied live guards, RLS policies, and triggers.')
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to apply live guards:', message)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.end().catch(() => {})
  })
