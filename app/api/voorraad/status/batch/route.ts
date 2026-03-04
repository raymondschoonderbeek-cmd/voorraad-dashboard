import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

function isAuthBodyError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (d?.error !== true) return false
  const msg = String(d?.error_message ?? d?.message ?? d?.msg ?? '').toLowerCase().trim()
  return msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('not authorized') || msg.includes('not authorised')
}

async function checkDealer(dealer: string): Promise<boolean> {
  const credentials = Buffer.from(
    `${process.env.CYCLESOFTWARE_USER}:${process.env.CYCLESOFTWARE_PASS}`
  ).toString('base64')

  const response = await fetch(`${process.env.CYCLESOFTWARE_BASE_URL}/${dealer}`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    next: { revalidate: 60 },
  })

  if (response.status === 401 || response.status === 403) return false
  if (!response.ok) return false

  const data = await response.json().catch(() => null)
  if (isAuthBodyError(data)) return false
  return true
}

/** Batch-check CycleSoftware API-status en update cache in DB (alleen admin) */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })
    const { supabase } = auth

    const body = await request.json().catch(() => ({}))
    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) return NextResponse.json({ results: {} })

    const results: Record<number, { authorized: boolean }> = {}
    const now = new Date().toISOString()

    await Promise.all(
      items.map(async ({ id, dealer_nummer }: { id: number; dealer_nummer: string }) => {
        if (!id || !dealer_nummer?.trim()) return
        const authorized = await checkDealer(dealer_nummer.trim())
        results[id] = { authorized }
        await supabase
          .from('winkels')
          .update({ cycle_api_authorized: authorized, cycle_api_checked_at: now })
          .eq('id', id)
      })
    )

    return NextResponse.json({ results })
  } catch (err) {
    console.error('CycleSoftware batch status fout:', err)
    return NextResponse.json({ error: 'Controleren mislukt.' }, { status: 500 })
  }
}
