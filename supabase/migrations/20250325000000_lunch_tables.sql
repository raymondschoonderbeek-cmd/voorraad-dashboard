-- Lunch module: producten, bestellingen, betalingen

-- Productcatalogus (Panini Italiani broodjes)
create table lunch_products (
  id uuid not null primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  category text not null default 'italiaanse_bol' check (category in ('italiaanse_bol', 'bruine_driehoek', 'ciabatta')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_lunch_products_active on lunch_products(active);
create index idx_lunch_products_category on lunch_products(category);

-- Bestellingen
create table lunch_orders (
  id uuid not null primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  user_name text,
  order_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  total_cents integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_lunch_orders_user on lunch_orders(user_id);
create index idx_lunch_orders_date on lunch_orders(order_date);
create index idx_lunch_orders_status on lunch_orders(status);

-- Bestelregels
create table lunch_order_items (
  id uuid not null primary key default gen_random_uuid(),
  order_id uuid not null references lunch_orders(id) on delete cascade,
  product_id uuid not null references lunch_products(id) on delete restrict,
  quantity integer not null check (quantity >= 1),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz default now()
);

create index idx_lunch_order_items_order on lunch_order_items(order_id);

-- Betalingen (Tikkie)
create table lunch_payments (
  id uuid not null primary key default gen_random_uuid(),
  order_id uuid not null references lunch_orders(id) on delete cascade,
  tikkie_id text,
  tikkie_url text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_lunch_payments_order on lunch_payments(order_id);
create index idx_lunch_payments_tikkie on lunch_payments(tikkie_id) where tikkie_id is not null;

-- RLS
alter table lunch_products enable row level security;
alter table lunch_orders enable row level security;
alter table lunch_order_items enable row level security;
alter table lunch_payments enable row level security;

-- Producten: iedereen kan lezen (actieve producten)
create policy "Anyone can read active lunch products"
  on lunch_products for select
  using (active = true);

-- Producten: alleen admin mag CRUD
create policy "Admin can manage lunch products"
  on lunch_products for all
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  )
  with check (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );

-- Bestellingen: gebruiker ziet eigen bestellingen
create policy "Users can view own lunch orders"
  on lunch_orders for select
  using (auth.uid() = user_id);

create policy "Users can insert own lunch orders"
  on lunch_orders for insert
  with check (auth.uid() = user_id);

create policy "Users can update own pending orders"
  on lunch_orders for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);

-- Admin ziet alle bestellingen
create policy "Admin can view all lunch orders"
  on lunch_orders for select
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );

create policy "Admin can update lunch orders"
  on lunch_orders for update
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );

-- Order items: via order toegang
create policy "Users can view own order items"
  on lunch_order_items for select
  using (
    exists (
      select 1 from lunch_orders
      where lunch_orders.id = lunch_order_items.order_id
      and lunch_orders.user_id = auth.uid()
    )
  );

create policy "Users can insert order items for own orders"
  on lunch_order_items for insert
  with check (
    exists (
      select 1 from lunch_orders
      where lunch_orders.id = lunch_order_items.order_id
      and lunch_orders.user_id = auth.uid()
      and lunch_orders.status = 'pending'
    )
  );

create policy "Admin can view all order items"
  on lunch_order_items for select
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );

-- Payments: via order
create policy "Users can view own payments"
  on lunch_payments for select
  using (
    exists (
      select 1 from lunch_orders
      where lunch_orders.id = lunch_payments.order_id
      and lunch_orders.user_id = auth.uid()
    )
  );

create policy "Admin can manage payments"
  on lunch_payments for all
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );

-- Service role moet payments kunnen updaten (webhook)
-- Webhook gebruikt service role, dus geen RLS policy nodig voor anon

comment on table lunch_products is 'Broodjes/producten voor lunch bestellingen';
comment on table lunch_orders is 'Lunch bestellingen per gebruiker per dag';
comment on table lunch_order_items is 'Regels per bestelling';
comment on table lunch_payments is 'Tikkie betalingen gekoppeld aan bestellingen';
