import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { resolveDashboardModules } from '@/lib/dashboard-modules'
import { DEFAULT_WORKFLOW, type WorkflowStap } from '@/app/api/admin/gazelle-observer/route'

async function requireGazelleAccess() {
  const { user, supabase, isAdmin } = await requireAuth()
  if (!user) return { ok: false as const, status: 401 }
  if (isAdmin) return { ok: true as const }
  const { data: profile } = await supabase.from('profiles').select('modules_toegang, lunch_module_enabled, campagne_fietsen_toegang').eq('user_id', user.id).maybeSingle()
  const { data: rolData } = await supabase.from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  const modules = resolveDashboardModules(rolData?.rol, profile, false)
  if (!modules.includes('gazelle-orders')) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function GET() {
  const auth = await requireGazelleAccess()
  if (!auth.ok) return NextResponse.json({ workflow: DEFAULT_WORKFLOW })
  if (!hasAdminKey()) return NextResponse.json({ workflow: DEFAULT_WORKFLOW })

  const { data } = await createAdminClient()
    .from('gazelle_observer_instellingen')
    .select('workflow_tekst')
    .eq('id', 1)
    .maybeSingle()

  const workflow = Array.isArray(data?.workflow_tekst) && data.workflow_tekst.length > 0
    ? data.workflow_tekst as WorkflowStap[]
    : DEFAULT_WORKFLOW

  return NextResponse.json({ workflow })
}
