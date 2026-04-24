alter table gazelle_observer_instellingen
  add column if not exists workflow_tekst jsonb default '[]'::jsonb;
