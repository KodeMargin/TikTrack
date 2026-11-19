import type { IncomingMessage, ServerResponse } from 'node:http'
import { handlePrismaApiRequest } from './prismaApiPlugin.ts'

function normalizeVercelRequestUrl(req: IncomingMessage): void {
  const rawUrl = req.url ?? ''
  if (!rawUrl) return

  const parsed = new URL(rawUrl, 'http://localhost')
  const rewrittenPath = parsed.searchParams.get('__path')
  if (rewrittenPath !== null) {
    parsed.searchParams.delete('__path')
    const cleanSubpath = rewrittenPath.replace(/^\/+/, '')
    const remainingQuery = parsed.searchParams.toString()
    req.url = `/api/prisma/${cleanSubpath}${remainingQuery ? `?${remainingQuery}` : ''}`
    return
  }

  // If Vercel preserved original path (e.g. /api/prisma/desktop/auth), keep as-is.
  if (parsed.pathname === '/api/prisma') {
    const remainingQuery = parsed.searchParams.toString()
    req.url = `/api/prisma/${remainingQuery ? `?${remainingQuery}` : ''}`
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  normalizeVercelRequestUrl(req)
  const handled = await handlePrismaApiRequest(req, res)
  if (!handled) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: `Not found: ${req.url ?? ''}` }))
  }
}
