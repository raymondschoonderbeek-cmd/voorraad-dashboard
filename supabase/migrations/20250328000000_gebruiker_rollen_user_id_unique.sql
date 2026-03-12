-- Zorg dat user_id uniek is in gebruiker_rollen (één rol per gebruiker)
-- Nodig voor robuuste upsert bij aanmaken nieuwe gebruiker

-- Verwijder eventuele dubbele rijen (houd één per user_id)
delete from public.gebruiker_rollen a
using public.gebruiker_rollen b
where a.user_id = b.user_id and a.ctid < b.ctid;

create unique index if not exists gebruiker_rollen_user_id_key on public.gebruiker_rollen (user_id);
