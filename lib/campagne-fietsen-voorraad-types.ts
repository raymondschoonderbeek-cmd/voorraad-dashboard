import type { CampagneFietsRow } from '@/lib/campagne-fietsen-voorraad-aggregate'

export type CampagneWinkelVoorraadRow = {
  winkel_id: number
  naam: string
  stad: string | null
  lat: number | null
  lng: number | null
  voorraad: number
  bron: string
  voorraad_referentie?: number | null
  verkocht?: number
  toename?: number
}

export type CampagneVoorraadPayload = {
  fietsen: Array<
    CampagneFietsRow & {
      totaal_voorraad: number
      winkels_met_voorraad: number
      totaal_referentie?: number | null
      verkocht_totaal?: number
      toename_totaal?: number
      winkels: CampagneWinkelVoorraadRow[]
    }
  >
  winkel_fouten: { winkel_id: number; naam: string; message: string }[]
  synced_at: string | null
  baseline_recorded_at?: string | null
}
