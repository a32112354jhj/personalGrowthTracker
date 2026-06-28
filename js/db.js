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

// ===== 每週目標 / 復盤 =====

export async function listWeeklyGoals(weekStart) {
  const { data, error } = await sb
    .from("weekly_goals")
    .select("*")
    .eq("week_start", weekStart)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function addWeeklyGoal(fields) {
  const user_id = await uid();
  const { data, error } = await sb
    .from("weekly_goals")
    .insert({ ...fields, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWeeklyGoal(id, fields) {
  const { error } = await sb.from("weekly_goals").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteWeeklyGoal(id) {
  const { error } = await sb.from("weekly_goals").delete().eq("id", id);
  if (error) throw error;
}

export async function getWeeklyReview(weekStart) {
  const { data, error } = await sb
    .from("weekly_reviews")
    .select("reflection")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data ? data.reflection : "";
}

export async function saveWeeklyReview(weekStart, reflection) {
  const user_id = await uid();
  const { error } = await sb.from("weekly_reviews").upsert(
    { user_id, week_start: weekStart, reflection, updated_at: new Date().toISOString() },
    { onConflict: "user_id,week_start" }
  );
  if (error) throw error;
}

// ===== 玩家狀態 / 晉階 / 計數 =====

export async function getPlayer() {
  const { data, error } = await sb
    .from("player")
    .select("rank, criteria")
    .maybeSingle();
  if (error) throw error;
  return data ? { rank: data.rank, criteria: data.criteria || {} } : { rank: "E", criteria: {} };
}

export async function setPlayerRank(rank) {
  const user_id = await uid();
  const { error } = await sb.from("player").upsert(
    { user_id, rank, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

export async function setRankCriteria(criteria) {
  const user_id = await uid();
  const { error } = await sb.from("player").upsert(
    { user_id, criteria, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

export async function addPromotion(rank, note) {
  const user_id = await uid();
  const { error } = await sb.from("rank_promotions").insert({ user_id, rank, note });
  if (error) throw error;
}

export async function listPromotions() {
  const { data, error } = await sb
    .from("rank_promotions")
    .select("rank, note, approved_at")
    .order("approved_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function countHabitDones() {
  const { count, error } = await sb
    .from("habit_checks")
    .select("*", { count: "exact", head: true })
    .eq("done", true);
  if (error) throw error;
  return count || 0;
}

export async function countTodayHabitDones(today) {
  const { count, error } = await sb
    .from("habit_checks")
    .select("*", { count: "exact", head: true })
    .eq("done", true)
    .eq("log_date", today);
  if (error) throw error;
  return count || 0;
}

export async function countCompletedWeeklyGoals() {
  const { data, error } = await sb
    .from("weekly_goals")
    .select("type, done, target, manual_count, linked_habit_id");
  if (error) throw error;
  let n = 0;
  for (const g of data) {
    if (g.type === "todo") { if (g.done) n++; }
    else if (!g.linked_habit_id && g.manual_count >= g.target) n++;
  }
  return n;
}
