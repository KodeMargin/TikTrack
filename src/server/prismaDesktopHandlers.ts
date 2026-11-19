import { createClient } from '@supabase/supabase-js'
import { prisma } from '../lib/prisma.ts'
import { handleRecordSession, isValidUuid } from './prismaPhase1Handlers.ts'

export function buildDeveloperPairingToken(userId: string): string {
  return `dp_live_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_sync`
}

function getSupabaseAnonClient() {
  const url = process.env.VITE_SUPABASE_URL || ''
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function getSupabaseAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function resolveMembershipAndDevice(params: {
  userId: string
  deviceName?: string
  osPlatform?: string
  agentVersion?: string
  mustChangePasswordHint?: boolean
}) {
  const memberships = await prisma.membership.findMany({
    where: { userId: params.userId },
    include: {
      user: true,
      tenant: true,
      roleGrants: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (memberships.length === 0) {
    return {
      ok: false as const,
      statusCode: 403,
      error:
        'No workspace membership found for this account. Ask your Tenant Owner to invite you first.',
    }
  }

  // Prefer an active membership; otherwise pick the most recent invited one
  const membership =
    memberships.find((m) => m.status === 'active') ??
    memberships.find((m) => m.status === 'invited') ??
    memberships[0]

  if (membership.status === 'suspended' || membership.status === 'revoked') {
    return {
      ok: false as const,
      statusCode: 403,
      error: `Your workspace membership is currently ${membership.status}. Contact your Tenant Owner.`,
    }
  }

  const mustChangePassword =
    membership.status === 'invited' || Boolean(params.mustChangePasswordHint)

  const pairingToken = buildDeveloperPairingToken(membership.userId)
  const deviceName = params.deviceName?.trim() || 'TikTrack Desktop Workstation'
  const osPlatform = params.osPlatform?.trim() || 'macos'
  const agentVersion = params.agentVersion?.trim() || '0.3.0'

  // Upsert enrolled workstation record
  const existingDevice = await prisma.device.findFirst({
    where: {
      tenantId: membership.tenantId,
      userId: membership.userId,
      revokedAt: null,
    },
    orderBy: { lastSeenAt: 'desc' },
  })

  let deviceId: string
  if (existingDevice) {
    const updated = await prisma.device.update({
      where: { id: existingDevice.id },
      data: {
        deviceName,
        osPlatform,
        agentVersion,
        lastSeenAt: new Date(),
      },
    })
    deviceId = updated.id
  } else {
    const created = await prisma.device.create({
      data: {
        tenantId: membership.tenantId,
        userId: membership.userId,
        deviceName,
        osPlatform,
        agentVersion,
        deviceFingerprintHash: pairingToken,
        updateChannel: 'stable',
        multiDisplayPolicy: 'coarse_metadata_only',
      },
    })
    deviceId = created.id
  }

  return {
    ok: true as const,
    statusCode: 200,
    user: {
      id: membership.userId,
      email: membership.user.email,
      name: membership.user.fullName,
      role: membership.roleGrants[0]?.role ?? 'developer',
      status: membership.status,
      mustChangePassword,
    },
    tenant: {
      id: membership.tenantId,
      name: membership.tenant.name,
      slug: membership.tenant.slug,
    },
    deviceId,
    pairingToken,
  }
}

export async function handleDesktopAuth(body: {
  mode: 'password' | 'pairing_token'
  email?: string
  password?: string
  token?: string
  deviceName?: string
  osPlatform?: string
  agentVersion?: string
}) {
  if (body.mode === 'password') {
    const email = (body.email ?? '').trim().toLowerCase()
    const password = body.password ?? ''
    if (!email || !password) {
      return { ok: false, statusCode: 400, error: 'Email and password are required.' }
    }

    const supa = getSupabaseAnonClient()
    if (!supa) {
      return {
        ok: false,
        statusCode: 500,
        error: 'Supabase Auth is not configured on the server.',
      }
    }

    const { data, error } = await supa.auth.signInWithPassword({ email, password })
    if (error || !data.user || !data.session) {
      return {
        ok: false,
        statusCode: 401,
        error: error?.message || 'Invalid email or password.',
      }
    }

    const profile =
      (await prisma.userProfile.findUnique({ where: { id: data.user.id } })) ??
      (await prisma.userProfile.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      }))

    if (!profile) {
      return {
        ok: false,
        statusCode: 403,
        error:
          'Account is not linked to a TikTrack workspace yet. Please complete onboarding or contact your Tenant Owner.',
      }
    }

    const metaMustChange = Boolean(data.user.user_metadata?.mustChangePassword)
    const resolved = await resolveMembershipAndDevice({
      userId: profile.id,
      deviceName: body.deviceName,
      osPlatform: body.osPlatform,
      agentVersion: body.agentVersion,
      mustChangePasswordHint: metaMustChange,
    })

    if (!resolved.ok) {
      return resolved
    }

    return {
      ok: true,
      statusCode: 200,
      accessToken: data.session.access_token,
      user: resolved.user,
      tenant: resolved.tenant,
      deviceId: resolved.deviceId,
      pairingToken: resolved.pairingToken,
    }
  }

  if (body.mode === 'pairing_token') {
    const token = (body.token ?? '').trim()
    if (!token) {
      return { ok: false, statusCode: 400, error: 'Device pairing token is required.' }
    }

    // 1. Check enrolled Device record first
    let matchedUserId: string | null = null
    const matchedDevice = await prisma.device.findFirst({
      where: { deviceFingerprintHash: token, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    })
    if (matchedDevice) {
      matchedUserId = matchedDevice.userId
    }

    // 2. Also match the deterministic developer sync token from Integrations & Devices view:
    //    dp_live_<first12AlnumOfUserId>_sync
    if (!matchedUserId && token.startsWith('dp_live_') && token.endsWith('_sync')) {
      const profiles = await prisma.userProfile.findMany({
        select: { id: true },
      })
      const found = profiles.find((p) => buildDeveloperPairingToken(p.id) === token)
      if (found) {
        matchedUserId = found.id
      }
    }

    if (!matchedUserId) {
      return {
        ok: false,
        statusCode: 401,
        error: 'Invalid or revoked device pairing token. Copy a fresh token from Integrations & Devices.',
      }
    }

    const resolved = await resolveMembershipAndDevice({
      userId: matchedUserId,
      deviceName: body.deviceName,
      osPlatform: body.osPlatform,
      agentVersion: body.agentVersion,
    })

    if (!resolved.ok) {
      return resolved
    }

    if (resolved.user.mustChangePassword || resolved.user.status === 'invited') {
      return {
        ok: false,
        statusCode: 403,
        requiresActivation: true,
        error:
          'Your profile is not active yet. Please sign in with your email and temporary password first to change your password and activate your account.',
      }
    }

    return {
      ok: true,
      statusCode: 200,
      accessToken: token,
      user: resolved.user,
      tenant: resolved.tenant,
      deviceId: resolved.deviceId,
      pairingToken: resolved.pairingToken,
    }
  }

  return { ok: false, statusCode: 400, error: 'Unsupported auth mode.' }
}

export async function handleDesktopActivatePassword(body: {
  tenantId: string
  userId: string
  newPassword: string
  accessToken?: string
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) {
    return { ok: false, statusCode: 400, error: 'Valid tenantId and userId are required.' }
  }
  const newPassword = (body.newPassword ?? '').trim()
  if (newPassword.length < 6) {
    return {
      ok: false,
      statusCode: 400,
      error: 'New password must be at least 6 characters long.',
    }
  }

  // Update password in Supabase Auth
  const admin = getSupabaseAdminClient()
  if (admin) {
    const { error } = await admin.auth.admin.updateUserById(body.userId, {
      password: newPassword,
      user_metadata: { mustChangePassword: false },
    })
    if (error) {
      return { ok: false, statusCode: 400, error: `Password update failed: ${error.message}` }
    }
  } else if (body.accessToken && process.env.VITE_SUPABASE_URL) {
    const apiKey =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      ''
    const resp = await fetch(`${process.env.VITE_SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        Authorization: `Bearer ${body.accessToken}`,
      },
      body: JSON.stringify({
        password: newPassword,
        data: { mustChangePassword: false },
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      return { ok: false, statusCode: 400, error: `Password update failed: ${errText}` }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: {
        tenantId_userId: { tenantId: body.tenantId, userId: body.userId },
      },
      data: {
        status: 'active',
        joinedAt: new Date(),
      },
    })

    await tx.auditEntry.create({
      data: {
        tenantId: body.tenantId,
        actorUserId: body.userId,
        actionType: 'FIRST_LOGIN_PASSWORD_CHANGED',
        targetEntity: `memberships:${body.userId}`,
        targetId: body.userId,
        reason: 'Activated invited profile via Desktop Agent first-login password change.',
      },
    })
  })

  return {
    ok: true,
    statusCode: 200,
    status: 'active',
    mustChangePassword: false,
    message: 'Password updated! Your profile is now active and eligible for task assignments.',
  }
}

export async function handleDesktopFetchTasks(params: {
  tenantId: string
  userId: string
}) {
  if (!isValidUuid(params.tenantId) || !isValidUuid(params.userId)) {
    return { ok: false, statusCode: 400, error: 'Valid tenantId and userId are required.' }
  }

  const membership = await prisma.membership.findUnique({
    where: {
      tenantId_userId: { tenantId: params.tenantId, userId: params.userId },
    },
    include: { roleGrants: true },
  })

  if (!membership) {
    return { ok: false, statusCode: 403, error: 'Membership not found in this tenant.' }
  }

  if (membership.status !== 'active') {
    return {
      ok: false,
      statusCode: 403,
      requiresActivation: membership.status === 'invited',
      error:
        membership.status === 'invited'
          ? 'Profile is pending activation. Change your temporary password first.'
          : `Membership is ${membership.status}.`,
    }
  }

  const dbTasks = await prisma.task.findMany({
    where: {
      tenantId: params.tenantId,
      assignments: {
        some: { userId: params.userId },
      },
    },
    include: {
      project: {
        select: { id: true, code: true, name: true, status: true },
      },
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  })

  return {
    ok: true,
    statusCode: 200,
    tasks: dbTasks
      .filter((t) => t.project.status !== 'archived')
      .map((t) => ({
        id: t.id,
        projectId: t.projectId,
        projectCode: t.project.code,
        projectName: t.project.name,
        code: t.code,
        title: t.title,
        status: t.status,
        priority: t.priority,
        estimateMinutes: t.estimateMinutes,
        defaultWorkMode: t.defaultWorkMode,
        dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      })),
  }
}

export async function handleDesktopSubmitSession(body: {
  tenantId: string
  userId: string
  projectId: string
  taskId: string
  deviceId?: string
  workMode: string
  startedAtUtc?: string
  endedAtUtc?: string
  elapsedSeconds: number
  breakSeconds: number
  developerNote?: string
  markTaskForReview?: boolean
  submitTimesheet?: boolean
}) {
  if (
    !isValidUuid(body.tenantId) ||
    !isValidUuid(body.userId) ||
    !isValidUuid(body.projectId) ||
    !isValidUuid(body.taskId)
  ) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Valid tenantId, userId, projectId, and taskId are required.',
    }
  }

  const membership = await prisma.membership.findUnique({
    where: {
      tenantId_userId: { tenantId: body.tenantId, userId: body.userId },
    },
    include: { roleGrants: true },
  })
  if (!membership || membership.status !== 'active') {
    return {
      ok: false,
      statusCode: 403,
      error: 'Only active workspace members can submit work sessions.',
    }
  }

  const assignment = await prisma.taskAssignment.findFirst({
    where: {
      tenantId: body.tenantId,
      taskId: body.taskId,
      userId: body.userId,
    },
  })
  const isOwner = membership.roleGrants.some((rg) => rg.role === 'tenant_owner')
  if (!assignment && !isOwner) {
    return {
      ok: false,
      statusCode: 403,
      error: 'You are not assigned to this task. Select an assigned task to submit work.',
    }
  }

  const endDate = body.endedAtUtc ? new Date(body.endedAtUtc) : new Date()
  const durationMinutes = Math.max(1, Math.round(body.elapsedSeconds / 60))
  const breakMinutes = Math.max(0, Math.round(body.breakSeconds / 60))
  const startDate = body.startedAtUtc
    ? new Date(body.startedAtUtc)
    : new Date(endDate.getTime() - durationMinutes * 60000)

  const workDate = startDate.toISOString().slice(0, 10)
  const startTime = startDate.toISOString().slice(11, 16)
  // Ensure endTime > startTime on same day for tstzrange '[)'
  const safeEndDate =
    endDate.getTime() <= startDate.getTime() + 60000
      ? new Date(startDate.getTime() + 60000)
      : endDate
  const endTime = safeEndDate.toISOString().slice(11, 16)

  const recorded = await handleRecordSession({
    tenantId: body.tenantId,
    userId: body.userId,
    projectId: body.projectId,
    taskId: body.taskId,
    workDate,
    startTime,
    endTime: endTime === startTime ? '23:59' : endTime,
    durationMinutes,
    breakMinutes: Math.min(breakMinutes, Math.max(0, durationMinutes - 1)),
    workMode: body.workMode || 'coding',
    provenance: 'desktop_timer',
    developerNote:
      body.developerNote?.trim() ||
      `Submitted from TikTrack Desktop Agent (${durationMinutes}m)`,
    hourlyRate: 75,
  })

  if (!recorded.ok) {
    return { ok: false, statusCode: 400, error: recorded.error || 'Failed to record session.' }
  }

  if (body.markTaskForReview) {
    await prisma.task.update({
      where: { id: body.taskId },
      data: { status: 'review' },
    })
  }

  if (body.submitTimesheet && 'timesheetId' in recorded && recorded.timesheetId) {
    await prisma.timesheet.update({
      where: { id: recorded.timesheetId },
      data: {
        status: 'submitted',
        submittedAtUtc: new Date(),
      },
    })
  }

  if (body.deviceId && isValidUuid(body.deviceId)) {
    await prisma.device
      .update({
        where: { id: body.deviceId },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {})
  }

  return {
    ok: true,
    statusCode: 201,
    lineId: 'lineId' in recorded ? recorded.lineId : undefined,
    timesheetId: 'timesheetId' in recorded ? recorded.timesheetId : undefined,
    taskStatus: body.markTaskForReview ? 'review' : 'active',
  }
}
