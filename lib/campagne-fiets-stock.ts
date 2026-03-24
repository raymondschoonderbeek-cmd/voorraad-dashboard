/** Parse response body van GET /api/voorraad naar platte item-array */
export function parseVoorraadItems(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[]
  if (json && typeof json === 'object' && 'products' in json) {
    const p = (json as { products?: unknown }).products
    if (Array.isArray(p)) return p as Record<string, unknown>[]
  }
  return []
}

/**
 * Som van voorraad voor campagnefiets: match op EAN (barcode) of leveranciersartikel.
 * Eén regel telt maximaal één keer (OR op velden).
 */
export function stockForCampagneFiets(
  items: Record<string, unknown>[],
  eanCode: string,
  bestelnummerLeverancier: string
): number {
  const eanN = String(eanCode ?? '').trim()
  const supN = String(bestelnummerLeverancier ?? '').trim().toLowerCase()
  let total = 0
  for (const it of items) {
    const bc = String(it.BARCODE ?? it.barcode ?? '').trim()
    const sup = String(it.SUPPLIER_PRODUCT_NUMBER ?? it.supplierProductNumber ?? '').trim().toLowerCase()
    const matchEan = eanN && bc === eanN
    const matchSup = supN && sup === supN
    if (!matchEan && !matchSup) continue
    const stock = Number(it.STOCK ?? it.stock ?? it.AVAILABLE_STOCK ?? it.availableStock ?? 0) || 0
    total += stock
  }
  return total
}
