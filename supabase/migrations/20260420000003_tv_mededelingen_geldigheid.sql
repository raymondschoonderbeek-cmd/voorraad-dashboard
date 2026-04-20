-- Begin- en einddatum per TV-mededeling
alter table public.tv_mededelingen
  add column if not exists geldig_van date,
  add column if not exists geldig_tot date;

comment on column public.tv_mededelingen.geldig_van is 'Eerste dag dat de mededeling zichtbaar is (leeg = altijd)';
comment on column public.tv_mededelingen.geldig_tot is 'Laatste dag dat de mededeling zichtbaar is (leeg = altijd)';
