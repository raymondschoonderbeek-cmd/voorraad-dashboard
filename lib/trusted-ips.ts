/**
 * Controleert of een IP-adres in de vertrouwde lijst staat.
 * TRUSTED_IPS in .env: komma-gescheiden, bijv. "192.168.1.100,192.168.1.0/24,10.0.0.1"
 * Ondersteunt exacte IP's en CIDR-notatie (bijv. /24, /16).
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

let cachedEntries: (string | { base: number; mask: number })[] | null = null

function getTrustedEntries(): (string | { base: number; mask: number })[] {
  if (cachedEntries) return cachedEntries
  const raw = process.env.TRUSTED_IPS ?? ''
  cachedEntries = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      if (entry.includes('/')) {
        const cidr = parseCidr(entry)
        return cidr ?? entry // fallback naar exact match als parse faalt
      }
      return entry
    })
  return cachedEntries
}

export function isIpTrusted(clientIp: string | null | undefined): boolean {
  if (!clientIp?.trim()) return false
  const entries = getTrustedEntries()
  if (entries.length === 0) return false

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

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return request.headers.get('x-real-ip') ?? null
}
