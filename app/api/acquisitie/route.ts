import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { fetchSharepointListItems, transformListItems, isSharepointConfigured } from '@/lib/sharepoint-list'
import { resolveDashboardModules, type ProfileModuleInput } from '@/lib/dashboard-modules'

/** GET: haal contactmomenten acquisitie op van SharePoint */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  try {
    // Check auth
    const { user, supabase, isAdmin } = await requireAuth()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check access control
    const { data: rolData } = await supabase
      .from('gebruiker_rollen')
      .select('rol')
      .eq('user_id', user.id)
      .maybeSingle()

    const { data: profileData } = await supabase
      .from('profiles')
      .select('modules_toegang, lunch_module_enabled, campagne_fietsen_toegang')
      .eq('user_id', user.id)
      .maybeSingle()

    // Bepaal module-toegang
    const modules = resolveDashboardModules(rolData?.rol, profileData as ProfileModuleInput | null, false)
    const hasAccess = isAdmin || modules.includes('acquisitie')

    if (!hasAccess) {
      return NextResponse.json({ error: 'Geen toegang tot acquisitie-module' }, { status: 403 })
    }

    // Check SharePoint config
    if (!isSharepointConfigured()) {
      return NextResponse.json(
        { error: 'SharePoint niet geconfigureerd. Zet AZURE_* env vars.' },
        { status: 503 },
      )
    }

    // Fetch data from SharePoint
    const items = await fetchSharepointListItems()
    const transformed = transformListItems(items)

    // tijdelijk: raw eerste item meesturen voor debug
    const rawSample = items[0]?.fields ?? null

    // Cache-headers: 5 minuten
    return NextResponse.json(
      { data: transformed, count: transformed.length, rawSample },
      {
        headers: {
          'Cache-Control': 'private, max-age=300',
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Acquisitie API-fout:', msg)
    return NextResponse.json(
      { error: msg },
      { status: 500 },
    )
  }
}
