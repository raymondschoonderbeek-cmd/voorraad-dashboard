-- Standaard werklocatie per dag (gesynchroniseerd vanuit Outlook-agenda)
ALTER TABLE public.gebruiker_beschikbaarheid
  ADD COLUMN IF NOT EXISTS werklocatie_schema JSONB;
