import type {
  ApiKeyRecord,
  OutboundWebhookDeliveryRecord,
  OutboundWebhookEndpointRecord,
  OutboundWebhookEventType,
  PublicApiScope,
} from '../../types/domain.types.ts'

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function signHmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyHmacSha256Hex(
  secret: string,
  message: string,
  expectedHex: string
): Promise<boolean> {
  const computed = await signHmacSha256Hex(secret, message)
  if (computed.length !== expectedHex.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHex.charCodeAt(i)
  }
  return diff === 0
}

/**
 * F4-006: Create a scoped `dp_live_...` API key returning the plaintext secret
 * once along with the persisted record containing only `keyHashSha256`.
 */
export async function generateScopedApiKey(input: {
  tenantId: string
  name: string
  scopes: PublicApiScope[]
  rateLimitPerMin: number
}): Promise<{ plaintextKey: string; record: ApiKeyRecord }> {
  const randomBytes = new Uint8Array(18)
  crypto.getRandomValues(randomBytes)
  const token = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const plaintextKey = `dp_live_${token}`
  const keyPrefix = plaintextKey.slice(0, 14)
  const keyHashSha256 = await sha256Hex(plaintextKey)

  return {
    plaintextKey,
    record: {
      id: `key-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: input.tenantId,
      name: input.name.trim(),
      keyPrefix,
      keyHashSha256,
      scopes: input.scopes,
      rateLimitPerMin: Math.max(10, input.rateLimitPerMin),
      createdAt: new Date().toISOString(),
    },
  }
}

/**
 * Validates an incoming Public API request against stored SHA-256 key hashes
 * and required scope.
 */
export async function authorizePublicApiRequest(input: {
  authorizationHeader: string | null
  requiredScope: PublicApiScope
  keys: ApiKeyRecord[]
}): Promise<
  | { authorized: true; apiKey: ApiKeyRecord }
  | { authorized: false; statusCode: 401 | 403; errorCode: string; message: string }
> {
  if (!input.authorizationHeader || !input.authorizationHeader.startsWith('Bearer dp_live_')) {
    return {
      authorized: false,
      statusCode: 401,
      errorCode: 'INVALID_API_KEY_FORMAT',
      message: 'Expected Authorization: Bearer dp_live_... API key.',
    }
  }

  const rawKey = input.authorizationHeader.slice('Bearer '.length).trim()
  const hash = await sha256Hex(rawKey)
  const match = input.keys.find((k) => k.keyHashSha256 === hash)

  if (!match || match.revokedAt) {
    return {
      authorized: false,
      statusCode: 401,
      errorCode: 'API_KEY_INVALID_OR_REVOKED',
      message: 'API key is unknown or has been revoked.',
    }
  }

  if (match.expiresAt && new Date(match.expiresAt) <= new Date()) {
    return {
      authorized: false,
      statusCode: 401,
      errorCode: 'API_KEY_EXPIRED',
      message: 'API key has expired.',
    }
  }

  if (!match.scopes.includes(input.requiredScope)) {
    return {
      authorized: false,
      statusCode: 403,
      errorCode: 'INSUFFICIENT_API_SCOPE',
      message: `API key "${match.name}" lacks required scope "${input.requiredScope}".`,
    }
  }

  return { authorized: true, apiKey: match }
}

/**
 * F4-007: Sign and construct an outbound webhook delivery record using
 * `X-DevProof-Signature-256: t=<unix>,v1=<hmac_sha256>`.
 */
export async function createSignedOutboundWebhookDelivery(input: {
  tenantId: string
  endpoint: OutboundWebhookEndpointRecord
  signingSecret: string
  eventType: OutboundWebhookEventType
  payloadData: Record<string, unknown>
  timestampUnix?: number
}): Promise<{
  envelope: Record<string, unknown>
  signatureHeader: string
  delivery: OutboundWebhookDeliveryRecord
}> {
  const eventId = crypto.randomUUID()
  const ts = input.timestampUnix ?? Math.floor(Date.now() / 1000)
  const envelope = {
    event_id: eventId,
    event_type: input.eventType,
    tenant_id: input.tenantId,
    occurred_at_utc: new Date(ts * 1000).toISOString(),
    data: input.payloadData,
  }
  const serialized = JSON.stringify(envelope)
  const hmacHex = await signHmacSha256Hex(input.signingSecret, `${ts}.${serialized}`)
  const signatureHeader = `t=${ts},v1=${hmacHex}`

  return {
    envelope,
    signatureHeader,
    delivery: {
      id: `whdel-${crypto.randomUUID().slice(0, 8)}`,
      tenantId: input.tenantId,
      endpointId: input.endpoint.id,
      eventType: input.eventType,
      eventId,
      signatureHeader,
      deliveryStatus: 'delivered',
      httpStatus: 202,
      attemptCount: 1,
      responseSnippet: `Signed with ${input.endpoint.signingSecretPrefix}... -> 202 Accepted`,
      createdAt: new Date().toISOString(),
    },
  }
}

export async function verifyOutboundWebhookSignature(input: {
  signatureHeader: string
  rawBody: string
  signingSecret: string
}): Promise<boolean> {
  const parts = input.signatureHeader.split(',').map((p) => p.trim())
  const t = parts.find((p) => p.startsWith('t='))?.slice(2)
  const v1 = parts.find((p) => p.startsWith('v1='))?.slice(3)
  if (!t || !v1) return false
  return verifyHmacSha256Hex(input.signingSecret, `${t}.${input.rawBody}`, v1)
}

