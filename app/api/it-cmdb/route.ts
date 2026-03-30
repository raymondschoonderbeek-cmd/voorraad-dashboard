import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

function ilikeFragment(value: string): string {
  return value.replace(/%/g, '').trim()
}

/**
 * GET: alle hardware-regels.
 * Kolomfilters (AND): serial, hostname, intune, user_name, device_type, notes, location.
 * Globaal zoeken (OR over kolommen): q.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  const serial = searchParams.get('serial')?.trim()
  const hostname = searchParams.get('hostname')?.trim()
  const intune = searchParams.get('intune')?.trim()
  const user_name = searchParams.get('user_name')?.trim()
  const device_type = searchParams.get('device_type')?.trim()
  const notes = searchParams.get('notes')?.trim()
  const location = searchParams.get('location')?.trim()

  let query = auth.supabase
    .from('it_cmdb_hardware')
    .select('*')
    .order('serial_number', { ascending: true })

  if (serial) {
    const s = ilikeFragment(serial)
    if (s) query = query.ilike('serial_number', `%${s}%`)
  }
  if (hostname) {
    const s = ilikeFragment(hostname)
    if (s) query = query.ilike('hostname', `%${s}%`)
  }
  if (intune) {
    const s = ilikeFragment(intune)
    if (s) query = query.ilike('intune', `%${s}%`)
  }
  if (user_name) {
    const s = ilikeFragment(user_name)
    if (s) query = query.ilike('user_name', `%${s}%`)
  }
  if (device_type) {
    const s = ilikeFragment(device_type)
    if (s) query = query.ilike('device_type', `%${s}%`)
  }
  if (notes) {
    const s = ilikeFragment(notes)
    if (s) query = query.ilike('notes', `%${s}%`)
  }
  if (location) {
    const s = ilikeFragment(location)
    if (s) query = query.ilike('location', `%${s}%`)
  }

  if (q) {
    const safe = ilikeFragment(q)
    if (safe) {
      query = query.or(
        `serial_number.ilike.%${safe}%,hostname.ilike.%${safe}%,user_name.ilike.%${safe}%,device_type.ilike.%${safe}%,notes.ilike.%${safe}%,location.ilike.%${safe}%,intune.ilike.%${safe}%`
      )
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const serial_number = typeof body.serial_number === 'string' ? body.serial_number.trim() : ''
  if (!serial_number) return NextResponse.json({ error: 'serial_number is verplicht' }, { status: 400 })

  const row = {
    serial_number,
    hostname: typeof body.hostname === 'string' ? body.hostname.trim() : '',
    intune: typeof body.intune === 'string' ? body.intune.trim() || null : null,
    user_name: typeof body.user_name === 'string' ? body.user_name.trim() || null : null,
    device_type: typeof body.device_type === 'string' ? body.device_type.trim() || null : null,
    notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    location: typeof body.location === 'string' ? body.location.trim() || null : null,
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await auth.supabase.from('it_cmdb_hardware').insert(row).select('*').single()
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Dit serienummer bestaat al.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data })
}
