-- Sla afdeling (Microsoft Graph 'department') op per gebruiker
ALTER TABLE public.gebruiker_rollen
  ADD COLUMN IF NOT EXISTS afdeling TEXT;

COMMENT ON COLUMN public.gebruiker_rollen.afdeling IS
  'Afdeling uit Microsoft Azure AD (department), gevuld door azure-sync.';
