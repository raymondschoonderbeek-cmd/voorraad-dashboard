/** Dashboard-tegels (id''s in volgorde voor UI) */
export const DASHBOARD_MODULE_ORDER = [
  'voorraad',
  'lunch',
  'brand-groep',
  'campagne-fietsen',
  'branche-nieuws',
  'interne-nieuws',
  'nieuws-redacteur',
  'it-cmdb',
  'beschikbaarheid',
  'winkels',
  'gazelle-orders',
  'meer',
] as const

export type DashboardModuleId = (typeof DASHBOARD_MODULE_ORDER)[number]

export type LandCode = 'Netherlands' | 'Belgium'

const ALL_MODULES: DashboardModuleId[] = [...DASHBOARD_MODULE_ORDER]

function isModuleId(x: unknown): x is DashboardModuleId {
  return typeof x === 'string' && (ALL_MODULES as readonly string[]).includes(x)
}

/** Expliciete JSON-array uit DB, of null = niet ingesteld (gebruik rol-defaults).
 *  Lege array [] = expliciet leeg (geen modules), onderscheid van null = niet ingesteld. */
export function parseModulesToegang(raw: unknown): DashboardModuleId[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  const out: DashboardModuleId[] = []
  for (const x of raw) {
    if (isModuleId(x) && !out.includes(x)) out.push(x)
  }
  return out
}

export type ProfileModuleInput = {
  modules_toegang?: unknown
  lunch_module_enabled?: boolean | null
  campagne_fietsen_toegang?: boolean | null
}

/**
 * Bepaal welke dashboard-modules zichtbaar zijn.
 * `modules_toegang` in DB overschrijft; anders legacy op basis van rol + profielvlaggen.
 */
export function resolveDashboardModules(
  rol: string | undefined,
  profile: ProfileModuleInput | null | undefined,
  isAdmin: boolean
): DashboardModuleId[] {
  const explicit = parseModulesToegang(profile?.modules_toegang)
  if (explicit !== null) return explicit

  if (isAdmin || rol === 'admin') return [...ALL_MODULES]
  if (rol === 'lunch') return ['lunch']

  const set = new Set<DashboardModuleId>()
  set.add('voorraad')
  set.add('brand-groep')
  set.add('branche-nieuws')
  set.add('beschikbaarheid')
  set.add('meer')
  if (profile?.lunch_module_enabled === true) set.add('lunch')
  if (profile?.campagne_fietsen_toegang === true) set.add('campagne-fietsen')
  return DASHBOARD_MODULE_ORDER.filter(id => set.has(id))
}

/** null = geen beperking (alle landen); anders subset */
export function parseLandenToegang(raw: unknown): LandCode[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  const allowed = raw.filter((x): x is LandCode => x === 'Netherlands' || x === 'Belgium')
  if (allowed.length === 0) return null
  if (allowed.length === 2) return null
  return [...new Set(allowed)]
}

export function landenToegangForDb(selected: LandCode[] | null): LandCode[] | null {
  if (!selected || selected.length === 0) return null
  if (selected.length === 2) return null
  return [...new Set(selected)]
}

/** Body van API: array module-id''s; lunch-rol → altijd alleen lunch */
export function normalizeModulesFromBody(raw: unknown, rol: string): DashboardModuleId[] | null {
  if (rol === 'lunch') return ['lunch']
  if (!Array.isArray(raw)) return null
  const allowed = new Set(ALL_MODULES)
  const out: DashboardModuleId[] = []
  for (const x of raw) {
    if (typeof x === 'string' && allowed.has(x as DashboardModuleId) && !out.includes(x as DashboardModuleId)) {
      out.push(x as DashboardModuleId)
    }
  }
  return out.length > 0 ? out : null
}

/** Intern: onderscheid null (niet ingesteld) van [] (expliciet leeg) voor weergave in beheer-UI */
export function hasExplicitModules(raw: unknown): boolean {
  return Array.isArray(raw)
}
