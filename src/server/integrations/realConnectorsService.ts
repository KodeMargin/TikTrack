import crypto from 'node:crypto'
import { prisma } from '../../lib/prisma.ts'
import { isValidUuid } from '../prismaPhase1Handlers.ts'
import {
  decryptCredentials,
  encryptCredentials,
  maskSecretValue,
  sanitizeSyncConfigForClient,
} from './integrationSecrets.ts'

export type RealConnectorProvider =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'jira'
  | 'clickup'
  | 'linear'
  | 'trello'
  | 'asana'
  | 'notion'
  | 'azure_devops'
  | 'slack'
  | 'discord'
  | 'ms_teams'
  | 'google_calendar'
  | 'outlook_calendar'

export interface ExternalTaskItem {
  id: string
  provider: RealConnectorProvider
  externalKey: string
  title: string
  status: string
  estimateMinutes: number
  priority: 'low' | 'medium' | 'high' | 'urgent'
  url?: string
  projectOrRepo?: string
}

const PROVIDER_META: Record<
  RealConnectorProvider,
  { category: string; displayName: string }
> = {
  github: { category: 'git', displayName: 'GitHub' },
  gitlab: { category: 'git', displayName: 'GitLab' },
  bitbucket: { category: 'git', displayName: 'Bitbucket' },
  jira: { category: 'pm', displayName: 'Jira' },
  clickup: { category: 'pm', displayName: 'ClickUp' },
  linear: { category: 'pm', displayName: 'Linear' },
  trello: { category: 'pm', displayName: 'Trello' },
  asana: { category: 'pm', displayName: 'Asana' },
  notion: { category: 'pm', displayName: 'Notion' },
  azure_devops: { category: 'pm', displayName: 'Azure DevOps' },
  slack: { category: 'chat', displayName: 'Slack' },
  discord: { category: 'chat', displayName: 'Discord' },
  ms_teams: { category: 'chat', displayName: 'Microsoft Teams' },
  google_calendar: { category: 'calendar', displayName: 'Google Calendar' },
  outlook_calendar: { category: 'calendar', displayName: 'Outlook Calendar' },
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    return { ok: res.ok, status: res.status, data, text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return { ok: false, status: 0, data: null, text: msg }
  } finally {
    clearTimeout(timer)
  }
}

function normalizeHttpUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function mapPriority(val: unknown): 'low' | 'medium' | 'high' | 'urgent' {
  const s = String(val ?? '').toLowerCase()
  if (s.includes('urgent') || s.includes('highest') || s === '1') return 'urgent'
  if (s.includes('high') || s === '2') return 'high'
  if (s.includes('low') || s.includes('lowest') || s === '4') return 'low'
  return 'medium'
}

// ============================================================================
// 1. REAL CREDENTIAL VERIFICATION (CALLS ACTUAL EXTERNAL APIS)
// ============================================================================

async function verifyExternalCredentials(
  provider: RealConnectorProvider,
  creds: Record<string, string>
): Promise<{ ok: boolean; accountLabel?: string; extraMeta?: Record<string, string>; error?: string }> {
  switch (provider) {
    case 'github': {
      const token = (creds.token || '').trim()
      if (!token) return { ok: false, error: 'GitHub Personal Access Token is required.' }
      const res = await fetchJsonWithTimeout('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'TikTrack-App',
        },
      })
      if (!res.ok) {
        return { ok: false, error: `GitHub rejected token (HTTP ${res.status}). Check token & scopes.` }
      }
      const user = res.data as { login?: string; name?: string }
      return {
        ok: true,
        accountLabel: user?.login ? `@${user.login}` : user?.name || 'GitHub Account',
      }
    }

    case 'gitlab': {
      const token = (creds.token || '').trim()
      const baseUrl = normalizeHttpUrl(creds.baseUrl || 'https://gitlab.com')
      if (!token) return { ok: false, error: 'GitLab Personal Access Token is required.' }
      const res = await fetchJsonWithTimeout(`${baseUrl}/api/v4/user`, {
        headers: { 'PRIVATE-TOKEN': token },
      })
      if (!res.ok) {
        return { ok: false, error: `GitLab rejected token (HTTP ${res.status}).` }
      }
      const user = res.data as { username?: string; name?: string }
      return {
        ok: true,
        accountLabel: user?.username ? `@${user.username}` : user?.name || 'GitLab Account',
        extraMeta: { baseUrl },
      }
    }

    case 'bitbucket': {
      const username = (creds.username || '').trim()
      const apiToken = (creds.apiToken || creds.appPassword || '').trim()
      const workspace = (creds.workspace || '').trim()
      if (!username || !apiToken || !workspace) {
        return { ok: false, error: 'Bitbucket workspace, account email/username, and API token are required.' }
      }
      const basic = Buffer.from(`${username}:${apiToken}`).toString('base64')
      const res = await fetchJsonWithTimeout('https://api.bitbucket.org/2.0/user', {
        headers: { Authorization: `Basic ${basic}` },
      })
      if (!res.ok) {
        return { ok: false, error: `Bitbucket authentication failed (HTTP ${res.status}). Check your username/email and API token.` }
      }
      const user = res.data as { display_name?: string; username?: string }
      return {
        ok: true,
        accountLabel: `${user?.display_name || username} (${workspace})`,
        extraMeta: { workspace },
      }
    }

    case 'jira': {
      const domain = normalizeHttpUrl(creds.domain || '')
      const email = (creds.email || '').trim()
      const apiToken = (creds.apiToken || '').trim()
      if (!domain || !email || !apiToken) {
        return { ok: false, error: 'Jira domain, email, and API token are required.' }
      }
      const basic = Buffer.from(`${email}:${apiToken}`).toString('base64')
      const res = await fetchJsonWithTimeout(`${domain}/rest/api/3/myself`, {
        headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
      })
      if (!res.ok) {
        return { ok: false, error: `Jira authentication failed (HTTP ${res.status}). Check domain, email & API token.` }
      }
      const user = res.data as { displayName?: string; emailAddress?: string }
      return {
        ok: true,
        accountLabel: user?.displayName || user?.emailAddress || email,
        extraMeta: { domain },
      }
    }

    case 'clickup': {
      const apiToken = (creds.apiToken || '').trim()
      if (!apiToken) return { ok: false, error: 'ClickUp Personal API Token is required.' }
      const res = await fetchJsonWithTimeout('https://api.clickup.com/api/v2/user', {
        headers: { Authorization: apiToken },
      })
      if (!res.ok) {
        return { ok: false, error: `ClickUp rejected API token (HTTP ${res.status}).` }
      }
      const payload = res.data as { user?: { username?: string; email?: string } }
      return {
        ok: true,
        accountLabel: payload?.user?.username || payload?.user?.email || 'ClickUp Account',
      }
    }

    case 'linear': {
      const apiKey = (creds.apiKey || '').trim()
      if (!apiKey) return { ok: false, error: 'Linear API Key is required.' }
      const res = await fetchJsonWithTimeout('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ viewer { id name email } }' }),
      })
      const gql = res.data as {
        data?: { viewer?: { name?: string; email?: string } }
        errors?: Array<{ message?: string }>
      }
      if (!res.ok || gql?.errors?.length || !gql?.data?.viewer) {
        return {
          ok: false,
          error: gql?.errors?.[0]?.message || `Linear rejected API key (HTTP ${res.status}).`,
        }
      }
      return {
        ok: true,
        accountLabel: gql.data.viewer.name || gql.data.viewer.email || 'Linear Account',
      }
    }

    case 'trello': {
      const apiKey = (creds.apiKey || '').trim()
      const token = (creds.token || '').trim()
      if (!apiKey || !token) return { ok: false, error: 'Trello API Key and Token are required.' }
      const res = await fetchJsonWithTimeout(
        `https://api.trello.com/1/members/me?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`
      )
      if (!res.ok) {
        return { ok: false, error: `Trello authentication failed (HTTP ${res.status}).` }
      }
      const member = res.data as { fullName?: string; username?: string }
      return {
        ok: true,
        accountLabel: member?.username ? `@${member.username}` : member?.fullName || 'Trello Account',
      }
    }

    case 'asana': {
      const accessToken = (creds.accessToken || '').trim()
      if (!accessToken) return { ok: false, error: 'Asana Personal Access Token is required.' }
      const res = await fetchJsonWithTimeout('https://app.asana.com/api/1.0/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        return { ok: false, error: `Asana rejected access token (HTTP ${res.status}).` }
      }
      const payload = res.data as {
        data?: { name?: string; email?: string; workspaces?: Array<{ gid: string; name: string }> }
      }
      const firstWs = payload?.data?.workspaces?.[0]
      return {
        ok: true,
        accountLabel: payload?.data?.name || payload?.data?.email || 'Asana Account',
        extraMeta: firstWs ? { workspaceGid: firstWs.gid, workspaceName: firstWs.name } : {},
      }
    }

    case 'notion': {
      const apiToken = (creds.apiToken || '').trim()
      const databaseId = (creds.databaseId || '').trim()
      if (!apiToken) return { ok: false, error: 'Notion Internal Integration Token is required.' }
      const res = await fetchJsonWithTimeout('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Notion-Version': '2022-06-28',
        },
      })
      if (!res.ok) {
        return { ok: false, error: `Notion rejected token (HTTP ${res.status}).` }
      }
      const bot = res.data as { name?: string; bot?: { workspace_name?: string } }
      return {
        ok: true,
        accountLabel: bot?.bot?.workspace_name || bot?.name || 'Notion Workspace',
        extraMeta: databaseId ? { databaseId } : {},
      }
    }

    case 'azure_devops': {
      const organization = (creds.organization || '').trim()
      const project = (creds.project || '').trim()
      const pat = (creds.pat || '').trim()
      if (!organization || !project || !pat) {
        return { ok: false, error: 'Azure DevOps organization, project, and PAT are required.' }
      }
      const basic = Buffer.from(`:${pat}`).toString('base64')
      const res = await fetchJsonWithTimeout(
        `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}?api-version=7.1`,
        { headers: { Authorization: `Basic ${basic}` } }
      )
      if (!res.ok) {
        return { ok: false, error: `Azure DevOps verification failed (HTTP ${res.status}).` }
      }
      const proj = res.data as { name?: string }
      return {
        ok: true,
        accountLabel: `${organization}/${proj?.name || project}`,
        extraMeta: { organization, project },
      }
    }

    case 'slack':
    case 'discord':
    case 'ms_teams': {
      const webhookUrl = (creds.webhookUrl || '').trim()
      if (!/^https:\/\/.+/i.test(webhookUrl)) {
        return { ok: false, error: 'Provide a valid https:// incoming webhook URL.' }
      }
      const sendRes = await sendRealChatAlert({
        provider,
        webhookUrl,
        title: 'TikTrack Connected',
        message: 'Real-time workspace notifications from TikTrack are now connected to this channel.',
      })
      if (!sendRes.ok) {
        return {
          ok: false,
          error: `Webhook test failed (HTTP ${sendRes.httpStatus || 'network error'}): ${sendRes.responseSnippet}`,
        }
      }
      return {
        ok: true,
        accountLabel: creds.channelName?.trim() || `${PROVIDER_META[provider].displayName} Channel`,
      }
    }

    default:
      return { ok: false, error: `Unsupported provider "${provider}".` }
  }
}

export async function handleConnectRealIntegration(body: {
  tenantId: string
  provider: RealConnectorProvider
  credentials: Record<string, string>
  connectedBy?: string
}) {
  if (!isValidUuid(body.tenantId)) {
    return { ok: false, error: 'Invalid workspace ID.' }
  }
  const meta = PROVIDER_META[body.provider]
  if (!meta) return { ok: false, error: 'Unknown provider.' }

  const verified = await verifyExternalCredentials(body.provider, body.credentials)
  if (!verified.ok) {
    return { ok: false, error: verified.error || 'Verification failed.' }
  }

  const secretSample =
    body.credentials.token ||
    body.credentials.apiToken ||
    body.credentials.apiKey ||
    body.credentials.accessToken ||
    body.credentials.pat ||
    body.credentials.appPassword ||
    body.credentials.webhookUrl ||
    ''

  const syncConfigToStore = {
    accountLabel: verified.accountLabel || meta.displayName,
    maskedCredential: maskSecretValue(secretSample),
    ...(verified.extraMeta ?? {}),
    encryptedCredentials: encryptCredentials(body.credentials),
  }

  const saved = await prisma.ecosystemConnector.upsert({
    where: {
      tenantId_provider: {
        tenantId: body.tenantId,
        provider: body.provider,
      },
    },
    update: {
      status: 'connected',
      displayName: meta.displayName,
      category: meta.category,
      syncConfig: syncConfigToStore,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    },
    create: {
      tenantId: body.tenantId,
      category: meta.category,
      provider: body.provider,
      displayName: meta.displayName,
      status: 'connected',
      syncConfig: syncConfigToStore,
      lastSyncedAt: new Date(),
      connectedBy: isValidUuid(body.connectedBy) ? body.connectedBy : null,
    },
  })

  return {
    ok: true,
    connector: {
      id: saved.id,
      tenantId: saved.tenantId,
      category: saved.category,
      provider: saved.provider,
      displayName: saved.displayName,
      status: saved.status,
      syncConfig: sanitizeSyncConfigForClient(saved.syncConfig),
      lastSyncedAt: saved.lastSyncedAt?.toISOString(),
      createdAt: saved.createdAt.toISOString(),
    },
    message: `Connected ${meta.displayName} (${verified.accountLabel}).`,
  }
}

export async function handleDisconnectRealIntegration(body: {
  tenantId: string
  provider: RealConnectorProvider
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false, error: 'Invalid workspace ID.' }
  await prisma.ecosystemConnector.deleteMany({
    where: {
      tenantId: body.tenantId,
      provider: body.provider,
    },
  })
  return { ok: true, message: `Disconnected ${PROVIDER_META[body.provider]?.displayName ?? body.provider}.` }
}

// ============================================================================
// 2. FETCH REAL LIVE ITEMS (ISSUES / TICKETS / CARDS) FROM CONNECTED PROVIDERS
// ============================================================================

export async function handleFetchRealIntegrationItems(body: {
  tenantId: string
  provider: RealConnectorProvider
}): Promise<{ ok: boolean; items: ExternalTaskItem[]; error?: string }> {
  if (!isValidUuid(body.tenantId)) {
    return { ok: false, items: [], error: 'Invalid workspace ID.' }
  }
  const connector = await prisma.ecosystemConnector.findUnique({
    where: {
      tenantId_provider: {
        tenantId: body.tenantId,
        provider: body.provider,
      },
    },
  })
  if (!connector || connector.status !== 'connected') {
    return { ok: false, items: [], error: `${body.provider} is not connected.` }
  }
  const rawConfig = (connector.syncConfig ?? {}) as Record<string, unknown>
  const creds = decryptCredentials(rawConfig.encryptedCredentials)
  if (!creds) {
    return { ok: false, items: [], error: 'Stored credentials could not be decrypted. Please reconnect.' }
  }

  let items: ExternalTaskItem[] = []

  switch (body.provider) {
    case 'github': {
      const res = await fetchJsonWithTimeout(
        'https://api.github.com/issues?filter=all&state=open&per_page=25',
        {
          headers: {
            Authorization: `Bearer ${creds.token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'TikTrack-App',
          },
        }
      )
      if (!res.ok) return { ok: false, items: [], error: `GitHub API error (HTTP ${res.status}).` }
      const rows = Array.isArray(res.data) ? res.data : []
      items = rows.map((row: Record<string, unknown>) => {
        const repo = (row.repository as { full_name?: string } | undefined)?.full_name || 'GitHub'
        return {
          id: String(row.id),
          provider: 'github',
          externalKey: `GH-${String(row.number ?? row.id)}`,
          title: String(row.title || 'Untitled Issue'),
          status: String(row.state || 'open'),
          estimateMinutes: 120,
          priority: 'medium',
          url: typeof row.html_url === 'string' ? row.html_url : undefined,
          projectOrRepo: repo,
        }
      })
      break
    }

    case 'gitlab': {
      const baseUrl = normalizeHttpUrl(creds.baseUrl || 'https://gitlab.com')
      const res = await fetchJsonWithTimeout(
        `${baseUrl}/api/v4/issues?scope=all&state=opened&per_page=25`,
        { headers: { 'PRIVATE-TOKEN': creds.token } }
      )
      if (!res.ok) return { ok: false, items: [], error: `GitLab API error (HTTP ${res.status}).` }
      const rows = Array.isArray(res.data) ? res.data : []
      items = rows.map((row: Record<string, unknown>) => {
        const timeStats = row.time_stats as { time_estimate?: number } | undefined
        return {
          id: String(row.id),
          provider: 'gitlab',
          externalKey: `GL-${String(row.iid ?? row.id)}`,
          title: String(row.title || 'Untitled Issue'),
          status: String(row.state || 'opened'),
          estimateMinutes:
            timeStats?.time_estimate && timeStats.time_estimate > 0
              ? Math.round(timeStats.time_estimate / 60)
              : 120,
          priority: 'medium',
          url: typeof row.web_url === 'string' ? row.web_url : undefined,
          projectOrRepo: String(row.references && (row.references as { full?: string }).full ? (row.references as { full?: string }).full : 'GitLab'),
        }
      })
      break
    }

    case 'bitbucket': {
      const token = creds.apiToken || creds.appPassword || ''
      const basic = Buffer.from(`${creds.username}:${token}`).toString('base64')
      const res = await fetchJsonWithTimeout(
        `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(creds.workspace)}?pagelen=15`,
        { headers: { Authorization: `Basic ${basic}` } }
      )
      if (!res.ok) return { ok: false, items: [], error: `Bitbucket API error (HTTP ${res.status}).` }
      const values = ((res.data as { values?: unknown[] })?.values ?? []) as Record<string, unknown>[]
      items = values.map((repo) => ({
        id: String(repo.uuid || repo.slug),
        provider: 'bitbucket',
        externalKey: `BB-${String(repo.slug || 'repo').slice(0, 12).toUpperCase()}`,
        title: `Repo Work: ${String(repo.name || repo.slug)}`,
        status: 'active',
        estimateMinutes: 120,
        priority: 'medium',
        url: (repo.links as { html?: { href?: string } } | undefined)?.html?.href,
        projectOrRepo: String(repo.full_name || creds.workspace),
      }))
      break
    }

    case 'jira': {
      const domain = normalizeHttpUrl(creds.domain)
      const basic = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64')
      const res = await fetchJsonWithTimeout(`${domain}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jql: 'statusCategory != Done ORDER BY updated DESC',
          maxResults: 25,
          fields: ['summary', 'status', 'priority', 'timeoriginalestimate', 'project'],
        }),
      })
      if (!res.ok) return { ok: false, items: [], error: `Jira search failed (HTTP ${res.status}).` }
      const issues = ((res.data as { issues?: unknown[] })?.issues ?? []) as Record<string, unknown>[]
      items = issues.map((issue) => {
        const fields = (issue.fields ?? {}) as Record<string, unknown>
        const sec = Number(fields.timeoriginalestimate ?? 0)
        return {
          id: String(issue.id),
          provider: 'jira',
          externalKey: String(issue.key || issue.id),
          title: String(fields.summary || 'Untitled Jira Issue'),
          status: String((fields.status as { name?: string } | undefined)?.name || 'Open'),
          estimateMinutes: sec > 0 ? Math.round(sec / 60) : 120,
          priority: mapPriority((fields.priority as { name?: string } | undefined)?.name),
          url: `${domain}/browse/${String(issue.key || '')}`,
          projectOrRepo: String((fields.project as { name?: string } | undefined)?.name || 'Jira'),
        }
      })
      break
    }

    case 'clickup': {
      const teamsRes = await fetchJsonWithTimeout('https://api.clickup.com/api/v2/team', {
        headers: { Authorization: creds.apiToken },
      })
      if (!teamsRes.ok) {
        return { ok: false, items: [], error: `ClickUp teams API error (HTTP ${teamsRes.status}).` }
      }
      const teams = ((teamsRes.data as { teams?: Array<{ id: string; name: string }> })?.teams ?? [])
      const firstTeam = teams[0]
      if (!firstTeam) return { ok: true, items: [] }

      const tasksRes = await fetchJsonWithTimeout(
        `https://api.clickup.com/api/v2/team/${encodeURIComponent(firstTeam.id)}/task?page=0&include_closed=false`,
        { headers: { Authorization: creds.apiToken } }
      )
      if (!tasksRes.ok) {
        return { ok: false, items: [], error: `ClickUp tasks API error (HTTP ${tasksRes.status}).` }
      }
      const tasks = ((tasksRes.data as { tasks?: unknown[] })?.tasks ?? []) as Record<string, unknown>[]
      items = tasks.slice(0, 25).map((t) => {
        const ms = Number(t.time_estimate ?? 0)
        return {
          id: String(t.id),
          provider: 'clickup',
          externalKey: String(t.custom_id || `CU-${String(t.id).slice(0, 6).toUpperCase()}`),
          title: String(t.name || 'Untitled ClickUp Task'),
          status: String((t.status as { status?: string } | undefined)?.status || 'open'),
          estimateMinutes: ms > 0 ? Math.round(ms / 60000) : 120,
          priority: mapPriority((t.priority as { priority?: string } | undefined)?.priority),
          url: typeof t.url === 'string' ? t.url : undefined,
          projectOrRepo: String((t.list as { name?: string } | undefined)?.name || firstTeam.name),
        }
      })
      break
    }

    case 'linear': {
      const res = await fetchJsonWithTimeout('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: creds.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{
            issues(first: 25, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
              nodes { id identifier title estimate priority url state { name } team { name } }
            }
          }`,
        }),
      })
      const gql = res.data as {
        data?: { issues?: { nodes?: Array<Record<string, unknown>> } }
      }
      if (!res.ok || !gql?.data?.issues) {
        return { ok: false, items: [], error: `Linear API error (HTTP ${res.status}).` }
      }
      items = (gql.data.issues.nodes ?? []).map((n) => ({
        id: String(n.id),
        provider: 'linear',
        externalKey: String(n.identifier || n.id),
        title: String(n.title || 'Untitled Issue'),
        status: String((n.state as { name?: string } | undefined)?.name || 'Open'),
        estimateMinutes: Number(n.estimate) > 0 ? Number(n.estimate) * 60 : 120,
        priority: mapPriority(n.priority),
        url: typeof n.url === 'string' ? n.url : undefined,
        projectOrRepo: String((n.team as { name?: string } | undefined)?.name || 'Linear'),
      }))
      break
    }

    case 'trello': {
      const res = await fetchJsonWithTimeout(
        `https://api.trello.com/1/members/me/cards?filter=open&key=${encodeURIComponent(creds.apiKey)}&token=${encodeURIComponent(creds.token)}`
      )
      if (!res.ok) return { ok: false, items: [], error: `Trello API error (HTTP ${res.status}).` }
      const cards = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : []
      items = cards.slice(0, 25).map((c) => ({
        id: String(c.id),
        provider: 'trello',
        externalKey: `TR-${String(c.idShort || String(c.id).slice(0, 5))}`,
        title: String(c.name || 'Untitled Card'),
        status: 'open',
        estimateMinutes: 90,
        priority: 'medium',
        url: typeof c.shortUrl === 'string' ? c.shortUrl : undefined,
        projectOrRepo: 'Trello Board',
      }))
      break
    }

    case 'asana': {
      const workspaceGid = String(rawConfig.workspaceGid || '')
      const url = workspaceGid
        ? `https://app.asana.com/api/1.0/tasks?assignee=me&workspace=${encodeURIComponent(workspaceGid)}&completed_since=now&opt_fields=name,permalink_url&limit=25`
        : 'https://app.asana.com/api/1.0/users/me/user_task_list'
      const res = await fetchJsonWithTimeout(url, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      })
      if (!res.ok) return { ok: false, items: [], error: `Asana API error (HTTP ${res.status}).` }
      const rows = ((res.data as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[]
      items = (Array.isArray(rows) ? rows : []).map((t) => ({
        id: String(t.gid),
        provider: 'asana',
        externalKey: `AS-${String(t.gid).slice(-5)}`,
        title: String(t.name || 'Untitled Asana Task'),
        status: 'open',
        estimateMinutes: 120,
        priority: 'medium',
        url: typeof t.permalink_url === 'string' ? t.permalink_url : undefined,
        projectOrRepo: String(rawConfig.workspaceName || 'Asana'),
      }))
      break
    }

    case 'notion': {
      const dbId = (creds.databaseId || '').trim()
      const endpoint = dbId
        ? `https://api.notion.com/v1/databases/${encodeURIComponent(dbId)}/query`
        : 'https://api.notion.com/v1/search'
      const payload = dbId
        ? { page_size: 25 }
        : { filter: { value: 'page', property: 'object' }, page_size: 25 }
      const res = await fetchJsonWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.apiToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return { ok: false, items: [], error: `Notion API error (HTTP ${res.status}).` }
      const results = ((res.data as { results?: unknown[] })?.results ?? []) as Record<string, unknown>[]
      items = results.map((page, idx) => {
        const props = (page.properties ?? {}) as Record<
          string,
          { type?: string; title?: Array<{ plain_text?: string }> }
        >
        const titleProp = Object.values(props).find((p) => p?.type === 'title')
        const title =
          titleProp?.title?.map((t) => t.plain_text || '').join('').trim() ||
          `Notion Page ${idx + 1}`
        return {
          id: String(page.id),
          provider: 'notion',
          externalKey: `NT-${String(page.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`,
          title,
          status: 'open',
          estimateMinutes: 120,
          priority: 'medium',
          url: typeof page.url === 'string' ? page.url : undefined,
          projectOrRepo: 'Notion',
        }
      })
      break
    }

    case 'azure_devops': {
      const basic = Buffer.from(`:${creds.pat}`).toString('base64')
      const wiqlRes = await fetchJsonWithTimeout(
        `https://dev.azure.com/${encodeURIComponent(creds.organization)}/${encodeURIComponent(creds.project)}/_apis/wit/wiql?api-version=7.1`,
        {
          method: 'POST',
          headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query:
              "SELECT [System.Id] FROM WorkItems WHERE [System.State] <> 'Done' AND [System.State] <> 'Closed' ORDER BY [System.ChangedDate] DESC",
          }),
        }
      )
      if (!wiqlRes.ok) {
        return { ok: false, items: [], error: `Azure DevOps query failed (HTTP ${wiqlRes.status}).` }
      }
      const refs = ((wiqlRes.data as { workItems?: Array<{ id: number }> })?.workItems ?? []).slice(
        0,
        25
      )
      if (refs.length === 0) return { ok: true, items: [] }
      const ids = refs.map((r) => r.id).join(',')
      const detailRes = await fetchJsonWithTimeout(
        `https://dev.azure.com/${encodeURIComponent(creds.organization)}/_apis/wit/workitems?ids=${ids}&api-version=7.1`,
        { headers: { Authorization: `Basic ${basic}` } }
      )
      const rows = ((detailRes.data as { value?: unknown[] })?.value ?? []) as Record<string, unknown>[]
      items = rows.map((w) => {
        const fields = (w.fields ?? {}) as Record<string, unknown>
        const remHrs = Number(fields['Microsoft.VSTS.Scheduling.RemainingWork'] ?? 0)
        return {
          id: String(w.id),
          provider: 'azure_devops',
          externalKey: `ADO-${String(w.id)}`,
          title: String(fields['System.Title'] || 'Untitled Work Item'),
          status: String(fields['System.State'] || 'Active'),
          estimateMinutes: remHrs > 0 ? Math.round(remHrs * 60) : 120,
          priority: mapPriority(fields['Microsoft.VSTS.Common.Priority']),
          projectOrRepo: creds.project,
        }
      })
      break
    }

    default:
      return { ok: false, items: [], error: `Live item import is not applicable for ${body.provider}.` }
  }

  void prisma.ecosystemConnector
    .update({
      where: { id: connector.id },
      data: { lastSyncedAt: new Date() },
    })
    .catch(() => { })

  return { ok: true, items }
}

// ============================================================================
// 3. REAL HTTP OUTBOUND WEBHOOKS & CHAT ALERTS (SLACK / DISCORD / MS TEAMS)
// ============================================================================

export async function sendRealChatAlert(input: {
  provider: 'slack' | 'discord' | 'ms_teams'
  webhookUrl: string
  title: string
  message: string
  fields?: Array<{ label: string; value: string }>
}): Promise<{ ok: boolean; httpStatus: number; responseSnippet: string }> {
  let body: unknown
  if (input.provider === 'slack') {
    body = {
      text: `${input.title} - ${input.message}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: input.title } },
        { type: 'section', text: { type: 'mrkdwn', text: input.message } },
        ...(input.fields?.length
          ? [
            {
              type: 'section',
              fields: input.fields.map((f) => ({
                type: 'mrkdwn',
                text: `*${f.label}:*\n${f.value}`,
              })),
            },
          ]
          : []),
      ],
    }
  } else if (input.provider === 'discord') {
    body = {
      embeds: [
        {
          title: input.title,
          description: input.message,
          color: 0x702fe3,
          fields: (input.fields ?? []).map((f) => ({
            name: f.label,
            value: f.value,
            inline: true,
          })),
          timestamp: new Date().toISOString(),
        },
      ],
    }
  } else {
    // Microsoft Teams Workflows Adaptive Card payload (official post-2026 Workflows format)
    body = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              {
                type: 'TextBlock',
                text: input.title,
                weight: 'Bolder',
                size: 'Medium',
                color: 'Accent',
              },
              {
                type: 'TextBlock',
                text: input.message,
                wrap: true,
              },
              ...(input.fields?.length
                ? [
                  {
                    type: 'FactSet',
                    facts: input.fields.map((f) => ({
                      title: f.label,
                      value: f.value,
                    })),
                  },
                ]
                : []),
            ],
          },
        },
      ],
    }
  }

  const res = await fetchJsonWithTimeout(
    input.webhookUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    8000
  )

  return {
    ok: res.ok,
    httpStatus: res.status,
    responseSnippet: res.text.slice(0, 240) || (res.ok ? 'OK' : 'Request failed'),
  }
}

export async function handleSendChatTestAlert(body: {
  tenantId: string
  provider: 'slack' | 'discord' | 'ms_teams'
  message?: string
}) {
  if (!isValidUuid(body.tenantId)) return { ok: false, error: 'Invalid workspace ID.' }
  const connector = await prisma.ecosystemConnector.findUnique({
    where: {
      tenantId_provider: {
        tenantId: body.tenantId,
        provider: body.provider,
      },
    },
  })
  if (!connector || connector.status !== 'connected') {
    return { ok: false, error: `${PROVIDER_META[body.provider].displayName} is not connected.` }
  }
  const rawConfig = (connector.syncConfig ?? {}) as Record<string, unknown>
  const creds = decryptCredentials(rawConfig.encryptedCredentials)
  if (!creds?.webhookUrl) {
    return { ok: false, error: 'Stored webhook URL missing. Please reconnect.' }
  }
  const res = await sendRealChatAlert({
    provider: body.provider,
    webhookUrl: creds.webhookUrl,
    title: 'TikTrack Test Alert',
    message:
      body.message?.trim() ||
      'This is a live test notification sent from your TikTrack workspace.',
    fields: [{ label: 'Sent At', value: new Date().toISOString() }],
  })
  return {
    ok: res.ok,
    httpStatus: res.httpStatus,
    message: res.ok
      ? `Live message delivered to ${PROVIDER_META[body.provider].displayName} (HTTP ${res.httpStatus}).`
      : `Delivery failed (HTTP ${res.httpStatus || 'network'}): ${res.responseSnippet}`,
  }
}

export async function handleDispatchRealOutboundWebhook(body: {
  tenantId: string
  endpointId: string
  eventType: string
  eventId?: string
  payload: Record<string, unknown>
  signingSecret?: string
}) {
  if (!isValidUuid(body.tenantId) || !isValidUuid(body.endpointId)) {
    return { ok: false, error: 'Invalid tenant or endpoint ID.' }
  }
  const endpoint = await prisma.outboundWebhookEndpoint.findUnique({
    where: { id: body.endpointId },
  })
  if (!endpoint || endpoint.tenantId !== body.tenantId) {
    return { ok: false, error: 'Webhook endpoint not found.' }
  }

  const eventId = isValidUuid(body.eventId) ? body.eventId : crypto.randomUUID()
  const rawBody = JSON.stringify(body.payload)
  const secretForHmac = body.signingSecret || endpoint.signingSecretPrefix
  const sig = crypto.createHmac('sha256', secretForHmac).update(rawBody, 'utf8').digest('hex')
  const signatureHeader = `sha256=${sig}`

  const httpRes = await fetchJsonWithTimeout(
    endpoint.targetUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TikTrack-Event': body.eventType,
        'X-TikTrack-Delivery': eventId,
        'X-TikTrack-Signature-256': signatureHeader,
      },
      body: rawBody,
    },
    8000
  )

  const deliveryStatus = httpRes.ok ? 'delivered' : 'failed'
  const snippet =
    httpRes.text.slice(0, 240) ||
    (httpRes.ok ? `HTTP ${httpRes.status} OK` : `HTTP ${httpRes.status || 'Network error'}`)

  const created = await prisma.outboundWebhookDelivery.create({
    data: {
      tenantId: body.tenantId,
      endpointId: endpoint.id,
      eventType: body.eventType,
      eventId,
      payload: body.payload as object,
      signatureHeader,
      deliveryStatus,
      httpStatus: httpRes.status || 0,
      attemptCount: 1,
      lastAttemptAt: new Date(),
      responseSnippet: snippet,
    },
  })

  return {
    ok: httpRes.ok,
    id: created.id,
    httpStatus: httpRes.status,
    deliveryStatus,
    signatureHeader,
    responseSnippet: snippet,
    message: httpRes.ok
      ? `Delivered ${body.eventType} to ${endpoint.targetUrl} (HTTP ${httpRes.status}).`
      : `Delivery to ${endpoint.targetUrl} failed (HTTP ${httpRes.status || 'network error'}): ${snippet}`,
  }
}
