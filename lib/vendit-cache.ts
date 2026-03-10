/**
 * Cache voor vendit RPC-resultaten om Disk IO te verminderen.
 * De RPCs get_vendit_dealer_stats_json en get_vendit_dealer_numbers_json
 * doen full table scans op vendit_stock; caching beperkt de frequentie.
 */

const TTL_MS = 10_000 // 10 seconden

type CacheEntry<T> = { data: T; expiresAt: number }

let statsCache: CacheEntry<Record<string, string>> | null = null
let numbersCache: CacheEntry<Set<string>> | null = null

function isStale<T>(entry: CacheEntry<T> | null): boolean {
  return !entry || Date.now() > entry.expiresAt
}

export function getCachedVenditStats(): Record<string, string> | null {
  if (isStale(statsCache)) return null
  return statsCache!.data
}

export function setCachedVenditStats(data: Record<string, string>): void {
  statsCache = { data, expiresAt: Date.now() + TTL_MS }
}

export function getCachedVenditDealerNumbers(): Set<string> | null {
  if (isStale(numbersCache)) return null
  return numbersCache!.data
}

export function setCachedVenditDealerNumbers(data: Set<string>): void {
  numbersCache = { data, expiresAt: Date.now() + TTL_MS }
}
