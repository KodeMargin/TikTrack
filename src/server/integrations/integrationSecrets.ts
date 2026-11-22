import crypto from 'node:crypto'

const ENCRYPTED_PREFIX = 'enc:v1:'

function deriveEncryptionKey(): Buffer {
  const seed =
    process.env.INTEGRATION_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DATABASE_URL ||
    'tiktrack-local-dev-integration-key-change-in-prod'
  return crypto.createHash('sha256').update(seed, 'utf8').digest()
}

export function encryptCredentials(payload: Record<string, string>): string {
  const key = deriveEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const plaintext = JSON.stringify(payload)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const packed = Buffer.concat([iv, tag, encrypted]).toString('base64')
  return `${ENCRYPTED_PREFIX}${packed}`
}

export function decryptCredentials(value: unknown): Record<string, string> | null {
  if (typeof value !== 'string' || !value.startsWith(ENCRYPTED_PREFIX)) return null
  try {
    const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64')
    if (raw.length < 28) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const key = deriveEncryptionKey()
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8'
    )
    const parsed = JSON.parse(decrypted) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function maskSecretValue(secret: string): string {
  const trimmed = secret.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}••••`
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

const SENSITIVE_KEY_PATTERN = /(encrypted|secret|token|password|apikey|api_key|pat|credentials)/i

export function sanitizeSyncConfigForClient(
  raw: unknown
): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k) && k !== 'maskedCredential') continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    }
  }
  return out
}
