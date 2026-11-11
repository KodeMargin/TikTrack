/**
 * DevProof (TikTrack) — Browser-to-Prisma API Client
 *
 * Communicates with the Vite server Prisma middleware (`/api/prisma/*`) so the
 * React frontend persists Phase 1 data through Prisma ORM without exposing DATABASE_URL.
 */

import type {
  AuditLogEntry,
  InvoiceDraftRecord,
  NotificationItem,
  ProjectRecord,
  TaskRecord,
  TenantWorkspace,
  TimesheetLineItem,
  WorkspaceMember,
} from '@/context/Phase1Store'

export interface PrismaConnectionStatus {
  connected: boolean
  configured: boolean
  projectRef: string | null
  message: string
}

export interface PrismaBootstrapPayload {
  status: PrismaConnectionStatus
  tenants: TenantWorkspace[]
  members: WorkspaceMember[]
  projects: ProjectRecord[]
  tasks: TaskRecord[]
  timesheetLines: TimesheetLineItem[]
  invoices: InvoiceDraftRecord[]
  notifications: NotificationItem[]
  auditLogs: AuditLogEntry[]
}

async function postJson<T>(url: string, body: unknown, method = 'POST'): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchPrismaBootstrap(): Promise<PrismaBootstrapPayload | null> {
  try {
    const res = await fetch('/api/prisma/bootstrap')
    if (!res.ok) return null
    return (await res.json()) as PrismaBootstrapPayload
  } catch {
    return null
  }
}

export const createTenantViaPrisma = (input: {
  name: string
  slug: string
  timezone: string
  currency: string
  ownerName: string
  ownerEmail: string
}) => postJson<{ ok: boolean; tenantId?: string; ownerId?: string }>('/api/prisma/tenants', input)

export const updateTenantSettingsViaPrisma = (input: {
  tenantId: string
  roundingRule?: string
  paidBreakMinutesPerDay?: number
  weeklyCapMinutes?: number
}) => postJson<{ ok: boolean }>('/api/prisma/tenant/settings', input, 'PATCH')

export const inviteMemberViaPrisma = (input: {
  tenantId: string
  name: string
  email: string
  role: string
}) => postJson<{ ok: boolean; userId?: string }>('/api/prisma/members', input)

export const updateMemberStatusViaPrisma = (input: {
  tenantId: string
  userId: string
  status: string
}) => postJson<{ ok: boolean }>('/api/prisma/members/status', input, 'PATCH')

export const createProjectViaPrisma = (input: {
  tenantId: string
  code: string
  name: string
  clientName: string
  description: string
  actorUserId?: string
}) =>
  postJson<{ ok: boolean; project?: ProjectRecord; error?: string }>(
    '/api/prisma/projects',
    input
  )

export const createTaskViaPrisma = (input: {
  tenantId: string
  projectId: string
  parentTaskId?: string
  code: string
  title: string
  acceptanceCriteria: string
  status: TaskRecord['status']
  priority: TaskRecord['priority']
  estimateMinutes: number
  isBillable: boolean
  defaultWorkMode: TaskRecord['defaultWorkMode']
  dueDate: string
  assignedMemberIds: string[]
}) =>
  postJson<{ ok: boolean; task?: TaskRecord; error?: string }>(
    '/api/prisma/tasks',
    input
  )

export const updateTaskStatusViaPrisma = (input: {
  taskId: string
  status: TaskRecord['status']
}) => postJson<{ ok: boolean; error?: string }>('/api/prisma/tasks/status', input, 'PATCH')

export const assignTaskMembersViaPrisma = (input: {
  tenantId: string
  projectId: string
  taskId: string
  assignedMemberIds: string[]
}) => postJson<{ ok: boolean }>('/api/prisma/tasks/assign', input, 'PATCH')

export const recordSessionViaPrisma = (input: {
  tenantId: string
  userId: string
  projectId: string
  taskId: string
  workDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  breakMinutes: number
  workMode: string
  provenance: 'desktop_timer' | 'web_timer' | 'manual_entry'
  developerNote: string
  manualReason?: string
  hourlyRate: number
}) =>
  postJson<{ ok: boolean; lineId?: string; timesheetId?: string; error?: string }>(
    '/api/prisma/sessions/record',
    input
  )

export const submitTimesheetViaPrisma = (input: {
  timesheetId: string
  summaryNote?: string
}) => postJson<{ ok: boolean }>('/api/prisma/timesheets/submit', input)

export const reviewTimesheetLineViaPrisma = (input: {
  tenantId: string
  timesheetId: string
  lineId: string
  reviewerUserId: string
  decision: 'approve' | 'ask_clarification' | 'adjust_with_reason' | 'reject'
  reason: string
  approvedMinutes: number
  lockLine: boolean
}) => postJson<{ ok: boolean }>('/api/prisma/timesheets/review', input)

export const lockInvoiceViaPrisma = (input: {
  invoiceId: string
  lineIds: string[]
}) => postJson<{ ok: boolean }>('/api/prisma/invoices/lock', input)

export const markNotificationReadViaPrisma = (input: { notificationId: string }) =>
  postJson<{ ok: boolean }>('/api/prisma/notifications/read', input, 'PATCH')

export const recordAuditViaPrisma = (input: {
  tenantId: string
  actorUserId?: string
  actionType: string
  targetEntity: string
  reason: string
}) => postJson<{ ok: boolean }>('/api/prisma/audit', input)

export const ingestWebhookViaPrisma = (input: {
  tenantId: string
  projectId: string
  taskId?: string | null
  provider: 'github' | 'gitlab' | 'jira' | 'linear'
  deliveryId: string
  eventType: string
  signatureVerified: boolean
  payloadSha256: string
  sourceType: string
  externalId: string
  summaryTitle: string
  metadata: Record<string, string | number | boolean>
  linkType: 'contemporaneous' | 'retrospective_outcome' | 'manual_attached'
  linkRationale: string
  actorUserId?: string | null
}) =>
  postJson<{
    ok: boolean
    deduplicated?: boolean
    deliveryAttemptCount?: number
    artifactId?: string
  }>('/api/prisma/phase2/webhook', input)

export const createSessionAnnotationViaPrisma = (input: {
  tenantId: string
  userId: string
  sessionId: string
  annotationType: string
  title: string
  contentMarkdown: string
  startMinuteOfDay?: number
  endMinuteOfDay?: number
}) => postJson<{ ok: boolean; annotationId?: string }>('/api/prisma/phase2/annotation', input)
