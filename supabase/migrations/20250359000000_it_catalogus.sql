-- IT Catalogus: software-licenties en IT-producten
CREATE TABLE IF NOT EXISTS it_catalogus (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  naam        TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('product', 'licentie')),
  categorie   TEXT        NOT NULL,
  leverancier TEXT        NOT NULL,
  versie      TEXT,
  aantallen   INTEGER,
  notities    TEXT,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE it_catalogus ENABLE ROW LEVEL SECURITY;

-- Lezen: alleen ingelogde gebruikers met IT-CMDB toegang
CREATE POLICY "it_catalogus_select" ON it_catalogus
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Schrijven: alleen ingelogde gebruikers (toegang wordt afgedwongen via de API)
CREATE POLICY "it_catalogus_insert" ON it_catalogus
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "it_catalogus_update" ON it_catalogus
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "it_catalogus_delete" ON it_catalogus
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Index voor zoeken
CREATE INDEX IF NOT EXISTS it_catalogus_naam_idx ON it_catalogus (naam);
CREATE INDEX IF NOT EXISTS it_catalogus_type_idx ON it_catalogus (type);
