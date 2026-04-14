'use client'

import { statusLabel, statusKleur, type BeschikbaarheidStatus } from '@/lib/beschikbaarheid'
import { FONT_FAMILY } from '@/lib/theme'

interface Props {
  status: BeschikbaarheidStatus
  oofEnd?: string | null
  oofStart?: string | null
  nextAvailableLabel?: string | null
  /** Klein pill zonder subregels */
  compact?: boolean
  /** Alleen een gekleurde dot met tooltip */
  dot?: boolean
  className?: string
}

function formatOofPeriod(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!end) return null
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return null
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const endStr = endDate.toLocaleDateString('nl-NL', opts)
  if (start) {
    const startDate = new Date(start)
    if (!Number.isNaN(startDate.getTime())) {
      const startStr = startDate.toLocaleDateString('nl-NL', opts)
      return `${startStr} – ${endStr}`
    }
  }
  return `t/m ${endStr}`
}

export function BeschikbaarheidBadge({
  status,
  oofEnd,
  oofStart,
  nextAvailableLabel,
  compact = false,
  dot: dotOnly = false,
  className,
}: Props) {
  const { bg, fg, dot: dotColor } = statusKleur(status)
  const label = statusLabel(status)
  const oofPeriod = status === 'out-of-office' ? formatOofPeriod(oofStart, oofEnd) : null
  const tooltip = [label, oofPeriod, nextAvailableLabel].filter(Boolean).join(' · ')

  // Alleen dot
  if (dotOnly) {
    return (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${className ?? ''}`}
        style={{ background: dotColor }}
        title={tooltip}
        aria-label={label}
      />
    )
  }

  // Compact: pill zonder subregels
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 leading-none whitespace-nowrap ${className ?? ''}`}
        style={{ background: bg, color: fg, fontFamily: FONT_FAMILY }}
        title={tooltip}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} aria-hidden />
        {label}
      </span>
    )
  }

  // Volledig: pill + subregels
  return (
    <span className={`inline-flex flex-col gap-1 ${className ?? ''}`}>
      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 leading-none whitespace-nowrap"
        style={{ background: bg, color: fg, fontFamily: FONT_FAMILY }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} aria-hidden />
        {label}
      </span>

      {/* OOF periode */}
      {oofPeriod && (
        <span
          className="text-[10px] font-medium pl-1 flex items-center gap-1 whitespace-nowrap"
          style={{ color: fg, fontFamily: FONT_FAMILY }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {oofPeriod}
        </span>
      )}

      {/* Volgende beschikbaarheid */}
      {nextAvailableLabel && (
        <span
          className="text-[10px] font-medium pl-1 flex items-center gap-1 whitespace-nowrap"
          style={{ color: fg, fontFamily: FONT_FAMILY, opacity: 0.8 }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          {nextAvailableLabel}
        </span>
      )}
    </span>
  )
}
