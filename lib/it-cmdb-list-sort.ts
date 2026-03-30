import type { IntuneSnapshot, ItCmdbHardwareListItem } from '@/lib/it-cmdb-types'

export const CMDB_SORT_KEYS = [
  'serial_number',
  'hostname',
  'compliance',
  'last_sync',
  'management',
  'user',
  'device_type',
  'notes',
  'location',
  'intune',
  'updated_at',
] as const

export type CmdbSortKey = (typeof CMDB_SORT_KEYS)[number]

export function isCmdbSortKey(s: string | null | undefined): s is CmdbSortKey {
  return s != null && (CMDB_SORT_KEYS as readonly string[]).includes(s)
}

function isIntuneSnapshot(v: unknown): v is IntuneSnapshot {
  return v != null && typeof v === 'object' && !Array.isArray(v) && typeof (v as IntuneSnapshot).graphDeviceId === 'string'
}

function userSortKey(row: ItCmdbHardwareListItem): string {
  const e = row.assigned_user_email?.trim().toLowerCase() ?? ''
  const u = row.user_name?.trim().toLowerCase() ?? ''
  return e || u || ''
}

function complianceKey(row: ItCmdbHardwareListItem): string {
  const s = isIntuneSnapshot(row.intune_snapshot) ? row.intune_snapshot : null
  return (s?.complianceState ?? '').trim().toLowerCase()
}

function lastSyncMs(row: ItCmdbHardwareListItem): number {
  const s = isIntuneSnapshot(row.intune_snapshot) ? row.intune_snapshot : null
  const iso = s?.lastSyncDateTime
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

function managementKey(row: ItCmdbHardwareListItem): string {
  const s = isIntuneSnapshot(row.intune_snapshot) ? row.intune_snapshot : null
  const m = s?.managementState != null && String(s.managementState).trim() !== '' ? String(s.managementState) : row.intune ?? ''
  return m.trim().toLowerCase()
}

/** Sorteren na enrich (Intune JSON + portal-e-mail). */
export function sortCmdbHardwareList(
  items: ItCmdbHardwareListItem[],
  sort: CmdbSortKey,
  ascending: boolean
): ItCmdbHardwareListItem[] {
  const dir = ascending ? 1 : -1
  const cmp = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0) * dir

  const out = [...items]
  out.sort((ra, rb) => {
    switch (sort) {
      case 'user':
        return cmp(userSortKey(ra), userSortKey(rb))
      case 'compliance':
        return cmp(complianceKey(ra), complianceKey(rb))
      case 'last_sync':
        return cmp(lastSyncMs(ra), lastSyncMs(rb))
      case 'management':
        return cmp(managementKey(ra), managementKey(rb))
      default:
        return 0
    }
  })
  return out
}
