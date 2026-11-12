/**
 * DevProof (TikTrack) — Vite Server Middleware for Prisma ORM + Supabase PostgreSQL
 *
 * Exposes `/api/prisma/*` endpoints on the Vite dev/preview server so the React
 * application persists all Phase 1 workflows through Prisma ORM.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import dotenv from 'dotenv'
import type { Plugin } from 'vite'
import { checkPrismaConnection, prisma } from '../lib/prisma.ts'
import { sendWorkspaceInviteEmail } from './emailService.ts'
import {
  handleBootstrap,
  handleCreateTenant,
  handleRecordSession,
  isValidUuid,
} from './prismaPhase1Handlers.ts'
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
  handleApprovePolicyChangeSecondPrisma,
  handleCreateLegalHoldPrisma,
  handleCreatePrivacyRequestPrisma,
  handleCreateSiemDestinationPrisma,
  handleCreateWarehouseExportPrisma,
  handleProposePolicyChangePrisma,
  handlePublishFleetReleasePrisma,
  handleRecordDrExercisePrisma,
  handleRecordRetentionJobPrisma,
  handleRecordScimEventPrisma,
  handleRecordSiemBatchPrisma,
  handleReleaseLegalHoldPrisma,
  handleUpdateAccessibilityConfigPrisma,
  handleUpsertResidencyConfigPrisma,
  handleUpsertRetentionPolicyPrisma,
  handleUpsertSecurityAssessmentPrisma,
  handleUpsertSsoProviderPrisma,
} from './prismaPhase5Handlers.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
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

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
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

        void (async () => {
          try {
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
              }>(req)
              const tenantResult = await handleCreateTenant(body)
              // Dispatch welcome/invite email to the owner via Supabase + Resend
              void sendWorkspaceInviteEmail({
                email: body.ownerEmail,
                name: body.ownerName,
                role: 'tenant_owner',
                tenantId: tenantResult.tenantId,
                tenantName: body.name,
              }).catch((err) => {
                console.warn('[EmailService] Owner welcome email dispatch error:', err)
              })
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

            if (req.method === 'POST' && url.startsWith('/api/prisma/members/resend-invite')) {
              const body = await readJsonBody<{
                tenantId: string
                userId: string
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.userId)) {
                return sendJson(res, 200, { ok: false, message: 'Invalid tenant or user ID' })
              }
              const member = await prisma.membership.findUnique({
                where: {
                  tenantId_userId: { tenantId: body.tenantId, userId: body.userId },
                },
                include: { user: true, roleGrants: true },
              })
              if (!member || !member.user) {
                return sendJson(res, 404, { ok: false, message: 'Member not found' })
              }
              const role = member.roleGrants[0]?.role || 'developer'
              const emailResult = await sendWorkspaceInviteEmail({
                email: member.user.email,
                name: member.user.fullName,
                role,
                tenantId: body.tenantId,
              })
              await prisma.auditEntry.create({
                data: {
                  tenantId: body.tenantId,
                  actionType: 'INVITE_RESENT',
                  targetEntity: `memberships:${member.user.email}`,
                  reason: `Resent invitation email to ${member.user.email}`,
                },
              })
              return sendJson(res, 200, { ok: emailResult.ok, message: emailResult.message })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/members') && !url.includes('/status') && !url.includes('/resend-invite')) {
              const body = await readJsonBody<{
                tenantId: string
                name: string
                email: string
                role: string
                temporaryPassword?: string
              }>(req)
              if (!isValidUuid(body.tenantId) || !body.email?.trim() || !body.name?.trim()) {
                return sendJson(res, 200, { ok: false, error: 'Valid tenantId, name, and email are required.' })
              }
              const normalizedEmail = body.email.toLowerCase().trim()
              try {
                let resolvedUserId = ''
                await prisma.$transaction(async (tx) => {
                  const existingUser = await tx.userProfile.findFirst({
                    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
                  })

                  if (existingUser) {
                    resolvedUserId = existingUser.id
                    if (body.name.trim() && existingUser.fullName !== body.name.trim()) {
                      await tx.userProfile.update({
                        where: { id: existingUser.id },
                        data: { fullName: body.name.trim() },
                      })
                    }
                  } else {
                    resolvedUserId = crypto.randomUUID()
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

                  if (existingMem) {
                    await tx.membership.update({
                      where: { id: existingMem.id },
                      data: {
                        status: 'invited',
                        invitedEmail: normalizedEmail,
                      },
                    })
                    const existingGrant = existingMem.roleGrants.find((rg) => rg.role === body.role)
                    if (!existingGrant) {
                      await tx.roleGrant.create({
                        data: {
                          tenantId: body.tenantId,
                          membershipId: existingMem.id,
                          role: body.role,
                        },
                      })
                    }
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
                    await tx.roleGrant.create({
                      data: {
                        tenantId: body.tenantId,
                        membershipId: mem.id,
                        role: body.role,
                      },
                    })
                  }

                  await tx.auditEntry.create({
                    data: {
                      tenantId: body.tenantId,
                      actionType: 'MEMBER_INVITED',
                      targetEntity: `memberships:${normalizedEmail}`,
                      reason: `Invited ${body.name} with role ${body.role}${body.temporaryPassword ? ' (temporary password issued)' : ''}`,
                    },
                  })
                })

                // Dispatch real invitation email via Supabase Auth + Resend SMTP
                const emailResult = await sendWorkspaceInviteEmail({
                  email: normalizedEmail,
                  name: body.name.trim(),
                  role: body.role,
                  tenantId: body.tenantId,
                  temporaryPassword: body.temporaryPassword,
                })

                return sendJson(res, 201, {
                  ok: true,
                  userId: resolvedUserId,
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
                data: { status: body.status },
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
                    where: { userId: body.userId, tenantId: body.tenantId },
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

                  // 9. Role Grants & Membership
                  const mem = await tx.membership.findFirst({
                    where: { tenantId: body.tenantId, userId: body.userId },
                  })
                  if (mem) {
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

            if (req.method === 'POST' && url.startsWith('/api/prisma/projects')) {
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
                },
              })
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/tasks') && !url.includes('/status') && !url.includes('/assign')) {
              const body = await readJsonBody<{
                tenantId: string
                projectId: string
                parentTaskId?: string
                code: string
                title: string
                acceptanceCriteria: string
                status: string
                priority: string
                estimateMinutes: number
                isBillable: boolean
                defaultWorkMode: string
                dueDate: string
                assignedMemberIds: string[]
              }>(req)
              if (!isValidUuid(body.tenantId) || !isValidUuid(body.projectId)) {
                return sendJson(res, 200, { ok: false, error: 'Non-UUID IDs' })
              }
              const created = await prisma.$transaction(async (tx) => {
                const tsk = await tx.task.create({
                  data: {
                    tenantId: body.tenantId,
                    projectId: body.projectId,
                    parentTaskId: isValidUuid(body.parentTaskId) ? body.parentTaskId : null,
                    code: body.code.toUpperCase(),
                    title: body.title,
                    acceptanceCriteria: body.acceptanceCriteria,
                    status: body.status,
                    priority: body.priority,
                    estimateMinutes: body.estimateMinutes,
                    isBillable: body.isBillable,
                    defaultWorkMode: body.defaultWorkMode,
                    dueDate: body.dueDate ? new Date(body.dueDate) : null,
                  },
                })
                for (const userId of (body.assignedMemberIds ?? []).filter(isValidUuid)) {
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
                  code: created.code,
                  title: created.title,
                  acceptanceCriteria: created.acceptanceCriteria,
                  status: created.status,
                  priority: created.priority,
                  estimateMinutes: created.estimateMinutes,
                  isBillable: created.isBillable,
                  defaultWorkMode: created.defaultWorkMode,
                  assignedMemberIds: body.assignedMemberIds ?? [],
                  dueDate: created.dueDate ? created.dueDate.toISOString().slice(0, 10) : body.dueDate,
                  attachments: [],
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
              await prisma.$transaction(async (tx) => {
                await tx.taskAssignment.deleteMany({
                  where: { tenantId: body.tenantId, taskId: body.taskId },
                })
                for (const userId of body.assignedMemberIds.filter(isValidUuid)) {
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

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/sso')) {
              const body = await readJsonBody<Parameters<typeof handleUpsertSsoProviderPrisma>[0]>(req)
              return sendJson(res, 200, await handleUpsertSsoProviderPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/scim')) {
              const body = await readJsonBody<Parameters<typeof handleRecordScimEventPrisma>[0]>(req)
              return sendJson(res, 201, await handleRecordScimEventPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/policy-changes/decide')) {
              const body = await readJsonBody<Parameters<typeof handleApprovePolicyChangeSecondPrisma>[0]>(req)
              return sendJson(res, 200, await handleApprovePolicyChangeSecondPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/policy-changes')) {
              const body = await readJsonBody<Parameters<typeof handleProposePolicyChangePrisma>[0]>(req)
              return sendJson(res, 201, await handleProposePolicyChangePrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/legal-holds/release')) {
              const body = await readJsonBody<Parameters<typeof handleReleaseLegalHoldPrisma>[0]>(req)
              return sendJson(res, 200, await handleReleaseLegalHoldPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/legal-holds')) {
              const body = await readJsonBody<Parameters<typeof handleCreateLegalHoldPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreateLegalHoldPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/retention-policies')) {
              const body = await readJsonBody<Parameters<typeof handleUpsertRetentionPolicyPrisma>[0]>(req)
              return sendJson(res, 200, await handleUpsertRetentionPolicyPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/retention-jobs')) {
              const body = await readJsonBody<Parameters<typeof handleRecordRetentionJobPrisma>[0]>(req)
              return sendJson(res, 201, await handleRecordRetentionJobPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/privacy-requests')) {
              const body = await readJsonBody<Parameters<typeof handleCreatePrivacyRequestPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreatePrivacyRequestPrisma(body))
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/phase5/residency')) {
              const body = await readJsonBody<Parameters<typeof handleUpsertResidencyConfigPrisma>[0]>(req)
              return sendJson(res, 200, await handleUpsertResidencyConfigPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/siem/export')) {
              const body = await readJsonBody<Parameters<typeof handleRecordSiemBatchPrisma>[0]>(req)
              return sendJson(res, 201, await handleRecordSiemBatchPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/siem')) {
              const body = await readJsonBody<Parameters<typeof handleCreateSiemDestinationPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreateSiemDestinationPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/fleet-releases')) {
              const body = await readJsonBody<Parameters<typeof handlePublishFleetReleasePrisma>[0]>(req)
              return sendJson(res, 201, await handlePublishFleetReleasePrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/warehouse-exports')) {
              const body = await readJsonBody<Parameters<typeof handleCreateWarehouseExportPrisma>[0]>(req)
              return sendJson(res, 201, await handleCreateWarehouseExportPrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/dr-exercises')) {
              const body = await readJsonBody<Parameters<typeof handleRecordDrExercisePrisma>[0]>(req)
              return sendJson(res, 201, await handleRecordDrExercisePrisma(body))
            }

            if (req.method === 'POST' && url.startsWith('/api/prisma/phase5/security-assessments')) {
              const body = await readJsonBody<Parameters<typeof handleUpsertSecurityAssessmentPrisma>[0]>(req)
              return sendJson(res, 201, await handleUpsertSecurityAssessmentPrisma(body))
            }

            if (req.method === 'PATCH' && url.startsWith('/api/prisma/phase5/accessibility')) {
              const body = await readJsonBody<Parameters<typeof handleUpdateAccessibilityConfigPrisma>[0]>(req)
              return sendJson(res, 200, await handleUpdateAccessibilityConfigPrisma(body))
            }

            return sendJson(res, 404, { error: 'Unknown Prisma API endpoint' })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return sendJson(res, 500, { ok: false, error: message })
          }
        })()
      })
    },
  }
}
