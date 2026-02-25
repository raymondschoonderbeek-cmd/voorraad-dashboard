import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function isAuthBodyError(data: any) {
  if (!data || typeof data !== 'object') return false
  if (data?.error !== true) return false

  const msg =
    String(data?.error_message ?? data?.message ?? data?.msg ?? '')
      .toLowerCase()
      .trim()

  return msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('not authorized') || msg.includes('not authorised')
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const zoekterm = searchParams.get('q') || ''
    const dealerNummer = searchParams.get('dealer') || ''
    if (!dealerNummer) return NextResponse.json({ error: 'Geen dealer opgegeven' }, { status: 400 })

    const credentials = Buffer.from(
      `${process.env.CYCLESOFTWARE_USER}:${process.env.CYCLESOFTWARE_PASS}`
    ).toString('base64')

    const response = await fetch(`${process.env.CYCLESOFTWARE_BASE_URL}/${dealerNummer}`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 60 },
    })

    // 1) HTTP auth-probleem
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          error: 'AUTH_REQUIRED',
          message: 'Deze winkel heeft nog geen toestemming gegeven om voorraad uit te lezen via CycleSoftware.',
          instructions: [
            'Log in bij CycleSoftware met het account van de winkel.',
            'Controleer/activeer API-toegang (koppeling/autorisatie voor voorraad).',
            'Sla op en probeer daarna opnieuw in het dashboard.',
          ],
        },
        { status: 403 }
      )
    }

    // 2) Andere upstream errors
    if (!response.ok) {
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'Voorraad ophalen bij CycleSoftware mislukt.' },
        { status: 502 }
      )
    }

    const data = await response.json().catch(() => null)

    // 3) Body auth-probleem (status 200 maar error true)
    if (isAuthBodyError(data)) {
      return NextResponse.json(
        {
          error: 'AUTH_REQUIRED',
          message:
            'CycleSoftware meldt dat deze winkel nog niet geautoriseerd is (Unauthorized). De winkel moet toestemming geven.',
          instructions: [
            'Log in bij CycleSoftware met het account van de winkel.',
            'Activeer/controleer de API-toestemming voor voorraad (autorisatie/koppeling).',
            'Probeer daarna opnieuw in het dashboard.',
          ],
          upstream: {
            error_message: data?.error_message ?? data?.message ?? data?.msg ?? null,
          },
        },
        { status: 403 }
      )
    }

    // 4) Normale dataflow: filter op zoekterm
    if (zoekterm && Array.isArray(data)) {
      const needle = zoekterm.toLowerCase()
      const gefilterd = data.filter((item: any) =>
        Object.values(item).some(waarde => String(waarde).toLowerCase().includes(needle))
      )
      return NextResponse.json(gefilterd)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Voorraad API fout:', err)
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: 'Er ging iets mis bij het ophalen van de voorraad.' },
      { status: 500 }
    )
  }
}