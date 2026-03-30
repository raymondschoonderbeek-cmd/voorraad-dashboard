import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { fetchAllManagedDevices, isIntuneGraphConfigured, mapManagedDeviceToCmdb } from '@/lib/intune-graph'

/** GET: of Intune/Graph server-side is geconfigureerd (zonder geheimen te tonen). */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  return NextResponse.json({ configured: isIntuneGraphConfigured() })
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * POST: synchroniseer Microsoft Intune managed devices → it_cmdb_hardware (match op serienummer).
 * Vereist server-env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET + Graph app-rechten.
 * Overschrijft bij bestaande rij: hostname, intune, user_name, device_type — niet: notes, location, assigned_user_id.
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  if (!isIntuneGraphConfigured()) {
    return NextResponse.json(
      {
        error:
          'Intune-sync is niet geconfigureerd. Zet AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET in de serveromgeving en verleen Graph-recht DeviceManagementManagedDevices.Read.All.',
      },
      { status: 503 }
    )
  }

  let graphDevices
  try {
    graphDevices = await fetchAllManagedDevices()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Graph-fout'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const skippedNoSerial = graphDevices.filter(d => !d.serialNumber?.trim()).length
  const bySerial = new Map<
    string,
    ReturnType<typeof mapManagedDeviceToCmdb>
  >()

  for (const d of graphDevices) {
    try {
      const m = mapManagedDeviceToCmdb(d)
      bySerial.set(m.serial_number, m)
    } catch {
      /* geen serienummer na trim */
    }
  }

  const serials = [...bySerial.keys()]
  const existingSerials = new Set<string>()
  for (const part of chunk(serials, 400)) {
    if (part.length === 0) continue
    const { data, error } = await auth.supabase.from('it_cmdb_hardware').select('serial_number').in('serial_number', part)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of data ?? []) {
      existingSerials.add(row.serial_number)
    }
  }

  let inserted = 0
  let updated = 0
  const errors: string[] = []
  const now = new Date().toISOString()

  const toInsert = serials.filter(s => !existingSerials.has(s))
  const toUpdate = serials.filter(s => existingSerials.has(s))

  for (const batch of chunk(toInsert, 25)) {
    await Promise.all(
      batch.map(async serial => {
        const m = bySerial.get(serial)!
        const { error } = await auth.supabase.from('it_cmdb_hardware').insert({
          serial_number: m.serial_number,
          hostname: m.hostname,
          intune: m.intune,
          intune_snapshot: m.intune_snapshot,
          user_name: m.user_name,
          device_type: m.device_type,
          notes: null,
          location: null,
          assigned_user_id: null,
          created_by: auth.user.id,
          updated_at: now,
        })
        if (error) errors.push(`${serial}: ${error.message}`)
        else inserted++
      })
    )
  }

  for (const batch of chunk(toUpdate, 25)) {
    await Promise.all(
      batch.map(async serial => {
        const m = bySerial.get(serial)!
        const { error } = await auth.supabase
          .from('it_cmdb_hardware')
          .update({
            hostname: m.hostname,
            intune: m.intune,
            intune_snapshot: m.intune_snapshot,
            user_name: m.user_name,
            device_type: m.device_type,
            updated_at: now,
          })
          .eq('serial_number', serial)
        if (error) errors.push(`${serial}: ${error.message}`)
        else updated++
      })
    )
  }

  return NextResponse.json({
    ok: true,
    graphDevices: graphDevices.length,
    uniqueWithSerial: serials.length,
    skippedNoSerial,
    inserted,
    updated,
    errors: errors.length ? errors.slice(0, 25) : undefined,
    errorCount: errors.length,
  })
}
