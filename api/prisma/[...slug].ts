import type { IncomingMessage, ServerResponse } from 'node:http'
import { handlePrismaApiRequest } from '../../src/server/prismaApiPlugin.ts'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const handled = await handlePrismaApiRequest(req, res)
  if (!handled) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Not found' }))
  }
}
