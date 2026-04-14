import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { fetchAllManagedDevices, isIntuneGraphConfigured, mapManagedDeviceToCmdb } from '@/lib/intune-graph'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'

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
 * Overschrijft bij bestaande rij: hostname, intune, user_name, device_type — niet: notes, location.
 * Koppelt assigned_user_id automatisch op basis van Intune e-mailadres (alleen als nog niet handmatig ingesteld).
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

  // Bouw email → user_id map op basis van alle auth.users (via admin-client)
  // Dit werkt ook als de IT-beheerder geen 'admin' rol heeft in gebruiker_rollen.
  const emailToUserId = new Map<string, string>()
  if (hasAdminKey()) {
    const adminClient = createAdminClient()
    let page = 1
    while (true) {
      const { data: { users: batch } } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
      if (!batch || batch.length === 0) break
      for (const u of batch) {
        const email = (u.email ?? '').toLowerCase().trim()
        if (email) emailToUserId.set(email, u.id)
      }
      if (batch.length < 1000) break
      page++
    }
  }

  const skippedNoSerial = graphDevices.filter(d => !d.serialNumber?.trim()).length
  const bySerial = new Map<string, ReturnType<typeof mapManagedDeviceToCmdb>>()

  for (const d of graphDevices) {
    try {
      const m = mapManagedDeviceToCmdb(d)
      bySerial.set(m.serial_number, m)
    } catch {
      /* geen serienummer na trim */
    }
  }

  const serials = [...bySerial.keys()]

  // Haal bestaande devices op inclusief assigned_user_id om handmatige koppelingen te bewaren
  const existingMap = new Map<string, { assigned_user_id: string | null }>()
  for (const part of chunk(serials, 400)) {
    if (part.length === 0) continue
    const { data, error } = await auth.supabase
      .from('it_cmdb_hardware')
      .select('serial_number, assigned_user_id')
      .in('serial_number', part)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of data ?? []) {
      existingMap.set(row.serial_number, { assigned_user_id: row.assigned_user_id ?? null })
    }
  }

  let inserted = 0
  let updated = 0
  let autoGekoppeld = 0
  const errors: string[] = []
  const now = new Date().toISOString()

  const toInsert = serials.filter(s => !existingMap.has(s))
  const toUpdate = serials.filter(s => existingMap.has(s))

  // Helper: zoek user_id op basis van Intune e-mailadres
  function findUserId(m: ReturnType<typeof mapManagedDeviceToCmdb>): string | null {
    const snap = m.intune_snapshot as { emailAddress?: string; userPrincipalName?: string } | null
    const emails = [
      snap?.emailAddress?.toLowerCase().trim(),
      snap?.userPrincipalName?.toLowerCase().trim(),
      m.user_name?.toLowerCase().trim(),
    ].filter((e): e is string => !!e && e.includes('@'))
    for (const email of emails) {
      const uid = emailToUserId.get(email)
      if (uid) return uid
    }
    return null
  }

  for (const batch of chunk(toInsert, 25)) {
    await Promise.all(
      batch.map(async serial => {
        const m = bySerial.get(serial)!
        const autoUserId = findUserId(m)
        const { error } = await auth.supabase.from('it_cmdb_hardware').insert({
          serial_number: m.serial_number,
          hostname: m.hostname,
          intune: m.intune,
          intune_snapshot: m.intune_snapshot,
          user_name: m.user_name,
          device_type: m.device_type,
          notes: null,
          location: null,
          assigned_user_id: autoUserId,
          created_by: auth.user.id,
          updated_at: now,
        })
        if (error) errors.push(`${serial}: ${error.message}`)
        else {
          inserted++
          if (autoUserId) autoGekoppeld++
        }
      })
    )
  }

  for (const batch of chunk(toUpdate, 25)) {
    await Promise.all(
      batch.map(async serial => {
        const m = bySerial.get(serial)!
        const existing = existingMap.get(serial)!
        const autoUserId = findUserId(m)

        // Alleen overschrijven als nog niet handmatig gekoppeld
        const newUserId = existing.assigned_user_id ?? autoUserId

        const updatePayload: Record<string, unknown> = {
          hostname: m.hostname,
          intune: m.intune,
          intune_snapshot: m.intune_snapshot,
          user_name: m.user_name,
          device_type: m.device_type,
          updated_at: now,
        }
        if (!existing.assigned_user_id && autoUserId) {
          updatePayload.assigned_user_id = newUserId
          autoGekoppeld++
        }

        const { error } = await auth.supabase
          .from('it_cmdb_hardware')
          .update(updatePayload)
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
    autoGekoppeld,
    errors: errors.length ? errors.slice(0, 25) : undefined,
    errorCount: errors.length,
  })
}
