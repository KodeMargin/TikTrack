import type {
  AiGenerationRecord,
  DisputeRecord,
  EvidenceCorrelationEdgeRecord,
  VerificationRuleSetRecord,
} from '../../types/domain.types.ts'

export interface AuditBundleInput {
  tenantName: string
  policyVersion: string
  ruleSet?: VerificationRuleSetRecord
  dispute?: DisputeRecord
  timesheetLines: Array<{
    id: string
    workDate: string
    taskCode: string
    taskTitle: string
    developerName: string
    workMode: string
    provenance: string
    elapsedMinutes: number
    claimedMinutes: number
    observedMinutes: number
    supportedMinutes: number
    approvedBillableMinutes: number
    evidenceStatus: string
    snapshotHourlyRate: number
    isLocked: boolean
    developerNote: string
    managerComment?: string
  }>
  artifacts: Array<{
    id: string
    sourceType: string
    externalId: string
    summaryTitle: string
    occurredAtUtc: string
    linkType: string
    reliabilityStatus: string
  }>
  correlationEdges: EvidenceCorrelationEdgeRecord[]
  aiGenerations: AiGenerationRecord[]
}

export function buildContractualAuditBundle(input: AuditBundleInput) {
  const exportedAtUtc = new Date().toISOString()

  const jsonBundle = {
    schemaVersion: 'devproof.audit_bundle.v1',
    exportedAtUtc,
    tenantName: input.tenantName,
    policyVersion: input.policyVersion,
    activeRuleSet: input.ruleSet
      ? {
          versionNumber: input.ruleSet.versionNumber,
          versionLabel: input.ruleSet.versionLabel,
          effectiveFrom: input.ruleSet.effectiveFrom,
          rulesConfig: input.ruleSet.rulesConfig,
        }
      : null,
    dispute: input.dispute ?? null,
    timesheetLines: input.timesheetLines,
    evidenceInventory: input.artifacts,
    correlationGraphEdges: input.correlationEdges,
    aiProvenanceLedger: input.aiGenerations.map((g) => ({
      id: g.id,
      targetType: g.targetType,
      generationMode: g.generationMode,
      modelId: g.modelId,
      status: g.status,
      citedEventIds: g.citedEventIds,
      citedArtifactIds: g.citedArtifactIds,
      approvedAt: g.approvedAt ?? null,
    })),
  }

  const linesMd = input.timesheetLines
    .map(
      (l) =>
        `- **${l.workDate} · ${l.taskCode}** (${l.developerName}, ${l.workMode}/${l.provenance}): ` +
        `Elapsed ${l.elapsedMinutes}m | Claimed ${l.claimedMinutes}m | Observed ${l.observedMinutes}m | Supported ${l.supportedMinutes}m | Approved ${l.approvedBillableMinutes}m @ $${l.snapshotHourlyRate}/hr [${l.evidenceStatus}]${l.isLocked ? ' (LOCKED)' : ''}`
    )
    .join('\n')

  const artifactsMd =
    input.artifacts.length > 0
      ? input.artifacts
          .map(
            (a) =>
              `- \`${a.sourceType}\` **${a.externalId}**: ${a.summaryTitle} (${a.linkType}, ${a.reliabilityStatus})`
          )
          .join('\n')
      : '- No external artifacts linked.'

  const disputeMd = input.dispute
    ? `\n## Dispute & Appeal Record (${input.dispute.id})\n` +
      `- **Status:** ${input.dispute.status} | **Disputed:** ${input.dispute.disputedMinutes}m | **Policy:** ${input.dispute.policyVersionCode}\n` +
      `- **Reason:** ${input.dispute.reason}\n` +
      (input.dispute.escalatedReviewerName
        ? `- **Independent Second Reviewer:** ${input.dispute.escalatedReviewerName}\n`
        : '') +
      input.dispute.messages
        .map(
          (m) =>
            `  - [${m.createdAt}] **${m.authorName}** (${m.messageType}): ${m.messageMarkdown}`
        )
        .join('\n')
    : ''

  const markdown = [
    `# DevProof Contractual Audit Export (F3-035)`,
    `- **Tenant:** ${input.tenantName}`,
    `- **Policy Version:** ${input.policyVersion}`,
    `- **Exported At (UTC):** ${exportedAtUtc}`,
    ``,
    `## Five-Concept Time & Approval Ledger`,
    linesMd || '- No lines in scope.',
    ``,
    `## Evidence Inventory`,
    artifactsMd,
    disputeMd,
  ].join('\n')

  return { jsonBundle, markdown }
}
