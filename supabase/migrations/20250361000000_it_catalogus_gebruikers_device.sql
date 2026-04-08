-- Voeg serienummer en datum_ingebruik toe aan de koppeltabel
ALTER TABLE it_catalogus_gebruikers
  ADD COLUMN IF NOT EXISTS serienummer    TEXT,
  ADD COLUMN IF NOT EXISTS datum_ingebruik DATE;

-- Update de RPC zodat de nieuwe velden ook worden teruggegeven
DROP FUNCTION IF EXISTS it_catalogus_gebruikers_voor_item(UUID);
CREATE OR REPLACE FUNCTION it_catalogus_gebruikers_voor_item(p_catalogus_id UUID)
RETURNS TABLE (
  koppeling_id     UUID,
  user_id          UUID,
  email            TEXT,
  toegewezen_op    TIMESTAMPTZ,
  serienummer      TEXT,
  datum_ingebruik  DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kg.id              AS koppeling_id,
    kg.user_id,
    au.email,
    kg.toegewezen_op,
    kg.serienummer,
    kg.datum_ingebruik
  FROM it_catalogus_gebruikers kg
  JOIN auth.users au ON au.id = kg.user_id
  WHERE kg.catalogus_id = p_catalogus_id
  ORDER BY au.email;
$$;

-- Update ook de gebruiker-kant RPC
DROP FUNCTION IF EXISTS it_catalogus_voor_gebruiker(UUID);
CREATE OR REPLACE FUNCTION it_catalogus_voor_gebruiker(p_user_id UUID)
RETURNS TABLE (
  catalogus_id     UUID,
  naam             TEXT,
  type             TEXT,
  categorie        TEXT,
  leverancier      TEXT,
  versie           TEXT,
  toegewezen_op    TIMESTAMPTZ,
  serienummer      TEXT,
  datum_ingebruik  DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id              AS catalogus_id,
    c.naam,
    c.type,
    c.categorie,
    c.leverancier,
    c.versie,
    kg.toegewezen_op,
    kg.serienummer,
    kg.datum_ingebruik
  FROM it_catalogus_gebruikers kg
  JOIN it_catalogus c ON c.id = kg.catalogus_id
  WHERE kg.user_id = p_user_id
  ORDER BY c.naam;
$$;
