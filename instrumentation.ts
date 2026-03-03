export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnvWarnings } = await import('@/lib/env')
    const warnings = getEnvWarnings()
    if (warnings.length > 0) {
      console.warn('[voorraad-dashboard] Env waarschuwingen:', warnings.join('; '))
    }
  }
}
