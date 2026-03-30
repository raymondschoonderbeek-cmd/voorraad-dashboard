/** Velden uit Microsoft Graph managedDevice (na Intune-sync). */
export type IntuneSnapshot = {
  graphDeviceId: string
  complianceState: string | null
  managementState: string | null
  lastSyncDateTime: string | null
  userPrincipalName: string | null
  emailAddress: string | null
  manufacturer: string | null
  model: string | null
  operatingSystem: string | null
  osVersion: string | null
}

export type ItCmdbHardware = {
  id: string
  serial_number: string
  hostname: string
  intune: string | null
  /** Gestructureerde Intune-data (alleen gezet bij Graph-sync) */
  intune_snapshot: IntuneSnapshot | null
  /** Freshdesk ticket (API v2); voorkomt dubbele aanmaak */
  freshdesk_ticket_id: number | null
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
  /** Alleen gezet wanneer Freshdesk server-side is geconfigureerd */
  freshdesk_ticket_url?: string | null
}
