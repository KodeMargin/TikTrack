/**
 * DevProof (TikTrack) - Server-Side Google Gemini Service
 *
 * Calls the Gemini REST API strictly from the Node/Vercel server using
 * server-only `GEMINI_API_KEY` (never exposed to browser bundles).
 * Only receives pre-sanitized metadata payloads (no keystrokes, raw window titles, or source code).
 */

export interface GeminiDraftRequest {
  targetType:
    | 'daily_summary'
    | 'reviewer_digest'
    | 'gap_explanation'
    | 'task_mapping'
    | 'debug_investigation'
    | 'pattern_cluster'
  targetLabel: string
  sanitizedPayload: Record<string, unknown>
  citedIds: string[]
}

export interface GeminiDraftResponse {
  ok: boolean
  configured: boolean
  modelId: string
  draftMarkdown?: string
  tokensUsed?: number
  error?: string
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

export function getGeminiConfig(): {
  configured: boolean
  apiKey: string
  model: string
} {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  const model = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim()
  return {
    configured: apiKey.length > 0 && apiKey !== 'your-gemini-api-key',
    apiKey,
    model,
  }
}

const TARGET_INSTRUCTIONS: Record<GeminiDraftRequest['targetType'], string> = {
  daily_summary:
    'Write a concise Daily Work Summary (3-5 bullet points) describing the logged time, work modes used, and linked work proof for the developer to review before submitting.',
  reviewer_digest:
    'Write a concise Manager Review Brief (3-5 bullet points) summarizing logged vs. supported time, linked deliverables, and any open items awaiting human confirmation.',
  gap_explanation:
    'Write a polite, clear Quiet-Gap Note prompt explaining why a quiet period needs a quick label (e.g., Thinking, Reading Docs, Meeting, or Break) and reminding that no automatic pay cuts occur.',
  task_mapping:
    'Write a concise Task Match Summary explaining how the repository/branch metadata aligns with the target task, noting that developer confirmation is required.',
  debug_investigation:
    'Write a concise Debugging Recap summarizing debugging & local testing progress from lifecycle metadata without assuming or inventing code changes.',
  pattern_cluster:
    'Write a constructive Work Pattern Recap grouping recurring review notices and suggesting practical workflow improvements (like selecting Deep Work mode upfront).',
}

export async function generateGeminiSummaryDraft(
  input: GeminiDraftRequest
): Promise<GeminiDraftResponse> {
  const { configured, apiKey, model } = getGeminiConfig()

  if (!configured) {
    return {
      ok: false,
      configured: false,
      modelId: model,
      error: 'GEMINI_API_KEY is not configured in the server environment.',
    }
  }

  const systemInstruction = [
    'You are TikTrack Smart Assistant for a privacy-first engineering time tracker.',
    'Rules you MUST strictly obey:',
    '1. Only use the sanitized metadata provided in JSON. Never invent commits, bugs, or hours.',
    '2. Never accuse any developer of fraud, idleness, slacking, or low performance.',
    '3. Never recommend automatic pay deductions or punitive actions; human review is always authoritative.',
    '4. Use clear, plain, everyday English — avoid technical jargon.',
    '5. Output clean Markdown (a short bold title + 3 to 5 concise bullets). Keep it under 160 words.',
  ].join('\n')

  const taskInstruction =
    TARGET_INSTRUCTIONS[input.targetType] ??
    'Write a clear, concise summary of the provided work metadata.'

  const userPrompt = [
    `Target: ${input.targetLabel}`,
    `Draft Type: ${input.targetType}`,
    `Instruction: ${taskInstruction}`,
    `Verified Metadata (JSON):`,
    JSON.stringify(input.sanitizedPayload, null, 2),
  ].join('\n\n')

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 512,
        },
      }),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      let errMsg = `Gemini API error (${response.status})`
      try {
        const parsed = JSON.parse(errBody) as { error?: { message?: string } }
        if (parsed.error?.message) errMsg = parsed.error.message
      } catch {
        // ignore parse failure
      }
      return {
        ok: false,
        configured: true,
        modelId: model,
        error: errMsg,
      }
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
      usageMetadata?: {
        totalTokenCount?: number
      }
    }

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? ''

    if (!text) {
      return {
        ok: false,
        configured: true,
        modelId: model,
        error: 'Gemini returned an empty response.',
      }
    }

    const citationFooter =
      input.citedIds.length > 0
        ? `\n\n_Sources cited: ${input.citedIds.join(', ')}_`
        : ''

    return {
      ok: true,
      configured: true,
      modelId: model,
      draftMarkdown: `${text}${citationFooter}`,
      tokensUsed: data.usageMetadata?.totalTokenCount ?? Math.max(80, Math.round(text.length / 3)),
    }
  } catch (err) {
    return {
      ok: false,
      configured: true,
      modelId: model,
      error: err instanceof Error ? err.message : 'Failed to reach Gemini API.',
    }
  }
}
