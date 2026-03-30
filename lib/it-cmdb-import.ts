/** Kolommen uit Excel/CSV mappen naar DB-velden (Nederlandse en Engelse koppen). */

export type ItCmdbImportRow = {
  serial_number: string
  hostname: string
  intune: string | null
  user_name: string | null
  device_type: string | null
  notes: string | null
  location: string | null
}

function normalizeHeaderKey(k: string): keyof ItCmdbImportRow | null {
  const s = k.replace(/\u00A0/g, ' ').trim().toLowerCase()
  if (!s) return null
  if (/serie|serial|service.?tag|^tag$/i.test(s)) return 'serial_number'
  if (/^host|^computer|^name.*host/i.test(s) || s === 'hostname') return 'hostname'
  if (/intune/i.test(s)) return 'intune'
  if (/gebruiker|^user|assigned|medewerker/i.test(s)) return 'user_name'
  if (s === 'type' || /model|apparaat|device|merk.*type/i.test(s)) return 'device_type'
  if (/opmerking|note|comment|remark/i.test(s)) return 'notes'
  if (/locatie|location|plaats$/i.test(s)) return 'location'
  return null
}

function cellToString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v)
  return String(v).trim()
}

/** Eén Excel-rij (object met kolomkoppen als keys) → DB-velden. */
export function mapItCmdbRow(raw: Record<string, unknown>): Partial<ItCmdbImportRow> {
  const out: Partial<ItCmdbImportRow> = {}
  for (const [k, v] of Object.entries(raw)) {
    const field = normalizeHeaderKey(k)
    if (!field) continue
    const str = cellToString(v)
    if (field === 'serial_number') {
      out.serial_number = str
    } else if (field === 'hostname') {
      out.hostname = str
    } else {
      ;(out as Record<string, unknown>)[field] = str === '' ? null : str
    }
  }
  if (out.serial_number) out.serial_number = out.serial_number.trim()
  return out
}

/** Zet gedeeltelijke rijen om naar complete rijen; sla lege serienummers over. */
export function finalizeImportRows(partials: Partial<ItCmdbImportRow>[]): ItCmdbImportRow[] {
  const rows: ItCmdbImportRow[] = []
  for (const p of partials) {
    const sn = p.serial_number?.trim()
    if (!sn) continue
    rows.push({
      serial_number: sn,
      hostname: (p.hostname ?? '').trim(),
      intune: p.intune ?? null,
      user_name: p.user_name ?? null,
      device_type: p.device_type ?? null,
      notes: p.notes ?? null,
      location: p.location ?? null,
    })
  }
  return rows
}

/** Laatste rij wint bij dubbel serienummer in het bestand. */
export function dedupeBySerial(rows: ItCmdbImportRow[]): ItCmdbImportRow[] {
  const m = new Map<string, ItCmdbImportRow>()
  for (const r of rows) {
    m.set(r.serial_number, r)
  }
  return [...m.values()]
}
