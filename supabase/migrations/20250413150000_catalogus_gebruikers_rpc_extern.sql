-- Update RPC zodat ook externe (niet-portal) gebruikers worden teruggegeven
DROP FUNCTION IF EXISTS it_catalogus_gebruikers_voor_item(UUID);
CREATE OR REPLACE FUNCTION it_catalogus_gebruikers_voor_item(p_catalogus_id UUID)
RETURNS TABLE (
  koppeling_id      UUID,
  user_id           UUID,
  email             TEXT,
  naam              TEXT,
  microsoft_synced  BOOLEAN,
  toegewezen_op     TIMESTAMPTZ,
  serienummer       TEXT,
  datum_ingebruik   DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Portal gebruikers (user_id is gevuld)
  SELECT
    kg.id               AS koppeling_id,
    kg.user_id,
    au.email,
    NULL::TEXT          AS naam,
    COALESCE(kg.microsoft_synced, FALSE) AS microsoft_synced,
    kg.toegewezen_op,
    kg.serienummer,
    kg.datum_ingebruik
  FROM it_catalogus_gebruikers kg
  JOIN auth.users au ON au.id = kg.user_id
  WHERE kg.catalogus_id = p_catalogus_id
    AND kg.user_id IS NOT NULL

  UNION ALL

  -- Externe gebruikers (geen user_id, wel microsoft_email)
  SELECT
    kg.id               AS koppeling_id,
    NULL::UUID          AS user_id,
    kg.microsoft_email  AS email,
    kg.microsoft_naam   AS naam,
    COALESCE(kg.microsoft_synced, FALSE) AS microsoft_synced,
    kg.toegewezen_op,
    kg.serienummer,
    kg.datum_ingebruik
  FROM it_catalogus_gebruikers kg
  WHERE kg.catalogus_id = p_catalogus_id
    AND kg.user_id IS NULL
    AND kg.microsoft_email IS NOT NULL

  ORDER BY email;
$$;
