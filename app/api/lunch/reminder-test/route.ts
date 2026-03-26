import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { getAmsterdamYmd } from '@/lib/amsterdam-time'
import { sendLunchReminderToEmail } from '@/lib/lunch-reminder-mail'

/**
 * POST: stuur test-herinnering naar het e-mailadres van de ingelogde beheerder.
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })

  const mailgunOk =
    !!process.env.MAILGUN_API_KEY?.trim() &&
    !!process.env.MAILGUN_DOMAIN?.trim() &&
    !!process.env.MAILGUN_FROM?.trim()
  if (!mailgunOk) {
    return NextResponse.json({ error: 'Mailgun niet geconfigureerd (MAILGUN_*).' }, { status: 503 })
  }

  const { user } = admin
  const email = user.email?.trim()
  if (!email) {
    return NextResponse.json({ error: 'Geen e-mail op account' }, { status: 400 })
  }

  let orderDate = getAmsterdamYmd(new Date())
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body.orderDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.orderDate)) {
      orderDate = body.orderDate
    }
  } catch {
    /* default vandaag */
  }

  try {
    await sendLunchReminderToEmail(email, orderDate)
    return NextResponse.json({ ok: true, to: email, orderDate })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Versturen mislukt'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
