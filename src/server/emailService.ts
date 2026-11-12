import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface SendInviteParams {
  email: string
  name: string
  role: string
  tenantId: string
  tenantName?: string
  redirectTo?: string
  temporaryPassword?: string
}

interface SendRecoveryParams {
  email: string
  redirectTo?: string
}

interface SendMagicLinkParams {
  email: string
  redirectTo?: string
}

export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL || ''
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''

  if (!url || !key) return null
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Sends a real invitation email to a new team member via Supabase Auth + Resend SMTP.
 * If SUPABASE_SERVICE_ROLE_KEY is configured, it dispatches the official Supabase invite template.
 * If only ANON/PUBLISHABLE key is configured, it sends an invitation magic link.
 */
export async function sendWorkspaceInviteEmail(
  params: SendInviteParams
): Promise<{ ok: boolean; method: string; message: string }> {
  const client = getSupabaseServerClient()
  if (!client) {
    return { ok: false, method: 'none', message: 'Supabase credentials not configured' }
  }

  const defaultRedirect = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/auth-privacy?invite=true`
  const targetRedirect = params.redirectTo || defaultRedirect

  // 1. Try admin invite or create with temporary password if service role key is present
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      if (params.temporaryPassword) {
        const { data: created, error: createErr } = await client.auth.admin.createUser({
          email: params.email,
          password: params.temporaryPassword,
          email_confirm: true,
          user_metadata: {
            fullName: params.name,
            tenantId: params.tenantId,
            tenantName: params.tenantName || 'DevProof Workspace',
            role: params.role,
            mustChangePassword: true,
          },
        })
        if (!createErr && created.user) {
          return {
            ok: true,
            method: 'admin_create_temp_pass',
            message: `User created with temporary password. Member can log in at once.`,
          }
        }
      }

      const { error } = await client.auth.admin.inviteUserByEmail(params.email, {
        data: {
          fullName: params.name,
          tenantId: params.tenantId,
          tenantName: params.tenantName || 'TikTrack Workspace',
          role: params.role,
        },
        redirectTo: targetRedirect,
      })

      if (error) {
        console.warn('[EmailService] Admin inviteUserByEmail error:', error.message)
        // Fallback to signInWithOtp if user already exists
        const otpRes = await client.auth.signInWithOtp({
          email: params.email,
          options: {
            data: {
              fullName: params.name,
              tenantId: params.tenantId,
              role: params.role,
            },
            emailRedirectTo: targetRedirect,
          },
        })
        if (otpRes.error) {
          return { ok: false, method: 'admin_invite_fallback', message: otpRes.error.message }
        }
        return {
          ok: true,
          method: 'magic_link_otp',
          message: `Workspace invite email dispatched to ${params.email} via Resend.`,
        }
      }

      return {
        ok: true,
        method: 'admin_invite',
        message: `Official team invitation email dispatched to ${params.email} via Resend.`,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[EmailService] Admin invite exception:', message)
    }
  }

  // 2. Publishable / Anon key fallback via OTP magic link
  try {
    const { error } = await client.auth.signInWithOtp({
      email: params.email,
      options: {
        data: {
          fullName: params.name,
          tenantId: params.tenantId,
          tenantName: params.tenantName || 'TikTrack Workspace',
          role: params.role,
        },
        emailRedirectTo: targetRedirect,
      },
    })

    if (error) {
      console.warn('[EmailService] signInWithOtp error:', error.message)
      return { ok: false, method: 'magic_link_otp', message: error.message }
    }

    return {
      ok: true,
      method: 'magic_link_otp',
      message: `Invitation email sent to ${params.email} via Resend.`,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, method: 'magic_link_otp', message }
  }
}

/**
 * Sends a password recovery email via Supabase Auth + Resend SMTP.
 */
export async function sendPasswordRecoveryEmail(
  params: SendRecoveryParams
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseServerClient()
  if (!client) {
    return { ok: false, message: 'Supabase credentials not configured' }
  }

  const defaultRedirect = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/auth-privacy`
  const targetRedirect = params.redirectTo || defaultRedirect

  try {
    const { error } = await client.auth.resetPasswordForEmail(params.email, {
      redirectTo: targetRedirect,
    })
    if (error) {
      return { ok: false, message: error.message }
    }
    return { ok: true, message: `Password reset email dispatched to ${params.email} via Resend.` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message }
  }
}

/**
 * Sends a magic link / passwordless sign-in email.
 */
export async function sendMagicLinkEmail(
  params: SendMagicLinkParams
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseServerClient()
  if (!client) {
    return { ok: false, message: 'Supabase credentials not configured' }
  }

  const defaultRedirect = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/auth-privacy`
  const targetRedirect = params.redirectTo || defaultRedirect

  try {
    const { error } = await client.auth.signInWithOtp({
      email: params.email,
      options: {
        emailRedirectTo: targetRedirect,
      },
    })
    if (error) {
      return { ok: false, message: error.message }
    }
    return { ok: true, message: `Magic link dispatched to ${params.email} via Resend.` }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message }
  }
}
