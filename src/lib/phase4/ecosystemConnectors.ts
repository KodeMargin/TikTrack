import type {
  CalendarMeetingEventRecord,
  EcosystemConnectorProvider,
} from '../../types/domain.types.ts'

export interface AccountingExportInvoiceInput {
  invoiceNumber: string
  clientName: string
  currency: string
  createdAt: string
  taxPercent: number
  lines: Array<{
    workDate: string
    taskCode: string
    description: string
    approvedMinutes: number
    hourlyRate: number
    amount: number
  }>
}

function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * F4-009: Xero & QuickBooks Online export generators from approved/locked
 * commercial invoices (never exposes raw workstation telemetry).
 */
export function buildXeroInvoiceCsv(
  invoice: AccountingExportInvoiceInput,
  accountCode = '200',
  taxType = 'OUTPUT'
): string {
  const header =
    '*ContactName,*InvoiceNumber,*InvoiceDate,*DueDate,*Description,*Quantity,*UnitAmount,*AccountCode,*TaxType'
  const invoiceDate = invoice.createdAt.slice(0, 10)
  const dueDateObj = new Date(invoiceDate)
  dueDateObj.setDate(dueDateObj.getDate() + 14)
  const dueDate = dueDateObj.toISOString().slice(0, 10)

  const rows = invoice.lines.map((line) => {
    const qtyHours = (line.approvedMinutes / 60).toFixed(2)
    return [
      escapeCsvCell(invoice.clientName),
      escapeCsvCell(invoice.invoiceNumber),
      invoiceDate,
      dueDate,
      escapeCsvCell(`${line.taskCode}: ${line.description} (${line.workDate})`),
      qtyHours,
      line.hourlyRate.toFixed(2),
      accountCode,
      taxType,
    ].join(',')
  })

  return [header, ...rows].join('\n')
}

export function buildQuickBooksInvoicePayload(invoice: AccountingExportInvoiceInput) {
  return {
    schema: 'devproof.quickbooks.invoice.v1',
    DocNumber: invoice.invoiceNumber,
    TxnDate: invoice.createdAt.slice(0, 10),
    CurrencyRef: { value: invoice.currency },
    CustomerRef: { name: invoice.clientName },
    Line: invoice.lines.map((line, index) => ({
      LineNum: index + 1,
      DetailType: 'SalesItemLineDetail',
      Amount: Number(line.amount.toFixed(2)),
      Description: `${line.taskCode} - ${line.description} (${line.workDate})`,
      SalesItemLineDetail: {
        Qty: Number((line.approvedMinutes / 60).toFixed(2)),
        UnitPrice: Number(line.hourlyRate.toFixed(2)),
      },
    })),
  }
}

export interface ExternalPmTicketDraft {
  externalKey: string
  provider: Extract<EcosystemConnectorProvider, 'jira' | 'linear' | 'trello' | 'azure_devops'>
  title: string
  acceptanceCriteria: string
  estimateMinutes: number
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

export function mapExternalPmIssueToTaskDraft(issue: ExternalPmTicketDraft) {
  const cleanCode = issue.externalKey.toUpperCase().replace(/[^A-Z0-9-]/g, '')
  return {
    code: cleanCode || `EXT-${Math.floor(100 + Math.random() * 900)}`,
    title: issue.title.trim(),
    acceptanceCriteria:
      issue.acceptanceCriteria.trim() ||
      `Imported from ${issue.provider} (${cleanCode}); verify acceptance tests & outcome link.`,
    estimateMinutes: Math.max(30, issue.estimateMinutes),
    priority: issue.priority,
    defaultWorkMode: 'coding' as const,
  }
}

/**
 * F4-008: Permissioned calendar meeting metadata sanitization.
 * Strips private attendee email lists or freeform body notes when syncing
 * metadata_only, returning clean meeting metadata for `meeting` mode association.
 */
export function sanitizeCalendarMeetingEvent(input: {
  tenantId: string
  userId: string
  connectorId?: string
  projectId?: string
  taskId?: string
  externalEventId: string
  rawTitle: string
  startedAtUtc: string
  endedAtUtc: string
  syncPermissionScope: 'metadata_only' | 'title_and_duration'
}): CalendarMeetingEventRecord {
  const startMs = new Date(input.startedAtUtc).getTime()
  const endMs = new Date(input.endedAtUtc).getTime()
  const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000))

  const sanitizedTitle =
    input.syncPermissionScope === 'metadata_only'
      ? `Scheduled Project Meeting (${durationMinutes}m)`
      : input.rawTitle
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
        .replace(/https?:\/\/\S+/gi, '[meeting-link]')
        .trim() || `Scheduled Meeting (${durationMinutes}m)`

  return {
    id: `cal-${crypto.randomUUID().slice(0, 8)}`,
    tenantId: input.tenantId,
    userId: input.userId,
    projectId: input.projectId,
    taskId: input.taskId,
    connectorId: input.connectorId,
    externalEventId: input.externalEventId,
    meetingTitleSanitized: sanitizedTitle,
    startedAtUtc: input.startedAtUtc,
    endedAtUtc: input.endedAtUtc,
    durationMinutes,
    syncPermissionScope: input.syncPermissionScope,
  }
}

