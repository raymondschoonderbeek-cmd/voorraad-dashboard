-- Gebruikersprofiel met voorkeuren (o.a. lunch module)
create table if not exists profiles (
  user_id uuid not null primary key references auth.users(id) on delete cascade,
  lunch_module_enabled boolean not null default false,
  updated_at timestamptz default now()
);

-- RLS: gebruiker leest en wijzigt alleen eigen profiel
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = user_id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = user_id);

-- Trigger: maak profiel aan bij eerste login (optioneel, we doen upsert vanuit app)
comment on table profiles is 'Gebruikersvoorkeuren; lunch_module_enabled = lunch bestellingen aan/uit via instellingen';
