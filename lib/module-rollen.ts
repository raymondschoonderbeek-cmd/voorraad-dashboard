export type ModuleRol = 'viewer' | 'bewerker' | 'admin'

export const MODULE_ROL_LABELS: Record<ModuleRol, string> = {
  viewer:   'Viewer',
  bewerker: 'Bewerker',
  admin:    'Beheerder',
}

export const MODULE_ROL_ORDER: ModuleRol[] = ['viewer', 'bewerker', 'admin']

/** True als de gebruiker minimaal het vereiste niveau heeft. */
export function heeftMinimaalRol(
  rollen: Record<string, ModuleRol>,
  module: string,
  minimaal: ModuleRol,
  isGlobalAdmin: boolean
): boolean {
  if (isGlobalAdmin) return true
  const rol = rollen[module]
  if (!rol) return false
  return MODULE_ROL_ORDER.indexOf(rol) >= MODULE_ROL_ORDER.indexOf(minimaal)
}
