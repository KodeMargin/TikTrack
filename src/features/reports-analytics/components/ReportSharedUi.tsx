/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import {
  defaultAlignForFormat,
  formatReportCellValue,
  type ReportColumnDef,
  type ReportKpiItem,
} from '../export/reportDocument.types'

export const CHART_COLORS = [
  '#6d25da', // TikTrack Brand Purple
  '#10b981', // Emerald
  '#0ea5e9', // Sky
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#f43f5e', // Rose
]

export const REPORT_CARD_CLS =
  'rounded-2xl bg-white dark:bg-[#111117] ring-1 ring-zinc-950/[0.06] dark:ring-white/[0.08] shadow-xs'

export function KpiGrid({ kpis }: { kpis: ReportKpiItem[] }) {
  const toneAccent: Record<NonNullable<ReportKpiItem['tone']>, string> = {
    brand: 'bg-[#6d25da] dark:bg-[#a87ce9]',
    positive: 'bg-emerald-500',
    warning: 'bg-amber-500',
    negative: 'bg-rose-500',
    neutral: 'bg-zinc-400 dark:bg-zinc-500',
  }

  const valueColor: Record<NonNullable<ReportKpiItem['tone']>, string> = {
    brand: 'text-[#6d25da] dark:text-[#c5a8f0]',
    positive: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    negative: 'text-rose-600 dark:text-rose-400',
    neutral: 'text-zinc-900 dark:text-white',
  }

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 ${
        kpis.length >= 6 ? 'xl:grid-cols-3' : 'xl:grid-cols-4'
      } gap-3.5`}
    >
      {kpis.map((kpi) => {
        const tone = kpi.tone ?? 'neutral'
        return (
          <div
            key={kpi.label}
            className={`${REPORT_CARD_CLS} relative overflow-hidden p-4 sm:p-5 flex flex-col justify-between gap-2`}
          >
            <span
              className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${toneAccent[tone]}`}
            />
            <div className="pl-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 truncate">
                {kpi.label}
              </span>
              {kpi.delta && (
                <span className="text-[10.5px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 shrink-0">
                  {kpi.delta}
                </span>
              )}
            </div>
            <div className={`pl-2 text-xl sm:text-2xl font-bold font-mono tracking-tight ${valueColor[tone]}`}>
              {kpi.value}
            </div>
            {kpi.subtext && (
              <div className="pl-2 text-[11.5px] text-zinc-500 dark:text-zinc-400 truncate">
                {kpi.subtext}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ChartCard({
  title,
  subtitle,
  rightSlot,
  children,
}: {
  title: string
  subtitle?: string
  rightSlot?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`${REPORT_CARD_CLS} p-5 space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          )}
        </div>
        {rightSlot}
      </div>
      <div>{children}</div>
    </section>
  )
}

export function StructuredDataTable({
  title,
  description,
  columns,
  rows,
  totalsRow,
  currency,
  emptyMessage = 'No records match the current date range and filters.',
  actionRenderer,
}: {
  title: string
  description?: string
  columns: ReportColumnDef[]
  rows: Array<Record<string, string | number | null | undefined>>
  totalsRow?: Record<string, string | number | null | undefined>
  currency: string
  emptyMessage?: string
  actionRenderer?: (row: Record<string, string | number | null | undefined>, index: number) => ReactNode
}) {
  const alignCls = (align?: 'left' | 'right' | 'center') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  return (
    <section className={`${REPORT_CARD_CLS} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
            {title}
          </h3>
          {description && (
            <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
        <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50/90 dark:bg-white/[0.03] border-b border-zinc-200/80 dark:border-white/[0.07] text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {columns.map((col) => {
                  const align = col.align ?? defaultAlignForFormat(col.format)
                  return (
                    <th key={col.key} className={`py-2.5 px-4 whitespace-nowrap ${alignCls(align)}`}>
                      {col.header}
                    </th>
                  )
                })}
                {actionRenderer && <th className="py-2.5 px-4 text-right whitespace-nowrap">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-zinc-50/80 dark:hover:bg-white/[0.025] transition-colors"
                >
                  {columns.map((col) => {
                    const align = col.align ?? defaultAlignForFormat(col.format)
                    const isNumeric =
                      col.format === 'currency' ||
                      col.format === 'hours' ||
                      col.format === 'integer' ||
                      col.format === 'decimal' ||
                      col.format === 'percent'
                    return (
                      <td
                        key={col.key}
                        className={`py-2.5 px-4 whitespace-nowrap ${alignCls(align)} ${
                          isNumeric
                            ? 'font-mono text-zinc-800 dark:text-zinc-200'
                            : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                      >
                        {formatReportCellValue(row[col.key], col.format, currency)}
                      </td>
                    )
                  })}
                  {actionRenderer && (
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {actionRenderer(row, idx)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {totalsRow && (
              <tfoot>
                <tr className="bg-[#6d25da]/[0.06] dark:bg-[#6d25da]/[0.16] border-t-2 border-[#6d25da]/30 font-bold text-zinc-900 dark:text-white">
                  {columns.map((col) => {
                    const align = col.align ?? defaultAlignForFormat(col.format)
                    const isNumeric =
                      col.format === 'currency' ||
                      col.format === 'hours' ||
                      col.format === 'integer' ||
                      col.format === 'decimal' ||
                      col.format === 'percent'
                    return (
                      <td
                        key={col.key}
                        className={`py-3 px-4 whitespace-nowrap ${alignCls(align)} ${
                          isNumeric ? 'font-mono' : ''
                        }`}
                      >
                        {formatReportCellValue(totalsRow[col.key], col.format, currency)}
                      </td>
                    )
                  })}
                  {actionRenderer && <td className="py-3 px-4" />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  )
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="h-56 flex items-center justify-center rounded-xl bg-zinc-50/80 dark:bg-white/[0.02] border border-dashed border-zinc-200 dark:border-white/[0.08] text-xs text-zinc-500 dark:text-zinc-400">
      {message}
    </div>
  )
}
