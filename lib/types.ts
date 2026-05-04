/** API & domain types */

export type Winkel = {
  id: number;
  naam: string;
  kassa_nummer: string | null;
  actief: boolean;
  straat: string | null;
  huisnummer: string | null;
  postcode: string | null;
  stad: string | null;
  provincie: string | null;
  land: string | null;
  lat: number | null;
  lng: number | null;
  contactpersoon: string | null;
  telefoon: string | null;
  email: string | null;
  email_administratie: string | null;
  website: string | null;
  lidnummer: string | null;
  cbnr: string | null;
  geblokkeerd: string | null;
  formule: string | null;
  regio_manager: string | null;
  aangesloten_sinds: string | null;
  vvo_m2: string | null;
  iban: string | null;
  btw_nummer: string | null;
  kvk: string | null;
  gln: string | null;
  accountant: string | null;
  kassasysteem: string | null;
  api_type: string | null;
  wilmar_organisation_id: number | null;
  wilmar_branch_id: number | null;
  wilmar_store_naam: string | null;
  cycle_api_authorized: boolean | null;
  cycle_api_checked_at: string | null;
  vendit_api_username: string | null;
  vendit_api_key: string | null;
  bike_totaal_nieuw_start: string | null;
  bike_totaal_nieuw_eind: string | null;
  cm_fietsen_deelname: string | null;
  cm_fietsen_instroom: string | null;
  cm_fietsen_uitstroom: string | null;
  sales_channels_qv: string | null;
  webshoporders_naar_kassa: string | null;
  laatste_contract: string | null;
  jaarcijfers: string | null;
  startdatum_servicepas_drs: string | null;
  einddatum_servicepas_drs: string | null;
  deelname_servicepas_drs: string | null;
  startdatum_lease: string | null;
  einddatum_lease: string | null;
  deelname_lease: string | null;
  deelname_centraal_betalen: string | null;
  created_at: string;
  vendit_laatst_datum?: string | null;
};

export type WinkelActiviteit = {
  id: number;
  winkel_id: number;
  kind: 'notitie' | 'taak' | 'belverslag';
  body: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
};

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
