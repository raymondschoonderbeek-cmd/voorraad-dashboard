import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { dedupeBySerial, finalizeImportRows, mapItCmdbRow } from '@/lib/it-cmdb-import'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * POST multipart/form-data: veld `file` = .xlsx, .xls of .csv
 * Beste eerste rij: kolomkoppen (SerieNR, Hostname, Intune, Gebruiker, Type, Opmerkingen, Locatie).
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Geen formulierdata' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Geen bestand (veld file)' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Bestand te groot (max. 8 MB)' }, { status: 400 })
  }

  const name = 'name' in file && typeof (file as File).name === 'string' ? (file as File).name : 'upload'
  const lower = name.toLowerCase()
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
    return NextResponse.json({ error: 'Alleen .xlsx, .xls of .csv' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: true })
  } catch {
    return NextResponse.json({ error: 'Kon het bestand niet lezen' }, { status: 400 })
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return NextResponse.json({ error: 'Geen werkblad gevonden' }, { status: 400 })
  }

  const sheet = workbook.Sheets[sheetName]
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })

  const partials = jsonRows.map(mapItCmdbRow)
  const finalized = finalizeImportRows(partials)
  const unique = dedupeBySerial(finalized)

  if (unique.length === 0) {
    return NextResponse.json({
      error:
        'Geen geldige rijen met serienummer. Controleer of de eerste rij kolomkoppen bevat (bijv. SerieNR, Hostname, Intune, Gebruiker, Type, Opmerkingen, Locatie).',
      parsed: 0,
      inserted: 0,
      updated: 0,
    }, { status: 400 })
  }

  let inserted = 0
  let updated = 0
  const errors: string[] = []

  for (let i = 0; i < unique.length; i++) {
    const row = unique[i]
    const label = `${row.serial_number} (rij ${i + 2})`

    const { data: existing, error: selErr } = await auth.supabase
      .from('it_cmdb_hardware')
      .select('id')
      .eq('serial_number', row.serial_number)
      .maybeSingle()

    if (selErr) {
      errors.push(`${label}: ${selErr.message}`)
      continue
    }

    const payload = {
      serial_number: row.serial_number,
      hostname: row.hostname,
      intune: row.intune,
      user_name: row.user_name,
      device_type: row.device_type,
      notes: row.notes,
      location: row.location,
      updated_at: new Date().toISOString(),
    }

    if (existing?.id) {
      const { error: upErr } = await auth.supabase.from('it_cmdb_hardware').update(payload).eq('id', existing.id)
      if (upErr) errors.push(`${label}: ${upErr.message}`)
      else updated++
    } else {
      const { error: insErr } = await auth.supabase.from('it_cmdb_hardware').insert({
        ...payload,
        created_by: auth.user.id,
      })
      if (insErr) errors.push(`${label}: ${insErr.message}`)
      else inserted++
    }
  }

  return NextResponse.json({
    ok: true,
    total_in_file: unique.length,
    inserted,
    updated,
    errors: errors.length ? errors : undefined,
  })
}
