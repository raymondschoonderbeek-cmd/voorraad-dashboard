-- Koppeltabel: IT-catalogus items ↔ portalgebruikers (many-to-many)
CREATE TABLE IF NOT EXISTS it_catalogus_gebruikers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogus_id   UUID        NOT NULL REFERENCES it_catalogus(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  toegewezen_op  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  toegewezen_door UUID       REFERENCES auth.users(id),
  UNIQUE (catalogus_id, user_id)
);

ALTER TABLE it_catalogus_gebruikers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "it_catalogus_gebr_select" ON it_catalogus_gebruikers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "it_catalogus_gebr_insert" ON it_catalogus_gebruikers
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "it_catalogus_gebr_delete" ON it_catalogus_gebruikers
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS it_catalogus_gebr_cat_idx  ON it_catalogus_gebruikers (catalogus_id);
CREATE INDEX IF NOT EXISTS it_catalogus_gebr_user_idx ON it_catalogus_gebruikers (user_id);

-- RPC: gebruikers per catalogus-item, inclusief e-mailadres (security definer zodat RLS geen probleem geeft)
CREATE OR REPLACE FUNCTION it_catalogus_gebruikers_voor_item(p_catalogus_id UUID)
RETURNS TABLE (
  koppeling_id   UUID,
  user_id        UUID,
  email          TEXT,
  toegewezen_op  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kg.id           AS koppeling_id,
    kg.user_id,
    au.email,
    kg.toegewezen_op
  FROM it_catalogus_gebruikers kg
  JOIN auth.users au ON au.id = kg.user_id
  WHERE kg.catalogus_id = p_catalogus_id
  ORDER BY au.email;
$$;

-- RPC: alle items per gebruiker (voor profielpagina o.i.d.)
CREATE OR REPLACE FUNCTION it_catalogus_voor_gebruiker(p_user_id UUID)
RETURNS TABLE (
  catalogus_id  UUID,
  naam          TEXT,
  type          TEXT,
  categorie     TEXT,
  leverancier   TEXT,
  versie        TEXT,
  toegewezen_op TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id            AS catalogus_id,
    c.naam,
    c.type,
    c.categorie,
    c.leverancier,
    c.versie,
    kg.toegewezen_op
  FROM it_catalogus_gebruikers kg
  JOIN it_catalogus c ON c.id = kg.catalogus_id
  WHERE kg.user_id = p_user_id
  ORDER BY c.naam;
$$;
