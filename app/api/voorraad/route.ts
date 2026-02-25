import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const zoekterm = searchParams.get('q') || ''
    const dealerNummer = searchParams.get('dealer') || ''

    if (!dealerNummer) {
      return NextResponse.json(
        { error: 'Geen dealer opgegeven' },
        { status: 400 }
      )
    }

    const credentials = Buffer.from(
      `${process.env.CYCLESOFTWARE_USER}:${process.env.CYCLESOFTWARE_PASS}`
    ).toString('base64')

    const response = await fetch(
      `${process.env.CYCLESOFTWARE_BASE_URL}/${dealerNummer}`,
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        next: { revalidate: 60 },
      }
    )

    // 🔴 1️⃣ Geen autorisatie bij CycleSoftware
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          error: 'AUTH_REQUIRED',
          message:
            'Deze winkel heeft nog geen toestemming gegeven om voorraad uit te lezen via CycleSoftware.',
          // 🔧 Als je ooit een echte autorisatielink hebt, kun je die hier zetten:
          authorizeUrl: null,
        },
        { status: 403 }
      )
    }

    // 🔴 2️⃣ Andere upstream error
    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'UPSTREAM_ERROR',
          message: 'Voorraad ophalen bij CycleSoftware mislukt.',
        },
        { status: 502 }
      )
    }

    const data = await response.json()

    // 🔍 Filter op zoekterm
    if (zoekterm && Array.isArray(data)) {
      const gefilterd = data.filter((item: any) =>
        Object.values(item).some(waarde =>
          String(waarde).toLowerCase().includes(zoekterm.toLowerCase())
        )
      )
      return NextResponse.json(gefilterd)
    }

    return NextResponse.json(data)

  } catch (error) {
    console.error('Voorraad API fout:', error)

    return NextResponse.json(
      {
        error: 'SERVER_ERROR',
        message: 'Er ging iets mis bij het ophalen van de voorraad.',
      },
      { status: 500 }
    )
  }
}