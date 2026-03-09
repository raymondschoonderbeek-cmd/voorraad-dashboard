import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/api-middleware'

function isAuthBodyError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (d?.error !== true) return false
  const msg = String(d?.error_message ?? d?.message ?? d?.msg ?? '').toLowerCase().trim()
  return msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('not authorized') || msg.includes('not authorised')
}

/** Check of CycleSoftware API rechten heeft voor een dealer. */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dealer = request.nextUrl.searchParams.get('dealer')?.trim()
    if (!dealer) {
      return NextResponse.json({ error: 'Parameter dealer ontbreekt' }, { status: 400 })
    }

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

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({
        authorized: false,
        message: 'Deze winkel heeft nog geen toestemming gegeven om voorraad uit te lezen via CycleSoftware.',
      })
    }

    if (!response.ok) {
      return NextResponse.json({
        authorized: false,
        message: 'Voorraad ophalen bij CycleSoftware mislukt.',
      })
    }

    const data = await response.json().catch(() => null)
    if (isAuthBodyError(data)) {
      return NextResponse.json({
        authorized: false,
        message: 'CycleSoftware meldt dat deze winkel nog niet geautoriseerd is. De winkel moet toestemming geven.',
      })
    }

    return NextResponse.json({ authorized: true })
  } catch (err) {
    console.error('CycleSoftware status check fout:', err)
    return NextResponse.json({
      authorized: false,
      message: 'Controleren mislukt.',
    })
  }
}
