import { prisma } from '../../lib/prisma.ts'
import { isValidUuid } from '../prismaPhase1Handlers.ts'
import {
  decryptCredentials,
  encryptCredentials,
  maskSecretValue,
} from './integrationSecrets.ts'

export interface CalendarOAuthConfigStatus {
  googleConfigured: boolean
  microsoftConfigured: boolean
}

export function getCalendarOAuthStatus(): CalendarOAuthConfigStatus {
  return {
    googleConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
    ),
    microsoftConfigured: Boolean(
      process.env.MICROSOFT_CLIENT_ID?.trim() && process.env.MICROSOFT_CLIENT_SECRET?.trim()
    ),
  }
}

export function buildCalendarOAuthStartUrl(input: {
  provider: 'google_calendar' | 'outlook_calendar'
  tenantId: string
  userId: string
  origin: string
}): { ok: boolean; url?: string; error?: string } {
  const state = Buffer.from(
    JSON.stringify({ tenantId: input.tenantId, userId: input.userId, provider: input.provider })
  ).toString('base64url')

  if (input.provider === 'google_calendar') {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
    if (!clientId || !clientSecret) {
      return {
        ok: false,
        error:
          'Google Calendar OAuth is not configured on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.',
      }
    }
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() || `${input.origin}/api/prisma/oauth/google/callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly openid email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    return { ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim()
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error:
        'Outlook Calendar OAuth is not configured on this server. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env.local.',
    }
  }
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI?.trim() || `${input.origin}/api/prisma/oauth/microsoft/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'offline_access Calendars.Read User.Read',
    state,
  })
  return {
    ok: true,
    url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
  }
}

export async function handleCalendarOAuthCallback(input: {
  provider: 'google_calendar' | 'outlook_calendar'
  code: string
  state: string
  origin: string
}): Promise<{ ok: boolean; error?: string }> {
  let decoded: { tenantId?: string; userId?: string } = {}
  try {
    decoded = JSON.parse(Buffer.from(input.state, 'base64url').toString('utf8')) as {
      tenantId?: string
      userId?: string
    }
  } catch {
    return { ok: false, error: 'Invalid OAuth state.' }
  }

  if (!isValidUuid(decoded.tenantId)) {
    return { ok: false, error: 'Invalid workspace in OAuth state.' }
  }

  if (input.provider === 'google_calendar') {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || ''
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || ''
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() || `${input.origin}/api/prisma/oauth/google/callback`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) {
      return { ok: false, error: `Google token exchange failed (HTTP ${tokenRes.status}).` }
    }
    const tokens = (await tokenRes.json()) as {
      access_token?: string
      refresh_token?: string
    }
    if (!tokens.access_token) return { ok: false, error: 'Google did not return an access token.' }

    await prisma.ecosystemConnector.upsert({
      where: {
        tenantId_provider: { tenantId: decoded.tenantId, provider: 'google_calendar' },
      },
      update: {
        status: 'connected',
        displayName: 'Google Calendar',
        category: 'calendar',
        syncConfig: {
          accountLabel: 'Google Calendar (OAuth)',
          maskedCredential: maskSecretValue(tokens.access_token),
          encryptedCredentials: encryptCredentials({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || '',
          }),
        },
        lastSyncedAt: new Date(),
      },
      create: {
        tenantId: decoded.tenantId,
        category: 'calendar',
        provider: 'google_calendar',
        displayName: 'Google Calendar',
        status: 'connected',
        syncConfig: {
          accountLabel: 'Google Calendar (OAuth)',
          maskedCredential: maskSecretValue(tokens.access_token),
          encryptedCredentials: encryptCredentials({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || '',
          }),
        },
        lastSyncedAt: new Date(),
        connectedBy: isValidUuid(decoded.userId) ? decoded.userId : null,
      },
    })
    return { ok: true }
  }

  // Microsoft Outlook
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() || ''
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI?.trim() || `${input.origin}/api/prisma/oauth/microsoft/callback`

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) {
    return { ok: false, error: `Microsoft token exchange failed (HTTP ${tokenRes.status}).` }
  }
  const tokens = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
  }
  if (!tokens.access_token) return { ok: false, error: 'Microsoft did not return an access token.' }

  await prisma.ecosystemConnector.upsert({
    where: {
      tenantId_provider: { tenantId: decoded.tenantId, provider: 'outlook_calendar' },
    },
    update: {
      status: 'connected',
      displayName: 'Outlook Calendar',
      category: 'calendar',
      syncConfig: {
        accountLabel: 'Microsoft Outlook (OAuth)',
        maskedCredential: maskSecretValue(tokens.access_token),
        encryptedCredentials: encryptCredentials({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || '',
        }),
      },
      lastSyncedAt: new Date(),
    },
    create: {
      tenantId: decoded.tenantId,
      category: 'calendar',
      provider: 'outlook_calendar',
      displayName: 'Outlook Calendar',
      status: 'connected',
      syncConfig: {
        accountLabel: 'Microsoft Outlook (OAuth)',
        maskedCredential: maskSecretValue(tokens.access_token),
        encryptedCredentials: encryptCredentials({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || '',
        }),
      },
      lastSyncedAt: new Date(),
      connectedBy: isValidUuid(decoded.userId) ? decoded.userId : null,
    },
  })
  return { ok: true }
}

export async function handleFetchRealCalendarEvents(body: {
  tenantId: string
  provider: 'google_calendar' | 'outlook_calendar'
}): Promise<{
  ok: boolean
  events: Array<{
    id: string
    title: string
    startedAtUtc: string
    endedAtUtc: string
    durationMinutes: number
  }>
  error?: string
}> {
  if (!isValidUuid(body.tenantId)) {
    return { ok: false, events: [], error: 'Invalid workspace ID.' }
  }
  const connector = await prisma.ecosystemConnector.findUnique({
    where: {
      tenantId_provider: { tenantId: body.tenantId, provider: body.provider },
    },
  })
  if (!connector || connector.status !== 'connected') {
    return { ok: false, events: [], error: 'Calendar is not connected.' }
  }
  const rawConfig = (connector.syncConfig ?? {}) as Record<string, unknown>
  const creds = decryptCredentials(rawConfig.encryptedCredentials)
  if (!creds?.accessToken) {
    return { ok: false, events: [], error: 'Calendar token missing. Please reconnect.' }
  }

  const timeMin = new Date(Date.now() - 2 * 86400 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 7 * 86400 * 1000).toISOString()

  if (body.provider === 'google_calendar') {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=20`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` } }
    )
    if (!res.ok) {
      return { ok: false, events: [], error: `Google Calendar API error (HTTP ${res.status}).` }
    }
    const data = (await res.json()) as {
      items?: Array<{
        id?: string
        summary?: string
        start?: { dateTime?: string }
        end?: { dateTime?: string }
      }>
    }
    const events = (data.items ?? [])
      .filter((ev) => ev.start?.dateTime && ev.end?.dateTime)
      .map((ev) => {
        const start = new Date(ev.start!.dateTime!)
        const end = new Date(ev.end!.dateTime!)
        return {
          id: ev.id || crypto.randomUUID(),
          title: ev.summary || 'Calendar Meeting',
          startedAtUtc: start.toISOString(),
          endedAtUtc: end.toISOString(),
          durationMinutes: Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000)),
        }
      })
    return { ok: true, events }
  }

  // Microsoft Graph CalendarView
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}&$top=20`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } }
  )
  if (!res.ok) {
    return { ok: false, events: [], error: `Microsoft Graph API error (HTTP ${res.status}).` }
  }
  const data = (await res.json()) as {
    value?: Array<{
      id?: string
      subject?: string
      start?: { dateTime?: string }
      end?: { dateTime?: string }
    }>
  }
  const events = (data.value ?? [])
    .filter((ev) => ev.start?.dateTime && ev.end?.dateTime)
    .map((ev) => {
      const start = new Date(ev.start!.dateTime!)
      const end = new Date(ev.end!.dateTime!)
      return {
        id: ev.id || crypto.randomUUID(),
        title: ev.subject || 'Calendar Meeting',
        startedAtUtc: start.toISOString(),
        endedAtUtc: end.toISOString(),
        durationMinutes: Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000)),
      }
    })
  return { ok: true, events }
}
