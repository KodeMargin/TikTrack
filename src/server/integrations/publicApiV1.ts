import crypto from 'node:crypto'
import { prisma } from '../../lib/prisma.ts'

export type PublicApiResource = 'projects' | 'tasks' | 'timesheets' | 'invoices'

const RESOURCE_SCOPE: Record<PublicApiResource, string> = {
  projects: 'projects:read',
  tasks: 'tasks:read',
  timesheets: 'timesheets:read',
  invoices: 'invoices:read',
}

function sha256HexNode(val: string): string {
  return crypto.createHash('sha256').update(val, 'utf8').digest('hex')
}

export async function handlePublicRestApiV1Request(input: {
  authorizationHeader?: string
  resource: PublicApiResource
}): Promise<{ statusCode: number; payload: Record<string, unknown> }> {
  const authHeader = (input.authorizationHeader || '').trim()
  if (!authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      payload: {
        ok: false,
        error: {
          code: 'MISSING_BEARER_TOKEN',
          message: 'Provide an Authorization: Bearer <api_key> header.',
        },
      },
    }
  }

  const rawKey = authHeader.slice('Bearer '.length).trim()
  if (!rawKey) {
    return {
      statusCode: 401,
      payload: {
        ok: false,
        error: { code: 'EMPTY_API_KEY', message: 'API key is empty.' },
      },
    }
  }

  const keyHash = sha256HexNode(rawKey)
  const record = await prisma.apiKey.findFirst({
    where: { keyHashSha256: keyHash },
  })

  if (!record) {
    return {
      statusCode: 401,
      payload: {
        ok: false,
        error: { code: 'INVALID_API_KEY', message: 'API key was not recognized.' },
      },
    }
  }

  if (record.revokedAt) {
    return {
      statusCode: 401,
      payload: {
        ok: false,
        error: { code: 'REVOKED_API_KEY', message: 'This API key has been revoked.' },
      },
    }
  }

  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    return {
      statusCode: 401,
      payload: {
        ok: false,
        error: { code: 'EXPIRED_API_KEY', message: 'This API key has expired.' },
      },
    }
  }

  const requiredScope = RESOURCE_SCOPE[input.resource]
  if (!record.scopes.includes(requiredScope)) {
    return {
      statusCode: 403,
      payload: {
        ok: false,
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: `API key is missing required scope "${requiredScope}".`,
        },
      },
    }
  }

  void prisma.apiKey
    .update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {})

  const tenantId = record.tenantId
  let data: unknown[] = []

  if (input.resource === 'projects') {
    const rows = await prisma.project.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    data = rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      clientName: p.clientName,
      status: p.status,
    }))
  } else if (input.resource === 'tasks') {
    const rows = await prisma.task.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    data = rows.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      code: t.code,
      title: t.title,
      status: t.status,
      priority: t.priority,
      estimateMinutes: t.estimateMinutes,
      isBillable: t.isBillable,
    }))
  } else if (input.resource === 'timesheets') {
    const [rows, tenantTasks] = await Promise.all([
      prisma.timesheetLine.findMany({
        where: { tenantId },
        orderBy: { workDate: 'desc' },
        take: 100,
      }),
      prisma.task.findMany({ where: { tenantId }, select: { id: true, code: true } }),
    ])
    const taskCodeById = new Map(tenantTasks.map((t) => [t.id, t.code]))
    data = rows.map((l) => ({
      id: l.id,
      workDate: l.workDate.toISOString().slice(0, 10),
      taskCode: taskCodeById.get(l.taskId) ?? '',
      claimedMinutes: Number(l.claimedMinutes),
      approvedBillableMinutes: Number(l.approvedBillableMinutes),
      status: l.lineStatus,
    }))
  } else if (input.resource === 'invoices') {
    const rows = await prisma.invoiceDraft.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    data = rows.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      totalAmount: Number(inv.totalAmount),
      currency: inv.currency,
      status: inv.status,
    }))
  }

  return {
    statusCode: 200,
    payload: {
      ok: true,
      resource: input.resource,
      scope: requiredScope,
      apiKeyPrefix: record.keyPrefix,
      count: data.length,
      data,
    },
  }
}
