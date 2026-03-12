-- Script: Bestaande Auth-gebruiker toevoegen aan gebruiker_rollen
-- Voer uit in Supabase SQL Editor als een gebruiker wel in auth.users staat
-- maar niet in gebruiker_rollen (en daardoor niet in de app verschijnt).
--
-- Pas het e-mailadres, naam en rol aan naar wens.

INSERT INTO public.gebruiker_rollen (user_id, rol, naam, mfa_verplicht)
SELECT
  u.id,
  'lunch',                    -- rol: 'viewer' | 'lunch' | 'admin'
  'Raymond Schoonderbeek',     -- naam
  false                       -- mfa_verplicht
FROM auth.users u
WHERE u.email = 'raymondschoonderbeek@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.gebruiker_rollen gr WHERE gr.user_id = u.id
  );
