/**
 * DevProof (TikTrack) — Vite Server Middleware for Prisma ORM + Supabase PostgreSQL
 *
 * Exposes `/api/prisma/*` endpoints on the Vite dev/preview server so the React
 * application interacts with Supabase PostgreSQL through Prisma ORM.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import dotenv from 'dotenv'
import type { Plugin } from 'vite'
import { checkPrismaConnection, prisma } from '../lib/prisma.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(val: string | undefined): val is string {
  return Boolean(val && UUID_REGEX.test(val))
}

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
            // 1. GET /api/prisma/status
          if (req.method === 'GET' && url.startsWith('/api/prisma/status')) {
            const status = await checkPrismaConnection()
            return sendJson(res, 200, status)
          }

          // 2. GET /api/prisma/bootstrap
          if (req.method === 'GET' && url.startsWith('/api/prisma/bootstrap')) {
            const status = await checkPrismaConnection()
            if (!status.connected) {
              return sendJson(res, 200, {
                status,
                tenants: [],
                members: [],
                projects: [],
                tasks: [],
                timesheetLines: [],
                invoices: [],
                auditLogs: [],
              })
            }

            const [
              dbTenants,
              dbMemberships,
              dbProjects,
              dbTasks,
              dbTimesheetLines,
              dbInvoices,
              dbAudits,
            ] = await Promise.all([
              prisma.tenant.findMany({
                include: {
                  settings: true,
                  policyVersions: {
                    orderBy: { effectiveFrom: 'desc' },
                    take: 1,
                  },
                },
                orderBy: { createdAt: 'asc' },
              }),
              prisma.membership.findMany({
                include: {
                  user: {
                    include: {
                      policyConsents: {
                        include: { policyVersion: true },
                        orderBy: { consentedAt: 'desc' },
                        take: 1,
                      },
                      projectMemberships: true,
                    },
                  },
                  roleGrants: true,
                },
              }),
              prisma.project.findMany({
                orderBy: { createdAt: 'asc' },
              }),
              prisma.task.findMany({
                include: {
                  assignments: true,
                  notes: true,
                },
                orderBy: { createdAt: 'asc' },
              }),
              prisma.timesheetLine.findMany({
                include: {
                  timesheet: {
                    include: { user: true },
                  },
                  appliedRateVersion: true,
                  disputes: {
                    include: {
                      messages: {
                        include: { author: true },
                        orderBy: { createdAt: 'asc' },
                      },
                    },
                  },
                },
                orderBy: { workDate: 'desc' },
              }),
              prisma.invoiceDraft.findMany({
                include: {
                  project: true,
                  lines: true,
                },
                orderBy: { createdAt: 'desc' },
              }),
              prisma.auditEntry.findMany({
                include: { actorUser: true },
                orderBy: { occurredAtUtc: 'desc' },
                take: 50,
              }),
            ])

            const taskById = new Map(dbTasks.map((t) => [t.id, t]))

            const tenants = dbTenants.map((t) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
              timezone: t.defaultTimezone,
              currency: t.defaultCurrency,
              planTier: t.planTier as 'starter' | 'team' | 'agency' | 'enterprise',
              roundingRule: (t.settings?.roundingRule ?? 'none') as
                | 'none'
                | 'nearest_5m'
                | 'nearest_6m'
                | 'nearest_15m',
              paidBreakMinutesPerDay: t.settings?.paidBreakAllowanceMinutes ?? 15,
              weeklyCapMinutes: t.settings?.weeklyCapMinutes ?? 2400,
              policyVersion: t.policyVersions[0]?.versionCode ?? 'v1.0-2026-11',
            }))

            const members = dbMemberships.map((m) => ({
              id: m.userId,
              tenantId: m.tenantId,
              name: m.user.fullName,
              email: m.user.email,
              role: (m.roleGrants[0]?.role ?? 'developer') as
                | 'tenant_owner'
                | 'project_manager'
                | 'developer'
                | 'finance'
                | 'client_reviewer'
                | 'auditor',
              status: m.status as 'active' | 'invited' | 'suspended' | 'revoked',
              mfaEnabled: true,
              consentedPolicyVersion:
                m.user.policyConsents[0]?.policyVersion.versionCode ?? null,
              assignedProjectIds: m.user.projectMemberships
                .filter((pm) => pm.tenantId === m.tenantId)
                .map((pm) => pm.projectId),
            }))

            const projects = dbProjects.map((p) => ({
              id: p.id,
              tenantId: p.tenantId,
              code: p.code,
              name: p.name,
              clientName: p.clientName,
              status: p.status as 'active' | 'paused' | 'archived',
              description: p.description ?? '',
            }))

            const tasks = dbTasks.map((t) => ({
              id: t.id,
              tenantId: t.tenantId,
              projectId: t.projectId,
              code: t.code,
              title: t.title,
              acceptanceCriteria: t.acceptanceCriteria,
              status: t.status as 'backlog' | 'active' | 'review' | 'done',
              priority: t.priority as 'low' | 'medium' | 'high' | 'urgent',
              estimateMinutes: t.estimateMinutes,
              isBillable: t.isBillable,
              defaultWorkMode: t.defaultWorkMode,
              assignedMemberIds: t.assignments.map((a) => a.userId),
              dueDate: t.dueDate
                ? t.dueDate.toISOString().slice(0, 10)
                : '2026-11-20',
              attachments: t.notes.flatMap((n) => n.attachmentPaths),
            }))

            const timesheetLines = dbTimesheetLines.map((l) => {
              const task = taskById.get(l.taskId)
              return {
                id: l.id,
                tenantId: l.tenantId,
                projectId: l.timesheet.projectId,
                taskId: l.taskId,
                taskCode: task?.code ?? 'TASK',
                taskTitle: task?.title ?? 'Project Task',
                developerId: l.timesheet.userId,
                developerName: l.timesheet.user.fullName,
                workDate: l.workDate.toISOString().slice(0, 10),
                startTime: '09:00',
                endTime: '10:30',
                workMode: l.workMode,
                provenance: l.provenance,
                elapsedMinutes: Number(l.elapsedMinutes),
                claimedMinutes: Number(l.claimedMinutes),
                observedMinutes: Number(l.observedMinutes),
                supportedMinutes: Number(l.supportedMinutes),
                approvedBillableMinutes: Number(l.approvedBillableMinutes),
                evidenceStatus:
                  l.lineStatus === 'approved' || l.lineStatus === 'adjusted_approved'
                    ? 'approved'
                    : l.lineStatus === 'needs_clarification'
                      ? 'needs_clarification'
                      : l.lineStatus === 'disputed' || l.lineStatus === 'rejected'
                        ? 'disputed'
                        : 'observed',
                snapshotHourlyRate: Number(l.snapshotHourlyRate),
                rateLabel: l.appliedRateVersion.versionLabel,
                developerNote: l.developerNote,
                managerComment: l.reviewerComment ?? undefined,
                disputeMessages: l.disputes.flatMap((d) =>
                  d.messages.map((msg) => ({
                    author: msg.author.fullName,
                    role: 'member',
                    text: msg.messageMarkdown,
                    timestamp: msg.createdAt.toISOString(),
                  }))
                ),
                isLocked: l.isLocked,
              }
            })

            const invoices = dbInvoices.map((inv) => ({
              id: inv.id,
              tenantId: inv.tenantId,
              invoiceNumber: inv.invoiceNumber,
              projectId: inv.projectId,
              projectName: inv.project.name,
              clientName: inv.clientName,
              currency: inv.currency,
              periodLabel: 'Current Billing Period',
              totalApprovedMinutes: inv.lines.reduce(
                (sum, ln) => sum + Number(ln.approvedMinutes),
                0
              ),
              subtotalAmount: Number(inv.subtotalAmount),
              taxPercent: Number(inv.taxRatePercent),
              taxAmount: Number(inv.taxAmount),
              totalAmount: Number(inv.totalAmount),
              status: inv.status,
              createdAt: inv.createdAt.toISOString(),
              lines: inv.lines.map((ln) => ({
                lineId: ln.timesheetLineId,
                workDate: ln.workDate.toISOString().slice(0, 10),
                taskCode: 'TASK',
                description: ln.description,
                approvedMinutes: Number(ln.approvedMinutes),
                hourlyRate: Number(ln.snapshotHourlyRate),
                amount: Number(ln.lineTotal),
              })),
            }))

            const auditLogs = dbAudits.map((a) => ({
              id: a.id,
              tenantId: a.tenantId,
              actorName: a.actorUser?.fullName ?? 'System',
              actorRole: 'tenant_owner',
              actionType: a.actionType,
              targetEntity: a.targetEntity,
              reason: a.reason ?? '',
              timestamp: a.occurredAtUtc.toISOString(),
            }))

            return sendJson(res, 200, {
              status,
              tenants,
              members,
              projects,
              tasks,
              timesheetLines,
              invoices,
              auditLogs,
            })
          }

          // 3. POST /api/prisma/projects
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
              return sendJson(res, 200, {
                ok: false,
                error: 'Tenant ID is a local fixture ID; seed Supabase to persist via Prisma.',
              })
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

          // 4. POST /api/prisma/tasks
          if (req.method === 'POST' && url.startsWith('/api/prisma/tasks')) {
            const body = await readJsonBody<{
              tenantId: string
              projectId: string
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
              return sendJson(res, 200, {
                ok: false,
                error: 'Project/Tenant IDs are local fixture IDs; seed Supabase to persist.',
              })
            }

            const created = await prisma.$transaction(async (tx) => {
              const tsk = await tx.task.create({
                data: {
                  tenantId: body.tenantId,
                  projectId: body.projectId,
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

              const validAssignees = (body.assignedMemberIds ?? []).filter(isValidUuid)
              for (const userId of validAssignees) {
                await tx.taskAssignment.create({
                  data: {
                    tenantId: body.tenantId,
                    projectId: body.projectId,
                    taskId: tsk.id,
                    userId,
                  },
                })
              }

              await tx.auditEntry.create({
                data: {
                  tenantId: body.tenantId,
                  actionType: 'TASK_CREATED',
                  targetEntity: `tasks:${tsk.code}`,
                  targetId: tsk.id,
                  reason: `Created task ${tsk.title} via Prisma ORM`,
                },
              })

              return tsk
            })

            return sendJson(res, 201, {
              ok: true,
              task: {
                id: created.id,
                tenantId: created.tenantId,
                projectId: created.projectId,
                code: created.code,
                title: created.title,
                acceptanceCriteria: created.acceptanceCriteria,
                status: created.status,
                priority: created.priority,
                estimateMinutes: created.estimateMinutes,
                isBillable: created.isBillable,
                defaultWorkMode: created.defaultWorkMode,
                assignedMemberIds: body.assignedMemberIds ?? [],
                dueDate: created.dueDate
                  ? created.dueDate.toISOString().slice(0, 10)
                  : body.dueDate,
                attachments: [],
              },
            })
          }

          // 5. PATCH /api/prisma/tasks/status
          if (req.method === 'PATCH' && url.startsWith('/api/prisma/tasks/status')) {
            const body = await readJsonBody<{ taskId: string; status: string }>(req)
            if (!isValidUuid(body.taskId)) {
              return sendJson(res, 200, { ok: false, error: 'Non-UUID fixture task ID' })
            }

            await prisma.task.update({
              where: { id: body.taskId },
              data: { status: body.status },
            })
            return sendJson(res, 200, { ok: true })
          }

          // 6. POST /api/prisma/audit
          if (req.method === 'POST' && url.startsWith('/api/prisma/audit')) {
            const body = await readJsonBody<{
              tenantId: string
              actorUserId?: string
              actionType: string
              targetEntity: string
              reason: string
            }>(req)

            if (!isValidUuid(body.tenantId)) {
              return sendJson(res, 200, { ok: false })
            }

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
