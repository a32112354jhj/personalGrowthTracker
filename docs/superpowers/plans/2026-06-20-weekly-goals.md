# 每週任務（週目標 + 復盤）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為既有自我成長檢核 app 新增第 5 個「週目標」分頁：每週可定義待辦/次數型目標、追蹤進度（手動計次或連動每日習慣）、做文字復盤，並在週五～週日以頁面內橫幅提醒。

**Architecture:** 沿用「純前端 ES Module + Supabase」架構。新增 `js/ui-weekly.js` 渲染週目標分頁；週區間/達成等純運算放進 `js/logic.js` 並以 `node:test` TDD；新增 `weekly_goals` / `weekly_reviews` 兩張表（RLS）。提醒為純前端判斷，無推播、無後端排程。

**Tech Stack:** Vanilla JS (ES Modules) / Supabase (PostgreSQL + RLS) / Chart.js（既有，本功能不用）/ Node `node:test`。

## Global Constraints

- 不新增任何 npm 相依；測試用 Node 內建 `node:test`，指令一律 `node --test`。
- 既有 class 名稱與《System》深色霓虹樣式不得破壞；新樣式沿用既有 CSS 變數（`--accent` #2bd4ff、`--good` #39ff9e、`--muted`、`--panel` 等）。
- 所有 commit 訊息結尾加一行：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- Supabase DDL（建表）需由人在 SQL Editor 手動執行；subagent 無法連 Supabase（控制者代辦）。
- `week_start` 一律為該週「週一」的 `YYYY-MM-DD`，以既有 `mondayOf()` 計算。

---

## File Structure

```
js/
├─ logic.js        # 既有；新增 addDays / weekRange / weekLabel / weeklySummary（+ 測試）
├─ db.js           # 既有；新增 weekly_goals / weekly_reviews CRUD
├─ ui-weekly.js    # 新增；週目標分頁
├─ app.js          # 既有；接上第 5 分頁 + 載入時提醒橫幅
index.html          # 既有；新增「週目標」分頁按鈕與容器
css/styles.css      # 既有；週目標 / 進度條 / 提醒橫幅樣式
sql/migrations/2026-06-20-weekly.sql  # 新增；建表 + RLS
tests/logic.test.js # 既有；新增週純函式測試
```

---

## Task 1: logic.js 週純函式（TDD）

**Files:**
- Modify: `tests/logic.test.js`（檔尾新增）
- Modify: `js/logic.js`（檔尾新增）

**Interfaces:**
- Consumes: 既有 `isoFromDate(Date)`、`mondayOf(dateISO)`（已存在於 logic.js）。
- Produces:
  - `addDays(dateISO: string, n: number) => string`
  - `weekRange(weekStartISO: string) => { from: string, to: string }`
  - `weekLabel(weekStartISO: string) => string`  // "M/D–M/D"
  - `weeklySummary(goals: Array<{type:'todo'|'count', done?:boolean, target:number, progress:number}>) => { todoDone:number, todoTotal:number, countDone:number, countTotal:number }`

- [ ] **Step 1: 在 `tests/logic.test.js` 檔尾新增測試**

```javascript
import { addDays, weekRange, weekLabel, weeklySummary } from "../js/logic.js";

test("addDays 加減天數（跨月）", () => {
  assert.equal(addDays("2026-06-20", 3), "2026-06-23");
  assert.equal(addDays("2026-06-30", 1), "2026-07-01");
  assert.equal(addDays("2026-06-01", -1), "2026-05-31");
});

test("weekRange 回傳週一到週日", () => {
  assert.deepEqual(weekRange("2026-06-15"), { from: "2026-06-15", to: "2026-06-21" });
});

test("weekLabel 顯示 M/D–M/D", () => {
  assert.equal(weekLabel("2026-06-15"), "6/15–6/21");
});

test("weeklySummary 統計 todo 完成數與 count 達標數", () => {
  const goals = [
    { type: "todo", done: true, target: 1, progress: 0 },
    { type: "todo", done: false, target: 1, progress: 0 },
    { type: "count", done: false, target: 4, progress: 4 },
    { type: "count", done: false, target: 3, progress: 1 },
  ];
  assert.deepEqual(weeklySummary(goals), { todoDone: 1, todoTotal: 2, countDone: 1, countTotal: 2 });
});
```

- [ ] **Step 2: 跑測試確認新測試失敗**

Run: `node --test`
Expected: FAIL（`addDays` 等未匯出）。

- [ ] **Step 3: 在 `js/logic.js` 檔尾新增實作**

```javascript

// ===== 每週目標用 =====

// 日期加減天數，回傳 YYYY-MM-DD。
export function addDays(dateISO, n) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return isoFromDate(new Date(y, m - 1, d + n));
}

// 某週（以週一 ISO 表示）的起迄（週一..週日）。
export function weekRange(weekStartISO) {
  return { from: weekStartISO, to: addDays(weekStartISO, 6) };
}

// 週標籤 "M/D–M/D"（不補零）。
export function weekLabel(weekStartISO) {
  const end = addDays(weekStartISO, 6);
  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  return `${md(weekStartISO)}–${md(end)}`;
}

// 目標達成摘要。goals 需已附帶 progress（count 的當前次數）。
export function weeklySummary(goals) {
  let todoDone = 0, todoTotal = 0, countDone = 0, countTotal = 0;
  for (const g of goals) {
    if (g.type === "count") {
      countTotal++;
      if (g.progress >= g.target) countDone++;
    } else {
      todoTotal++;
      if (g.done) todoDone++;
    }
  }
  return { todoDone, todoTotal, countDone, countTotal };
}
```

- [ ] **Step 4: 跑測試確認全部通過**

Run: `node --test`
Expected: PASS（既有 18 + 新增 4 = 22 個測試皆綠）。

- [ ] **Step 5: Commit**

```bash
git add tests/logic.test.js js/logic.js
git commit -m "feat: add weekly date-range and summary pure functions"
```

---

## Task 2: 資料庫遷移 + db 層 CRUD

**Files:**
- Create: `sql/migrations/2026-06-20-weekly.sql`
- Modify: `js/db.js`（檔尾新增匯出）

**Interfaces:**
- Consumes: 既有 `sb`（supabaseClient）、既有 `getRange(table, from, to)`。
- Produces（皆 async，錯誤時 throw）:
  - `listWeeklyGoals(weekStart: string) => Goal[]`
  - `addWeeklyGoal(fields: object) => Goal`
  - `updateWeeklyGoal(id: string, fields: object) => void`
  - `deleteWeeklyGoal(id: string) => void`
  - `getWeeklyReview(weekStart: string) => string`  // reflection 文字，無則 ""
  - `saveWeeklyReview(weekStart: string, reflection: string) => void`
  - Goal 欄位：`{ id, user_id, week_start, title, type, target, done, linked_habit_id, manual_count, sort_order }`

- [ ] **Step 1: 建立遷移 SQL**

Create `sql/migrations/2026-06-20-weekly.sql`:

```sql
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
```

- [ ] **Step 2: 在 `js/db.js` 檔尾新增 CRUD**

（注意：`uid()` 已定義於 db.js 開頭，可直接重用。）

```javascript

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
```

- [ ] **Step 3: 確認 uid() 可重用**

Run: `grep -n "async function uid" js/db.js`
Expected: 找到既有 `async function uid()` 定義（不要重複定義）。若不存在則改用 `(await sb.auth.getUser()).data.user.id`。

- [ ] **Step 4: 語法檢查**

Run: `node --check js/db.js && echo OK`
Expected: 印出 `OK`。

- [ ] **Step 5: Commit**

```bash
git add sql/migrations/2026-06-20-weekly.sql js/db.js
git commit -m "feat: add weekly goals/reviews schema and data access"
```

> **控制者代辦：** 執行本任務後，請使用者在 Supabase SQL Editor 貼上並執行 `sql/migrations/2026-06-20-weekly.sql`（建表 + RLS），週目標頁才能讀寫。

---

## Task 3: 週目標分頁 UI（ui-weekly.js + 接線 + 樣式）

**Files:**
- Create: `js/ui-weekly.js`
- Modify: `index.html`（整檔取代為下方版本）
- Modify: `js/app.js`（整檔取代為下方版本）
- Modify: `css/styles.css`（檔尾新增樣式）

**Interfaces:**
- Consumes: `listWeeklyGoals/addWeeklyGoal/updateWeeklyGoal/deleteWeeklyGoal/getWeeklyReview/saveWeeklyReview`（Task 2）、`listDefinitions("habits")` 與 `getRange("habit_checks", from, to)`（既有 db）、`todayISO/mondayOf/addDays/weekRange/weekLabel/weeklySummary`（logic）、`showToast`（app.js）。
- Produces: `renderWeekly(rootEl)`（供 app.js 匯入）。

- [ ] **Step 1: 建立 `js/ui-weekly.js`**

```javascript
import {
  listWeeklyGoals, addWeeklyGoal, updateWeeklyGoal, deleteWeeklyGoal,
  getWeeklyReview, saveWeeklyReview, listDefinitions, getRange,
} from "./db.js";
import { todayISO, mondayOf, addDays, weekRange, weekLabel, weeklySummary } from "./logic.js";
import { showToast } from "./app.js";

let weekStart = mondayOf(todayISO());

export async function renderWeekly(root) {
  const isThisWeek = weekStart === mondayOf(todayISO());
  root.innerHTML = `<h1>週目標</h1>
    <div class="week-nav">
      <button class="secondary" id="wk-prev" aria-label="上一週">‹</button>
      <span class="week-label">${weekLabel(weekStart)}${isThisWeek ? "（本週）" : ""}</span>
      <button class="secondary" id="wk-next" aria-label="下一週">›</button>
    </div>
    <div id="weekly-body" class="muted">載入中…</div>`;

  root.querySelector("#wk-prev").addEventListener("click", () => { weekStart = addDays(weekStart, -7); renderWeekly(root); });
  root.querySelector("#wk-next").addEventListener("click", () => { weekStart = addDays(weekStart, 7); renderWeekly(root); });

  const body = root.querySelector("#weekly-body");
  try {
    const { from, to } = weekRange(weekStart);
    const [goals, habits, checks, reflection] = await Promise.all([
      listWeeklyGoals(weekStart),
      listDefinitions("habits"),
      getRange("habit_checks", from, to),
      getWeeklyReview(weekStart),
    ]);

    const habitName = Object.fromEntries(habits.map((h) => [h.id, h.name]));
    const withProgress = goals.map((g) => ({ ...g, progress: progressOf(g, checks) }));
    const sum = weeklySummary(withProgress);

    body.classList.remove("muted");
    body.innerHTML = `
      <h2>本週目標</h2>
      ${withProgress.map((g) => goalRow(g, habitName)).join("") || `<p class="muted">尚無目標，於下方新增</p>`}
      ${addForm(habits)}
      <h2>復盤</h2>
      <p class="muted">待辦 ${sum.todoDone}/${sum.todoTotal}　次數達標 ${sum.countDone}/${sum.countTotal}</p>
      <textarea id="wk-reflection" rows="5" placeholder="這週做得如何？下週想調整什麼…">${escapeHtml(reflection)}</textarea>
      <button id="wk-save-review">儲存復盤</button>`;

    wire(root, body);
  } catch (err) {
    body.innerHTML = `<p class="error">載入失敗：${escapeHtml(err.message || "")}</p>`;
  }
}

// 計算某目標當前進度
function progressOf(g, checks) {
  if (g.type !== "count") return 0;
  if (g.linked_habit_id) {
    return checks.filter((c) => c.habit_id === g.linked_habit_id && c.done).length;
  }
  return g.manual_count || 0;
}

function goalRow(g, habitName) {
  if (g.type === "count") {
    const reached = g.progress >= g.target;
    const pct = Math.min(100, Math.round((g.progress / g.target) * 100));
    const linked = g.linked_habit_id ? `連動：${escapeHtml(habitName[g.linked_habit_id] || "?")}` : "";
    const buttons = g.linked_habit_id
      ? `<span class="muted">${linked}</span>`
      : `<span class="row" style="flex:0 0 auto;width:auto;gap:6px">
           <button class="secondary wk-dec" data-id="${g.id}">−</button>
           <button class="secondary wk-inc" data-id="${g.id}">＋</button>
         </span>`;
    return `<div class="card goal${reached ? " filled" : ""}">
      <div class="row"><span class="hb-name">${escapeHtml(g.title)}</span>
        <span class="row" style="flex:0 0 auto;width:auto;gap:10px">
          <span class="goal-count${reached ? " reached" : ""}">[${g.progress}/${g.target}]</span>
          <button class="link wk-del" data-id="${g.id}">刪除</button>
        </span></div>
      <div class="bar" style="margin-top:8px"><span style="width:${pct}%"></span></div>
      <div class="row" style="margin-top:8px">${buttons}<span></span></div>
    </div>`;
  }
  return `<div class="card row goal goal-todo${g.done ? " done filled" : ""}" data-id="${g.id}">
    <span class="hb-name">${escapeHtml(g.title)}</span>
    <span class="hb-right">
      <span class="hb-tag"></span>
      <button class="check ${g.done ? "done" : ""}"></button>
      <button class="link wk-del" data-id="${g.id}">刪除</button>
    </span>
  </div>`;
}

function addForm(habits) {
  const habitOpts = habits.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join("");
  return `<div class="card add-goal">
    <input id="wk-title" placeholder="新增目標名稱" />
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <select id="wk-type" style="width:auto">
        <option value="todo">待辦</option>
        <option value="count">次數</option>
      </select>
      <span id="wk-count-opts" class="row hidden" style="flex:0 0 auto;width:auto;gap:8px">
        <input id="wk-target" type="number" min="1" value="4" style="width:70px" />
        <select id="wk-link" style="width:auto">
          <option value="">手動計次</option>
          ${habitOpts}
        </select>
      </span>
      <button id="wk-add" style="flex:0 0 auto">新增</button>
    </div>
  </div>`;
}

function wire(root, body) {
  const typeSel = body.querySelector("#wk-type");
  const countOpts = body.querySelector("#wk-count-opts");
  typeSel.addEventListener("change", () =>
    countOpts.classList.toggle("hidden", typeSel.value !== "count")
  );

  body.querySelector("#wk-add").addEventListener("click", async () => {
    const title = body.querySelector("#wk-title").value.trim();
    if (!title) return;
    const type = typeSel.value;
    const fields = { week_start: weekStart, title, type };
    if (type === "count") {
      fields.target = Math.max(1, Number(body.querySelector("#wk-target").value) || 1);
      const link = body.querySelector("#wk-link").value;
      if (link) fields.linked_habit_id = link;
    }
    try { await addWeeklyGoal(fields); showToast("已新增"); renderWeekly(root); }
    catch { showToast("新增失敗"); }
  });

  // todo 整列切換完成
  body.querySelectorAll(".goal-todo").forEach((rowEl) =>
    rowEl.addEventListener("click", async (e) => {
      if (e.target.closest(".wk-del")) return;
      const id = rowEl.dataset.id;
      const done = !rowEl.classList.contains("done");
      try { await updateWeeklyGoal(id, { done }); renderWeekly(root); }
      catch { showToast("更新失敗"); }
    })
  );

  // 手動計次 +/-
  body.querySelectorAll(".wk-inc").forEach((b) =>
    b.addEventListener("click", () => stepCount(root, b.dataset.id, +1))
  );
  body.querySelectorAll(".wk-dec").forEach((b) =>
    b.addEventListener("click", () => stepCount(root, b.dataset.id, -1))
  );

  // 刪除
  body.querySelectorAll(".wk-del").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      try { await deleteWeeklyGoal(b.dataset.id); showToast("已刪除"); renderWeekly(root); }
      catch { showToast("刪除失敗"); }
    })
  );

  body.querySelector("#wk-save-review").addEventListener("click", async () => {
    try {
      await saveWeeklyReview(weekStart, body.querySelector("#wk-reflection").value);
      showToast("已儲存");
    } catch { showToast("儲存失敗"); }
  });
}

async function stepCount(root, id, delta) {
  const goals = await listWeeklyGoals(weekStart);
  const g = goals.find((x) => x.id === id);
  if (!g) return;
  const next = Math.max(0, (g.manual_count || 0) + delta);
  try { await updateWeeklyGoal(id, { manual_count: next }); renderWeekly(root); }
  catch { showToast("更新失敗"); }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
```

- [ ] **Step 2: 整檔取代 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>成長檢核</title>
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#05070d" />
  <link rel="icon" href="icons/icon-192.png" />
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="成長檢核" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/styles.css" />
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body>
  <section id="login-view" class="view hidden">
    <h1>成長檢核</h1>
    <form id="login-form">
      <input id="login-email" type="email" placeholder="Email" autocomplete="username" required />
      <input id="login-password" type="password" placeholder="密碼" autocomplete="current-password" required />
      <button type="submit">登入</button>
      <p id="login-error" class="error"></p>
    </form>
  </section>

  <div id="reminder" class="reminder hidden"></div>

  <main id="app-view" class="hidden">
    <section id="tab-today" class="tab"></section>
    <section id="tab-weekly" class="tab hidden"></section>
    <section id="tab-review" class="tab hidden"></section>
    <section id="tab-charts" class="tab hidden"></section>
    <section id="tab-settings" class="tab hidden"></section>
  </main>

  <nav id="tabbar" class="hidden">
    <button data-tab="today" class="active">今天</button>
    <button data-tab="weekly">週目標</button>
    <button data-tab="review">回顧</button>
    <button data-tab="charts">圖表</button>
    <button data-tab="settings">設定</button>
  </nav>

  <div id="toast" class="toast hidden"></div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: 整檔取代 `js/app.js`**

```javascript
import { currentUser, signIn, onAuthChange } from "./auth.js";
import { renderToday } from "./ui-today.js";
import { renderWeekly } from "./ui-weekly.js";
import { renderReview } from "./ui-review.js";
import { renderCharts } from "./ui-charts.js";
import { renderSettings } from "./ui-settings.js";
import { listWeeklyGoals, getWeeklyReview } from "./db.js";
import { todayISO, mondayOf, addDays } from "./logic.js";

const el = (id) => document.getElementById(id);
const TABS = ["today", "weekly", "review", "charts", "settings"];

export function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2000);
}

const renderers = {
  today: () => renderToday(el("tab-today")),
  weekly: () => renderWeekly(el("tab-weekly")),
  review: () => renderReview(el("tab-review")),
  charts: () => renderCharts(el("tab-charts")),
  settings: () => renderSettings(el("tab-settings")),
};

function switchTab(name) {
  for (const tab of TABS) {
    el(`tab-${tab}`).classList.toggle("hidden", tab !== name);
  }
  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  renderers[name]();
}

// 週五～週日：下週尚無目標 或 本週尚無復盤 → 顯示頁面內提醒（非推播）
async function maybeReminder() {
  const today = todayISO();
  const dow = new Date(today + "T00:00:00").getDay(); // 0=日,5=五,6=六
  const isWeekend = dow === 5 || dow === 6 || dow === 0;
  const thisWeek = mondayOf(today);
  if (!isWeekend) return;
  if (localStorage.getItem("reminderDismissed") === thisWeek) return;
  try {
    const nextWeek = addDays(thisWeek, 7);
    const [nextGoals, review] = await Promise.all([
      listWeeklyGoals(nextWeek),
      getWeeklyReview(thisWeek),
    ]);
    if (nextGoals.length > 0 && review.trim() !== "") return;
    const bar = el("reminder");
    bar.innerHTML = `該復盤並規劃下週了
      <span class="row" style="flex:0 0 auto;width:auto;gap:8px">
        <button id="reminder-go">前往</button>
        <button class="secondary" id="reminder-x">關閉</button>
      </span>`;
    bar.classList.remove("hidden");
    el("reminder-go").addEventListener("click", () => { bar.classList.add("hidden"); switchTab("weekly"); });
    el("reminder-x").addEventListener("click", () => {
      bar.classList.add("hidden");
      localStorage.setItem("reminderDismissed", thisWeek);
    });
  } catch (e) { /* 提醒失敗不影響主流程 */ }
}

function showLoggedIn() {
  el("login-view").classList.add("hidden");
  el("app-view").classList.remove("hidden");
  el("tabbar").classList.remove("hidden");
  switchTab("today");
  maybeReminder();
}

function showLoggedOut() {
  el("app-view").classList.add("hidden");
  el("tabbar").classList.add("hidden");
  el("reminder").classList.add("hidden");
  el("login-view").classList.remove("hidden");
}

function wire() {
  el("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    el("login-error").textContent = "";
    try {
      await signIn(el("login-email").value, el("login-password").value);
    } catch (err) {
      el("login-error").textContent = "登入失敗：" + (err.message || "請檢查帳密");
    }
  });

  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );

  onAuthChange((user) => {
    if (user) showLoggedIn();
    else showLoggedOut();
  });
}

(async function init() {
  wire();
  const user = await currentUser();
  if (user) showLoggedIn();
  else showLoggedOut();
})();
```

- [ ] **Step 4: 在 `css/styles.css` 檔尾新增樣式**

```css
/* 週目標 */
.week-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.week-nav button { padding: 8px 16px; }
.week-label { font-family: "Orbitron", sans-serif; letter-spacing: 1px; color: var(--accent); text-shadow: 0 0 8px rgba(43, 212, 255, 0.4); }
.goal { cursor: default; }
.goal-todo { cursor: pointer; user-select: none; -webkit-user-select: none; }
.goal-todo .check { pointer-events: none; }
.goal-count { font-family: "Orbitron", sans-serif; color: var(--muted); }
.goal-count.reached { color: var(--good); text-shadow: 0 0 8px rgba(57, 255, 158, 0.6); }
.goal.filled { opacity: 0.55; }
.add-goal input, .add-goal select { margin: 6px 0; }
.reminder {
  position: relative; z-index: 9; margin: 0 auto; max-width: 640px;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 16px; color: var(--good);
  background: rgba(57, 255, 158, 0.08); border: 1px solid var(--good);
  box-shadow: 0 0 12px rgba(57, 255, 158, 0.25);
}
@media (min-width: 768px) { .reminder { margin-top: 64px; } }
```

- [ ] **Step 5: 語法檢查 + 既有測試未退化**

Run: `node --check js/ui-weekly.js && node --check js/app.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`。
Run: `node --test`
Expected: PASS（22 個測試）。

- [ ] **Step 6: 整合靜態檢查（所有 import 有對應 export）**

Run:
```bash
node --input-type=module -e '
import fs from "node:fs";
const dir="js"; const files=fs.readdirSync(dir).filter(f=>f.endsWith(".js"));
const ex={};
for(const f of files){const s=fs.readFileSync(dir+"/"+f,"utf8");const n=new Set();
 for(const m of s.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g))n.add(m[1]);
 for(const m of s.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g))n.add(m[1]);
 ex["./"+f]=n;}
let p=0;
for(const f of files){const s=fs.readFileSync(dir+"/"+f,"utf8");
 for(const m of s.matchAll(/import\s*\{([^}]+)\}\s*from\s*["\x27](\.\/[^"\x27]+)["\x27]/g)){
  for(const nm of m[1].split(",").map(x=>x.trim()).filter(Boolean)){
   if(!ex[m[2]]){console.log("MISSING FILE",f,m[2]);p++;}
   else if(!ex[m[2]].has(nm)){console.log("MISSING EXPORT",f,"{"+nm+"} <-",m[2]);p++;}}}}
console.log(p===0?"IMPORTS_OK":"PROBLEMS "+p);
'
```
Expected: `IMPORTS_OK`。

- [ ] **Step 7: 手動驗證（需先完成 Task 2 的 Supabase 建表）**

啟動 `python3 -m http.server 8099`，登入後到「週目標」分頁：
1. 新增一個待辦目標 → 出現可打勾的列；點整列切換完成（變綠淡化）。
2. 新增一個次數目標「手動計次」target=4 → 按 ＋ 三次顯示 `[3/4]`、進度條 75%。
3. 新增一個次數目標「連動：運動」→ 進度自動等於本週「運動」打勾天數（到今天頁打幾天勾再回來看）。
4. 寫復盤 → 儲存 → 重整頁面後仍在。
5. ‹ › 切換週 → 各週目標獨立。
Expected: 上述皆正確、無 console error。

- [ ] **Step 8: Commit**

```bash
git add js/ui-weekly.js index.html js/app.js css/styles.css
git commit -m "feat: add Weekly Goals tab (todo/count goals, review, in-app reminder)"
```

---

## Self-Review 紀錄

- **Spec coverage：** 週定義/識別 → Task 1（weekRange/weekLabel）+ mondayOf；兩種目標 todo/count → Task 3 goalRow；連動習慣自動計次 → Task 3 progressOf + getRange；手動計次 +/- → Task 3 stepCount；復盤文字 + 達成摘要 → Task 3 + weeklySummary（Task 1）；頁面內提醒（非推播）→ Task 3 app.js maybeReminder；資料模型 2 表 + RLS → Task 2 SQL；CRUD → Task 2 db.js；第 5 分頁 → Task 3 index/app。皆有對應。
- **型別一致：** db 匯出（listWeeklyGoals/addWeeklyGoal/updateWeeklyGoal/deleteWeeklyGoal/getWeeklyReview/saveWeeklyReview）在 ui-weekly 與 app 引用一致；logic 匯出（addDays/weekRange/weekLabel/weeklySummary）測試與使用一致；TABS 與 renderers 鍵一致（today/weekly/review/charts/settings）；goal 欄位（type/target/done/linked_habit_id/manual_count）schema 與 UI 一致。
- **Placeholder：** 無 TODO/TBD；整檔取代與新增皆含完整程式碼。Supabase 建表標注為控制者代辦。
- **YAGNI：** 未做「未完成 todo 帶到下週」與推播（依設計排除）。
