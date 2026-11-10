/**
 * DevProof (TikTrack) — Browser-to-Prisma API Client
 *
 * Communicates with the Vite server Prisma middleware (`/api/prisma/*`) so the
 * React frontend can read and mutate Supabase PostgreSQL data through Prisma ORM
 * without ever exposing DATABASE_URL in the client bundle.
 */

import type {
  AuditLogEntry,
  InvoiceDraftRecord,
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
  auditLogs: AuditLogEntry[]
}

export async function fetchPrismaStatus(): Promise<PrismaConnectionStatus> {
  try {
    const res = await fetch('/api/prisma/status')
    if (!res.ok) {
      return {
        connected: false,
        configured: false,
        projectRef: null,
        message: `Prisma API returned HTTP ${res.status}`,
      }
    }
    return (await res.json()) as PrismaConnectionStatus
  } catch {
    return {
      connected: false,
      configured: false,
      projectRef: null,
      message: 'Prisma server middleware not reachable (running in static client mode).',
    }
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

export async function createProjectViaPrisma(input: {
  tenantId: string
  code: string
  name: string
  clientName: string
  description: string
  actorUserId?: string
}): Promise<{ ok: boolean; project?: ProjectRecord; error?: string }> {
  try {
    const res = await fetch('/api/prisma/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; project?: ProjectRecord; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createTaskViaPrisma(input: {
  tenantId: string
  projectId: string
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
}): Promise<{ ok: boolean; task?: TaskRecord; error?: string }> {
  try {
    const res = await fetch('/api/prisma/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; task?: TaskRecord; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateTaskStatusViaPrisma(input: {
  taskId: string
  status: TaskRecord['status']
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/prisma/tasks/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean; error?: string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function recordAuditViaPrisma(input: {
  tenantId: string
  actorUserId?: string
  actionType: string
  targetEntity: string
  reason: string
}): Promise<{ ok: boolean }> {
  try {
    const res = await fetch('/api/prisma/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await res.json()) as { ok: boolean }
  } catch {
    return { ok: false }
  }
}

