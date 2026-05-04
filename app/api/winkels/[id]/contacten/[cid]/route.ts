import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, cid } = await params
  const { error } = await supabase
    .from('winkel_contacten')
    .delete()
    .eq('id', Number(cid))
    .eq('winkel_id', Number(id))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
