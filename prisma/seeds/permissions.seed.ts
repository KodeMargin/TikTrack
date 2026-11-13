/**
 * DevProof (TikTrack) - Granular Permissions & System Roles Database Seed
 *
 * Idempotently seeds:
 *   1. `permission_modules`   (all 13 modules)
 *   2. `permissions`          (all granular permissions, e.g. task:create, task:edit,
 *                              task:delete, task:view, task:assign, task:status_change,
 *                              task:approve, ..., plus superadmin:* privileges)
 *   3. `roles` & `role_permissions` for the 7 pre-defined system roles
 *      (super_admin, tenant_owner, project_manager, developer, finance,
 *       client_reviewer, auditor)
 *   4. `system_seed_runs` ledger row (`seed_key = 'granular_rbac_v1'`) with a SHA-256
 *      checksum of the permission catalog.
 *
 * First-run & auto-evolution behavior:
 *   - On first application startup (when `system_seed_runs` has no row for
 *     `granular_rbac_v1`), `ensurePermissionsSeeded()` creates the RBAC tables if
 *     needed and writes the entire permission catalog + system roles to PostgreSQL.
 *   - Whenever a new permission is added to `GRANULAR_PERMISSIONS` in code, the
 *     catalog checksum changes, so the next startup automatically upserts the new
 *     permission into `permissions` and grants it to `super_admin` (and to
 *     `tenant_owner` if it is not marked `isSuperAdminOnly`).
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../../src/lib/prisma.ts'
import {
  DEFAULT_PREDEFINED_ROLES,
  GRANULAR_PERMISSIONS,
  PERMISSION_MODULES,
} from '../../src/types/permissions.types.ts'

export const PERMISSIONS_SEED_KEY = 'granular_rbac_v1'
export const PERMISSIONS_SEED_VERSION = 1

/**
 * Deterministic UUIDs for the 7 pre-defined system roles (`tenant_id IS NULL`)
 * so primary-key upserts are 100% repeatable across environments.
 */
export const SYSTEM_ROLE_UUIDS: Record<string, string> = {
  super_admin: '00000000-0000-4000-8000-000000000001',
  tenant_owner: '00000000-0000-4000-8000-000000000002',
  project_manager: '00000000-0000-4000-8000-000000000003',
  developer: '00000000-0000-4000-8000-000000000004',
  finance: '00000000-0000-4000-8000-000000000005',
  client_reviewer: '00000000-0000-4000-8000-000000000006',
  auditor: '00000000-0000-4000-8000-000000000007',
}

export function computeCatalogChecksum(): string {
  const payload = JSON.stringify({
    version: PERMISSIONS_SEED_VERSION,
    modules: PERMISSION_MODULES,
    permissions: GRANULAR_PERMISSIONS,
    roles: DEFAULT_PREDEFINED_ROLES.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
    })),
  })
  return crypto.createHash('sha256').update(payload).digest('hex')
}

let inMemorySeededChecksum: string | null = null
let inFlightSeedPromise: Promise<SeedPermissionsResult> | null = null

export interface SeedPermissionsResult {
  seeded: boolean
  firstTime: boolean
  checksum: string
  moduleCount: number
  permissionCount: number
  systemRoleCount: number
}

/**
 * Ensures the 0017 RBAC tables exist in PostgreSQL before querying/seeding.
 * Uses `IF NOT EXISTS` DDL so it is a no-op once tables are present.
 */
async function ensureRbacSchemaExists(): Promise<void> {
  const candidates = [
    path.resolve(
      import.meta.dirname,
      '../../supabase/migrations/0017_granular_rbac_permissions.sql'
    ),
    path.resolve(
      process.cwd(),
      'supabase/migrations/0017_granular_rbac_permissions.sql'
    ),
  ]
  const migrationPath = candidates.find((p) => fs.existsSync(p))
  if (!migrationPath) return

  const sql = fs.readFileSync(migrationPath, 'utf8')
  const stripped = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  const statements = stripped
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0)

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt)
  }
}

/**
 * Runs the granular permissions & system roles seed unconditionally.
 * Called by `npm run db:seed` and by `ensurePermissionsSeeded()` when the DB has
 * not been seeded yet or the permission catalog checksum has changed.
 */
export async function seedPermissionsAndRoles(options?: {
  force?: boolean
}): Promise<SeedPermissionsResult> {
  await ensureRbacSchemaExists()

  const checksum = computeCatalogChecksum()
  const existingRun = await prisma.systemSeedRun.findUnique({
    where: { seedKey: PERMISSIONS_SEED_KEY },
  })

  if (!options?.force && existingRun && existingRun.checksum === checksum) {
    // Even when checksum matches, guarantee super_admin holds every permission in DB
    // (including any permission inserted directly into the `permissions` table).
    await grantAllDatabasePermissionsToSuperAdmin()
    inMemorySeededChecksum = checksum
    return {
      seeded: false,
      firstTime: false,
      checksum,
      moduleCount: PERMISSION_MODULES.length,
      permissionCount: GRANULAR_PERMISSIONS.length,
      systemRoleCount: DEFAULT_PREDEFINED_ROLES.length,
    }
  }

  const firstTime = !existingRun

  await prisma.$transaction(async (tx) => {
    // 1. Seed permission_modules
    for (let i = 0; i < PERMISSION_MODULES.length; i++) {
      const mod = PERMISSION_MODULES[i]
      await tx.permissionModule.upsert({
        where: { id: mod.id },
        update: {
          name: mod.name,
          description: mod.description,
          icon: mod.icon,
          sortOrder: i,
        },
        create: {
          id: mod.id,
          name: mod.name,
          description: mod.description,
          icon: mod.icon,
          sortOrder: i,
        },
      })
    }

    // 2. Seed granular permissions
    for (let i = 0; i < GRANULAR_PERMISSIONS.length; i++) {
      const perm = GRANULAR_PERMISSIONS[i]
      await tx.permission.upsert({
        where: { key: perm.key },
        update: {
          moduleId: perm.module,
          label: perm.label,
          description: perm.description,
          isSuperAdminOnly: Boolean(perm.isSuperAdminOnly),
          isActive: true,
          sortOrder: i,
        },
        create: {
          key: perm.key,
          moduleId: perm.module,
          label: perm.label,
          description: perm.description,
          isSuperAdminOnly: Boolean(perm.isSuperAdminOnly),
          isActive: true,
          sortOrder: i,
        },
      })
    }

    // Fetch all permission keys present in DB (code catalog + any DB-added permissions)
    const allDbPermissions = await tx.permission.findMany({
      where: { isActive: true },
      select: { key: true, isSuperAdminOnly: true },
    })
    const allPermissionKeys = allDbPermissions.map((p) => p.key)
    const allTenantPermissionKeys = allDbPermissions
      .filter((p) => !p.isSuperAdminOnly)
      .map((p) => p.key)

    // 3. Seed pre-defined system roles & their default role_permissions
    for (const sysRole of DEFAULT_PREDEFINED_ROLES) {
      const roleId = SYSTEM_ROLE_UUIDS[sysRole.code]
      if (!roleId) continue

      await tx.role.upsert({
        where: { id: roleId },
        update: {
          code: sysRole.code,
          name: sysRole.name,
          description: sysRole.description,
          isSystemRole: true,
          tenantId: null,
        },
        create: {
          id: roleId,
          tenantId: null,
          code: sysRole.code,
          name: sysRole.name,
          description: sysRole.description,
          isSystemRole: true,
        },
      })

      // Super Admin automatically gets EVERY permission (existing + newly added).
      // Tenant Owner default system role gets all non-superadmin permissions.
      const targetKeys =
        sysRole.code === 'super_admin'
          ? allPermissionKeys
          : sysRole.code === 'tenant_owner'
            ? allTenantPermissionKeys
            : sysRole.permissions

      await tx.rolePermission.deleteMany({ where: { roleId } })
      if (targetKeys.length > 0) {
        await tx.rolePermission.createMany({
          data: targetKeys.map((permissionKey) => ({
            roleId,
            permissionKey,
          })),
          skipDuplicates: true,
        })
      }
    }

    // 4. Record seed execution in system_seed_runs
    await tx.systemSeedRun.upsert({
      where: { seedKey: PERMISSIONS_SEED_KEY },
      update: {
        version: PERMISSIONS_SEED_VERSION,
        checksum,
        runCount: { increment: 1 },
        lastAppliedAt: new Date(),
      },
      create: {
        seedKey: PERMISSIONS_SEED_KEY,
        version: PERMISSIONS_SEED_VERSION,
        checksum,
        runCount: 1,
      },
    })
  }, { timeout: 60000, maxWait: 15000 })

  inMemorySeededChecksum = checksum

  return {
    seeded: true,
    firstTime,
    checksum,
    moduleCount: PERMISSION_MODULES.length,
    permissionCount: GRANULAR_PERMISSIONS.length,
    systemRoleCount: DEFAULT_PREDEFINED_ROLES.length,
  }
}

/**
 * Ensures the `super_admin` system role has a `role_permissions` row for every
 * active permission in the `permissions` table (so even permissions inserted at
 * runtime or by future migrations automatically apply to Super Admin).
 */
export async function grantAllDatabasePermissionsToSuperAdmin(): Promise<void> {
  const superRoleId = SYSTEM_ROLE_UUIDS.super_admin
  const allPerms = await prisma.permission.findMany({
    where: { isActive: true },
    select: { key: true },
  })
  if (allPerms.length === 0) return

  await prisma.rolePermission.createMany({
    data: allPerms.map((p) => ({
      roleId: superRoleId,
      permissionKey: p.key,
    })),
    skipDuplicates: true,
  })
}

/**
 * Called automatically during `/api/prisma/bootstrap` on application startup.
 * Runs the seed on the very first run (or when the catalog checksum changes) and
 * caches the checksum in memory so subsequent requests in the same server process
 * incur zero overhead.
 */
export async function ensurePermissionsSeeded(): Promise<SeedPermissionsResult> {
  const targetChecksum = computeCatalogChecksum()
  if (inMemorySeededChecksum === targetChecksum) {
    return {
      seeded: false,
      firstTime: false,
      checksum: targetChecksum,
      moduleCount: PERMISSION_MODULES.length,
      permissionCount: GRANULAR_PERMISSIONS.length,
      systemRoleCount: DEFAULT_PREDEFINED_ROLES.length,
    }
  }

  if (!inFlightSeedPromise) {
    inFlightSeedPromise = seedPermissionsAndRoles().finally(() => {
      inFlightSeedPromise = null
    })
  }
  return inFlightSeedPromise
}

