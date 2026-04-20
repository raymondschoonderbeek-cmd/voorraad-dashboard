-- Veld om per nieuwsbericht in te stellen of het op het TV-scherm getoond wordt
alter table public.drg_news_posts
  add column if not exists toon_op_tv boolean not null default false;

comment on column public.drg_news_posts.toon_op_tv is 'Indien true: bericht wordt getoond op het TV-scherm in het kantoor';
