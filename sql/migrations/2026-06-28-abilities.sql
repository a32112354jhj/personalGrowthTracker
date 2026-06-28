-- 自訂能力項目（各自一個 E→S 等級，手動審核）
create table if not exists public.ability_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  rank text not null default 'E',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ability_items enable row level security;
create policy ability_items_owner on public.ability_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
