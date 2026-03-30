import type { IntuneSnapshot, ItCmdbHardwareListItem } from '@/lib/it-cmdb-types'

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(s.trim())
}

function prettyNameFromLocalPart(email: string): string {
  const local = email.trim().split('@')[0] ?? ''
  if (!local) return email.trim()
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length === 0) return email.trim()
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

/** Weergavenaam voor ticket-onderwerp / beschrijving (Graph levert geen vaste displayName op managedDevice) */
export function resolveIntuneUserDisplayName(row: ItCmdbHardwareListItem, snap: IntuneSnapshot | null): string {
  const un = row.user_name?.trim()
  if (un && !looksLikeEmail(un)) return un
  const mail =
    snap?.emailAddress?.trim() ||
    row.assigned_user_email?.trim() ||
    (snap?.userPrincipalName?.trim() && looksLikeEmail(snap.userPrincipalName) ? snap.userPrincipalName.trim() : '')
  if (mail) return prettyNameFromLocalPart(mail)
  return 'Onbekende gebruiker'
}

export function resolvePrimaryRequesterEmail(row: ItCmdbHardwareListItem, snap: IntuneSnapshot | null): string | null {
  const a = snap?.emailAddress?.trim()
  if (a) return a
  const p = row.assigned_user_email?.trim()
  if (p) return p
  const upn = snap?.userPrincipalName?.trim()
  if (upn && looksLikeEmail(upn)) return upn
  return null
}

function line(label: string, value: string | null | undefined): string {
  const v = value != null && String(value).trim() !== '' ? String(value).trim() : '—'
  return `${label}: ${v}`
}

export function buildIntuneFreshdeskDescription(
  row: ItCmdbHardwareListItem,
  snap: IntuneSnapshot | null
): string {
  const userDisplayName = resolveIntuneUserDisplayName(row, snap)
  const deviceName = row.hostname?.trim() || '—'
  const serialNumber = row.serial_number?.trim() || '—'

  const lines = [
    'Intune / CMDB — devicegegevens',
    '─────────────────────────────',
    line('userDisplayName', userDisplayName),
    line('userPrincipalName', snap?.userPrincipalName ?? null),
    line('deviceName', deviceName),
    line('serialNumber', serialNumber),
    line('operatingSystem', snap?.operatingSystem ?? null),
    line('osVersion', snap?.osVersion ?? null),
    line('complianceState', snap?.complianceState ?? null),
    line('lastSyncDateTime', snap?.lastSyncDateTime ?? null),
    line('manufacturer', snap?.manufacturer ?? null),
    line('model', snap?.model ?? null),
    '',
    `CMDB-record: ${row.id}`,
  ]
  return lines.join('\n')
}

export function buildIntuneFreshdeskSubject(row: ItCmdbHardwareListItem, snap: IntuneSnapshot | null): string {
  const userDisplayName = resolveIntuneUserDisplayName(row, snap)
  const deviceName = row.hostname?.trim() || '—'
  return `Intune device issue - ${userDisplayName} - ${deviceName}`
}
