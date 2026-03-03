/**
 * Controleert of een IP-adres in de vertrouwde lijst staat.
 * Ondersteunt: env TRUSTED_IPS + database tabel trusted_ips.
 * Exacte IP's en CIDR-notatie (bijv. /24, /16).
 */
function ipToNumber(ip: string): number | null {
  const parts = ip.trim().split('.').map(Number)
  if (parts.length !== 4) return null
  if (parts.some(p => isNaN(p) || p < 0 || p > 255)) return null
  return (parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!
}

function parseCidr(entry: string): { base: number; mask: number } | null {
  const [ipPart, maskPart] = entry.trim().split('/')
  if (!ipPart) return null
  const base = ipToNumber(ipPart)
  if (base == null) return null
  const bits = maskPart ? parseInt(maskPart, 10) : 32
  if (isNaN(bits) || bits < 0 || bits > 32) return null
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return { base: base & mask, mask }
}

function isIpInCidr(ipNum: number, cidr: { base: number; mask: number }): boolean {
  return (ipNum & cidr.mask) === cidr.base
}

let cachedEnvEntries: (string | { base: number; mask: number })[] | null = null

function parseRawEntries(raw: string): (string | { base: number; mask: number })[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      if (entry.includes('/')) {
        const cidr = parseCidr(entry)
        return cidr ?? entry
      }
      return entry
    })
}

function getEnvEntries(): (string | { base: number; mask: number })[] {
  if (cachedEnvEntries) return cachedEnvEntries
  cachedEnvEntries = parseRawEntries(process.env.TRUSTED_IPS ?? '')
  return cachedEnvEntries
}

/** Parseert een lijst IP/CIDR strings naar entries voor matching */
export function parseTrustedIpEntries(ipList: string[]): (string | { base: number; mask: number })[] {
  return parseRawEntries(ipList.join(','))
}

/** Controleert of clientIp matcht met de gegeven entries */
export function isIpInEntries(
  clientIp: string | null | undefined,
  entries: (string | { base: number; mask: number })[]
): boolean {
  if (!clientIp?.trim() || entries.length === 0) return false
  const ipNum = ipToNumber(clientIp.split(',')[0]!.trim())
  if (ipNum == null) return false
  for (const entry of entries) {
    if (typeof entry === 'string') {
      if (ipToNumber(entry) === ipNum) return true
    } else {
      if (isIpInCidr(ipNum, entry)) return true
    }
  }
  return false
}

/** Controleert of IP vertrouwd is (env + optionele dbEntries) */
export function isIpTrusted(
  clientIp: string | null | undefined,
  dbEntries?: string[]
): boolean {
  const envEntries = getEnvEntries()
  const dbParsed = dbEntries?.length ? parseTrustedIpEntries(dbEntries) : []
  const allEntries = [...envEntries, ...dbParsed]
  return isIpInEntries(clientIp, allEntries)
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return request.headers.get('x-real-ip') ?? null
}
