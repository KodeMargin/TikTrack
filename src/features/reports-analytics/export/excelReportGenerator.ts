/**
 * DevProof (TikTrack) - Clean & Clear Styled Multi-Sheet Excel (.xlsx) Generator
 *
 * Uses ExcelJS to produce accountant-ready workbooks directly from a canonical
 * `ReportDocument` model:
 *   - Sheet 1: Executive Summary (branded banner, metadata, KPI table, notes)
 *   - Sheet 2..N: One clean worksheet per report section with frozen styled
 *     headers, AutoFilter, native Excel numeric formats (currency/hours/percent),
 *     dynamic =SUM(...) totals formulas, auto-fitted column widths, and print setup.
 */

import ExcelJS from 'exceljs'
import {
  buildSafeExportFilename,
  defaultAlignForFormat,
  sanitizeExcelSheetName,
  type ReportColumnFormat,
  type ReportDocument,
} from './reportDocument.types.ts'

function cleanHexArgb(hex: string | undefined, fallback: string): string {
  const cleaned = (hex || '').replace('#', '').trim().toUpperCase()
  if (/^[0-9A-F]{6}$/.test(cleaned)) return `FF${cleaned}`
  return `FF${fallback}`
}

function excelNumberFormat(format: ReportColumnFormat | undefined, currency: string): string | undefined {
  const safeCurr = (currency || 'USD').replace(/"/g, '')
  switch (format) {
    case 'currency':
      return `"${safeCurr} "#,##0.00;-"${safeCurr} "#,##0.00;"${safeCurr} "0.00`
    case 'hours':
      return '0.00" h"'
    case 'percent':
      return '0.0%'
    case 'integer':
      return '#,##0'
    case 'decimal':
      return '#,##0.00'
    case 'date':
      return 'yyyy-mm-dd'
    default:
      return undefined
  }
}

function excelColLetter(colIndex1Based: number): string {
  let col = colIndex1Based
  let letter = ''
  while (col > 0) {
    const rem = (col - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    col = Math.floor((col - 1) / 26)
  }
  return letter
}

export async function buildExcelWorkbook(report: ReportDocument): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = `TikTrack (${report.generatedBy})`
  workbook.created = new Date(report.generatedAtIso)
  workbook.modified = new Date(report.generatedAtIso)

  const brandArgb = cleanHexArgb(report.brandColorHex, '6D25DA')
  const headerSlateArgb = 'FF1E1B4B'
  const lightTintArgb = 'FFF3F0FF'
  const zebraArgb = 'FFF8FAFC'
  const borderArgb = 'FFE2E8F0'
  const textDarkArgb = 'FF0F172A'
  const textMutedArgb = 'FF475569'

  // ===========================================================================
  // Sheet 1: Executive Summary
  // ===========================================================================
  const summarySheet = workbook.addWorksheet('Executive Summary', {
    views: [{ showGridLines: true }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })

  summarySheet.columns = [
    { width: 28 },
    { width: 32 },
    { width: 24 },
    { width: 36 },
  ]

  // Title Banner
  summarySheet.mergeCells('A1:D1')
  const bannerCell = summarySheet.getCell('A1')
  bannerCell.value = `TIKTRACK ANALYTICS  -  ${report.title.toUpperCase()}`
  bannerCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandArgb } }
  bannerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  summarySheet.getRow(1).height = 30

  summarySheet.mergeCells('A2:D2')
  const subCell = summarySheet.getCell('A2')
  subCell.value = report.subtitle
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: textMutedArgb } }
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightTintArgb } }
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  summarySheet.getRow(2).height = 20

  summarySheet.addRow([])

  // Report Metadata Block
  const metaHeaderRow = summarySheet.addRow(['Report Metadata', 'Details', '', ''])
  summarySheet.mergeCells(`B${metaHeaderRow.number}:D${metaHeaderRow.number}`)
  metaHeaderRow.eachCell((c) => {
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerSlateArgb } }
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  })
  metaHeaderRow.height = 22

  const metaEntries: Array<[string, string]> = [
    ['Report Code', report.reportCode],
    ['Scope / Workspace', report.scopeLabel],
    ['Date Period', report.dateRangeLabel],
    ['Reporting Currency', report.currency],
    ['Prepared By', `${report.generatedBy} (${report.generatedRole.replace(/_/g, ' ')})`],
    ['Generated Timestamp', new Date(report.generatedAtIso).toLocaleString('en-US')],
    ...report.appliedFilters.map((f): [string, string] => [`Filter: ${f.label}`, f.value]),
  ]

  metaEntries.forEach(([k, v], idx) => {
    const r = summarySheet.addRow([k, v, '', ''])
    summarySheet.mergeCells(`B${r.number}:D${r.number}`)
    r.height = 19
    const keyCell = r.getCell(1)
    const valCell = r.getCell(2)
    keyCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: textMutedArgb } }
    valCell.font = { name: 'Calibri', size: 10, color: { argb: textDarkArgb } }
    if (idx % 2 === 1) {
      keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraArgb } }
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraArgb } }
    }
    for (let c = 1; c <= 4; c++) {
      r.getCell(c).border = {
        bottom: { style: 'thin', color: { argb: borderArgb } },
      }
    }
  })

  summarySheet.addRow([])

  // Executive KPI Table
  if (report.kpis.length > 0) {
    const kpiTitleRow = summarySheet.addRow([
      'Key Performance Indicator',
      'Value',
      'Period Delta',
      'Context / Notes',
    ])
    kpiTitleRow.height = 22
    kpiTitleRow.eachCell((c, colNum) => {
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerSlateArgb } }
      c.alignment = {
        vertical: 'middle',
        horizontal: colNum === 2 ? 'right' : 'left',
        indent: colNum === 2 ? 0 : 1,
      }
    })

    report.kpis.forEach((kpi, idx) => {
      const r = summarySheet.addRow([
        kpi.label,
        kpi.value,
        kpi.delta || '-',
        kpi.subtext || '-',
      ])
      r.height = 20
      r.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: textDarkArgb } }
      r.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: brandArgb } }
      r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' }
      r.getCell(3).font = { name: 'Calibri', size: 10, color: { argb: textMutedArgb } }
      r.getCell(4).font = { name: 'Calibri', size: 9.5, color: { argb: textMutedArgb } }
      r.eachCell((c) => {
        if (idx % 2 === 1) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraArgb } }
        }
        c.border = {
          bottom: { style: 'thin', color: { argb: borderArgb } },
        }
      })
    })
  }

  // Footnotes
  if (report.footnotes && report.footnotes.length > 0) {
    summarySheet.addRow([])
    const noteHead = summarySheet.addRow(['Notes & Methodology'])
    noteHead.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: textMutedArgb } }
    for (const note of report.footnotes) {
      const nr = summarySheet.addRow([`• ${note}`])
      summarySheet.mergeCells(`A${nr.number}:D${nr.number}`)
      nr.getCell(1).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: textMutedArgb } }
      nr.getCell(1).alignment = { wrapText: true }
    }
  }

  // ===========================================================================
  // Sheets 2..N: Structured Section Worksheets
  // ===========================================================================
  const usedSheetNames = new Set<string>(['Executive Summary'])

  report.sections.forEach((section, secIdx) => {
    let sheetName = sanitizeExcelSheetName(section.sheetName || section.title, secIdx + 1)
    let suffix = 2
    while (usedSheetNames.has(sheetName)) {
      const base = sheetName.slice(0, 27)
      sheetName = `${base} (${suffix})`
      suffix += 1
    }
    usedSheetNames.add(sheetName)

    const colCount = Math.max(1, section.columns.length)
    const lastColLetter = excelColLetter(colCount)

    const ws = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      pageSetup: {
        paperSize: 9,
        orientation: colCount >= 6 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    })

    // Row 1: Section Title Banner
    ws.mergeCells(`A1:${lastColLetter}1`)
    const titleCell = ws.getCell('A1')
    titleCell.value = `${section.title}  -  ${report.scopeLabel}`
    titleCell.font = { name: 'Calibri', size: 12.5, bold: true, color: { argb: 'FFFFFFFF' } }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandArgb } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    ws.getRow(1).height = 26

    // Row 2: Subtitle / Period
    ws.mergeCells(`A2:${lastColLetter}2`)
    const infoCell = ws.getCell('A2')
    infoCell.value = `${section.description ? `${section.description}  •  ` : ''}Period: ${report.dateRangeLabel}`
    infoCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: textMutedArgb } }
    infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightTintArgb } }
    infoCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    ws.getRow(2).height = 19

    // Row 3: Spacer
    ws.getRow(3).height = 8

    // Row 4: Styled Table Header Row
    const headerRow = ws.getRow(4)
    headerRow.height = 24
    section.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = col.header
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerSlateArgb } }
      cell.alignment = {
        vertical: 'middle',
        horizontal: col.align ?? defaultAlignForFormat(col.format),
        wrapText: true,
      }
      cell.border = {
        top: { style: 'thin', color: { argb: headerSlateArgb } },
        bottom: { style: 'medium', color: { argb: brandArgb } },
      }
    })

    // Enable Excel AutoFilter on Row 4
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: colCount },
    }

    // Track max text width per column for auto-sizing
    const colWidths = section.columns.map((c) => Math.max(c.width ?? 14, c.header.length + 4))

    // Data Rows (starting at Row 5)
    const firstDataRow = 5
    if (section.rows.length === 0) {
      const emptyRow = ws.addRow(['No matching records for the selected period and filters.'])
      ws.mergeCells(`A${emptyRow.number}:${lastColLetter}${emptyRow.number}`)
      emptyRow.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: textMutedArgb } }
      emptyRow.height = 22
    } else {
      section.rows.forEach((rowData, rowIdx) => {
        const excelRow = ws.addRow(
          section.columns.map((col) => {
            const v = rowData[col.key]
            if (v === null || v === undefined) return ''
            return v
          })
        )
        excelRow.height = 20

        section.columns.forEach((col, cIdx) => {
          const cell = excelRow.getCell(cIdx + 1)
          cell.font = { name: 'Calibri', size: 10, color: { argb: textDarkArgb } }
          cell.alignment = {
            vertical: 'middle',
            horizontal: col.align ?? defaultAlignForFormat(col.format),
          }

          const numFmt = excelNumberFormat(col.format, report.currency)
          if (numFmt && typeof cell.value === 'number') {
            cell.numFmt = numFmt
          }

          if (rowIdx % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraArgb } }
          }
          cell.border = {
            bottom: { style: 'thin', color: { argb: borderArgb } },
          }

          const rawLen = String(cell.value ?? '').length + 3
          if (rawLen > colWidths[cIdx]) {
            colWidths[cIdx] = Math.min(44, rawLen)
          }
        })
      })
    }

    const lastDataRow = firstDataRow + Math.max(section.rows.length - 1, 0)

    // Totals Row with Native =SUM(...) Formulas where configured
    if (section.totalsRow && section.rows.length > 0) {
      const totalExcelRow = ws.addRow(
        section.columns.map((col, cIdx) => {
          if (col.sumInTotals) {
            const colLetter = excelColLetter(cIdx + 1)
            const fallbackVal = section.totalsRow?.[col.key]
            return {
              formula: `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})`,
              result: typeof fallbackVal === 'number' ? fallbackVal : undefined,
            }
          }
          const v = section.totalsRow?.[col.key]
          return v === null || v === undefined ? '' : v
        })
      )
      totalExcelRow.height = 23

      section.columns.forEach((col, cIdx) => {
        const cell = totalExcelRow.getCell(cIdx + 1)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: textDarkArgb } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightTintArgb } }
        cell.alignment = {
          vertical: 'middle',
          horizontal: col.align ?? defaultAlignForFormat(col.format),
        }
        const numFmt = excelNumberFormat(col.format, report.currency)
        if (numFmt) {
          cell.numFmt = numFmt
        }
        cell.border = {
          top: { style: 'thin', color: { argb: brandArgb } },
          bottom: { style: 'double', color: { argb: headerSlateArgb } },
        }
      })
    }

    // Apply auto-fitted column widths
    section.columns.forEach((_, idx) => {
      ws.getColumn(idx + 1).width = Math.max(12, Math.min(44, colWidths[idx]))
    })
  })

  return workbook
}

export async function exportReportToExcel(report: ReportDocument): Promise<string> {
  const workbook = await buildExcelWorkbook(report)
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = buildSafeExportFilename(report, 'xlsx')

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const doc = (globalThis as { document?: { createElement: (tag: string) => { href: string; download: string; click: () => void }; body: { appendChild: (el: unknown) => void; removeChild: (el: unknown) => void } } }).document
  if (doc) {
    const link = doc.createElement('a')
    link.href = url
    link.download = filename
    doc.body.appendChild(link)
    link.click()
    doc.body.removeChild(link)
  }
  URL.revokeObjectURL(url)
  return filename
}
