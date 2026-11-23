/**
 * DevProof (TikTrack) - Canonical Structured Report Document Types
 *
 * Every report (Platform P1-P3 and Tenant Operational R1-R8) compiles its
 * verified data into a `ReportDocument`. Both the clean vector PDF renderer
 * and the styled multi-sheet Excel renderer consume this exact contract -
 * never printing or screenshotting the interactive display view.
 */

export type ReportColumnFormat =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'hours'
  | 'currency'
  | 'percent'
  | 'date'

export type ReportColumnAlign = 'left' | 'right' | 'center'

export interface ReportColumnDef {
  key: string
  header: string
  align?: ReportColumnAlign
  format?: ReportColumnFormat
  /** Excel column width hint in characters */
  width?: number
  /** If true, Excel totals row writes a native =SUM(...) formula for this column */
  sumInTotals?: boolean
}

export interface ReportKpiItem {
  label: string
  value: string
  subtext?: string
  delta?: string
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'brand'
}

export interface ReportSectionDef {
  /** Excel worksheet tab name (sanitized & truncated to <= 31 chars) */
  sheetName: string
  title: string
  description?: string
  columns: ReportColumnDef[]
  rows: Array<Record<string, string | number | null | undefined>>
  totalsRow?: Record<string, string | number | null | undefined>
}

export interface ReportDocument {
  reportCode: string
  title: string
  subtitle: string
  scopeLabel: string
  tenantSlug?: string
  dateRangeLabel: string
  appliedFilters: Array<{ label: string; value: string }>
  currency: string
  generatedBy: string
  generatedRole: string
  generatedAtIso: string
  brandColorHex?: string
  kpis: ReportKpiItem[]
  sections: ReportSectionDef[]
  footnotes?: string[]
}

export function formatReportCellValue(
  raw: string | number | null | undefined,
  format: ReportColumnFormat | undefined,
  currency: string
): string {
  if (raw === null || raw === undefined || raw === '') return '-'
  if (typeof raw === 'string') return raw

  const num = Number(raw)
  if (!Number.isFinite(num)) return '-'

  switch (format) {
    case 'integer':
      return Math.round(num).toLocaleString('en-US')
    case 'decimal':
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    case 'hours':
      return `${num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} h`
    case 'currency':
      return `${currency} ${num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    case 'percent':
      return `${(num * 100).toFixed(1)}%`
    default:
      return String(raw)
  }
}

export function defaultAlignForFormat(format?: ReportColumnFormat): ReportColumnAlign {
  switch (format) {
    case 'integer':
    case 'decimal':
    case 'hours':
    case 'currency':
    case 'percent':
      return 'right'
    case 'date':
      return 'center'
    default:
      return 'left'
  }
}

export function buildSafeExportFilename(doc: ReportDocument, ext: 'pdf' | 'xlsx'): string {
  const slugify = (input: string) =>
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)

  const code = slugify(doc.reportCode || doc.title)
  const scope = slugify(doc.tenantSlug || doc.scopeLabel || 'workspace')
  const dateTag = doc.generatedAtIso.slice(0, 10)
  return `tiktrack-${code}-${scope}-${dateTag}.${ext}`
}

export function sanitizeExcelSheetName(name: string, fallbackIndex: number): string {
  const cleaned = name
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return `Section ${fallbackIndex}`
  return cleaned.slice(0, 31)
}
