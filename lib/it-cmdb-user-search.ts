import type { IntuneSnapshot, ItCmdbHardwareListItem } from '@/lib/it-cmdb-types'

/** Accent-neutraal vergelijken (align met unaccent in DB). */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(s.trim())
}

function addEmailLocalParts(local: string, into: Set<string>): void {
  const t = local.trim()
  if (!t) return
  for (const p of t.split(/[._-]+/)) {
    if (p) into.add(fold(p))
  }
}

/**
 * Woord-/segmenten die de gebruiker in de CMDB-tabel zouden kunnen herkennen
 * (user_name, portal-e-mail local, Intune e-mail/UPN local).
 */
export function getCmdbNameMatchSegments(row: ItCmdbHardwareListItem, snap: IntuneSnapshot | null): Set<string> {
  const segs = new Set<string>()

  const rawName = row.user_name?.trim() || ''
  if (rawName) {
    if (looksLikeEmail(rawName)) {
      addEmailLocalParts(rawName.split('@')[0] ?? '', segs)
    } else {
      for (const w of rawName.split(/\s+/)) {
        if (w) segs.add(fold(w))
      }
    }
  }

  const pe = row.assigned_user_email?.trim() || ''
  if (pe.includes('@')) {
    addEmailLocalParts(pe.split('@')[0] ?? '', segs)
  }

  const intuneAddr = (snap?.emailAddress || snap?.userPrincipalName)?.trim() || ''
  if (intuneAddr.includes('@')) {
    addEmailLocalParts(intuneAddr.split('@')[0] ?? '', segs)
  }

  return segs
}

/**
 * True als elk token (min. 2 tekens) als eigen segment voorkomt (zoals “Raymond” in “Raymond Schoonderbeek” / raymond.schoonderbeek@…).
 * Geen treffer op lege gebruikersregels.
 */
export function cmdbRowMatchesNameTokens(
  row: ItCmdbHardwareListItem,
  snap: IntuneSnapshot | null,
  tokens: string[]
): boolean {
  const segs = getCmdbNameMatchSegments(row, snap)
  if (segs.size === 0) return false
  const needles = tokens.map(t => fold(t.trim())).filter(t => t.length >= 2)
  if (needles.length === 0) return true
  return needles.every(n => segs.has(n))
}
