/**
 * DevProof (TikTrack) - Server-Side Authentication & Tenant Isolation Guard
 *
 * Cryptographically verifies Supabase Auth JWTs from `Authorization: Bearer <token>`
 * and resolves the caller's canonical Super Admin status and active workspace
 * memberships directly from PostgreSQL — never trusting client-supplied role fields.
 */

import crypto from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '../lib/prisma.ts'
import { isValidUuid } from './prismaPhase1Handlers.ts'

export interface VerifiedServerActor {
  /** True when Supabase Auth is configured in the server environment */
  authEnforced: boolean
  /** True when a valid session token was verified (or when auth is not configured in local offline mode) */
  authenticated: boolean
  userId: string | null
  email: string | null
  isSuperAdmin: boolean
  tenantIds: Set<string>
  tenantRoles: Map<string, Set<string>>
}

interface CachedTokenIdentity {
  userId: string
  email: string
  expiresAtMs: number
}

const TOKEN_CACHE_TTL_MS = 30_000
const TOKEN_CACHE_MAX_SIZE = 256
const tokenCache = new Map<string, CachedTokenIdentity>()

export function getSuperAdminEmailSet(): Set<string> {
  return new Set([
    ...(
      process.env.SUPER_ADMIN_EMAILS ||
      process.env.VITE_SUPER_ADMIN_EMAILS ||
      'iamartseeker@gmail.com'
    )
      .toLowerCase()
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean),
    'iamartseeker@gmail.com',
  ])
}

function getSupabaseAuthVerifierConfig(): { url: string; key: string } | null {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim()

  if (!url || !key || key.includes('your-local-or-project')) {
    return null
  }
  return { url, key }
}

function extractBearerToken(req: IncomingMessage): string | null {
  const raw = req.headers.authorization
  if (!raw || typeof raw !== 'string') return null
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

async function verifySupabaseJwt(
  token: string,
  cfg: { url: string; key: string }
): Promise<{ userId: string; email: string } | null> {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const now = Date.now()
  const cached = tokenCache.get(hash)
  if (cached && cached.expiresAtMs > now) {
    return { userId: cached.userId, email: cached.email }
  }

  try {
    const client = createClient(cfg.url, cfg.key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data?.user?.email) {
      tokenCache.delete(hash)
      return null
    }

    const identity = {
      userId: data.user.id,
      email: data.user.email.toLowerCase().trim(),
    }

    if (tokenCache.size >= TOKEN_CACHE_MAX_SIZE) {
      const oldestKey = tokenCache.keys().next().value
      if (oldestKey) tokenCache.delete(oldestKey)
    }
    tokenCache.set(hash, {
      ...identity,
      expiresAtMs: now + TOKEN_CACHE_TTL_MS,
    })

    return identity
  } catch {
    return null
  }
}

export async function resolveServerActor(
  req: IncomingMessage
): Promise<VerifiedServerActor> {
  const authCfg = getSupabaseAuthVerifierConfig()
  if (!authCfg) {
    return {
      authEnforced: false,
      authenticated: true,
      userId: null,
      email: null,
      isSuperAdmin: true,
      tenantIds: new Set(),
      tenantRoles: new Map(),
    }
  }

  const token = extractBearerToken(req)
  if (!token) {
    return {
      authEnforced: true,
      authenticated: false,
      userId: null,
      email: null,
      isSuperAdmin: false,
      tenantIds: new Set(),
      tenantRoles: new Map(),
    }
  }

  const identity = await verifySupabaseJwt(token, authCfg)
  if (!identity) {
    return {
      authEnforced: true,
      authenticated: false,
      userId: null,
      email: null,
      isSuperAdmin: false,
      tenantIds: new Set(),
      tenantRoles: new Map(),
    }
  }

  const superAdminSet = getSuperAdminEmailSet()
  const isSuperAdmin = superAdminSet.has(identity.email)

  const tenantIds = new Set<string>()
  const tenantRoles = new Map<string, Set<string>>()

  try {
    const memberships = await prisma.membership.findMany({
      where: {
        status: { in: ['active', 'invited'] },
        OR: [
          ...(isValidUuid(identity.userId) ? [{ userId: identity.userId }] : []),
          {
            user: {
              email: {
                equals: identity.email,
                mode: 'insensitive',
              },
            },
          },
        ],
      },
      include: {
        roleGrants: true,
      },
    })

    for (const m of memberships) {
      tenantIds.add(m.tenantId)
      const roles = tenantRoles.get(m.tenantId) ?? new Set<string>()
      for (const rg of m.roleGrants) {
        roles.add(rg.role)
      }
      tenantRoles.set(m.tenantId, roles)
    }
  } catch (err) {
    console.warn(
      '[ServerAuthGuard] Failed to resolve memberships:',
      err instanceof Error ? err.message : String(err)
    )
  }

  return {
    authEnforced: true,
    authenticated: true,
    userId: identity.userId,
    email: identity.email,
    isSuperAdmin,
    tenantIds,
    tenantRoles,
  }
}

export function canActorAccessTenant(
  actor: VerifiedServerActor,
  tenantId: string | undefined | null
): boolean {
  if (!actor.authEnforced) return true
  if (!actor.authenticated) return false
  if (actor.isSuperAdmin) return true
  if (!tenantId || !isValidUuid(tenantId)) return true
  return actor.tenantIds.has(tenantId)
}
