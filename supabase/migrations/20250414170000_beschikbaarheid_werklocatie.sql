-- Voeg werklocatie toe aan gebruiker_beschikbaarheid
-- Wordt gevuld via bulk-sync vanuit Microsoft Graph Calendar API
ALTER TABLE public.gebruiker_beschikbaarheid
  ADD COLUMN IF NOT EXISTS werklocatie TEXT;
