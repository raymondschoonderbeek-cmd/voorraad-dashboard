-- Voeg office_location toe aan gebruiker_rollen (werklocatie uit Azure AD)
-- v2: opnieuw aangemaakt om automatische deploy te testen
ALTER TABLE public.gebruiker_rollen
  ADD COLUMN IF NOT EXISTS office_location TEXT;
