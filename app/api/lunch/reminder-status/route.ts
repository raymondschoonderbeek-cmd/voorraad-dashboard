import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { getReminderCronReadiness } from '@/lib/lunch-reminder-cron-status'

/**
 * GET: status van automatische herinneringsmail (zelfde checks als cron, geen verzending).
 * Alleen admin; geen CRON_SECRET nodig.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })

  try {
    const snapshot = await getReminderCronReadiness(new Date())
    return NextResponse.json(snapshot)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Status ophalen mislukt'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
