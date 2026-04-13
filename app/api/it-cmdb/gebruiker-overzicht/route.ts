import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * GET: alle devices, producten en licenties per gebruiker.
 * Geeft een lijst van gebruikers met hun assets (voor IT-beheer overzicht).
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  // Hardware per portalgebruiker
  const { data: hardware, error: hwErr } = await auth.supabase
    .from('it_cmdb_hardware')
    .select('id, serial_number, hostname, device_type, location, assigned_user_id, assigned_user_email, user_name, intune_snapshot')
    .not('assigned_user_id', 'is', null)
    .order('assigned_user_email')

  if (hwErr) return NextResponse.json({ error: hwErr.message }, { status: 500 })

  // Catalogus koppelingen (producten + licenties) voor portalgebruikers
  const { data: koppelingen, error: kopErr } = await auth.supabase
    .from('it_catalogus_gebruikers')
    .select(`
      id,
      user_id,
      microsoft_email,
      microsoft_naam,
      serienummer,
      datum_ingebruik,
      toegewezen_op,
      it_catalogus (
        id,
        naam,
        type,
        categorie,
        leverancier,
        versie
      )
    `)
    .order('toegewezen_op', { ascending: false })

  if (kopErr) return NextResponse.json({ error: kopErr.message }, { status: 500 })

  // Haal e-mails op via RPC voor alle user_ids
  const userIds = [
    ...new Set([
      ...(hardware ?? []).map(h => h.assigned_user_id as string).filter(Boolean),
      ...(koppelingen ?? []).map(k => k.user_id as string).filter(Boolean),
    ])
  ]

  const { data: emailRows } = userIds.length > 0
    ? await auth.supabase.rpc('get_user_emails', { user_ids: userIds })
    : { data: [] }

  const emailByUser = new Map<string, string>()
  for (const row of emailRows ?? []) {
    const uid = (row as { user_id: string }).user_id
    const email = (row as { email: string }).email
    if (uid && email) emailByUser.set(uid, email.toLowerCase())
  }

  // Bouw gebruiker-kaart op — key is user_id of microsoft_email
  type Gebruiker = {
    key: string
    user_id: string | null
    email: string
    naam: string | null
    devices: { id: string; serial_number: string; hostname: string | null; device_type: string | null; location: string | null }[]
    licenties: { id: string; naam: string; categorie: string; leverancier: string; versie: string | null; serienummer: string | null; datum_ingebruik: string | null }[]
    producten: { id: string; naam: string; categorie: string; leverancier: string; serienummer: string | null; datum_ingebruik: string | null }[]
  }

  const gebruikers = new Map<string, Gebruiker>()

  function getOfMaak(key: string, userId: string | null, email: string, naam: string | null): Gebruiker {
    if (!gebruikers.has(key)) {
      gebruikers.set(key, { key, user_id: userId, email, naam, devices: [], licenties: [], producten: [] })
    }
    return gebruikers.get(key)!
  }

  // Voeg hardware toe
  for (const hw of hardware ?? []) {
    const uid = hw.assigned_user_id as string
    const email = (hw.assigned_user_email as string | null) ?? emailByUser.get(uid) ?? uid
    const g = getOfMaak(uid, uid, email, null)
    g.devices.push({
      id: hw.id as string,
      serial_number: hw.serial_number as string,
      hostname: hw.hostname as string | null,
      device_type: hw.device_type as string | null,
      location: hw.location as string | null,
    })
  }

  // Voeg catalogus koppelingen toe
  for (const k of koppelingen ?? []) {
    const cat = k.it_catalogus as { id: string; naam: string; type: string; categorie: string; leverancier: string; versie: string | null } | null
    if (!cat) continue

    let key: string
    let userId: string | null
    let email: string
    let naam: string | null

    if (k.user_id) {
      key = k.user_id as string
      userId = k.user_id as string
      email = emailByUser.get(userId) ?? userId
      naam = null
    } else if (k.microsoft_email) {
      key = `ext:${k.microsoft_email as string}`
      userId = null
      email = k.microsoft_email as string
      naam = k.microsoft_naam as string | null
    } else {
      continue
    }

    const g = getOfMaak(key, userId, email, naam)

    if (cat.type === 'licentie') {
      g.licenties.push({
        id: cat.id,
        naam: cat.naam,
        categorie: cat.categorie,
        leverancier: cat.leverancier,
        versie: cat.versie,
        serienummer: k.serienummer as string | null,
        datum_ingebruik: k.datum_ingebruik as string | null,
      })
    } else {
      g.producten.push({
        id: cat.id,
        naam: cat.naam,
        categorie: cat.categorie,
        leverancier: cat.leverancier,
        serienummer: k.serienummer as string | null,
        datum_ingebruik: k.datum_ingebruik as string | null,
      })
    }
  }

  const lijst = [...gebruikers.values()].sort((a, b) =>
    a.email.localeCompare(b.email, 'nl')
  )

  return NextResponse.json({ gebruikers: lijst })
}
