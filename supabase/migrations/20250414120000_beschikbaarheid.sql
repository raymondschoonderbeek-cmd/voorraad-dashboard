-- Werktijden & out-of-office per medewerker (gesynchroniseerd met Microsoft Graph mailboxSettings)
CREATE TABLE IF NOT EXISTS gebruiker_beschikbaarheid (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Out of Office (automaticRepliesSetting)
  oof_status        TEXT NOT NULL DEFAULT 'disabled',  -- 'disabled' | 'alwaysEnabled' | 'scheduled'
  oof_start         TIMESTAMPTZ,
  oof_end           TIMESTAMPTZ,
  oof_internal_msg  TEXT,
  oof_external_msg  TEXT,

  -- Werktijden (workingHours)
  work_days         TEXT[]  NOT NULL DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'],
  work_start_time   TEXT    NOT NULL DEFAULT '09:00',  -- HH:MM
  work_end_time     TEXT    NOT NULL DEFAULT '17:00',  -- HH:MM
  work_timezone     TEXT    NOT NULL DEFAULT 'W. Europe Standard Time',

  -- Meta
  graph_synced_at   TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE gebruiker_beschikbaarheid ENABLE ROW LEVEL SECURITY;

-- Iedereen binnen de organisatie mag status lezen (voor badges/overzicht)
CREATE POLICY "beschikbaarheid_select_authenticated"
  ON gebruiker_beschikbaarheid FOR SELECT
  USING (auth.role() = 'authenticated');

-- Medewerker mag eigen rij aanmaken/bijwerken/verwijderen
CREATE POLICY "beschikbaarheid_own_write"
  ON gebruiker_beschikbaarheid FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index voor snelle status-lookup van meerdere gebruikers
CREATE INDEX IF NOT EXISTS idx_beschikbaarheid_oof ON gebruiker_beschikbaarheid (oof_status, oof_start, oof_end);
