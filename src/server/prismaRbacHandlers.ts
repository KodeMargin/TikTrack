/**
 * DevProof (TikTrack) - Prisma Handlers for Granular RBAC (Permissions, Roles,
 * Member Permission Overrides & Super Admin Tenant-Owner Policy Governance)
 */

import { prisma } from '../lib/prisma.ts'
import {
  ensurePermissionsSeeded,
  grantAllDatabasePermissionsToSuperAdmin,
  seedPermissionsAndRoles,
  SYSTEM_ROLE_UUIDS,
} from '../../prisma/seeds/permissions.seed.ts'
export { seedPermissionsAndRoles }
import type {
  CustomRole,
  GranularPermissionDef,
  PermissionModule,
  PermissionModuleId,
} from '../types/permissions.types.ts'
import { isValidUuid } from './prismaPhase1Handlers.ts'

export interface PrismaRbacBootstrapPayload {
  seedStatus: {
    seeded: boolean
    firstTime: boolean
    checksum: string
    moduleCount: number
    permissionCount: number
    systemRoleCount: number
  }
  modules: PermissionModule[]
  permissions: GranularPermissionDef[]
  roles: CustomRole[]
  tenantOwnerPermissions: Record<string, string[]>
  memberGrantsByMembershipId: Record<string, string[]>
}

export async function handleBootstrapRbacData(): Promise<PrismaRbacBootstrapPayload> {
  // 1. Ensure seed has been applied on first app run (or when catalog evolved)
  const seedStatus = await ensurePermissionsSeeded()

  // 2. Load modules, permissions, roles, tenant owner policies, and member grants from DB
  const [dbModules, dbPermissions, dbRoles, dbOwnerPolicies, dbMemberGrants] =
    await Promise.all([
      prisma.permissionModule.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.permission.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      }),
      prisma.role.findMany({
        include: { permissions: true },
        orderBy: [{ isSystemRole: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.tenantOwnerPermissionPolicy.findMany({
        include: { permissions: true },
      }),
      prisma.memberPermissionGrant.findMany(),
    ])

  const allPermissionKeys = dbPermissions.map((p) => p.key)

  const modules: PermissionModule[] = dbModules.map((m) => ({
    id: m.id as PermissionModuleId,
    name: m.name,
    description: m.description,
    icon: m.icon,
  }))

  const permissions: GranularPermissionDef[] = dbPermissions.map((p) => ({
    key: p.key,
    module: p.moduleId as PermissionModuleId,
    label: p.label,
    description: p.description,
    isSuperAdminOnly: p.isSuperAdminOnly || undefined,
  }))

  const roles: CustomRole[] = dbRoles.map((r) => ({
    id: r.id,
    tenantId: r.isSystemRole || !r.tenantId ? 'system' : r.tenantId,
    name: r.name,
    code: r.code,
    description: r.description,
    isSystemRole: r.isSystemRole,
    // Super Admin always receives every active permission in DB dynamically
    permissions:
      r.code === 'super_admin'
        ? allPermissionKeys
        : r.permissions.map((rp) => rp.permissionKey),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))

  const tenantOwnerPermissions: Record<string, string[]> = {}
  for (const policy of dbOwnerPolicies) {
    tenantOwnerPermissions[policy.tenantId] = policy.permissions.map(
      (p) => p.permissionKey
    )
  }

  const memberGrantsByMembershipId: Record<string, string[]> = {}
  for (const grant of dbMemberGrants) {
    if (!memberGrantsByMembershipId[grant.membershipId]) {
      memberGrantsByMembershipId[grant.membershipId] = []
    }
    memberGrantsByMembershipId[grant.membershipId].push(grant.permissionKey)
  }

  return {
    seedStatus,
    modules,
    permissions,
    roles,
    tenantOwnerPermissions,
    memberGrantsByMembershipId,
  }
}

export async function handleCreateCustomRolePrisma(body: {
  tenantId: string
  name: string
  code: string
  description: string
  permissions: string[]
  createdBy?: string
}): Promise<{ ok: boolean; role?: CustomRole; error?: string }> {
  if (!isValidUuid(body.tenantId)) {
    return { ok: false, error: 'Valid tenantId UUID is required.' }
  }
  const cleanName = body.name?.trim()
  const cleanCode = (
    body.code?.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')
  ).slice(0, 32)
  if (!cleanName || !cleanCode) {
    return { ok: false, error: 'Role name and code are required.' }
  }

  const validPerms = await prisma.permission.findMany({
    where: { key: { in: body.permissions ?? [] }, isSuperAdminOnly: false },
    select: { key: true },
  })
  const validKeys = validPerms.map((p) => p.key)

  const created = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        tenantId: body.tenantId,
        code: cleanCode,
        name: cleanName,
        description: body.description?.trim() ?? '',
        isSystemRole: false,
        createdBy: isValidUuid(body.createdBy) ? body.createdBy : null,
      },
    })

    if (validKeys.length > 0) {
      await tx.rolePermission.createMany({
        data: validKeys.map((permissionKey) => ({
          roleId: role.id,
          permissionKey,
        })),
        skipDuplicates: true,
      })
    }

    return role
  })

  return {
    ok: true,
    role: {
      id: created.id,
      tenantId: created.tenantId ?? body.tenantId,
      name: created.name,
      code: created.code,
      description: created.description,
      isSystemRole: false,
      permissions: validKeys,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  }
}

export async function handleUpdateCustomRolePrisma(body: {
  roleId: string
  tenantId: string
  name?: string
  description?: string
  permissions?: string[]
}): Promise<{ ok: boolean; error?: string }> {
  if (!isValidUuid(body.roleId)) {
    return { ok: false, error: 'Valid roleId UUID is required.' }
  }

  const existing = await prisma.role.findUnique({ where: { id: body.roleId } })
  if (!existing) {
    return { ok: false, error: 'Role not found in database.' }
  }
  if (existing.isSystemRole) {
    return { ok: false, error: 'Pre-defined system roles cannot be modified directly.' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: body.roleId },
      data: {
        name: body.name?.trim() || existing.name,
        description:
          body.description !== undefined
            ? body.description.trim()
            : existing.description,
      },
    })

    if (body.permissions) {
      const validPerms = await tx.permission.findMany({
        where: { key: { in: body.permissions }, isSuperAdminOnly: false },
        select: { key: true },
      })
      await tx.rolePermission.deleteMany({ where: { roleId: body.roleId } })
      if (validPerms.length > 0) {
        await tx.rolePermission.createMany({
          data: validPerms.map((p) => ({
            roleId: body.roleId,
            permissionKey: p.key,
          })),
          skipDuplicates: true,
        })
      }
    }
  })

  return { ok: true }
}

export async function handleDeleteCustomRolePrisma(body: {
  roleId: string
  tenantId: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!isValidUuid(body.roleId)) {
    return { ok: false, error: 'Valid roleId UUID is required.' }
  }

  const existing = await prisma.role.findUnique({ where: { id: body.roleId } })
  if (!existing) return { ok: true }
  if (existing.isSystemRole) {
    return { ok: false, error: 'System roles cannot be deleted.' }
  }

  await prisma.role.delete({ where: { id: body.roleId } })
  return { ok: true }
}

export async function handleUpdateMemberRoleAndPermissionsPrisma(body: {
  tenantId: string
  userId: string
  role: string
  customPermissions?: string[]
  grantedBy?: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) {
    return { ok: false, error: 'Valid tenantId and userId UUIDs are required.' }
  }

  const membership = await prisma.membership.findUnique({
    where: {
      tenantId_userId: { tenantId: body.tenantId, userId: body.userId },
    },
  })
  if (!membership) {
    return { ok: false, error: 'Membership not found.' }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Replace primary tenant-scoped role grant
    await tx.roleGrant.deleteMany({
      where: {
        tenantId: body.tenantId,
        membershipId: membership.id,
        projectScopeId: null,
      },
    })
    await tx.roleGrant.create({
      data: {
        tenantId: body.tenantId,
        membershipId: membership.id,
        role: body.role,
        grantedBy: isValidUuid(body.grantedBy) ? body.grantedBy : null,
      },
    })

    // 2. Replace granular member permission overrides if provided
    if (body.customPermissions !== undefined) {
      await tx.memberPermissionGrant.deleteMany({
        where: { membershipId: membership.id, tenantId: body.tenantId },
      })

      if (body.customPermissions.length > 0) {
        const validPerms = await tx.permission.findMany({
          where: { key: { in: body.customPermissions }, isSuperAdminOnly: false },
          select: { key: true },
        })
        if (validPerms.length > 0) {
          await tx.memberPermissionGrant.createMany({
            data: validPerms.map((p) => ({
              membershipId: membership.id,
              tenantId: body.tenantId,
              permissionKey: p.key,
              grantedBy: isValidUuid(body.grantedBy) ? body.grantedBy : null,
            })),
            skipDuplicates: true,
          })
        }
      }
    }
  })

  return { ok: true }
}

export async function handleUpdateTenantOwnerPermissionsPrisma(body: {
  tenantId: string
  permissions: string[]
  updatedBy?: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!isValidUuid(body.tenantId)) {
    return { ok: false, error: 'Valid tenantId UUID is required.' }
  }

  const validPerms = await prisma.permission.findMany({
    where: { key: { in: body.permissions ?? [] }, isSuperAdminOnly: false },
    select: { key: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.tenantOwnerPermissionPolicy.upsert({
      where: { tenantId: body.tenantId },
      update: {
        updatedBy: isValidUuid(body.updatedBy) ? body.updatedBy : null,
      },
      create: {
        tenantId: body.tenantId,
        updatedBy: isValidUuid(body.updatedBy) ? body.updatedBy : null,
      },
    })

    await tx.tenantOwnerPermission.deleteMany({
      where: { tenantId: body.tenantId },
    })

    if (validPerms.length > 0) {
      await tx.tenantOwnerPermission.createMany({
        data: validPerms.map((p) => ({
          tenantId: body.tenantId,
          permissionKey: p.key,
        })),
        skipDuplicates: true,
      })
    }
  })

  return { ok: true }
}

/**
 * Registers a brand-new granular permission in PostgreSQL and automatically
 * attaches it to the `super_admin` system role (and to `tenant_owner` default
 * system role if not `isSuperAdminOnly`).
 */
export async function handleRegisterPermissionPrisma(body: {
  key: string
  module: PermissionModuleId
  label: string
  description: string
  isSuperAdminOnly?: boolean
}): Promise<{ ok: boolean; permission?: GranularPermissionDef; error?: string }> {
  const cleanKey = body.key?.trim().toLowerCase()
  const cleanLabel = body.label?.trim()
  if (!cleanKey || !cleanKey.includes(':') || !cleanLabel) {
    return {
      ok: false,
      error: 'Permission key (format module:action) and label are required.',
    }
  }

  const count = await prisma.permission.count({ where: { moduleId: body.module } })

  const saved = await prisma.permission.upsert({
    where: { key: cleanKey },
    update: {
      moduleId: body.module,
      label: cleanLabel,
      description: body.description?.trim() ?? '',
      isSuperAdminOnly: Boolean(body.isSuperAdminOnly),
      isActive: true,
    },
    create: {
      key: cleanKey,
      moduleId: body.module,
      label: cleanLabel,
      description: body.description?.trim() ?? '',
      isSuperAdminOnly: Boolean(body.isSuperAdminOnly),
      isActive: true,
      sortOrder: count,
    },
  })

  // Guarantee Super Admin automatically receives this newly registered permission in DB
  await grantAllDatabasePermissionsToSuperAdmin()

  // Also attach to default tenant_owner system role if not super-admin-only
  if (!saved.isSuperAdminOnly && SYSTEM_ROLE_UUIDS.tenant_owner) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionKey: {
          roleId: SYSTEM_ROLE_UUIDS.tenant_owner,
          permissionKey: saved.key,
        },
      },
      update: {},
      create: {
        roleId: SYSTEM_ROLE_UUIDS.tenant_owner,
        permissionKey: saved.key,
      },
    })
  }

  return {
    ok: true,
    permission: {
      key: saved.key,
      module: saved.moduleId as PermissionModuleId,
      label: saved.label,
      description: saved.description,
      isSuperAdminOnly: saved.isSuperAdminOnly || undefined,
    },
  }
}

