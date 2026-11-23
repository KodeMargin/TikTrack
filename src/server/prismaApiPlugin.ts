/**
 * DevProof (TikTrack) - Vite Server Middleware for Prisma ORM + Supabase PostgreSQL
 *
 * Exposes `/api/prisma/*` endpoints on the Vite dev/preview server so the React
 * application persists all Phase 1 workflows through Prisma ORM.
 */

import type { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import dotenv from 'dotenv'
import type { Plugin } from 'vite'
import { checkPrismaConnection, prisma } from '../lib/prisma.ts'
import {
  ensureSupabaseAuthUser,
  sendOwnerSignupVerificationEmail,
  sendPasswordRecoveryEmail,
  sendWorkspaceInviteEmail,
} from './emailService.ts'
import {
  handleBootstrap,
  handleCreateTenant,
  handleRecordSession,
  isValidUuid,
} from './prismaPhase1Handlers.ts'
import {
  handleDesktopActivatePassword,
  handleDesktopAuth,
  handleDesktopFetchTasks,
  handleDesktopSubmitSession,
} from './prismaDesktopHandlers.ts'
import {
  handleAddPrivacyExclusionPrisma,
  handleCreateSessionAnnotationPrisma,
  handleIngestWebhookPrisma,
  handleReconcileGapPrisma,
  handleRemovePrivacyExclusionPrisma,
  handleToggleDeviceRevocationPrisma,
} from './prismaPhase2Handlers.ts'
import {
  handleCreateAiGenerationPrisma,
  handleDecideAiGenerationPrisma,
  handleDisputeActionPrisma,
  handleOpenDisputePrisma,
  handlePartialApproveTimesheetPrisma,
  handlePublishRuleSetPrisma,
  handleToggleTenantAiPrisma,
} from './prismaPhase3Handlers.ts'
import {
  generateGeminiSummaryDraft,
  getGeminiConfig,
  type GeminiDraftRequest,
} from './geminiService.ts'
import {
  handleCheckoutSubscriptionPrisma,
  handleCreateApiKeyPrisma,
  handleCreatePortableReportPrisma,
  handleCreateWebhookEndpointPrisma,
  handleDispatchWebhookDeliveryPrisma,
  handleRevokeApiKeyPrisma,
  handleSyncCalendarMeetingPrisma,
  handleUpdateBrandingPrisma,
  handleUpsertConnectorPrisma,
} from './prismaPhase4Handlers.ts'
import {
  handleCreateCustomRolePrisma,
  handleDeleteCustomRolePrisma,
  handleRegisterPermissionPrisma,
  handleUpdateCustomRolePrisma,
  handleUpdateMemberRoleAndPermissionsPrisma,
  handleUpdateTenantOwnerPermissionsPrisma,
  seedPermissionsAndRoles,
} from './prismaRbacHandlers.ts'
import {
  handleConnectRealIntegration,
  handleDisconnectRealIntegration,
  handleDispatchRealOutboundWebhook,
  handleFetchRealIntegrationItems,
  handleSendChatTestAlert,
} from './integrations/realConnectorsService.ts'
import {
  buildCalendarOAuthStartUrl,
  getCalendarOAuthStatus,
  handleCalendarOAuthCallback,
  handleFetchRealCalendarEvents,
} from './integrations/calendarOAuth.ts'
import {
  handlePublicRestApiV1Request,
  type PublicApiResource,
} from './integrations/publicApiV1.ts'
import {
  handleCreateSavedReportPrisma,
  handleDeleteSavedReportPrisma,
  handleFetchPlatformReportsPrisma,
  handleGenerateReportAiBriefPrisma,
  handleListSavedReportsPrisma,
} from './prismaReportsHandlers.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const preParsed = (req as IncomingMessage & { body?: unknown }).body
  if (preParsed !== undefined) {
    if (typeof preParsed === 'string') {
      return preParsed ? (JSON.parse(preParsed) as T) : ({} as T)
    }
    return preParsed as T
  }

  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
    })
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as T) : ({} as T))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
    req.on('error', (err) => {
      reject(err instanceof Error ? err : new Error(String(err)))
    })
  })
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): true {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.end(JSON.stringify(payload))
  return true
}

export async function handlePrismaApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url ?? ''
  if (!url.startsWith('/api/prisma/')) {
    return false
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.end()
    return true
  }

  try {
            if (req.method === 'POST' && url.startsWith('/api/prisma/desktop/auth')) {
              const body = await readJsonBody<Parameters<typeof handleDesktopAuth>[0]>(req)
              const result = await handleDesktopAuth(body)
              return sendJson(res, result.statusCode ?? 200, result)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/desktop/activate-password')) {
              const body = await readJsonBody<Parameters<typeof handleDesktopActivatePassword>[0]>(req)
              const result = await handleDesktopActivatePassword(body)
              return sendJson(res, result.statusCode ?? 200, result)
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/desktop/tasks')) {
              const parsed = new URL(url, 'http://localhost')
              const tenantId = parsed.searchParams.get('tenantId') ?? ''
              const userId = parsed.searchParams.get('userId') ?? ''
              const result = await handleDesktopFetchTasks({ tenantId, userId })
              return sendJson(res, result.statusCode ?? 200, result)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/desktop/sessions/submit')) {
              const body = await readJsonBody<Parameters<typeof handleDesktopSubmitSession>[0]>(req)
              const result = await handleDesktopSubmitSession(body)
              return sendJson(res, result.statusCode ?? 200, result)
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/status')) {
              return sendJson(res, 200, await checkPrismaConnection())
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/bootstrap')) {
              return sendJson(res, 200, await handleBootstrap())
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/tenants')) {
              const body = await readJsonBody<{
                name: string
                slug: string
                timezone: string
                currency: string
                ownerName: string
                ownerEmail: string
                skipOwnerInvite?: boolean
              }>(req)
              const tenantResult = await handleCreateTenant(body)
              // Dispatch welcome/invite email to the owner via Supabase + Resend unless self-service owner is already signed in
              if (!body.skipOwnerInvite) {
                void sendWorkspaceInviteEmail({
                  email: body.ownerEmail,
                  name: body.ownerName,
                  role: 'tenant_owner',
                  tenantId: tenantResult.tenantId,
                  tenantName: body.name,
                }).catch((err) => {
                  console.warn('[EmailService] Owner welcome email dispatch error:', err)
                })
              }
              return sendJson(res, 201, tenantResult)
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/tenant/settings')) {
              const body = await readJsonBody<{
                tenantId: string
                roundingRule?: string
                paidBreakMinutesPerDay?: number
                weeklyCapMinutes?: number
              }>(req)
              if (!isValidUuid(body.tenantId)) {
                return sendJson(res, 200, { ok: false })
              }
              await prisma.tenantSettings.update({
                where: { tenantId: body.tenantId },
                data: {
                  ...(body.roundingRule ? { roundingRule: body.roundingRule } : {}),
                  ...(body.paidBreakMinutesPerDay !== undefined
                    ? { paidBreakAllowanceMinutes: body.paidBreakMinutesPerDay }
                    : {}),
                  ...(body.weeklyCapMinutes !== undefined
                    ? { weeklyCapMinutes: body.weeklyCapMinutes }
                    : {}),
                },
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/auth/owner-signup')) {
              const body = await readJsonBody<{
                email: string
                password: string
                fullName: string
                timezone?: string
                countryCode?: string
                countryName?: string
                redirectTo?: string
              }>(req)
              const email = (body.email ?? '').trim().toLowerCase()
              if (!email || !body.password || body.password.length < 6) {
                return sendJson(res, 400, {
                  ok: false,
                  message: 'Valid email and password (minimum 6 characters) are required.',
                })
              }
              const emailResult = await sendOwnerSignupVerificationEmail({
                email,
                password: body.password,
                fullName: body.fullName || email.split('@')[0],
                timezone: body.timezone,
                countryCode: body.countryCode,
                countryName: body.countryName,
                redirectTo: body.redirectTo,
              })
              return sendJson(res, emailResult.ok ? 200 : 400, emailResult)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/auth/reset-password')) {
              const body = await readJsonBody<{ email: string; redirectTo?: string }>(req)
              const email = (body.email ?? '').trim().toLowerCase()
              if (!email) {
                return sendJson(res, 400, { ok: false, message: 'Email address is required.' })
              }
              const emailResult = await sendPasswordRecoveryEmail({
                email,
                redirectTo: body.redirectTo,
              })
              return sendJson(res, emailResult.ok ? 200 : 500, emailResult)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/members/resend-invite')) {
              const body = await readJsonBody<{
                tenantId: string
                userId: string
                temporaryPassword?: string
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) {
                return sendJson(res, 200, { ok: false, message: 'Invalid tenant or user ID' })
              }
              const member = await prisma.membership.findUnique({
                where: {
                  tenantId_userId: { tenantId: body.tenantId, userId: body.userId },
                },
                include: { user: true, tenant: true, roleGrants: true },
              })
              if (!member || !member.user) {
                return sendJson(res, 404, { ok: false, message: 'Member not found' })
              }
              const role = member.roleGrants[0]?.role || 'developer'
              const freshTempPassword =
                body.temporaryPassword?.trim() ||
                (member.status === 'invited'
                  ? `TT-${crypto.randomBytes(4).toString('hex')}!`
                  : undefined)
              const emailResult = await sendWorkspaceInviteEmail({
                email: member.user.email,
                name: member.user.fullName,
                role,
                tenantId: body.tenantId,
                tenantName: member.tenant?.name,
                temporaryPassword: freshTempPassword,
              })
              await prisma.auditEntry.create({
                data: {
                  tenantId: body.tenantId,
                  actionType: 'INVITE_RESENT',
                  targetEntity: `memberships:${member.user.email}`,
                  reason: `Resent invitation email to ${member.user.email} via Resend`,
                },
              })
              return sendJson(res, 200, {
                ok: emailResult.ok,
                emailSent: emailResult.ok,
                message: emailResult.message,
                temporaryPassword: freshTempPassword,
              })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/members') && !url.includes('/status') && !url.includes('/resend-invite')) {
              const body = await readJsonBody<{
                tenantId: string
                name: string
                email: string
                role: string
                temporaryPassword?: string
                customPermissions?: string[]
              }>(req)
              if (!isValidUuid(body.tenantId) || !body.email?.trim() || !body.name?.trim()) {
                return sendJson(res, 400, { ok: false, error: 'Valid tenantId, name, and email are required.' })
              }
              const normalizedEmail = body.email.toLowerCase().trim()
              const effectiveTempPassword =
                body.temporaryPassword?.trim() || `TT-${crypto.randomBytes(4).toString('hex')}!`
              try {
                const tenantRecord = await prisma.tenant.findUnique({
                  where: { id: body.tenantId },
                  select: { name: true },
                })

                // 1. Provision or locate the user in Supabase Auth FIRST so `auth.users(id)` exists
                //    before Prisma inserts into `public.user_profiles` (which has FK -> auth.users.id).
                const authProvision = await ensureSupabaseAuthUser({
                  email: normalizedEmail,
                  name: body.name.trim(),
                  role: body.role,
                  tenantId: body.tenantId,
                  tenantName: tenantRecord?.name,
                  temporaryPassword: effectiveTempPassword,
                })

                let resolvedUserId = ''
                await prisma.$transaction(async (tx) => {
                  const existingUserById = authProvision.userId
                    ? await tx.userProfile.findUnique({ where: { id: authProvision.userId } })
                    : null
                  const existingUser =
                    existingUserById ||
                    (await tx.userProfile.findFirst({
                      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
                    }))

                  if (existingUser) {
                    resolvedUserId = existingUser.id
                    if (body.name.trim() && existingUser.fullName !== body.name.trim()) {
                      await tx.userProfile.update({
                        where: { id: existingUser.id },
                        data: { fullName: body.name.trim() },
                      })
                    }
                  } else {
                    resolvedUserId = authProvision.userId || crypto.randomUUID()
                    await tx.userProfile.create({
                      data: { id: resolvedUserId, email: normalizedEmail, fullName: body.name.trim() },
                    })
                  }

                  const existingMem = await tx.membership.findFirst({
                    where: {
                      tenantId: body.tenantId,
                      userId: resolvedUserId,
                    },
                    include: { roleGrants: true },
                  })

                  let targetMembershipId = ''
                  if (existingMem) {
                    targetMembershipId = existingMem.id
                    await tx.membership.update({
                      where: { id: existingMem.id },
                      data: {
                        status: 'invited',
                        invitedEmail: normalizedEmail,
                      },
                    })
                    await tx.roleGrant.deleteMany({
                      where: {
                        tenantId: body.tenantId,
                        membershipId: existingMem.id,
                        projectScopeId: null,
                      },
                    })
                    await tx.roleGrant.create({
                      data: {
                        tenantId: body.tenantId,
                        membershipId: existingMem.id,
                        role: body.role,
                      },
                    })
                  } else {
                    const mem = await tx.membership.create({
                      data: {
                        tenantId: body.tenantId,
                        userId: resolvedUserId,
                        status: 'invited',
                        invitedEmail: normalizedEmail,
                        joinedAt: new Date(),
                      },
                    })
                    targetMembershipId = mem.id
                    await tx.roleGrant.create({
                      data: {
                        tenantId: body.tenantId,
                        membershipId: mem.id,
                        role: body.role,
                      },
                    })
                  }

                  if (Array.isArray(body.customPermissions) && body.customPermissions.length > 0 && targetMembershipId) {
                    const validPerms = await tx.permission.findMany({
                      where: { key: { in: body.customPermissions }, isSuperAdminOnly: false },
                      select: { key: true },
                    })
                    await tx.memberPermissionGrant.deleteMany({
                      where: { membershipId: targetMembershipId, tenantId: body.tenantId },
                    })
                    if (validPerms.length > 0) {
                      await tx.memberPermissionGrant.createMany({
                        data: validPerms.map((p) => ({
                          membershipId: targetMembershipId,
                          tenantId: body.tenantId,
                          permissionKey: p.key,
                        })),
                        skipDuplicates: true,
                      })
                    }
                  }

                  await tx.auditEntry.create({
                    data: {
                      tenantId: body.tenantId,
                      actionType: 'MEMBER_INVITED',
                      targetEntity: `memberships:${normalizedEmail}`,
                      reason: `Invited ${body.name} with role ${body.role} (temporary password issued)`,
                    },
                  })
                })

                // 2. Dispatch real invitation email directly via Resend API
                const emailResult = await sendWorkspaceInviteEmail({
                  email: normalizedEmail,
                  name: body.name.trim(),
                  role: body.role,
                  tenantId: body.tenantId,
                  tenantName: tenantRecord?.name,
                  temporaryPassword: effectiveTempPassword,
                  skipAuthProvision: true,
                })

                return sendJson(res, 201, {
                  ok: true,
                  userId: resolvedUserId,
                  temporaryPassword: effectiveTempPassword,
                  emailSent: emailResult.ok,
                  emailMessage: emailResult.message,
                })
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error('[API] /api/prisma/members error:', message)
                return sendJson(res, 500, { ok: false, error: message })
              }
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/members/status')) {
              const body = await readJsonBody<{
                tenantId: string
                userId: string
                status: string
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) {
                return sendJson(res, 200, { ok: false })
              }
              await prisma.membership.update({
                where: {
                  tenantId_userId: { tenantId: body.tenantId, userId: body.userId },
                },
                data: {
                  status: body.status,
                  ...(body.status === 'active' ? { joinedAt: new Date() } : {}),
                },
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/members')) {
              const body = await readJsonBody<{
                tenantId: string
                userId: string
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) {
                return sendJson(res, 400, { ok: false, error: 'Valid tenantId and userId are required.' })
              }
              try {
                await prisma.$transaction(async (tx) => {
                  // 1. Task Assignments & Notes
                  await tx.taskAssignment.deleteMany({
                    where: { userId: body.userId, task: { tenantId: body.tenantId } },
                  })
                  await tx.taskNote.deleteMany({
                    where: { authorId: body.userId, task: { tenantId: body.tenantId } },
                  })

                  // 2. Time Segments & Work Sessions
                  await tx.timeSegment.deleteMany({
                    where: { userId: body.userId, tenantId: body.tenantId },
                  })
                  await tx.workSession.deleteMany({
                    where: { userId: body.userId, tenantId: body.tenantId },
                  })

                  // 3. Dispute Messages & Disputes
                  await tx.disputeMessage.deleteMany({
                    where: { authorUserId: body.userId },
                  })
                  await tx.dispute.deleteMany({
                    where: { openedByUserId: body.userId, timesheetLine: { tenantId: body.tenantId } },
                  })

                  // 4. Timesheet Lines & Timesheets
                  await tx.timesheetLine.deleteMany({
                    where: { timesheet: { userId: body.userId, tenantId: body.tenantId } },
                  })
                  await tx.timesheet.deleteMany({
                    where: { userId: body.userId, tenantId: body.tenantId },
                  })

                  // 5. Activity Events & Batches
                  await tx.activityEvent.deleteMany({
                    where: { userId: body.userId, tenantId: body.tenantId },
                  })
                  await tx.activityEventBatch.deleteMany({
                    where: { userId: body.userId, tenantId: body.tenantId },
                  })

                  // 6. Notifications
                  await tx.notification.deleteMany({
                    where: { recipientUserId: body.userId, tenantId: body.tenantId },
                  })

                  // 7. Policy Consents
                  await tx.policyConsent.deleteMany({
                    where: { userId: body.userId, tenantId: body.tenantId },
                  })

                  // 8. IDE Mappings & Devices
                  await tx.ideWorkspaceMapping.deleteMany({
                    where: { userId: body.userId, tenantId: body.tenantId },
                  })
                  await tx.device.deleteMany({
                    where: { userId: body.userId, tenantId: body.tenantId },
                  })

                  // 9. Role Grants, Member Permissions & Membership
                  const mem = await tx.membership.findFirst({
                    where: { tenantId: body.tenantId, userId: body.userId },
                  })
                  if (mem) {
                    await tx.memberPermissionGrant.deleteMany({
                      where: { membershipId: mem.id },
                    })
                    await tx.roleGrant.deleteMany({
                      where: { membershipId: mem.id },
                    })
                    await tx.membership.delete({
                      where: { id: mem.id },
                    })
                  }

                  // 10. If user has no other memberships in any workspace, purge UserProfile
                  const remainingMemberships = await tx.membership.count({
                    where: { userId: body.userId },
                  })
                  if (remainingMemberships === 0) {
                    await tx.userProfile.deleteMany({
                      where: { id: body.userId },
                    })
                  }

                  // 11. Audit log
                  await tx.auditEntry.create({
                    data: {
                      tenantId: body.tenantId,
                      actionType: 'MEMBER_CASCADE_DELETED',
                      targetEntity: `users:${body.userId}`,
                      reason: `Permanently removed member and cascade-deleted all associated timesheets, sessions, and activity events.`,
                    },
                  })
                })

                return sendJson(res, 200, { ok: true, message: 'Member and all associated data permanently deleted with cascade cleanup.' })
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error('[API] DELETE /api/prisma/members error:', message)
                return sendJson(res, 500, { ok: false, error: message })
              }
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/projects/members')) {
              const body = await readJsonBody<{
                tenantId: string
                projectId: string
                userId: string
                projectRole: string
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.projectId) || !isValidUuid(body.userId)) {
                return sendJson(res, 200, { ok: false, error: 'Invalid UUIDs' })
              }
              const member = await prisma.projectMember.upsert({
                where: {
                  tenantId_projectId_userId: {
                    tenantId: body.tenantId,
                    projectId: body.projectId,
                    userId: body.userId,
                  },
                },
                update: { projectRole: body.projectRole || 'developer' },
                create: {
                  tenantId: body.tenantId,
                  projectId: body.projectId,
                  userId: body.userId,
                  projectRole: body.projectRole || 'developer',
                },
              })
              return sendJson(res, 200, {
                ok: true,
                member: {
                  id: member.id,
                  tenantId: member.tenantId,
                  projectId: member.projectId,
                  userId: member.userId,
                  projectRole: member.projectRole,
                  addedAt: member.addedAt.toISOString(),
                },
              })
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/projects/members')) {
              const body = await readJsonBody<{
                tenantId: string
                projectId: string
                userId: string
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.projectId) || !isValidUuid(body.userId)) {
                return sendJson(res, 200, { ok: false })
              }
              await prisma.projectMember.deleteMany({
                where: {
                  tenantId: body.tenantId,
                  projectId: body.projectId,
                  userId: body.userId,
                },
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/projects') && !url.includes('/members')) {
              const body = await readJsonBody<{
                tenantId: string
                code: string
                name: string
                clientName: string
                description: string
                actorUserId?: string
              }>(req)
              if (!isValidUuid(body.tenantId)) {
                return sendJson(res, 200, { ok: false, error: 'Non-UUID tenant ID' })
              }
              const created = await prisma.$transaction(async (tx) => {
                const proj = await tx.project.create({
                  data: {
                    tenantId: body.tenantId,
                    code: body.code.toUpperCase(),
                    name: body.name,
                    clientName: body.clientName,
                    description: body.description,
                    status: 'active',
                    createdBy: isValidUuid(body.actorUserId) ? body.actorUserId : null,
                  },
                })
                await tx.auditEntry.create({
                  data: {
                    tenantId: body.tenantId,
                    actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
                    actionType: 'PROJECT_CREATED',
                    targetEntity: `projects:${proj.code}`,
                    targetId: proj.id,
                    reason: `Created project ${proj.name} via Prisma ORM`,
                  },
                })
                return proj
              })
              return sendJson(res, 201, {
                ok: true,
                project: {
                  id: created.id,
                  tenantId: created.tenantId,
                  code: created.code,
                  name: created.name,
                  clientName: created.clientName,
                  status: created.status,
                  description: created.description ?? '',
                  boardConfig: (created.boardConfig ?? undefined) as Record<string, unknown> | undefined,
                  members: [],
                },
              })
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/projects') && !url.includes('/members')) {
              const body = await readJsonBody<{
                projectId: string
                tenantId?: string
                actorUserId?: string
                code?: string
                name?: string
                clientName?: string
                description?: string
                status?: string
                boardConfig?: Record<string, unknown>
              }>(req)
              if (!isValidUuid(body.projectId)) {
                return sendJson(res, 200, { ok: false, error: 'Invalid project ID' })
              }
              const updated = await prisma.project.update({
                where: { id: body.projectId },
                data: {
                  ...(body.code !== undefined ? { code: body.code.toUpperCase() } : {}),
                  ...(body.name !== undefined ? { name: body.name } : {}),
                  ...(body.clientName !== undefined ? { clientName: body.clientName } : {}),
                  ...(body.description !== undefined ? { description: body.description } : {}),
                  ...(body.status !== undefined ? { status: body.status } : {}),
                  ...(body.boardConfig !== undefined ? { boardConfig: body.boardConfig as object } : {}),
                },
              })
              if (isValidUuid(body.tenantId)) {
                await prisma.auditEntry.create({
                  data: {
                    tenantId: body.tenantId,
                    actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
                    actionType: 'PROJECT_UPDATED',
                    targetEntity: `projects:${updated.code}`,
                    targetId: updated.id,
                    reason: `Updated project ${updated.name}`,
                  },
                })
              }
              return sendJson(res, 200, {
                ok: true,
                project: {
                  id: updated.id,
                  tenantId: updated.tenantId,
                  code: updated.code,
                  name: updated.name,
                  clientName: updated.clientName,
                  status: updated.status,
                  description: updated.description ?? '',
                  boardConfig: (updated.boardConfig ?? undefined) as Record<string, unknown> | undefined,
                },
              })
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/projects') && !url.includes('/members')) {
              const body = await readJsonBody<{
                projectId: string
                tenantId?: string
                actorUserId?: string
              }>(req)
              if (!isValidUuid(body.projectId)) {
                return sendJson(res, 200, { ok: false, error: 'Invalid project ID' })
              }
              const existing = await prisma.project.findUnique({
                where: { id: body.projectId },
                include: { _count: { select: { timesheets: true, invoiceDrafts: true } } },
              })
              if (!existing) {
                return sendJson(res, 404, { ok: false, error: 'Project not found' })
              }
              if (existing._count.timesheets > 0 || existing._count.invoiceDrafts > 0) {
                await prisma.project.update({
                  where: { id: body.projectId },
                  data: { status: 'archived' },
                })
                return sendJson(res, 200, {
                  ok: true,
                  archivedOnly: true,
                  message: 'Project has billing/timesheet history and was archived instead of permanently deleted.',
                })
              }
              await prisma.project.delete({ where: { id: body.projectId } })
              if (isValidUuid(body.tenantId)) {
                await prisma.auditEntry.create({
                  data: {
                    tenantId: body.tenantId,
                    actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
                    actionType: 'PROJECT_DELETED',
                    targetEntity: `projects:${existing.code}`,
                    reason: `Deleted project ${existing.name}`,
                  },
                })
              }
              return sendJson(res, 200, { ok: true, message: `Project ${existing.code} deleted.` })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/sprints')) {
              const body = await readJsonBody<{
                tenantId: string
                projectId: string
                name: string
                goal?: string
                status?: string
                startDate?: string | null
                endDate?: string | null
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.projectId)) {
                return sendJson(res, 200, { ok: false, error: 'Invalid UUIDs' })
              }
              const created = await prisma.sprint.create({
                data: {
                  tenantId: body.tenantId,
                  projectId: body.projectId,
                  name: body.name,
                  goal: body.goal ?? '',
                  status: body.status ?? 'planned',
                  startDate: body.startDate ? new Date(body.startDate) : null,
                  endDate: body.endDate ? new Date(body.endDate) : null,
                },
              })
              return sendJson(res, 201, {
                ok: true,
                sprint: {
                  id: created.id,
                  tenantId: created.tenantId,
                  projectId: created.projectId,
                  name: created.name,
                  goal: created.goal ?? '',
                  status: created.status,
                  startDate: created.startDate ? created.startDate.toISOString().slice(0, 10) : null,
                  endDate: created.endDate ? created.endDate.toISOString().slice(0, 10) : null,
                  createdAt: created.createdAt.toISOString(),
                },
              })
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/sprints')) {
              const body = await readJsonBody<{
                sprintId: string
                name?: string
                goal?: string
                status?: 'planned' | 'active' | 'completed'
                startDate?: string | null
                endDate?: string | null
                moveIncompleteToSprintId?: string | null
              }>(req)
              if (!isValidUuid(body.sprintId)) {
                return sendJson(res, 200, { ok: false, error: 'Invalid sprint ID' })
              }
              const updated = await prisma.$transaction(async (tx) => {
                const sp = await tx.sprint.update({
                  where: { id: body.sprintId },
                  data: {
                    ...(body.name !== undefined ? { name: body.name } : {}),
                    ...(body.goal !== undefined ? { goal: body.goal } : {}),
                    ...(body.status !== undefined ? { status: body.status } : {}),
                    ...(body.startDate !== undefined
                      ? { startDate: body.startDate ? new Date(body.startDate) : null }
                      : {}),
                    ...(body.endDate !== undefined
                      ? { endDate: body.endDate ? new Date(body.endDate) : null }
                      : {}),
                  },
                })
                if (body.status === 'completed' && body.moveIncompleteToSprintId !== undefined) {
                  const targetSprintId = isValidUuid(body.moveIncompleteToSprintId)
                    ? body.moveIncompleteToSprintId
                    : null
                  await tx.task.updateMany({
                    where: {
                      sprintId: body.sprintId,
                      status: { not: 'done' },
                    },
                    data: { sprintId: targetSprintId },
                  })
                }
                return sp
              })
              return sendJson(res, 200, {
                ok: true,
                sprint: {
                  id: updated.id,
                  tenantId: updated.tenantId,
                  projectId: updated.projectId,
                  name: updated.name,
                  goal: updated.goal ?? '',
                  status: updated.status,
                  startDate: updated.startDate ? updated.startDate.toISOString().slice(0, 10) : null,
                  endDate: updated.endDate ? updated.endDate.toISOString().slice(0, 10) : null,
                  createdAt: updated.createdAt.toISOString(),
                },
              })
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/sprints')) {
              const body = await readJsonBody<{ sprintId: string }>(req)
              if (!isValidUuid(body.sprintId)) return sendJson(res, 200, { ok: false })
              await prisma.$transaction(async (tx) => {
                await tx.task.updateMany({
                  where: { sprintId: body.sprintId },
                  data: { sprintId: null },
                })
                await tx.sprint.delete({ where: { id: body.sprintId } })
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/tasks/notes')) {
              const body = await readJsonBody<{
                tenantId: string
                projectId: string
                taskId: string
                authorId: string
                contentMarkdown: string
                attachmentPaths?: string[]
              }>(req)
              if (
                !isValidUuid(body.tenantId) ||
                !isValidUuid(body.projectId) ||
                !isValidUuid(body.taskId) ||
                !isValidUuid(body.authorId)
              ) {
                return sendJson(res, 200, { ok: false, error: 'Invalid UUIDs' })
              }
              const note = await prisma.taskNote.create({
                data: {
                  tenantId: body.tenantId,
                  projectId: body.projectId,
                  taskId: body.taskId,
                  authorId: body.authorId,
                  contentMarkdown: body.contentMarkdown,
                  attachmentPaths: body.attachmentPaths ?? [],
                },
                include: { author: true },
              })
              return sendJson(res, 201, {
                ok: true,
                note: {
                  id: note.id,
                  taskId: note.taskId,
                  authorId: note.authorId,
                  authorName: note.author?.fullName ?? 'Team Member',
                  contentMarkdown: note.contentMarkdown,
                  attachmentPaths: note.attachmentPaths ?? [],
                  createdAt: note.createdAt.toISOString(),
                },
              })
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/tasks/notes')) {
              const body = await readJsonBody<{ noteId: string }>(req)
              if (!isValidUuid(body.noteId)) return sendJson(res, 200, { ok: false })
              await prisma.taskNote.delete({ where: { id: body.noteId } })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/tasks/reorder')) {
              const body = await readJsonBody<{
                items: {
                  taskId: string
                  status?: string
                  boardOrder: number
                  sprintId?: string | null
                }[]
              }>(req)
              const validItems = (body.items ?? []).filter((it) => isValidUuid(it.taskId))
              if (validItems.length === 0) return sendJson(res, 200, { ok: true })
              await prisma.$transaction(
                validItems.map((it) =>
                  prisma.task.update({
                    where: { id: it.taskId },
                    data: {
                      boardOrder: it.boardOrder,
                      ...(it.status !== undefined ? { status: it.status } : {}),
                      ...(it.sprintId !== undefined
                        ? { sprintId: isValidUuid(it.sprintId) ? it.sprintId : null }
                        : {}),
                    },
                  })
                )
              )
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/tasks/update')) {
              const body = await readJsonBody<{
                taskId: string
                title?: string
                description?: string
                acceptanceCriteria?: string
                issueType?: string
                status?: string
                priority?: string
                labels?: string[]
                storyPoints?: number | null
                boardOrder?: number
                estimateMinutes?: number
                isBillable?: boolean
                defaultWorkMode?: string
                dueDate?: string | null
                parentTaskId?: string | null
                sprintId?: string | null
              }>(req)
              if (!isValidUuid(body.taskId)) return sendJson(res, 200, { ok: false })
              const updated = await prisma.task.update({
                where: { id: body.taskId },
                data: {
                  ...(body.title !== undefined ? { title: body.title } : {}),
                  ...(body.description !== undefined ? { description: body.description } : {}),
                  ...(body.acceptanceCriteria !== undefined
                    ? { acceptanceCriteria: body.acceptanceCriteria }
                    : {}),
                  ...(body.issueType !== undefined ? { issueType: body.issueType } : {}),
                  ...(body.status !== undefined ? { status: body.status } : {}),
                  ...(body.priority !== undefined ? { priority: body.priority } : {}),
                  ...(body.labels !== undefined ? { labels: body.labels } : {}),
                  ...(body.storyPoints !== undefined ? { storyPoints: body.storyPoints } : {}),
                  ...(body.boardOrder !== undefined ? { boardOrder: body.boardOrder } : {}),
                  ...(body.estimateMinutes !== undefined ? { estimateMinutes: body.estimateMinutes } : {}),
                  ...(body.isBillable !== undefined ? { isBillable: body.isBillable } : {}),
                  ...(body.defaultWorkMode !== undefined ? { defaultWorkMode: body.defaultWorkMode } : {}),
                  ...(body.dueDate !== undefined
                    ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
                    : {}),
                  ...(body.parentTaskId !== undefined
                    ? { parentTaskId: isValidUuid(body.parentTaskId) ? body.parentTaskId : null }
                    : {}),
                  ...(body.sprintId !== undefined
                    ? { sprintId: isValidUuid(body.sprintId) ? body.sprintId : null }
                    : {}),
                },
              })
              return sendJson(res, 200, {
                ok: true,
                updatedAt: updated.updatedAt.toISOString(),
              })
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/tasks') && !url.includes('/notes')) {
              const body = await readJsonBody<{ taskId: string }>(req)
              if (!isValidUuid(body.taskId)) return sendJson(res, 200, { ok: false })
              try {
                await prisma.$transaction(async (tx) => {
                  await tx.task.updateMany({
                    where: { parentTaskId: body.taskId },
                    data: { parentTaskId: null },
                  })
                  await tx.task.delete({ where: { id: body.taskId } })
                })
                return sendJson(res, 200, { ok: true })
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                return sendJson(res, 400, {
                  ok: false,
                  error:
                    'Task has logged work sessions or time segments and cannot be permanently deleted. Consider moving it to Done or archiving.',
                  detail: msg,
                })
              }
            }

            if (
              req.method === 'POST' &&
              url.startsWith('/api/prisma/tasks') &&
              !url.includes('/status') &&
              !url.includes('/assign') &&
              !url.includes('/notes')
            ) {
              const body = await readJsonBody<{
                tenantId: string
                projectId: string
                parentTaskId?: string
                sprintId?: string | null
                code: string
                title: string
                description?: string
                acceptanceCriteria: string
                issueType?: string
                status: string
                priority: string
                labels?: string[]
                storyPoints?: number | null
                boardOrder?: number
                estimateMinutes: number
                isBillable: boolean
                defaultWorkMode: string
                dueDate: string
                assignedMemberIds: string[]
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.projectId)) {
                return sendJson(res, 200, { ok: false, error: 'Non-UUID IDs' })
              }
              const requestedAssignees = (body.assignedMemberIds ?? []).filter(isValidUuid)
              if (requestedAssignees.length > 0) {
                const activeMemberships = await prisma.membership.findMany({
                  where: {
                    tenantId: body.tenantId,
                    userId: { in: requestedAssignees },
                    status: 'active',
                  },
                  select: { userId: true },
                })
                const activeIds = new Set(activeMemberships.map((m) => m.userId))
                const blockedIds = requestedAssignees.filter((id) => !activeIds.has(id))
                if (blockedIds.length > 0) {
                  return sendJson(res, 400, {
                    ok: false,
                    error:
                      'Cannot assign tasks to pending or inactive members. They must change their temporary password and activate their profile first.',
                  })
                }
              }
              const created = await prisma.$transaction(async (tx) => {
                const tsk = await tx.task.create({
                  data: {
                    tenantId: body.tenantId,
                    projectId: body.projectId,
                    parentTaskId: isValidUuid(body.parentTaskId) ? body.parentTaskId : null,
                    sprintId: isValidUuid(body.sprintId) ? body.sprintId : null,
                    code: body.code.toUpperCase(),
                    title: body.title,
                    description: body.description ?? '',
                    acceptanceCriteria: body.acceptanceCriteria,
                    issueType: body.issueType || (isValidUuid(body.parentTaskId) ? 'subtask' : 'task'),
                    status: body.status,
                    priority: body.priority,
                    labels: body.labels ?? [],
                    storyPoints: body.storyPoints ?? null,
                    boardOrder: body.boardOrder ?? 0,
                    estimateMinutes: body.estimateMinutes,
                    isBillable: body.isBillable,
                    defaultWorkMode: body.defaultWorkMode,
                    dueDate: body.dueDate ? new Date(body.dueDate) : null,
                  },
                })
                for (const userId of requestedAssignees) {
                  await tx.taskAssignment.create({
                    data: {
                      tenantId: body.tenantId,
                      projectId: body.projectId,
                      taskId: tsk.id,
                      userId,
                    },
                  })
                }
                return tsk
              })
              return sendJson(res, 201, {
                ok: true,
                task: {
                  id: created.id,
                  tenantId: created.tenantId,
                  projectId: created.projectId,
                  parentTaskId: created.parentTaskId ?? undefined,
                  sprintId: created.sprintId ?? null,
                  code: created.code,
                  title: created.title,
                  description: created.description ?? '',
                  acceptanceCriteria: created.acceptanceCriteria,
                  issueType: created.issueType,
                  status: created.status,
                  priority: created.priority,
                  labels: created.labels ?? [],
                  storyPoints: created.storyPoints ?? null,
                  boardOrder: created.boardOrder ?? 0,
                  estimateMinutes: created.estimateMinutes,
                  isBillable: created.isBillable,
                  defaultWorkMode: created.defaultWorkMode,
                  assignedMemberIds: body.assignedMemberIds ?? [],
                  dueDate: created.dueDate ? created.dueDate.toISOString().slice(0, 10) : '',
                  attachments: [],
                  notes: [],
                  createdAt: created.createdAt.toISOString(),
                  updatedAt: created.updatedAt.toISOString(),
                },
              })
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/tasks/status')) {
              const body = await readJsonBody<{ taskId: string; status: string }>(req)
              if (!isValidUuid(body.taskId)) return sendJson(res, 200, { ok: false })
              await prisma.task.update({
                where: { id: body.taskId },
                data: { status: body.status },
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/tasks/assign')) {
              const body = await readJsonBody<{
                tenantId: string
                projectId: string
                taskId: string
                assignedMemberIds: string[]
              }>(req)
              if (!isValidUuid(body.taskId) || !isValidUuid(body.tenantId) || !isValidUuid(body.projectId)) {
                return sendJson(res, 200, { ok: false })
              }
              const candidateAssignees = (body.assignedMemberIds ?? []).filter(isValidUuid)
              if (candidateAssignees.length > 0) {
                const activeMemberships = await prisma.membership.findMany({
                  where: {
                    tenantId: body.tenantId,
                    userId: { in: candidateAssignees },
                    status: 'active',
                  },
                  select: { userId: true },
                })
                const activeIds = new Set(activeMemberships.map((m) => m.userId))
                const blockedIds = candidateAssignees.filter((id) => !activeIds.has(id))
                if (blockedIds.length > 0) {
                  return sendJson(res, 400, {
                    ok: false,
                    error:
                      'Cannot assign tasks to pending or inactive members. They must change their temporary password and activate their profile first.',
                  })
                }
              }
              await prisma.$transaction(async (tx) => {
                await tx.taskAssignment.deleteMany({
                  where: { tenantId: body.tenantId, taskId: body.taskId },
                })
                for (const userId of candidateAssignees) {
                  await tx.taskAssignment.create({
                    data: {
                      tenantId: body.tenantId,
                      projectId: body.projectId,
                      taskId: body.taskId,
                      userId,
                    },
                  })
                }
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/sessions/record')) {
              const body = await readJsonBody<Parameters<typeof handleRecordSession>[0]>(req)
              return sendJson(res, 201, await handleRecordSession(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/timesheets/submit')) {
              const body = await readJsonBody<{ timesheetId: string; summaryNote?: string }>(req)
              if (!isValidUuid(body.timesheetId)) return sendJson(res, 200, { ok: false })
              await prisma.timesheet.update({
                where: { id: body.timesheetId },
                data: {
                  status: 'submitted',
                  submittedAt: new Date(),
                  developerSummaryNote: body.summaryNote ?? '',
                },
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/timesheets/review')) {
              const body = await readJsonBody<{
                tenantId: string
                timesheetId: string
                lineId: string
                reviewerUserId: string
                decision: 'approve' | 'ask_clarification' | 'adjust_with_reason' | 'reject'
                reason: string
                approvedMinutes: number
                lockLine: boolean
              }>(req)
              if (!isValidUuid(body.lineId) || !isValidUuid(body.timesheetId) || !isValidUuid(body.reviewerUserId)) {
                return sendJson(res, 200, { ok: false })
              }
              const nextStatus =
                body.decision === 'approve'
                  ? 'approved'
                  : body.decision === 'adjust_with_reason'
                    ? 'adjusted_approved'
                    : body.decision === 'ask_clarification'
                      ? 'needs_clarification'
                      : 'rejected'

              await prisma.$transaction(async (tx) => {
                const prevLine = await tx.timesheetLine.findUniqueOrThrow({
                  where: { id: body.lineId },
                  include: { timesheet: true },
                })
                await tx.timesheetLine.update({
                  where: { id: body.lineId },
                  data: {
                    approvedBillableMinutes: body.approvedMinutes,
                    lineStatus: nextStatus,
                    reviewerComment: body.reason,
                    isLocked: body.lockLine && (nextStatus === 'approved' || nextStatus === 'adjusted_approved'),
                  },
                })
                await tx.reviewDecision.create({
                  data: {
                    tenantId: body.tenantId,
                    timesheetId: body.timesheetId,
                    timesheetLineId: body.lineId,
                    reviewerUserId: body.reviewerUserId,
                    decisionType: body.decision,
                    reason: body.reason,
                    previousApprovedMinutes: prevLine.approvedBillableMinutes,
                    newApprovedMinutes: body.approvedMinutes,
                  },
                })
                await tx.notification.create({
                  data: {
                    tenantId: body.tenantId,
                    recipientUserId: prevLine.timesheet.userId,
                    notificationType:
                      body.decision === 'ask_clarification'
                        ? 'clarification_requested'
                        : body.decision === 'adjust_with_reason'
                          ? 'timesheet_adjusted'
                          : 'timesheet_approved',
                    title: `Timesheet review: ${body.decision.replace('_', ' ')}`,
                    body: body.reason,
                    targetEntity: 'timesheet_lines',
                    targetId: body.lineId,
                  },
                })
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/invoices/lock')) {
              const body = await readJsonBody<{ invoiceId: string; lineIds: string[] }>(req)
              if (!isValidUuid(body.invoiceId)) return sendJson(res, 200, { ok: false })
              await prisma.$transaction(async (tx) => {
                await tx.invoiceDraft.update({
                  where: { id: body.invoiceId },
                  data: { status: 'finalized_locked', issuedAt: new Date() },
                })
                for (const id of body.lineIds.filter(isValidUuid)) {
                  await tx.timesheetLine.update({
                    where: { id },
                    data: { isLocked: true },
                  })
                }
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/notifications/read')) {
              const body = await readJsonBody<{ notificationId: string }>(req)
              if (!isValidUuid(body.notificationId)) return sendJson(res, 200, { ok: false })
              await prisma.notification.update({
                where: { id: body.notificationId },
                data: { readAt: new Date() },
              })
              return sendJson(res, 200, { ok: true })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/audit')) {
              const body = await readJsonBody<{
                tenantId: string
                actorUserId?: string
                actionType: string
                targetEntity: string
                reason: string
              }>(req)
              if (!isValidUuid(body.tenantId)) return sendJson(res, 200, { ok: false })
              await prisma.auditEntry.create({
                data: {
                  tenantId: body.tenantId,
                  actorUserId: isValidUuid(body.actorUserId) ? body.actorUserId : null,
                  actionType: body.actionType,
                  targetEntity: body.targetEntity,
                  reason: body.reason,
                },
              })
              return sendJson(res, 201, { ok: true })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase2/webhook')) {
              const body = await readJsonBody<Parameters<typeof handleIngestWebhookPrisma>[0]>(req)
              return sendJson(res, 202, await handleIngestWebhookPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase2/annotation')) {
              const body = await readJsonBody<Parameters<typeof handleCreateSessionAnnotationPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreateSessionAnnotationPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase2/exclusions')) {
              const body = await readJsonBody<Parameters<typeof handleAddPrivacyExclusionPrisma>[0]>(req)
              return sendJson(res, 201, await handleAddPrivacyExclusionPrisma(body))
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/phase2/exclusions')) {
              const body = await readJsonBody<Parameters<typeof handleRemovePrivacyExclusionPrisma>[0]>(req)
              return sendJson(res, 200, await handleRemovePrivacyExclusionPrisma(body))
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/phase2/devices/revoke')) {
              const body = await readJsonBody<Parameters<typeof handleToggleDeviceRevocationPrisma>[0]>(req)
              return sendJson(res, 200, await handleToggleDeviceRevocationPrisma(body))
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/phase2/reconcile-gap')) {
              const body = await readJsonBody<Parameters<typeof handleReconcileGapPrisma>[0]>(req)
              return sendJson(res, 200, await handleReconcileGapPrisma(body))
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/phase3/ai-status')) {
              const cfg = getGeminiConfig()
              return sendJson(res, 200, { configured: cfg.configured, model: cfg.model })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase3/ai-draft-gemini')) {
              const body = await readJsonBody<GeminiDraftRequest>(req)
              const result = await generateGeminiSummaryDraft(body)
              return sendJson(res, 200, result)
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/phase3/tenant-ai')) {
              const body = await readJsonBody<Parameters<typeof handleToggleTenantAiPrisma>[0]>(req)
              return sendJson(res, 200, await handleToggleTenantAiPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase3/rule-sets')) {
              const body = await readJsonBody<Parameters<typeof handlePublishRuleSetPrisma>[0]>(req)
              return sendJson(res, 201, await handlePublishRuleSetPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase3/ai-generate')) {
              const body = await readJsonBody<Parameters<typeof handleCreateAiGenerationPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreateAiGenerationPrisma(body))
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/phase3/ai-decision')) {
              const body = await readJsonBody<Parameters<typeof handleDecideAiGenerationPrisma>[0]>(req)
              return sendJson(res, 200, await handleDecideAiGenerationPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase3/timesheets/partial-approve')) {
              const body = await readJsonBody<Parameters<typeof handlePartialApproveTimesheetPrisma>[0]>(req)
              return sendJson(res, 200, await handlePartialApproveTimesheetPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase3/disputes/action')) {
              const body = await readJsonBody<Parameters<typeof handleDisputeActionPrisma>[0]>(req)
              return sendJson(res, 200, await handleDisputeActionPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase3/disputes')) {
              const body = await readJsonBody<Parameters<typeof handleOpenDisputePrisma>[0]>(req)
              return sendJson(res, 201, await handleOpenDisputePrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase4/subscription/checkout')) {
              const body = await readJsonBody<Parameters<typeof handleCheckoutSubscriptionPrisma>[0]>(req)
              return sendJson(res, 200, await handleCheckoutSubscriptionPrisma(body))
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/phase4/branding')) {
              const body = await readJsonBody<Parameters<typeof handleUpdateBrandingPrisma>[0]>(req)
              return sendJson(res, 200, await handleUpdateBrandingPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase4/api-keys/revoke')) {
              const body = await readJsonBody<Parameters<typeof handleRevokeApiKeyPrisma>[0]>(req)
              return sendJson(res, 200, await handleRevokeApiKeyPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase4/api-keys')) {
              const body = await readJsonBody<Parameters<typeof handleCreateApiKeyPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreateApiKeyPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase4/webhooks/deliver')) {
              const body = await readJsonBody<Parameters<typeof handleDispatchWebhookDeliveryPrisma>[0]>(req)
              return sendJson(res, 201, await handleDispatchWebhookDeliveryPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase4/webhooks')) {
              const body = await readJsonBody<Parameters<typeof handleCreateWebhookEndpointPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreateWebhookEndpointPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase4/connectors')) {
              const body = await readJsonBody<Parameters<typeof handleUpsertConnectorPrisma>[0]>(req)
              return sendJson(res, 200, await handleUpsertConnectorPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase4/calendar-sync')) {
              const body = await readJsonBody<Parameters<typeof handleSyncCalendarMeetingPrisma>[0]>(req)
              return sendJson(res, 201, await handleSyncCalendarMeetingPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase4/portable-reports')) {
              const body = await readJsonBody<Parameters<typeof handleCreatePortableReportPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreatePortableReportPrisma(body))
            }

            // --- Real External Integrations (Git, PM Tools, Chat Alerts, Live Webhooks, Calendar OAuth) ---
            if (req.method === 'POST' && url.startsWith('/api/prisma/integrations/connect')) {
              const body = await readJsonBody<Parameters<typeof handleConnectRealIntegration>[0]>(req)
              const result = await handleConnectRealIntegration(body)
              return sendJson(res, result.ok ? 200 : 400, result)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/integrations/disconnect')) {
              const body = await readJsonBody<Parameters<typeof handleDisconnectRealIntegration>[0]>(req)
              return sendJson(res, 200, await handleDisconnectRealIntegration(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/integrations/items')) {
              const body = await readJsonBody<Parameters<typeof handleFetchRealIntegrationItems>[0]>(req)
              const result = await handleFetchRealIntegrationItems(body)
              return sendJson(res, result.ok ? 200 : 400, result)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/integrations/chat-test')) {
              const body = await readJsonBody<Parameters<typeof handleSendChatTestAlert>[0]>(req)
              const result = await handleSendChatTestAlert(body)
              return sendJson(res, result.ok ? 200 : 400, result)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/integrations/webhook-dispatch')) {
              const body = await readJsonBody<Parameters<typeof handleDispatchRealOutboundWebhook>[0]>(req)
              const result = await handleDispatchRealOutboundWebhook(body)
              return sendJson(res, 200, result)
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/integrations/oauth-status')) {
              return sendJson(res, 200, getCalendarOAuthStatus())
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/integrations/calendar-events')) {
              const body = await readJsonBody<Parameters<typeof handleFetchRealCalendarEvents>[0]>(req)
              const result = await handleFetchRealCalendarEvents(body)
              return sendJson(res, result.ok ? 200 : 400, result)
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/oauth/google/start')) {
              const parsed = new URL(url, `http://${req.headers.host || 'localhost:5173'}`)
              const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost:5173'}`
              const start = buildCalendarOAuthStartUrl({
                provider: 'google_calendar',
                tenantId: parsed.searchParams.get('tenantId') || '',
                userId: parsed.searchParams.get('userId') || '',
                origin,
              })
              if (!start.ok || !start.url) return sendJson(res, 400, start)
              res.statusCode = 302
              res.setHeader('Location', start.url)
              res.end()
              return true
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/oauth/google/callback')) {
              const parsed = new URL(url, `http://${req.headers.host || 'localhost:5173'}`)
              const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost:5173'}`
              const result = await handleCalendarOAuthCallback({
                provider: 'google_calendar',
                code: parsed.searchParams.get('code') || '',
                state: parsed.searchParams.get('state') || '',
                origin,
              })
              res.statusCode = 302
              res.setHeader(
                'Location',
                result.ok
                  ? '/integrations?oauth=google_connected'
                  : `/integrations?oauth_error=${encodeURIComponent(result.error || 'OAuth failed')}`
              )
              res.end()
              return true
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/oauth/microsoft/start')) {
              const parsed = new URL(url, `http://${req.headers.host || 'localhost:5173'}`)
              const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost:5173'}`
              const start = buildCalendarOAuthStartUrl({
                provider: 'outlook_calendar',
                tenantId: parsed.searchParams.get('tenantId') || '',
                userId: parsed.searchParams.get('userId') || '',
                origin,
              })
              if (!start.ok || !start.url) return sendJson(res, 400, start)
              res.statusCode = 302
              res.setHeader('Location', start.url)
              res.end()
              return true
            }

            if (req.method === 'GET' && url.startsWith('/api/prisma/oauth/microsoft/callback')) {
              const parsed = new URL(url, `http://${req.headers.host || 'localhost:5173'}`)
              const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost:5173'}`
              const result = await handleCalendarOAuthCallback({
                provider: 'outlook_calendar',
                code: parsed.searchParams.get('code') || '',
                state: parsed.searchParams.get('state') || '',
                origin,
              })
              res.statusCode = 302
              res.setHeader(
                'Location',
                result.ok
                  ? '/integrations?oauth=microsoft_connected'
                  : `/integrations?oauth_error=${encodeURIComponent(result.error || 'OAuth failed')}`
              )
              res.end()
              return true
            }

            // --- Real Public REST API v1 (Bearer API Key Authentication) ---
            if (req.method === 'GET' && url.startsWith('/api/prisma/v1/')) {
              const parsed = new URL(url, 'http://localhost')
              const resourceSegment = parsed.pathname.replace('/api/prisma/v1/', '').split('/')[0]
              const validResources: PublicApiResource[] = ['projects', 'tasks', 'timesheets', 'invoices']
              if (!validResources.includes(resourceSegment as PublicApiResource)) {
                return sendJson(res, 404, {
                  ok: false,
                  error: { code: 'UNKNOWN_RESOURCE', message: `Unknown resource "${resourceSegment}".` },
                })
              }
              const apiRes = await handlePublicRestApiV1Request({
                authorizationHeader: req.headers.authorization,
                resource: resourceSegment as PublicApiResource,
              })
              return sendJson(res, apiRes.statusCode, apiRes.payload)
            }

            // --- Granular RBAC (Permissions Seed, Roles, Member Grants & Tenant Owner Policy) ---
            if (req.method === 'POST' && url.startsWith('/api/prisma/rbac/seed')) {
              const result = await seedPermissionsAndRoles({ force: true })
              return sendJson(res, 200, { ok: true, ...result })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/rbac/roles')) {
              const body = await readJsonBody<Parameters<typeof handleCreateCustomRolePrisma>[0]>(req)
              return sendJson(res, 201, await handleCreateCustomRolePrisma(body))
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/rbac/roles')) {
              const body = await readJsonBody<Parameters<typeof handleUpdateCustomRolePrisma>[0]>(req)
              return sendJson(res, 200, await handleUpdateCustomRolePrisma(body))
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/rbac/roles')) {
              const body = await readJsonBody<Parameters<typeof handleDeleteCustomRolePrisma>[0]>(req)
              return sendJson(res, 200, await handleDeleteCustomRolePrisma(body))
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/rbac/member-role')) {
              const body = await readJsonBody<Parameters<typeof handleUpdateMemberRoleAndPermissionsPrisma>[0]>(req)
              return sendJson(res, 200, await handleUpdateMemberRoleAndPermissionsPrisma(body))
            }

            if (req.method === 'PUT' && url.startsWith('/api/prisma/rbac/tenant-owner-permissions')) {
              const body = await readJsonBody<Parameters<typeof handleUpdateTenantOwnerPermissionsPrisma>[0]>(req)
              return sendJson(res, 200, await handleUpdateTenantOwnerPermissionsPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/rbac/permissions')) {
              const body = await readJsonBody<Parameters<typeof handleRegisterPermissionPrisma>[0]>(req)
              return sendJson(res, 201, await handleRegisterPermissionPrisma(body))
            }

            // --- Reporting & Analytics Endpoints ---
            if (req.method === 'POST' && url.startsWith('/api/prisma/reports/platform')) {
              const body = await readJsonBody<{ actorRole?: string }>(req)
              const result = await handleFetchPlatformReportsPrisma({
                actorRole: body.actorRole || '',
              })
              return sendJson(res, result.statusCode, result.payload)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/reports/saved/list')) {
              const body = await readJsonBody<Parameters<typeof handleListSavedReportsPrisma>[0]>(req)
              const result = await handleListSavedReportsPrisma(body)
              return sendJson(res, result.statusCode, result.payload)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/reports/saved/create')) {
              const body = await readJsonBody<Parameters<typeof handleCreateSavedReportPrisma>[0]>(req)
              const result = await handleCreateSavedReportPrisma(body)
              return sendJson(res, result.statusCode, result.payload)
            }

            if (req.method === 'DELETE' && url.startsWith('/api/prisma/reports/saved')) {
              const body = await readJsonBody<Parameters<typeof handleDeleteSavedReportPrisma>[0]>(req)
              const result = await handleDeleteSavedReportPrisma(body)
              return sendJson(res, result.statusCode, result.payload)
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/reports/ai-brief')) {
              const body = await readJsonBody<Parameters<typeof handleGenerateReportAiBriefPrisma>[0]>(req)
              const result = await handleGenerateReportAiBriefPrisma(body)
              return sendJson(res, result.statusCode, result.payload)
            }

            sendJson(res, 404, { error: 'Unknown Prisma API endpoint' })
            return true
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            sendJson(res, 500, { ok: false, error: message })
            return true
          }
}

export function prismaSupabaseApiPlugin(): Plugin {
  return {
    name: 'devproof-prisma-supabase-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/prisma/')) {
          next()
          return
        }
        void handlePrismaApiRequest(req, res)
      })
    },
  }
}
