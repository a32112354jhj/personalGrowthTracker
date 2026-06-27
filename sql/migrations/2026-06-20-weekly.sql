-- 每週目標
create table if not exists public.weekly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  title text not null,
  type text not null default 'todo',          -- 'todo' | 'count'
  target int not null default 1,
  done boolean not null default false,
  linked_habit_id uuid references public.habits(id) on delete set null,
  manual_count int not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 每週復盤
create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  reflection text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_goals enable row level security;
alter table public.weekly_reviews enable row level security;

create policy weekly_goals_owner on public.weekly_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy weekly_reviews_owner on public.weekly_reviews
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
