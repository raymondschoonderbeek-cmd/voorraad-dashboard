-- Zichtbaarheid in self-service (Instellingen → licentie aanvragen). IT-CMDB-catalogus blijft alles tonen.
ALTER TABLE it_catalogus
  ADD COLUMN IF NOT EXISTS aanvraagbaar BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN it_catalogus.aanvraagbaar IS
  'true: medewerkers zien dit bij zelfaanvraag; false: alleen IT kan via IT CMDB → Catalogus aanvragen.';
