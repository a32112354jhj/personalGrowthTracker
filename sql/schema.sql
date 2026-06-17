-- 自我成長檢核系統 schema
-- 在 Supabase 專案的 SQL Editor 貼上整段執行。

-- 1. 習慣定義
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. 評分項定義
create table if not exists public.score_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. 數值項定義
create table if not exists public.metric_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text default '',
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- 4. 每日總紀錄（日記）
create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  journal text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- 5. 習慣打勾
create table if not exists public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  log_date date not null,
  done boolean not null default false,
  unique (habit_id, log_date)
);

-- 6. 每日評分
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score_item_id uuid not null references public.score_items(id) on delete cascade,
  log_date date not null,
  value int not null check (value between 1 and 10),
  unique (score_item_id, log_date)
);

-- 7. 每日數值
create table if not exists public.metric_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_item_id uuid not null references public.metric_items(id) on delete cascade,
  log_date date not null,
  value numeric not null,
  unique (metric_item_id, log_date)
);

-- Row Level Security：每張表只允許擁有者讀寫
do $$
declare t text;
begin
  foreach t in array array[
    'habits','score_items','metric_items','daily_logs',
    'habit_checks','scores','metric_values'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      create policy %I on public.%I
      for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
    $p$, t || '_owner', t);
  end loop;
end $$;
