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

interface SendOwnerSignupParams {
  email: string
  password: string
  fullName: string
  timezone?: string
  countryCode?: string
  countryName?: string
  redirectTo?: string
}

interface SendRecoveryParams {
  email: string
  recoveryUrl?: string
  redirectTo?: string
}

interface ResendSendParams {
  to: string
  subject: string
  html: string
  text: string
}

const RESEND_API_URL = 'https://api.resend.com/emails'

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '')
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, '')}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`
  }
  return 'http://localhost:5173'
}

function getResendConfig(): { apiKey: string; from: string } | null {
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) return null
  const from = (
    process.env.RESEND_FROM_EMAIL || 'TikTrack <noreply@dev.kodemargin.com>'
  ).trim()
  return { apiKey, from }
}

/**
 * Sends an email directly via the Resend REST API (Supabase email delivery disabled).
 */
export async function sendViaResend(
  params: ResendSendParams
): Promise<{ ok: boolean; id?: string; message: string }> {
  const cfg = getResendConfig()
  if (!cfg) {
    return {
      ok: false,
      message:
        'RESEND_API_KEY is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in your environment.',
    }
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    })

    const data = (await response.json().catch(() => ({}))) as {
      id?: string
      message?: string
      name?: string
    }

    if (!response.ok) {
      return {
        ok: false,
        message: data.message || `Resend API rejected request (${response.status}).`,
      }
    }

    return {
      ok: true,
      id: data.id,
      message: `Email sent to ${params.to} via Resend.`,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Resend network error: ${message}` }
  }
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderOtpBlockHtml(otpCode: string, label: string): string {
  if (!otpCode) return ''
  return `
    <div style="margin:20px 0;padding:16px;border-radius:10px;background:#f4effc;border:1px solid #c5a8f0;text-align:center;">
      <div style="font-size:11px;color:#581eae;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">
        ${escapeHtml(label)}
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:800;letter-spacing:0.22em;color:#18181b;">
        ${escapeHtml(otpCode)}
      </div>
      <p style="margin:8px 0 0;font-size:12px;color:#52525b;">
        If the button above does not work, enter this 6-digit code directly on the TikTrack screen.
      </p>
    </div>
  `
}

/**
 * Registers a new Tenant Owner silently in Supabase Auth (NO Supabase email sent),
 * generates both a verification link AND a 6-digit OTP fallback, and dispatches
 * the verification email directly via Resend API.
 */
export async function sendOwnerSignupVerificationEmail(
  params: SendOwnerSignupParams
): Promise<{ ok: boolean; message: string; hasOtp?: boolean }> {
  const admin = getSupabaseAdminClient()
  if (!admin) {
    return {
      ok: false,
      message: 'SUPABASE_SERVICE_ROLE_KEY is required on the server to generate Resend signup verification.',
    }
  }

  const email = params.email.trim().toLowerCase()
  const fullName = params.fullName.trim() || email.split('@')[0]
  const redirectTo = params.redirectTo || `${getAppBaseUrl()}/auth-privacy`

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password: params.password,
    options: {
      redirectTo,
      data: {
        full_name: fullName,
        timezone: params.timezone || 'UTC',
        country_code: params.countryCode || 'US',
        country_name: params.countryName || 'United States',
        account_type: 'tenant_owner',
      },
    },
  })

  if (error || !data?.properties?.action_link) {
    return {
      ok: false,
      message: error?.message || 'Could not create owner account or verification link.',
    }
  }

  const verifyLink = data.properties.action_link
  const otpCode = data.properties.email_otp || ''
  const safeName = escapeHtml(fullName)
  const safeLink = escapeHtml(verifyLink)

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b;background:#ffffff;">
      <div style="display:inline-block;background:#6d25da;color:#ffffff;font-weight:800;font-size:14px;padding:6px 12px;border-radius:8px;margin-bottom:16px;">
        TikTrack
      </div>
      <h2 style="margin:0 0 8px;font-size:20px;color:#09090b;">
        Verify your Tenant Owner account
      </h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#3f3f46;">
        Hi ${safeName}, thanks for signing up for TikTrack. Confirm your email address to create your company workspace.
      </p>
      <a href="${safeLink}" style="display:inline-block;margin-top:4px;padding:11px 20px;border-radius:8px;background:#6d25da;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
        Verify Email Address
      </a>
      ${renderOtpBlockHtml(otpCode, 'Or Enter This 6-Digit Verification Code')}
      <p style="margin:20px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
        If you did not request a TikTrack workspace account, you can safely ignore this email.
      </p>
    </div>
  `

  const text = [
    `Hi ${fullName},`,
    ``,
    `Verify your TikTrack Tenant Owner account by opening this link:`,
    verifyLink,
    otpCode ? `` : '',
    otpCode ? `Or enter this 6-digit verification code on the sign-up screen: ${otpCode}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const resendResult = await sendViaResend({
    to: email,
    subject: 'Verify your TikTrack Tenant Owner account',
    html,
    text,
  })

  return {
    ok: resendResult.ok,
    hasOtp: Boolean(otpCode),
    message: resendResult.ok
      ? `Verification email & 6-digit OTP sent to ${email} via Resend.`
      : resendResult.message,
  }
}

/**
 * Provisions the invited user silently in Supabase Auth (no Supabase email sent)
 * with their temporary password + `mustChangePassword: true`, then dispatches
 * the branded invitation email directly via Resend API.
 */
export async function sendWorkspaceInviteEmail(
  params: SendInviteParams
): Promise<{ ok: boolean; method: string; message: string }> {
  const workspaceName = params.tenantName?.trim() || 'TikTrack Workspace'
  const loginUrl = params.redirectTo || `${getAppBaseUrl()}/auth-privacy`
  const tempPassword = params.temporaryPassword?.trim() || ''

  // 1. Silently provision or update the Supabase Auth credentials (NO Supabase email triggered)
  const admin = getSupabaseAdminClient()
  if (admin && tempPassword) {
    try {
      const { error: createErr } = await admin.auth.admin.createUser({
        email: params.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          fullName: params.name,
          tenantId: params.tenantId,
          tenantName: workspaceName,
          role: params.role,
          mustChangePassword: true,
        },
      })

      if (createErr) {
        const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = listData?.users?.find(
          (u) => u.email?.toLowerCase() === params.email.toLowerCase()
        )
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, {
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              ...existing.user_metadata,
              fullName: params.name,
              tenantId: params.tenantId,
              tenantName: workspaceName,
              role: params.role,
              mustChangePassword: true,
            },
          })
        } else {
          console.warn('[EmailService] Supabase admin createUser warning:', createErr.message)
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[EmailService] Supabase silent provision error:', message)
    }
  }

  // 2. Dispatch the invitation email directly through Resend API
  const safeName = escapeHtml(params.name)
  const safeWorkspace = escapeHtml(workspaceName)
  const safeRole = escapeHtml(params.role.replace(/_/g, ' '))
  const safeEmail = escapeHtml(params.email)
  const safeTempPass = escapeHtml(tempPassword)
  const safeLoginUrl = escapeHtml(loginUrl)

  const passwordBlockHtml = tempPassword
    ? `
      <div style="margin:20px 0;padding:16px;border-radius:10px;background:#f4effc;border:1px solid #c5a8f0;">
        <div style="font-size:12px;color:#581eae;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
          Your Temporary Login Credentials
        </div>
        <div style="font-size:14px;color:#18181b;margin-bottom:4px;">
          <strong>Email:</strong> ${safeEmail}
        </div>
        <div style="font-size:14px;color:#18181b;">
          <strong>Temporary Password:</strong>
          <code style="background:#ffffff;padding:3px 8px;border-radius:6px;border:1px solid #d4d4d8;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#581eae;">${safeTempPass}</code>
        </div>
        <p style="margin:10px 0 0;font-size:12px;color:#52525b;">
          You must change this temporary password on your first login to activate your profile. Tasks can only be assigned to you once your profile is active.
        </p>
      </div>
    `
    : ''

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b;background:#ffffff;">
      <div style="display:inline-block;background:#6d25da;color:#ffffff;font-weight:800;font-size:14px;padding:6px 12px;border-radius:8px;margin-bottom:16px;">
        TikTrack
      </div>
      <h2 style="margin:0 0 8px;font-size:20px;color:#09090b;">
        You're invited to join ${safeWorkspace}
      </h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#3f3f46;">
        Hi ${safeName}, you have been added to <strong>${safeWorkspace}</strong> as a <strong>${safeRole}</strong>.
      </p>
      ${passwordBlockHtml}
      <a href="${safeLoginUrl}" style="display:inline-block;margin-top:8px;padding:11px 20px;border-radius:8px;background:#6d25da;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
        Sign In &amp; Activate Profile
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
        After activating your profile, you can also sign in on the TikTrack Desktop Agent using your email &amp; new password or your Device Pairing Token.
      </p>
    </div>
  `

  const text = [
    `Hi ${params.name},`,
    ``,
    `You have been invited to join ${workspaceName} on TikTrack as ${params.role}.`,
    tempPassword ? `Email: ${params.email}` : '',
    tempPassword ? `Temporary Password: ${tempPassword}` : '',
    tempPassword
      ? `You must change your temporary password on first login to activate your profile before tasks can be assigned to you.`
      : '',
    ``,
    `Sign in here: ${loginUrl}`,
  ]
    .filter(Boolean)
    .join('\n')

  const resendResult = await sendViaResend({
    to: params.email,
    subject: `Welcome to ${workspaceName} on TikTrack - Activate your profile`,
    html,
    text,
  })

  return {
    ok: resendResult.ok,
    method: 'resend_direct',
    message: resendResult.message,
  }
}

/**
 * Sends a password recovery email with BOTH a clickable reset link AND a 6-digit OTP
 * directly via Resend API (Supabase email delivery disabled).
 */
export async function sendPasswordRecoveryEmail(
  params: SendRecoveryParams
): Promise<{ ok: boolean; message: string; hasOtp?: boolean }> {
  const admin = getSupabaseAdminClient()
  const redirectTo = params.redirectTo || `${getAppBaseUrl()}/auth-privacy`
  let recoveryLink = params.recoveryUrl || redirectTo
  let otpCode = ''

  if (admin && !params.recoveryUrl) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: params.email.trim().toLowerCase(),
      options: { redirectTo },
    })
    if (error) {
      return { ok: false, message: error.message }
    }
    if (data?.properties?.action_link) {
      recoveryLink = data.properties.action_link
    }
    if (data?.properties?.email_otp) {
      otpCode = data.properties.email_otp
    }
  }

  const safeLink = escapeHtml(recoveryLink)
  const resendResult = await sendViaResend({
    to: params.email,
    subject: 'Reset your TikTrack password',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b;background:#ffffff;">
        <div style="display:inline-block;background:#6d25da;color:#ffffff;font-weight:800;font-size:14px;padding:6px 12px;border-radius:8px;margin-bottom:16px;">
          TikTrack
        </div>
        <h2 style="margin:0 0 12px;font-size:20px;color:#09090b;">Password Reset Request</h2>
        <p style="font-size:14px;color:#3f3f46;line-height:1.5;">
          Click the button below to choose a new password for your TikTrack account.
        </p>
        <a href="${safeLink}" style="display:inline-block;margin-top:8px;padding:11px 20px;border-radius:8px;background:#6d25da;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
          Reset Password
        </a>
        ${renderOtpBlockHtml(otpCode, 'Or Enter This 6-Digit Reset Code')}
      </div>
    `,
    text: [
      `Reset your TikTrack password: ${recoveryLink}`,
      otpCode ? `Or enter this 6-digit reset code: ${otpCode}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  })

  return {
    ok: resendResult.ok,
    hasOtp: Boolean(otpCode),
    message: resendResult.ok
      ? `Password reset link & 6-digit OTP sent to ${params.email} via Resend.`
      : resendResult.message,
  }
}
