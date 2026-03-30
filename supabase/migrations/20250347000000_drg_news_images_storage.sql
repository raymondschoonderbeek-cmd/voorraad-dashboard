-- Publieke bucket voor afbeeldingen in interne nieuwsberichten (HTML <img src="...">)
-- Upload gebeurt via API met service role; lezen is publiek (ingelogde app + e-mail).
-- MIME-type en grootte worden in /api/news/upload-image gehandhaafd.

insert into storage.buckets (id, name, public)
values ('drg-news-images', 'drg-news-images', true)
on conflict (id) do update set public = excluded.public;
