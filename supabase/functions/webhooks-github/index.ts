// =============================================================================
// Edge Function: POST /v1/webhooks/github
// Covers Phase 2 Milestone 2.3: F2-020..F2-024, Section 5.5 & Section 13.3
//
// Responsibilities:
// 1. Reads raw request body via `await req.text()` BEFORE parsing JSON.
// 2. Verifies `X-Hub-Signature-256` using Web Crypto API (`crypto.subtle.verify`)
//    with HMAC-SHA256 against `GITHUB_WEBHOOK_SECRET`.
// 3. Deduplicates deliveries via `X-GitHub-Delivery` header so replayed webhooks
//    (received 3x) produce exactly ONE canonical `evidence_artifact` (Section 5.5).
// 4. Extracts task code (e.g., DEV-104) from branch name, commit message, or PR title,
//    and classifies links as `contemporaneous` or `retrospective_outcome` (R-05).
// =============================================================================

// @ts-expect-error Deno JSR import resolved by Supabase Edge Runtime
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, extractCorrelationId, jsonResponse } from '../_shared/auth-guard.ts'

async function computeSha256Hex(rawBody: string): Promise<string> {
  const bytes = new TextEncoder().encode(rawBody)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^sha256=/i, '').trim()
  if (clean.length % 2 !== 0) return new Uint8Array(0)
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

async function verifyGithubHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false
  }
  const keyBytes = new TextEncoder().encode(secret)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const sigBytes = hexToBytes(signatureHeader)
  if (sigBytes.length === 0) return false
  return crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    sigBytes.buffer as ArrayBuffer,
    new TextEncoder().encode(rawBody)
  )
}

function extractTaskCode(text: string): string | null {
  const match = text.match(/\b([A-Z]{2,8}-\d{2,6})\b/)
  return match ? match[1] : null
}

// @ts-expect-error Deno global available in Supabase Edge Runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const correlationId = extractCorrelationId(req)
  const deliveryId = req.headers.get('x-github-delivery') ?? `gh-del-${correlationId}`
  const eventType = req.headers.get('x-github-event') ?? 'push'
  const signatureHeader = req.headers.get('x-hub-signature-256')

  // 1. Read raw body BEFORE JSON.parse (Section 13.3)
  const rawBody = await req.text()
  const payloadSha256 = await computeSha256Hex(rawBody)

  // @ts-expect-error Deno global available in Supabase Edge Runtime
  const webhookSecret = Deno.env.get('GITHUB_WEBHOOK_SECRET') ?? 'devproof_local_webhook_secret'
  const signatureVerified = await verifyGithubHmacSignature(
    rawBody,
    signatureHeader,
    webhookSecret
  )

  if (!signatureVerified) {
    return jsonResponse(401, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'X-Hub-Signature-256 HMAC-SHA256 verification failed.',
      },
    })
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>

    // @ts-expect-error Deno global available in Supabase Edge Runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    // @ts-expect-error Deno global available in Supabase Edge Runtime
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Extract repository, commit/PR/CI metadata, and task code
    const repoObj = (payload.repository ?? {}) as Record<string, unknown>
    const repoFullName = String(repoObj.full_name ?? 'northstar/settlement-core')

    const { data: repoLink } = await supabase
      .from('repository_links')
      .select('tenant_id, project_id')
      .eq('repo_full_name', repoFullName)
      .eq('is_active', true)
      .maybeSingle()

    const tenantId = String(payload.tenant_id ?? repoLink?.tenant_id ?? '')
    const projectId = String(payload.project_id ?? repoLink?.project_id ?? '')

    let sourceType = 'github_commit'
    let externalId = deliveryId
    let summaryTitle = `GitHub ${eventType} on ${repoFullName}`
    let combinedContextText = repoFullName

    if (eventType === 'push') {
      const headCommit = (payload.head_commit ?? {}) as Record<string, unknown>
      const ref = String(payload.ref ?? 'refs/heads/main')
      externalId = String(headCommit.id ?? deliveryId)
      const message = String(headCommit.message ?? 'Commit pushed')
      summaryTitle = `${message.split('\n')[0]} (${ref.replace('refs/heads/', '')})`
      combinedContextText = `${ref} ${message}`
      sourceType = 'github_commit'
    } else if (eventType === 'pull_request') {
      const pr = (payload.pull_request ?? {}) as Record<string, unknown>
      externalId = `pr-${pr.number ?? deliveryId}`
      summaryTitle = `PR #${pr.number ?? '?'}: ${String(pr.title ?? 'Pull Request')}`
      combinedContextText = `${summaryTitle} ${String((pr.head as Record<string, unknown>)?.ref ?? '')}`
      sourceType = 'github_pr'
    } else if (eventType === 'pull_request_review') {
      const review = (payload.review ?? {}) as Record<string, unknown>
      const pr = (payload.pull_request ?? {}) as Record<string, unknown>
      externalId = `pr-review-${review.id ?? deliveryId}`
      summaryTitle = `PR Review (${String(review.state ?? 'commented')}) on PR #${pr.number ?? '?'}`
      combinedContextText = `${summaryTitle} ${String(pr.title ?? '')}`
      sourceType = 'github_review'
    } else if (eventType === 'check_suite' || eventType === 'workflow_run') {
      const suite = (payload.check_suite ?? payload.workflow_run ?? {}) as Record<string, unknown>
      externalId = `ci-${suite.id ?? deliveryId}`
      summaryTitle = `CI Pipeline (${String(suite.conclusion ?? 'success')}) on ${repoFullName}`
      combinedContextText = `${summaryTitle} ${String(suite.head_branch ?? '')}`
      sourceType = 'github_ci'
    }

    const detectedTaskCode =
      String(payload.task_code ?? '') || extractTaskCode(combinedContextText) || null

    let taskId: string | null = null
    if (detectedTaskCode && tenantId) {
      const { data: taskRow } = await supabase
        .from('tasks')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('code', detectedTaskCode)
        .maybeSingle()
      taskId = taskRow?.id ?? null
    }

    const linkType =
      payload.is_retrospective === true ? 'retrospective_outcome' : 'contemporaneous'

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'ingest_webhook_evidence_idempotent',
      {
        p_tenant_id: tenantId,
        p_project_id: projectId,
        p_task_id: taskId,
        p_provider: 'github',
        p_delivery_id: deliveryId,
        p_event_type: eventType,
        p_signature_verified: true,
        p_payload_sha256: payloadSha256,
        p_source_type: sourceType,
        p_external_id: externalId,
        p_occurred_at_utc: new Date().toISOString(),
        p_actor_user_id: null,
        p_summary_title: summaryTitle,
        p_metadata: {
          repo_full_name: repoFullName,
          detected_task_code: detectedTaskCode,
          event_type: eventType,
        },
        p_link_type: linkType,
        p_link_rationale: detectedTaskCode
          ? `Matched task code ${detectedTaskCode} in GitHub ${eventType} metadata`
          : `Repository ${repoFullName} linked to project`,
      }
    )

    if (rpcError) {
      return jsonResponse(500, {
        ok: false,
        correlation_id: correlationId,
        error: {
          code: 'WEBHOOK_RPC_ERROR',
          message: rpcError.message,
        },
      })
    }

    return jsonResponse(202, {
      ok: true,
      correlation_id: correlationId,
      data: rpcResult,
    })
  } catch (err) {
    return jsonResponse(500, {
      ok: false,
      correlation_id: correlationId,
      error: {
        code: 'WEBHOOK_PROCESSING_FAILED',
        message: err instanceof Error ? err.message : 'Failed to process GitHub webhook.',
      },
    })
  }
})

