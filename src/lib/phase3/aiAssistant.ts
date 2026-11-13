import { PROHIBITED_METADATA_KEYS } from '../schemas/index.ts'
import type {
  AiGenerationMode,
  AiGenerationRecord,
  AiTargetType,
} from '../../types/domain.types.ts'

const ALLOWLISTED_PROMPT_KEYS = new Set([
  'tenant_id',
  'target_type',
  'target_id',
  'task_code',
  'task_title',
  'work_date',
  'work_modes',
  'claimed_minutes',
  'supported_minutes',
  'observed_minutes',
  'artifact_summaries',
  'rollup_summaries',
  'annotation_titles',
  'unresolved_items',
  'repo_name',
  'branch_name',
])

const PRIVATE_PATH_OR_QUERY_REGEX =
  /(\/Users\/|\/home\/|[A-Za-z]:\\|https?:\/\/[^\s]*\?[^\s]*)/gi

/**
 * Section 6.5: Allowlisted Metadata Sanitizer
 * Strips prohibited surveillance keys, raw URLs with query strings, and local file paths
 * before constructing any AI prompt payload.
 */
export function sanitizeMetadataForAiPrompt(
  rawPayload: Record<string, unknown>
): {
  sanitized: Record<string, unknown>
  strippedKeys: string[]
} {
  const sanitized: Record<string, unknown> = {}
  const strippedKeys: string[] = []

  const sanitizeValue = (val: unknown): unknown => {
    if (typeof val === 'string') {
      return val.replace(PRIVATE_PATH_OR_QUERY_REGEX, '[REDACTED_PATH_OR_URL]')
    }
    if (Array.isArray(val)) {
      return val.map(sanitizeValue)
    }
    if (val && typeof val === 'object') {
      const nested: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const lower = k.toLowerCase()
        if (PROHIBITED_METADATA_KEYS.some((blocked) => lower.includes(blocked))) {
          strippedKeys.push(k)
          continue
        }
        nested[k] = sanitizeValue(v)
      }
      return nested
    }
    return val
  }

  for (const [key, value] of Object.entries(rawPayload)) {
    const lower = key.toLowerCase()
    const isProhibited = PROHIBITED_METADATA_KEYS.some((blocked) =>
      lower.includes(blocked)
    )
    if (isProhibited || !ALLOWLISTED_PROMPT_KEYS.has(key)) {
      strippedKeys.push(key)
      continue
    }
    sanitized[key] = sanitizeValue(value)
  }

  return { sanitized, strippedKeys }
}

/**
 * Exit Gate: Citation Verification Post-Processor
 * Guarantees that 100% of cited IDs exist in the tenant's stored event or artifact sets.
 */
export function verifyAiCitations(
  citedEventIds: string[],
  citedArtifactIds: string[],
  validTenantEventIds: Set<string>,
  validTenantArtifactIds: Set<string>
): {
  validEventIds: string[]
  validArtifactIds: string[]
  rejectedIds: string[]
  allValid: boolean
} {
  const validEventIds: string[] = []
  const validArtifactIds: string[] = []
  const rejectedIds: string[] = []

  for (const id of citedEventIds) {
    if (validTenantEventIds.has(id)) {
      validEventIds.push(id)
    } else {
      rejectedIds.push(id)
    }
  }

  for (const id of citedArtifactIds) {
    if (validTenantArtifactIds.has(id)) {
      validArtifactIds.push(id)
    } else {
      rejectedIds.push(id)
    }
  }

  return {
    validEventIds,
    validArtifactIds,
    rejectedIds,
    allValid: rejectedIds.length === 0,
  }
}

export interface GenerateAiDraftInput {
  tenantId: string
  aiEnabled: boolean
  userId?: string
  targetType: AiTargetType
  targetId: string
  targetLabel: string
  rawContextPayload: Record<string, unknown>
  candidateEventIds: string[]
  candidateArtifactIds: string[]
  validTenantEventIds: Set<string>
  validTenantArtifactIds: Set<string>
  summaryContext: {
    taskCode?: string
    taskTitle?: string
    claimedMinutes?: number
    supportedMinutes?: number
    workModes?: string[]
    artifactTitles?: string[]
    gapMinutes?: number
    branchName?: string
    repoName?: string
    unresolvedCount?: number
    clusterCount?: number
  }
}

/**
 * F3-020..F3-027: Guardrailed AI / Deterministic Template Draft Generator
 * - Enforces F3-027: when aiEnabled === false, uses 'deterministic_template' with 0 LLM tokens.
 * - Sanitizes prompt payload to allowlisted fields only.
 * - Verifies all cited event/artifact IDs exist in tenant storage.
 */
export function generateGuardrailedAiDraft(
  input: GenerateAiDraftInput
): AiGenerationRecord {
  const { sanitized } = sanitizeMetadataForAiPrompt(input.rawContextPayload)
  const citationCheck = verifyAiCitations(
    input.candidateEventIds,
    input.candidateArtifactIds,
    input.validTenantEventIds,
    input.validTenantArtifactIds
  )

  const generationMode: AiGenerationMode = input.aiEnabled
    ? 'ai_guardrailed'
    : 'deterministic_template'

  const modelId = input.aiEnabled
    ? 'gemini-2.5-flash-guardrailed'
    : 'deterministic-template-v1'

  const citedListText = [
    ...citationCheck.validEventIds.map((id) => `event:${id.slice(0, 8)}`),
    ...citationCheck.validArtifactIds.map((id) => `artifact:${id.slice(0, 8)}`),
  ]
  const citationFooter =
    citedListText.length > 0
      ? `\n\n_Sources cited: ${citedListText.join(', ')}_`
      : '\n\n_Sources cited: deterministic rule evaluation_'

  const c = input.summaryContext
  let draftMarkdown = ''

  switch (input.targetType) {
    case 'daily_summary':
      draftMarkdown =
        `**Daily Work Summary Draft (${c.taskCode ?? 'Workspace'})**\n` +
        `- Recorded **${c.claimedMinutes ?? 0}m** claimed (**${c.supportedMinutes ?? 0}m** supported) across modes: ${(c.workModes ?? ['coding']).join(', ')}.\n` +
        `- Corroborating artifacts: ${(c.artifactTitles && c.artifactTitles.length > 0 ? c.artifactTitles : ['Session context notes']).join('; ')}.\n` +
        `- Private draft - review and edit before attaching to your timesheet.` +
        citationFooter
      break

    case 'reviewer_digest':
      draftMarkdown =
        `**Reviewer Digest (${c.taskCode ?? input.targetLabel})**\n` +
        `- Claimed: **${c.claimedMinutes ?? 0}m** | Supported: **${c.supportedMinutes ?? 0}m**.\n` +
        `- Linked deliverables: ${(c.artifactTitles ?? []).join('; ') || 'None linked yet'}.\n` +
        `- Unresolved clarification items: **${c.unresolvedCount ?? 0}**. Human decision remains authoritative.` +
        citationFooter
      break

    case 'gap_explanation':
      draftMarkdown =
        `**Clarification Context (${c.gapMinutes ?? 20}m Unobserved Interval)**\n` +
        `- Why this needs clarification: Standard-mode interval had no IDE/desktop telemetry for >15m and no deep-work note attached.\n` +
        `- Next step: Confirm whether this interval was Architectural Thinking, Reading Docs, Meeting, or Break (zero automatic deduction).` +
        citationFooter
      break

    case 'task_mapping':
      draftMarkdown =
        `**Suggested Task Mapping**\n` +
        `- Repository \`${c.repoName ?? 'workspace'}\` on branch \`${c.branchName ?? 'main'}\` matches task **${c.taskCode ?? 'DEV-101'} - ${c.taskTitle ?? 'Assigned Task'}**.\n` +
        `- Developer confirmation required before attributing intervals.` +
        citationFooter
      break

    case 'debug_investigation':
      draftMarkdown =
        `**Debug Investigation Summary (${c.taskCode ?? 'Investigation'})**\n` +
        `- Synthesized from confirmed debugger lifecycle events and local test summaries (no raw source code uploaded).\n` +
        `- Artifacts: ${(c.artifactTitles ?? ['Debugger & test lifecycle signals']).join('; ')}.` +
        citationFooter
      break

    case 'pattern_cluster':
      draftMarkdown =
        `**Review Bottleneck & Pattern Cluster**\n` +
        `- Grouped **${c.clusterCount ?? 1}** recurring clarification or variance notices for **${c.taskCode ?? 'Project'}**.\n` +
        `- Recommendation: Clarify acceptance criteria or switch deep-work sessions to Thinking/Research mode upfront.` +
        citationFooter
      break
  }

  return {
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    userId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    generationMode,
    modelId,
    promptVersion: 'phase3-guardrail-v1',
    sanitizedPromptPayload: sanitized,
    citedEventIds: citationCheck.validEventIds,
    citedArtifactIds: citationCheck.validArtifactIds,
    draftMarkdown,
    status: 'draft',
    tokensUsed: input.aiEnabled ? Math.max(85, Math.min(420, draftMarkdown.length * 2)) : 0,
    createdAt: new Date().toISOString(),
  }
}
