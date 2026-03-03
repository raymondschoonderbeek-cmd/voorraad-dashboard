/** Environment variable checks - run bij opstarten */

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

const CONDITIONAL = {
  wilmar: ['WILMAR_API_KEY', 'WILMAR_PASSWORD'],
  cyclesoftware: ['CYCLESOFTWARE_USER', 'CYCLESOFTWARE_PASS', 'CYCLESOFTWARE_BASE_URL'],
} as const

export function checkEnv(): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  for (const key of REQUIRED) {
    if (!process.env[key]?.trim()) missing.push(key)
  }
  return { ok: missing.length === 0, missing }
}

export function getEnvWarnings(): string[] {
  const warnings: string[] = []
  const { missing } = checkEnv()
  if (missing.length > 0) {
    warnings.push(`Ontbrekende env vars: ${missing.join(', ')}`)
  }
  // Wilmar: alleen waarschuwen als geen van beide is gezet
  const wilmarSet = CONDITIONAL.wilmar.every(k => process.env[k]?.trim())
  const cycleSet = CONDITIONAL.cyclesoftware.every(k => process.env[k]?.trim())
  if (!wilmarSet && !cycleSet) {
    warnings.push('Geen voorraad-bron geconfigureerd: zet WILMAR_* of CYCLESOFTWARE_* env vars')
  }
  return warnings
}
