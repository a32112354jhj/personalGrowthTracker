-- 玩家狀態（每人一列）
create table if not exists public.player (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rank text not null default 'E',
  criteria jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 晉階紀錄
create table if not exists public.rank_promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rank text not null,
  note text default '',
  approved_at timestamptz not null default now()
);

alter table public.player enable row level security;
alter table public.rank_promotions enable row level security;

create policy player_owner on public.player
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rank_promotions_owner on public.rank_promotions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
