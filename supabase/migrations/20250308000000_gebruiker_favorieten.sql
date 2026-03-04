-- Favoriete winkels per gebruiker
create table if not exists gebruiker_favorieten (
  user_id uuid not null references auth.users(id) on delete cascade,
  winkel_id integer not null references winkels(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, winkel_id)
);

create index if not exists idx_gebruiker_favorieten_user on gebruiker_favorieten(user_id);

-- RLS: gebruiker ziet en beheert alleen eigen favorieten
alter table gebruiker_favorieten enable row level security;

create policy "Users can view own favorites"
  on gebruiker_favorieten for select
  using (auth.uid() = user_id);

create policy "Users can insert own favorites"
  on gebruiker_favorieten for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on gebruiker_favorieten for delete
  using (auth.uid() = user_id);
