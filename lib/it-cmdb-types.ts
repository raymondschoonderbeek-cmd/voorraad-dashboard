export type ItCmdbHardware = {
  id: string
  serial_number: string
  hostname: string
  intune: string | null
  user_name: string | null
  /** Gekoppelde DRG-portalgebruiker (gebruiker_rollen), indien bekend */
  assigned_user_id: string | null
  device_type: string | null
  notes: string | null
  location: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/** API GET /api/it-cmdb: verrijkt met e-mail van gekoppelde gebruiker */
export type ItCmdbHardwareListItem = ItCmdbHardware & {
  assigned_user_email?: string | null
}
