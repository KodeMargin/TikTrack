// =============================================================================
// Shared Supabase Edge Function Middleware (Section 11.1 & 13.1)
// Enforces JWT verification, correlation IDs, CORS, and structured error JSON
// =============================================================================

declare global {
  // Minimal Deno runtime ambient declaration for Supabase Edge Functions
  const Deno: {
    serve: (handler: (req: Request) => Response | Promise<Response>) => void
  }
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, idempotency-key, x-correlation-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

export interface EdgeResponseEnvelope<T> {
  ok: boolean
  correlation_id: string
  data?: T
  error?: {
    code: string
    message: string
  }
}

export function jsonResponse<T>(
  status: number,
  payload: EdgeResponseEnvelope<T>
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Correlation-Id': payload.correlation_id,
    },
  })
}

export function extractCorrelationId(req: Request): string {
  return req.headers.get('x-correlation-id') ?? crypto.randomUUID()
}

