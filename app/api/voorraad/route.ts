import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const zoekterm = searchParams.get('q') || ''
  const dealerNummer = searchParams.get('dealer') || ''

  if (!dealerNummer) return NextResponse.json({ error: 'Geen dealer opgegeven' }, { status: 400 })

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
      next: { revalidate: 60 }
    }
  )

  const data = await response.json()

  // Filter op zoekterm
  if (zoekterm && Array.isArray(data)) {
    const gefilterd = data.filter((item: any) =>
      Object.values(item).some(waarde =>
        String(waarde).toLowerCase().includes(zoekterm.toLowerCase())
      )
    )
    return NextResponse.json(gefilterd)
  }

  return NextResponse.json(data)
}