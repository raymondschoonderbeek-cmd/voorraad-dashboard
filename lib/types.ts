/** API & domain types */

export type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
  postcode?: string
  straat?: string
  huisnummer?: string
  stad?: string
  land?: 'Netherlands' | 'Belgium' | null
  lat?: number
  lng?: number
  wilmar_organisation_id?: number
  wilmar_branch_id?: number
  wilmar_store_naam?: string
  api_type?: 'cyclesoftware' | 'wilmar' | null
  cycle_api_authorized?: boolean | null
  cycle_api_checked_at?: string | null
}

export type Product = {
  _type?: string
  _source?: string
  PRODUCT_DESCRIPTION?: string
  BRAND_NAME?: string
  BARCODE?: string
  ARTICLE_NUMBER?: string
  SUPPLIER_PRODUCT_NUMBER?: string
  STOCK?: number | string
  AVAILABLE_STOCK?: number | string
  SALES_PRICE_INC?: number | string
  COLOR?: string
  FRAME_HEIGHT?: string
  MODEL_YEAR?: string
  WHEEL_SIZE?: string
  GEAR?: string
  LOCATION?: string
  GROUP_DESCRIPTION_1?: string
  GROUP_DESCRIPTION_2?: string
  SUPPLIER_NAME?: string
  [key: string]: unknown
}

export type Rol = {
  id: number
  user_id: string
  rol: string
  naam: string
  created_at: string
}

export type ApiError = {
  error: string
  message?: string
  status?: number
}
