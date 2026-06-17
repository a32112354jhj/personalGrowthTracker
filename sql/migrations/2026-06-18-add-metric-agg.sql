-- 數值項新增「彙總方式」欄位：sum=加總、avg=平均，預設 sum。
alter table public.metric_items
  add column if not exists agg text not null default 'sum';
