'use client'

import { statusLabel, statusKleur, type BeschikbaarheidStatus } from '@/lib/beschikbaarheid'
import { FONT_FAMILY } from '@/lib/theme'

interface Props {
  status: BeschikbaarheidStatus
  /** Datum wanneer OOF afloopt (voor tooltip/ondertitel). */
  oofEnd?: string | null
  /** Toon als kleine dot-only variant (geen label). */
  compact?: boolean
  className?: string
}

export function BeschikbaarheidBadge({ status, oofEnd, compact = false, className }: Props) {
  const { bg, fg, dot } = statusKleur(status)
  const label = statusLabel(status)

  const oofEndLabel = (() => {
    if (status !== 'out-of-office' || !oofEnd) return null
    const d = new Date(oofEnd)
    if (Number.isNaN(d.getTime())) return null
    return `Terug op ${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`
  })()

  if (compact) {
    return (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${className ?? ''}`}
        style={{ background: dot }}
        title={oofEndLabel ? `${label} · ${oofEndLabel}` : label}
        aria-label={label}
      />
    )
  }

  return (
    <span className={`inline-flex flex-col gap-0.5 ${className ?? ''}`}>
      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 leading-none whitespace-nowrap"
        style={{ background: bg, color: fg, fontFamily: FONT_FAMILY }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: dot }}
          aria-hidden
        />
        {label}
      </span>
      {oofEndLabel && (
        <span className="text-[10px] pl-1" style={{ color: fg, fontFamily: FONT_FAMILY }}>
          {oofEndLabel}
        </span>
      )}
    </span>
  )
}
