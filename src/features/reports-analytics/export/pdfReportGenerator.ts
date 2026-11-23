/**
 * DevProof (TikTrack) - Clean & Clear Structured Vector PDF Report Generator
 *
 * Uses jsPDF + jspdf-autotable to produce executive-grade A4 PDF documents
 * directly from a `ReportDocument` model. Always renders on crisp white pages
 * with structured headers, KPI cards, repeating multi-page table headers,
 * aligned numeric columns, bold totals, and page numbers.
 *
 * NEVER prints or screenshots the browser UI/display view.
 */

import { jsPDF } from 'jspdf'
import autoTable, { type CellHookData, type Styles } from 'jspdf-autotable'
import {
  buildSafeExportFilename,
  defaultAlignForFormat,
  formatReportCellValue,
  type ReportDocument,
} from './reportDocument.types.ts'

type RgbTuple = [number, number, number]

function parseHexToRgb(hex: string | undefined, fallback: RgbTuple): RgbTuple {
  if (!hex) return fallback
  const cleaned = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return fallback
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ]
}

const DEFAULT_BRAND_RGB: RgbTuple = [109, 37, 218] // TikTrack #6d25da
const SLATE_900: RgbTuple = [15, 23, 42]
const SLATE_600: RgbTuple = [71, 85, 105]
const SLATE_400: RgbTuple = [148, 163, 184]
const BORDER_LIGHT: RgbTuple = [226, 232, 240]
const ZEBRA_BG: RgbTuple = [248, 250, 252]
const TOTAL_BG: RgbTuple = [243, 240, 255]
const CARD_BG: RgbTuple = [249, 250, 251]

function formatGeneratedDate(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function buildPdfReportInstance(report: ReportDocument): jsPDF {
  const maxCols = report.sections.reduce(
    (max, sec) => Math.max(max, sec.columns.length),
    0
  )
  const orientation: 'portrait' | 'landscape' = maxCols >= 7 ? 'landscape' : 'portrait'

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  const brandRgb = parseHexToRgb(report.brandColorHex, DEFAULT_BRAND_RGB)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14
  const contentWidth = pageWidth - marginX * 2

  // ---------------------------------------------------------------------------
  // 1. Top Brand Accent Bar & Structured Executive Header
  // ---------------------------------------------------------------------------
  doc.setFillColor(...brandRgb)
  doc.rect(0, 0, pageWidth, 3.2, 'F')

  let cursorY = 12

  // Left block: Brand + Report Title + Subtitle
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...brandRgb)
  doc.text(`TIKTRACK ANALYTICS  •  ${report.reportCode.toUpperCase()}`, marginX, cursorY)

  cursorY += 6.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...SLATE_900)
  const titleMaxW = contentWidth * 0.6
  const wrappedTitle = doc.splitTextToSize(report.title, titleMaxW) as string[]
  doc.text(wrappedTitle, marginX, cursorY)

  const afterTitleY = cursorY + wrappedTitle.length * 6.2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...SLATE_600)
  const wrappedSub = doc.splitTextToSize(report.subtitle, titleMaxW) as string[]
  doc.text(wrappedSub, marginX, afterTitleY)

  // Right block: Clean Metadata Box
  const metaBoxW = contentWidth * 0.36
  const metaBoxX = pageWidth - marginX - metaBoxW
  const metaBoxY = 9.5
  const metaLines: Array<[string, string]> = [
    ['Scope', report.scopeLabel],
    ['Period', report.dateRangeLabel],
    ['Prepared By', `${report.generatedBy} (${report.generatedRole.replace(/_/g, ' ')})`],
    ['Generated', formatGeneratedDate(report.generatedAtIso)],
  ]
  const metaBoxH = 4 + metaLines.length * 4.7 + 2

  doc.setFillColor(...CARD_BG)
  doc.setDrawColor(...BORDER_LIGHT)
  doc.setLineWidth(0.25)
  doc.roundedRect(metaBoxX, metaBoxY, metaBoxW, metaBoxH, 2, 2, 'FD')

  let metaY = metaBoxY + 4.8
  for (const [k, v] of metaLines) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...SLATE_600)
    doc.text(`${k}:`, metaBoxX + 3, metaY)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SLATE_900)
    const valStr = v.length > 34 ? `${v.slice(0, 32)}…` : v
    doc.text(valStr, metaBoxX + 21, metaY)
    metaY += 4.7
  }

  cursorY = Math.max(afterTitleY + wrappedSub.length * 4.5, metaBoxY + metaBoxH) + 3.5

  // Applied Filters Strip
  if (report.appliedFilters.length > 0) {
    const filterText = report.appliedFilters
      .map((f) => `${f.label}: ${f.value}`)
      .join('   |   ')
    doc.setFillColor(245, 243, 255)
    doc.setDrawColor(221, 214, 254)
    doc.setLineWidth(0.2)
    const wrappedFilter = doc.splitTextToSize(
      `Applied Filters:  ${filterText}`,
      contentWidth - 6
    ) as string[]
    const stripH = Math.max(6.5, wrappedFilter.length * 4 + 3)
    doc.roundedRect(marginX, cursorY, contentWidth, stripH, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(76, 29, 149)
    doc.text(wrappedFilter, marginX + 3, cursorY + 4.3)
    cursorY += stripH + 4.5
  } else {
    doc.setDrawColor(...BORDER_LIGHT)
    doc.setLineWidth(0.3)
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY)
    cursorY += 5
  }

  // ---------------------------------------------------------------------------
  // 2. Executive KPI Summary Grid
  // ---------------------------------------------------------------------------
  if (report.kpis.length > 0) {
    const colsPerRow = orientation === 'landscape'
      ? Math.min(4, report.kpis.length)
      : Math.min(3, report.kpis.length)
    const gap = 3.2
    const cardW = (contentWidth - gap * (colsPerRow - 1)) / colsPerRow
    const cardH = 19.5

    for (let i = 0; i < report.kpis.length; i++) {
      const kpi = report.kpis[i]
      const colIdx = i % colsPerRow
      const rowIdx = Math.floor(i / colsPerRow)

      if (colIdx === 0 && rowIdx > 0) {
        cursorY += cardH + gap
      }

      const x = marginX + colIdx * (cardW + gap)
      const y = cursorY

      doc.setFillColor(...CARD_BG)
      doc.setDrawColor(...BORDER_LIGHT)
      doc.setLineWidth(0.25)
      doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD')

      // Subtle left color accent inside KPI card
      const accent: RgbTuple =
        kpi.tone === 'positive'
          ? [16, 185, 129]
          : kpi.tone === 'warning'
            ? [217, 119, 6]
            : kpi.tone === 'negative'
              ? [225, 29, 72]
              : brandRgb
      doc.setFillColor(...accent)
      doc.rect(x, y + 2.5, 1.2, cardH - 5, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...SLATE_600)
      const labelTxt = kpi.label.toUpperCase()
      doc.text(labelTxt.slice(0, 32), x + 3.8, y + 5.2)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12.5)
      doc.setTextColor(...SLATE_900)
      doc.text(kpi.value.slice(0, 24), x + 3.8, y + 11.8)

      const footLine = [kpi.delta, kpi.subtext].filter(Boolean).join(' • ')
      if (footLine) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...SLATE_600)
        doc.text(footLine.slice(0, 38), x + 3.8, y + 16.7)
      }
    }

    cursorY += cardH + 7
  }

  // ---------------------------------------------------------------------------
  // 3. Structured Data Sections (AutoTable with Multi-Page Repeating Headers)
  // ---------------------------------------------------------------------------
  for (const section of report.sections) {
    // Prevent orphaned section header near bottom of page
    if (cursorY > pageHeight - 42) {
      doc.addPage()
      cursorY = 16
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...SLATE_900)
    doc.text(section.title, marginX, cursorY)
    cursorY += 4.3

    if (section.description) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.2)
      doc.setTextColor(...SLATE_600)
      const wrappedDesc = doc.splitTextToSize(section.description, contentWidth) as string[]
      doc.text(wrappedDesc, marginX, cursorY)
      cursorY += wrappedDesc.length * 3.8 + 1.5
    } else {
      cursorY += 1.2
    }

    const headRow = section.columns.map((c) => c.header)
    const bodyRows =
      section.rows.length > 0
        ? section.rows.map((row) =>
            section.columns.map((col) =>
              formatReportCellValue(row[col.key], col.format, report.currency)
            )
          )
        : [
            [
              'No matching records for the selected period and filters.',
              ...section.columns.slice(1).map(() => ''),
            ],
          ]

    const footRows = section.totalsRow
      ? [
          section.columns.map((col) =>
            formatReportCellValue(
              section.totalsRow?.[col.key],
              col.format,
              report.currency
            )
          ),
        ]
      : undefined

    const columnStyles: Record<number, Partial<Styles>> = {}
    section.columns.forEach((col, idx) => {
      columnStyles[idx] = {
        halign: col.align ?? defaultAlignForFormat(col.format),
      }
    })

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, top: 15, bottom: 18 },
      head: [headRow],
      body: bodyRows,
      foot: footRows,
      showHead: 'everyPage',
      showFoot: 'lastPage',
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: { top: 2.6, right: 2.8, bottom: 2.6, left: 2.8 },
        textColor: SLATE_900,
        lineColor: BORDER_LIGHT,
        lineWidth: 0.15,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [30, 27, 75], // Crisp executive indigo-slate
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 3, right: 2.8, bottom: 3, left: 2.8 },
      },
      alternateRowStyles: {
        fillColor: ZEBRA_BG,
      },
      footStyles: {
        fillColor: TOTAL_BG,
        textColor: SLATE_900,
        fontStyle: 'bold',
        fontSize: 8.3,
        lineColor: brandRgb,
        lineWidth: { top: 0.4, bottom: 0.2, left: 0, right: 0 },
      },
      columnStyles,
      didParseCell: (data: CellHookData) => {
        if (data.section === 'head' || data.section === 'foot') {
          const col = section.columns[data.column.index]
          if (col) {
            data.cell.styles.halign = col.align ?? defaultAlignForFormat(col.format)
          }
        }
      },
    })

    const lastY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY
    cursorY = (lastY ?? cursorY + 20) + 8
  }

  // ---------------------------------------------------------------------------
  // 4. Footnotes & Governance Notice
  // ---------------------------------------------------------------------------
  if (report.footnotes && report.footnotes.length > 0) {
    if (cursorY > pageHeight - 28) {
      doc.addPage()
      cursorY = 16
    }
    doc.setDrawColor(...BORDER_LIGHT)
    doc.setLineWidth(0.25)
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY)
    cursorY += 4.5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.8)
    doc.setTextColor(...SLATE_600)
    doc.text('Report Notes & Methodology', marginX, cursorY)
    cursorY += 3.8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...SLATE_600)
    for (const note of report.footnotes) {
      const wrapped = doc.splitTextToSize(`• ${note}`, contentWidth) as string[]
      doc.text(wrapped, marginX, cursorY)
      cursorY += wrapped.length * 3.5 + 0.8
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Consistent Running Footer on Every Page ("Page X of Y")
  // ---------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = pageHeight - 9.5

    doc.setDrawColor(...BORDER_LIGHT)
    doc.setLineWidth(0.25)
    doc.line(marginX, footerY - 3.5, pageWidth - marginX, footerY - 3.5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...SLATE_400)
    doc.text(
      `TikTrack (DevProof)  •  ${report.scopeLabel}  •  Confidential`,
      marginX,
      footerY
    )

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...SLATE_600)
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, footerY, {
      align: 'right',
    })
  }

  return doc
}

export function exportReportToPdf(report: ReportDocument): string {
  const doc = buildPdfReportInstance(report)
  const filename = buildSafeExportFilename(report, 'pdf')
  doc.save(filename)
  return filename
}
