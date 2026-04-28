alter table public.tv_mededelingen
  add column if not exists label text null;

comment on column public.tv_mededelingen.label is 'Categorie-badge tekst (bijv. HR, IT, Facilitair) — optioneel';
