-- Manager-veld voor Azure AD koppeling
ALTER TABLE gebruiker_rollen
  ADD COLUMN IF NOT EXISTS manager_naam  TEXT,
  ADD COLUMN IF NOT EXISTS manager_email TEXT;
