-- Aanvraagflow voor software/licenties
CREATE TABLE IF NOT EXISTS product_licentie_aanvragen (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogus_id          UUID NOT NULL REFERENCES it_catalogus(id) ON DELETE CASCADE,
  catalogus_naam        TEXT NOT NULL,                        -- snapshot op moment van aanvraag
  aanvrager_id          UUID NOT NULL,                        -- auth.users.id
  aanvrager_naam        TEXT NOT NULL,
  aanvrager_email       TEXT NOT NULL,
  manager_naam          TEXT,
  manager_email         TEXT,
  motivatie             TEXT,
  status                TEXT NOT NULL DEFAULT 'ingediend'
                          CHECK (status IN ('ingediend','wacht_op_manager','goedgekeurd','afgekeurd')),
  manager_token         TEXT UNIQUE,                          -- secure random token voor goedkeuring-link
  token_verloopt_op     TIMESTAMPTZ,
  manager_beslissing_op TIMESTAMPTZ,
  manager_notitie       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snelle lookups
CREATE INDEX IF NOT EXISTS plaan_aanvrager_idx  ON product_licentie_aanvragen (aanvrager_id);
CREATE INDEX IF NOT EXISTS plaan_catalogus_idx  ON product_licentie_aanvragen (catalogus_id);
CREATE INDEX IF NOT EXISTS plaan_status_idx     ON product_licentie_aanvragen (status);
CREATE INDEX IF NOT EXISTS plaan_token_idx      ON product_licentie_aanvragen (manager_token) WHERE manager_token IS NOT NULL;

-- RLS: iedereen ziet alleen zijn eigen aanvragen; admins zien alles via service-role
ALTER TABLE product_licentie_aanvragen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigen aanvragen lezen" ON product_licentie_aanvragen
  FOR SELECT USING (aanvrager_id = auth.uid());

CREATE POLICY "Eigen aanvraag indienen" ON product_licentie_aanvragen
  FOR INSERT WITH CHECK (aanvrager_id = auth.uid());
