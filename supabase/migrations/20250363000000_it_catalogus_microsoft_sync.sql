-- Microsoft 365 licentie-sync: sku-koppeling op catalogus-items
ALTER TABLE it_catalogus
  ADD COLUMN IF NOT EXISTS microsoft_sku_id TEXT;

-- Unieke index zodat re-sync altijd dezelfde rij bijwerkt
CREATE UNIQUE INDEX IF NOT EXISTS it_catalogus_microsoft_sku_id_idx
  ON it_catalogus (microsoft_sku_id)
  WHERE microsoft_sku_id IS NOT NULL;

-- Markeer welke gebruiker-koppelingen via automatische sync zijn aangemaakt
ALTER TABLE it_catalogus_gebruikers
  ADD COLUMN IF NOT EXISTS microsoft_synced BOOLEAN NOT NULL DEFAULT FALSE;
