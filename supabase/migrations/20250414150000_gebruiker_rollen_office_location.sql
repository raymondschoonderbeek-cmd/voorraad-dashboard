-- Voeg office_location toe aan gebruiker_rollen (werklocatie uit Azure AD)
ALTER TABLE public.gebruiker_rollen
  ADD COLUMN IF NOT EXISTS office_location TEXT;
