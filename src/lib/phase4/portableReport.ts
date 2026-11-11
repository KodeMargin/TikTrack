import type { PortableWorkReportRecord } from '../../types/domain.types.ts'
import { sha256Hex, signHmacSha256Hex, verifyHmacSha256Hex } from './publicApiAndWebhooks.ts'

export interface PortableReportBuildInput {
  tenantId: string
  tenantName: string
  developerUserId: string
  developerName: string
  reportTitle: string
  periodStart: string
  periodEnd: string
  signingKey?: string
  lines: Array<{
    id: string
    developerId: string
    projectId: string
    taskCode: string
    taskTitle: string
    workDate: string
    workMode: string
    claimedMinutes: number
    supportedMinutes: number
    approvedBillableMinutes: number
    evidenceStatus: string
  }>
  deliverables: Array<{
    id: string
    sourceType: string
    externalId: string
    summaryTitle: string
    occurredAtUtc: string
  }>
}

/**
 * F4-013: Developer Portable Work Report
 * Scoped strictly to `developerUserId`'s own approved/supported sessions and
 * linked deliverable summaries, signed with SHA-256 + HMAC-SHA256.
 */
export async function generateSignedPortableWorkReport(
  input: PortableReportBuildInput
): Promise<PortableWorkReportRecord> {
  const ownLines = input.lines.filter(
    (l) =>
      l.developerId === input.developerUserId &&
      l.workDate >= input.periodStart &&
      l.workDate <= input.periodEnd
  )

  const approvedLines = ownLines.filter((l) => l.evidenceStatus === 'approved')
  const totalApprovedMinutes = approvedLines.reduce(
    (sum, l) => sum + l.approvedBillableMinutes,
    0
  )
  const totalSupportedMinutes = ownLines.reduce((sum, l) => sum + l.supportedMinutes, 0)

  const canonicalPayload = {
    schemaVersion: 'devproof.portable_work_report.v1',
    generatedAtUtc: new Date().toISOString(),
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    developerUserId: input.developerUserId,
    developerName: input.developerName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    summary: {
      totalApprovedMinutes,
      totalApprovedHours: Number((totalApprovedMinutes / 60).toFixed(2)),
      totalSupportedMinutes,
      approvedLineCount: approvedLines.length,
      deliverablesCount: input.deliverables.length,
    },
    approvedSessions: approvedLines.map((l) => ({
      lineId: l.id,
      workDate: l.workDate,
      taskCode: l.taskCode,
      taskTitle: l.taskTitle,
      workMode: l.workMode,
      approvedBillableMinutes: l.approvedBillableMinutes,
      supportedMinutes: l.supportedMinutes,
    })),
    deliverables: input.deliverables.map((d) => ({
      id: d.id,
      sourceType: d.sourceType,
      externalId: d.externalId,
      summaryTitle: d.summaryTitle,
      occurredAtUtc: d.occurredAtUtc,
    })),
  }

  const serialized = JSON.stringify(canonicalPayload)
  const payloadDigestSha256 = await sha256Hex(serialized)
  const signingSecret = input.signingKey ?? `devproof-portable-${input.tenantId}`
  const signatureHmacSha256 = await signHmacSha256Hex(signingSecret, payloadDigestSha256)

  return {
    id: `pwr-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: input.tenantId,
    developerUserId: input.developerUserId,
    developerName: input.developerName,
    reportTitle: input.reportTitle,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    totalApprovedMinutes,
    totalSupportedMinutes,
    deliverablesCount: input.deliverables.length,
    payloadDigestSha256,
    signatureHmacSha256,
    reportPayload: canonicalPayload,
    createdAt: new Date().toISOString(),
  }
}

export async function verifyPortableWorkReportSignature(
  report: PortableWorkReportRecord,
  signingKey?: string
): Promise<boolean> {
  const serialized = JSON.stringify(report.reportPayload)
  const digest = await sha256Hex(serialized)
  if (digest !== report.payloadDigestSha256) return false
  const secret = signingKey ?? `devproof-portable-${report.tenantId}`
  return verifyHmacSha256Hex(secret, digest, report.signatureHmacSha256)
}

export function formatPortableReportMarkdown(report: PortableWorkReportRecord): string {
  const approvedHours = (report.totalApprovedMinutes / 60).toFixed(2)
  const supportedHours = (report.totalSupportedMinutes / 60).toFixed(2)
  return [
    `# ${report.reportTitle}`,
    `- **Developer:** ${report.developerName}`,
    `- **Period:** ${report.periodStart} → ${report.periodEnd}`,
    `- **Verified Approved Time:** ${approvedHours} hrs (${report.totalApprovedMinutes} mins)`,
    `- **Supported Work Time:** ${supportedHours} hrs (${report.totalSupportedMinutes} mins)`,
    `- **Linked Deliverables:** ${report.deliverablesCount}`,
    `- **SHA-256 Content Digest:** \`${report.payloadDigestSha256}\``,
    `- **HMAC-SHA256 Verification Signature:** \`${report.signatureHmacSha256}\``,
  ].join('\n')
}

