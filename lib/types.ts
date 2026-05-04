/** API & domain types */

export type Winkel = {
  id: number
  naam: string
  kassa_nummer: string
  lidnummer?: string | null
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
  api_type?: 'cyclesoftware' | 'wilmar' | 'vendit' | 'vendit_api' | null
  vendit_api_key?: string | null
  vendit_api_username?: string | null
  vendit_api_password?: string | null
  cycle_api_authorized?: boolean | null
  cycle_api_checked_at?: string | null
  vendit_laatst_datum?: string | null
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
