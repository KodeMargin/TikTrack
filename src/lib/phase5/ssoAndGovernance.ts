import type {
  PolicyChangeRequestRecord,
  SsoProviderRecord,
  SsoProviderType,
} from '../../types/domain.types.ts'
import { sha256Hex } from '../phase4/publicApiAndWebhooks.ts'

const PROHIBITED_POLICY_KEYS = [
  'keystroke',
  'keystrokes',
  'clipboard',
  'raw_code',
  'source_code',
  'webcam',
  'microphone',
  'continuous_screenshot',
]

export async function generateScimBearerToken(
  prefix = 'dp_scim_'
): Promise<{
  plaintextToken: string
  tokenPrefix: string
  tokenHashSha256: string
}> {
  const randomBytes = new Uint8Array(18)
  crypto.getRandomValues(randomBytes)
  const secretBody = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const plaintextToken = `${prefix}${secretBody}`
  const tokenPrefix = plaintextToken.slice(0, 14)
  const tokenHashSha256 = await sha256Hex(plaintextToken)
  return { plaintextToken, tokenPrefix, tokenHashSha256 }
}

export function validateSsoProviderConfig(input: {
  providerType: SsoProviderType
  domain: string
  entityIdOrIssuer: string
  ssoUrl: string
  certificateFingerprint?: string
  clientId?: string
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const domain = input.domain.trim().toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    errors.push('Verified domain must be a valid hostname (e.g., acme.dev).')
  }
  if (!input.entityIdOrIssuer.trim().startsWith('https://')) {
    errors.push('Entity ID / OIDC Issuer URL must use HTTPS.')
  }
  if (!input.ssoUrl.trim().startsWith('https://')) {
    errors.push('SSO Endpoint URL must use HTTPS.')
  }
  if (input.providerType === 'saml' && !input.certificateFingerprint?.trim()) {
    errors.push('SAML 2.0 requires an IdP X.509 certificate SHA-256 fingerprint.')
  }
  if (input.providerType === 'oidc' && !input.clientId?.trim()) {
    errors.push('OIDC requires an Identity Provider Client ID.')
  }
  return { valid: errors.length === 0, errors }
}

export function buildSsoProviderSummary(provider: SsoProviderRecord): string {
  return `${provider.displayName} (${provider.providerType.toUpperCase()}) • ${provider.domain} • SCIM ${provider.scimEnabled ? 'ON' : 'OFF'}`
}

/**
 * F5-006: Two-person policy approval guard.
 * Any change expanding collection scope requires two distinct authorized admins
 * (e.g. tenant_owner + auditor) and never applies retroactively.
 */
export function evaluateTwoPersonPolicyApproval(input: {
  request: PolicyChangeRequestRecord
  secondApproverUserId: string
  secondApproverRole: string
  requestedEffectiveFrom?: string
}): {
  allowed: boolean
  reason?: string
  nonRetroactiveEffectiveFrom: string
} {
  const { request, secondApproverUserId, secondApproverRole, requestedEffectiveFrom } = input

  if (request.status !== 'pending_second_approval') {
    return {
      allowed: false,
      reason: `Policy change request is already '${request.status}'.`,
      nonRetroactiveEffectiveFrom: request.effectiveFrom,
    }
  }

  if (!['tenant_owner', 'auditor'].includes(secondApproverRole)) {
    return {
      allowed: false,
      reason: 'Second approver must hold tenant_owner or auditor governance role.',
      nonRetroactiveEffectiveFrom: request.effectiveFrom,
    }
  }

  if (
    secondApproverUserId === request.proposedBy ||
    secondApproverUserId === request.approvedByFirst
  ) {
    return {
      allowed: false,
      reason:
        'Two-person control violation (F5-006): a single administrator cannot supply both approvals.',
      nonRetroactiveEffectiveFrom: request.effectiveFrom,
    }
  }

  const diffKeys = Object.keys(request.scopeDiff).map((k) => k.toLowerCase())
  for (const key of diffKeys) {
    if (PROHIBITED_POLICY_KEYS.some((bad) => key.includes(bad)) && request.scopeDiff[key] === true) {
      return {
        allowed: false,
        reason: `Policy change violates DevProof hard privacy boundary: '${key}' cannot be enabled.`,
        nonRetroactiveEffectiveFrom: request.effectiveFrom,
      }
    }
  }

  const nowMs = Date.now()
  const candidateMs = requestedEffectiveFrom ? new Date(requestedEffectiveFrom).getTime() : nowMs
  const nonRetroactiveEffectiveFrom =
    Number.isFinite(candidateMs) && candidateMs >= nowMs
      ? new Date(candidateMs).toISOString()
      : new Date(nowMs).toISOString()

  return {
    allowed: true,
    nonRetroactiveEffectiveFrom,
  }
}
