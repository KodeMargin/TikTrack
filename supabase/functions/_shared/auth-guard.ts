// =============================================================================
// Shared Supabase Edge Function Middleware (Section 11.1 & 13.1)
// Enforces JWT verification via Supabase Auth, user-scoped RLS client creation,
// correlation IDs, CORS, and structured error JSON.
// =============================================================================

// @ts-expect-error Deno JSR import resolved by Supabase Edge Runtime
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

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

export interface AuthenticatedContext {
  userId: string
  email: string | undefined
  supabase: SupabaseClient
}

/**
 * Verifies the incoming Bearer JWT against Supabase Auth and returns a
 * user-scoped Supabase client that respects Row Level Security (RLS).
 */
export async function requireAuthenticatedUser(
  req: Request,
  correlationId: string
): Promise<AuthenticatedContext | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing Authorization Bearer token.',
      },
    })
  }

  // @ts-expect-error Deno global available in Supabase Edge Runtime
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  // @ts-expect-error Deno global available in Supabase Edge Runtime
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(500, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'SERVER_CONFIG_ERROR',
        message: 'SUPABASE_URL or SUPABASE_ANON_KEY is not configured in Edge Function environment.',
      },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INVALID_JWT',
        message: error?.message ?? 'Invalid or expired JWT token.',
      },
    })
  }

  return {
    userId: user.id,
    email: user.email,
    supabase,
  }
}
