import { sb } from "./supabaseClient.js";

// 取得目前登入使用者 id（未登入回傳 null）。
async function uid() {
  const { data } = await sb.auth.getUser();
  return data.user ? data.user.id : null;
}

// ---- 定義類資料（習慣 / 評分項 / 數值項）----

export async function listDefinitions(table) {
  const { data, error } = await sb
    .from(table)
    .select("*")
    .eq("is_archived", false)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function addDefinition(table, fields) {
  const user_id = await uid();
  const { data, error } = await sb
    .from(table)
    .insert({ ...fields, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDefinition(table, id, fields) {
  const { error } = await sb.from(table).update(fields).eq("id", id);
  if (error) throw error;
}

export async function archiveDefinition(table, id) {
  const { error } = await sb.from(table).update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}

// ---- 某天的紀錄讀取 ----

export async function getDay(logDate) {
  const [daily, checks, scores, metrics] = await Promise.all([
    sb.from("daily_logs").select("*").eq("log_date", logDate).maybeSingle(),
    sb.from("habit_checks").select("*").eq("log_date", logDate),
    sb.from("scores").select("*").eq("log_date", logDate),
    sb.from("metric_values").select("*").eq("log_date", logDate),
  ]);
  for (const r of [daily, checks, scores, metrics]) {
    if (r.error) throw r.error;
  }
  return {
    journal: daily.data ? daily.data.journal : "",
    checks: checks.data,
    scores: scores.data,
    metrics: metrics.data,
  };
}

// ---- 某天的紀錄寫入（upsert）----

export async function saveDay(logDate, { journal, checks, scores, metrics }) {
  const user_id = await uid();

  const ops = [
    sb.from("daily_logs").upsert(
      { user_id, log_date: logDate, journal, updated_at: new Date().toISOString() },
      { onConflict: "user_id,log_date" }
    ),
  ];

  if (checks.length) {
    ops.push(
      sb.from("habit_checks").upsert(
        checks.map((c) => ({ user_id, log_date: logDate, habit_id: c.habit_id, done: c.done })),
        { onConflict: "habit_id,log_date" }
      )
    );
  }
  if (scores.length) {
    ops.push(
      sb.from("scores").upsert(
        scores.map((s) => ({ user_id, log_date: logDate, score_item_id: s.score_item_id, value: s.value })),
        { onConflict: "score_item_id,log_date" }
      )
    );
  }
  if (metrics.length) {
    ops.push(
      sb.from("metric_values").upsert(
        metrics.map((m) => ({ user_id, log_date: logDate, metric_item_id: m.metric_item_id, value: m.value })),
        { onConflict: "metric_item_id,log_date" }
      )
    );
  }

  const results = await Promise.all(ops);
  for (const r of results) {
    if (r.error) throw r.error;
  }
}

// ---- 區間讀取（回顧頁用）----

export async function getRange(table, fromDate, toDate) {
  const { data, error } = await sb
    .from(table)
    .select("*")
    .gte("log_date", fromDate)
    .lte("log_date", toDate)
    .order("log_date", { ascending: true });
  if (error) throw error;
  return data;
}
