# 自我成長檢核系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打造一個單人使用、手機可用的自我成長檢核網頁，支援自訂「習慣打勾 / 1–10 評分 / 數值紀錄」與文字日記，資料存於 Supabase 免費雲端，並能回顧趨勢。

**Architecture:** 純前端單頁應用（HTML + 原生 ES Module JavaScript，無框架、無打包工具），透過 supabase-js（CDN 載入）直接與 Supabase 溝通。安全性由 Supabase Auth（email+密碼）加全表 Row Level Security 保證。純運算邏輯抽到獨立模組 `logic.js`，以 Node 內建 `node:test` 做單元測試（零相依套件）。部署到 GitHub Pages。

**Tech Stack:** HTML5 / CSS3 / Vanilla JS (ES Modules) / supabase-js v2 (CDN) / Supabase (PostgreSQL + Auth + RLS) / Node `node:test`（僅測試用）/ GitHub Pages。

---

## File Structure

```
personalGrowthTracker/
├─ index.html               # 應用外殼：三個分頁容器、登入畫面、CDN 載入 supabase-js
├─ css/
│  └─ styles.css            # 手機優先樣式、分頁列、表單元件
├─ js/
│  ├─ config.js             # Supabase URL 與 anon key（部署時填入）
│  ├─ supabaseClient.js     # 建立並匯出 supabase client 單例
│  ├─ logic.js              # 純函式：日期、統計、數值解析（可在 Node 測試）
│  ├─ db.js                 # 資料存取層：各表 CRUD / upsert
│  ├─ auth.js               # 登入 / 登出 / 取得目前使用者
│  ├─ ui-today.js           # 「今天」頁：渲染與儲存
│  ├─ ui-review.js          # 「回顧」頁：統計與趨勢
│  ├─ ui-settings.js        # 「設定」頁：管理習慣/評分項/數值項與登出
│  └─ app.js                # 進入點：登入守門、分頁切換、初始化
├─ sql/
│  └─ schema.sql            # 建表 + RLS 政策（在 Supabase SQL editor 執行）
├─ tests/
│  └─ logic.test.js         # logic.js 的單元測試（node:test）
├─ DEPLOY.md                # 部署步驟（Supabase 設定 + GitHub Pages）
└─ docs/superpowers/...     # 設計與計畫文件
```

每個檔案單一職責；`logic.js` 不依賴瀏覽器或 Supabase，因此可在 Node 直接跑測試。UI 與 db 層以手動測試（步驟記於各任務）驗證。

---

## Task 1: 專案骨架與 Supabase 資料庫 Schema

**Files:**
- Create: `sql/schema.sql`
- Create: `js/config.js`

- [ ] **Step 1: 建立資料庫 schema SQL**

Create `sql/schema.sql`:

```sql
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
```

- [ ] **Step 2: 建立前端設定檔範本**

Create `js/config.js`:

```javascript
// 部署時填入你的 Supabase 專案資訊。
// 這兩個值是設計上可公開的（anon key），資料安全由 Auth + RLS 保證。
export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
```

- [ ] **Step 3: Commit**

```bash
git add sql/schema.sql js/config.js
git commit -m "feat: add database schema and frontend config template"
```

---

## Task 2: 純運算邏輯模組（TDD）

`logic.js` 收納所有不依賴瀏覽器/Supabase 的純函式，先寫測試再實作。

**Files:**
- Create: `tests/logic.test.js`
- Create: `js/logic.js`

- [ ] **Step 1: 寫失敗測試**

Create `tests/logic.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recentDates,
  completionRate,
  cumulativeSum,
  clampScore,
  parseMetricValue,
  todayISO,
} from "../js/logic.js";

test("recentDates 回傳 N 天、含結束日、由舊到新", () => {
  const r = recentDates("2026-06-17", 3);
  assert.deepEqual(r, ["2026-06-15", "2026-06-16", "2026-06-17"]);
});

test("completionRate 計算完成百分比（四捨五入整數）", () => {
  assert.equal(completionRate([{ done: true }, { done: false }, { done: true }]), 67);
  assert.equal(completionRate([]), 0);
});

test("cumulativeSum 回傳逐項累計", () => {
  assert.deepEqual(cumulativeSum([100, 50, 25]), [100, 150, 175]);
  assert.deepEqual(cumulativeSum([]), []);
});

test("clampScore 限制在 1..10 並取整", () => {
  assert.equal(clampScore(0), 1);
  assert.equal(clampScore(11), 10);
  assert.equal(clampScore(7.6), 8);
});

test("parseMetricValue：合法數字回傳 number，非法回傳 null", () => {
  assert.equal(parseMetricValue("1500"), 1500);
  assert.equal(parseMetricValue("62.5"), 62.5);
  assert.equal(parseMetricValue(""), null);
  assert.equal(parseMetricValue("abc"), null);
});

test("todayISO 回傳 YYYY-MM-DD 格式", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/`
Expected: FAIL，訊息類似 `Cannot find module '../js/logic.js'`。

- [ ] **Step 3: 實作 logic.js**

Create `js/logic.js`:

```javascript
// 純函式工具：不依賴瀏覽器或 Supabase，可在 Node 直接測試。

// 將 Date 轉成本地時區的 YYYY-MM-DD。
export function isoFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return isoFromDate(new Date());
}

// 回傳結束日往前 count 天（含結束日）的日期字串，由舊到新。
export function recentDates(endISO, count) {
  const [y, m, d] = endISO.split("-").map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i);
    out.push(isoFromDate(dt));
  }
  return out;
}

// checks: 陣列，每個元素 { done: boolean }；回傳完成百分比（0..100 整數）。
export function completionRate(checks) {
  if (!checks.length) return 0;
  const done = checks.filter((c) => c.done).length;
  return Math.round((done / checks.length) * 100);
}

// 逐項累計總和。
export function cumulativeSum(values) {
  const out = [];
  let acc = 0;
  for (const v of values) {
    acc += v;
    out.push(acc);
  }
  return out;
}

// 限制評分在 1..10，並四捨五入為整數。
export function clampScore(n) {
  const r = Math.round(n);
  if (r < 1) return 1;
  if (r > 10) return 10;
  return r;
}

// 解析數值輸入：合法的有限數字回傳 number，否則 null。
export function parseMetricValue(str) {
  if (typeof str !== "string" || str.trim() === "") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test tests/`
Expected: PASS，6 個測試全綠。

- [ ] **Step 5: Commit**

```bash
git add tests/logic.test.js js/logic.js
git commit -m "feat: add pure logic module with unit tests"
```

---

## Task 3: Supabase client 與資料存取層

**Files:**
- Create: `js/supabaseClient.js`
- Create: `js/db.js`

- [ ] **Step 1: 建立 client 單例**

Create `js/supabaseClient.js`:

```javascript
// 由 index.html 以 CDN 載入的全域 supabase（window.supabase）建立 client。
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

- [ ] **Step 2: 建立資料存取層**

Create `js/db.js`:

```javascript
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
```

- [ ] **Step 3: Commit**

```bash
git add js/supabaseClient.js js/db.js
git commit -m "feat: add supabase client and data access layer"
```

---

## Task 4: 驗證模組（登入 / 登出）

**Files:**
- Create: `js/auth.js`

- [ ] **Step 1: 實作 auth 模組**

Create `js/auth.js`:

```javascript
import { sb } from "./supabaseClient.js";

export async function currentUser() {
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

// 監聽登入狀態變化，callback(user|null)
export function onAuthChange(callback) {
  sb.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/auth.js
git commit -m "feat: add auth module"
```

---

## Task 5: 應用外殼（HTML + CSS + 分頁切換）

**Files:**
- Create: `index.html`
- Create: `css/styles.css`
- Create: `js/app.js`

- [ ] **Step 1: 建立 HTML 外殼**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>成長檢核</title>
  <link rel="stylesheet" href="css/styles.css" />
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
  <!-- 登入畫面 -->
  <section id="login-view" class="view hidden">
    <h1>成長檢核</h1>
    <form id="login-form">
      <input id="login-email" type="email" placeholder="Email" autocomplete="username" required />
      <input id="login-password" type="password" placeholder="密碼" autocomplete="current-password" required />
      <button type="submit">登入</button>
      <p id="login-error" class="error"></p>
    </form>
  </section>

  <!-- 主畫面 -->
  <main id="app-view" class="hidden">
    <section id="tab-today" class="tab"></section>
    <section id="tab-review" class="tab hidden"></section>
    <section id="tab-settings" class="tab hidden"></section>
  </main>

  <!-- 底部分頁列 -->
  <nav id="tabbar" class="hidden">
    <button data-tab="today" class="active">今天</button>
    <button data-tab="review">回顧</button>
    <button data-tab="settings">設定</button>
  </nav>

  <div id="toast" class="toast hidden"></div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 建立樣式**

Create `css/styles.css`:

```css
:root {
  --bg: #0f2233;
  --card: #16314a;
  --accent: #1ca8c4;
  --text: #eaf2f6;
  --muted: #8fb0c0;
  --danger: #e2606a;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
  padding-bottom: 72px;
  -webkit-tap-highlight-color: transparent;
}
.hidden { display: none !important; }
.view, .tab { padding: 20px 16px; max-width: 640px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin-bottom: 16px; }
h2 { font-size: 1.2rem; margin: 18px 0 10px; }
input, textarea, button, select {
  font: inherit; color: var(--text);
}
input, textarea, select {
  width: 100%; padding: 12px; margin: 6px 0;
  background: var(--card); border: 1px solid #234; border-radius: 10px;
}
button {
  background: var(--accent); border: none; border-radius: 10px;
  padding: 12px 16px; color: #042; font-weight: 600; cursor: pointer;
}
button.secondary { background: transparent; border: 1px solid var(--accent); color: var(--accent); }
button.link { background: none; color: var(--muted); padding: 4px; font-weight: 400; }
.error { color: var(--danger); margin-top: 8px; min-height: 1.2em; }
.card { background: var(--card); border-radius: 12px; padding: 14px; margin: 10px 0; }
.row { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.check { width: 30px; height: 30px; border-radius: 8px; border: 2px solid var(--accent); background: transparent; }
.check.done { background: var(--accent); }
.slider-row input[type=range] { flex: 1; }
.muted { color: var(--muted); font-size: 0.9rem; }
.bar { height: 8px; background: #234; border-radius: 4px; overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--accent); }
#tabbar {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; background: var(--card); border-top: 1px solid #234;
  padding-bottom: env(safe-area-inset-bottom);
}
#tabbar button {
  flex: 1; background: none; color: var(--muted); border-radius: 0; font-weight: 400;
}
#tabbar button.active { color: var(--accent); font-weight: 600; }
.toast {
  position: fixed; bottom: 84px; left: 50%; transform: translateX(-50%);
  background: #042; color: var(--text); padding: 10px 18px; border-radius: 20px;
  border: 1px solid var(--accent);
}
```

- [ ] **Step 3: 建立進入點與分頁切換**

Create `js/app.js`:

```javascript
import { currentUser, signIn, onAuthChange } from "./auth.js";
import { renderToday } from "./ui-today.js";
import { renderReview } from "./ui-review.js";
import { renderSettings } from "./ui-settings.js";

const el = (id) => document.getElementById(id);

export function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2000);
}

const renderers = {
  today: () => renderToday(el("tab-today")),
  review: () => renderReview(el("tab-review")),
  settings: () => renderSettings(el("tab-settings")),
};

function switchTab(name) {
  for (const tab of ["today", "review", "settings"]) {
    el(`tab-${tab}`).classList.toggle("hidden", tab !== name);
  }
  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  renderers[name]();
}

function showLoggedIn() {
  el("login-view").classList.add("hidden");
  el("app-view").classList.remove("hidden");
  el("tabbar").classList.remove("hidden");
  switchTab("today");
}

function showLoggedOut() {
  el("app-view").classList.add("hidden");
  el("tabbar").classList.add("hidden");
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

- [ ] **Step 4: 手動驗證**

填好 `js/config.js`（真實 Supabase URL/key）並在 Supabase 建好一個測試帳號後，於專案根目錄執行：
Run: `python3 -m http.server 5173`
開瀏覽器 `http://localhost:5173`。
Expected: 看到登入畫面；輸入正確帳密後切到主畫面，底部三個分頁可點擊切換（內容由後續任務填上，先不報錯即可——本步驟接受空白分頁）。

- [ ] **Step 5: Commit**

```bash
git add index.html css/styles.css js/app.js
git commit -m "feat: add app shell, styles, login and tab navigation"
```

---

## Task 6: 「今天」頁

**Files:**
- Create: `js/ui-today.js`

- [ ] **Step 1: 實作今天頁**

Create `js/ui-today.js`:

```javascript
import { listDefinitions, getDay, saveDay } from "./db.js";
import { todayISO, clampScore, parseMetricValue } from "./logic.js";
import { showToast } from "./app.js";

let currentDate = todayISO();

export async function renderToday(root) {
  currentDate = currentDate || todayISO();
  root.innerHTML = `<h1>今天</h1>
    <input type="date" id="today-date" value="${currentDate}" />
    <div id="today-body" class="muted">載入中…</div>`;

  root.querySelector("#today-date").addEventListener("change", (e) => {
    currentDate = e.target.value;
    renderToday(root);
  });

  const body = root.querySelector("#today-body");
  try {
    const [habits, scoreItems, metricItems, day] = await Promise.all([
      listDefinitions("habits"),
      listDefinitions("score_items"),
      listDefinitions("metric_items"),
      getDay(currentDate),
    ]);

    const checkMap = Object.fromEntries(day.checks.map((c) => [c.habit_id, c.done]));
    const scoreMap = Object.fromEntries(day.scores.map((s) => [s.score_item_id, s.value]));
    const metricMap = Object.fromEntries(day.metrics.map((m) => [m.metric_item_id, m.value]));

    body.classList.remove("muted");
    body.innerHTML = `
      ${section("習慣", habits.map((h) => habitRow(h, checkMap[h.id] || false)).join("") || empty())}
      ${section("評分（1–10）", scoreItems.map((s) => scoreRow(s, scoreMap[s.id] || 5)).join("") || empty())}
      ${section("數值", metricItems.map((m) => metricRow(m, metricMap[m.id])).join("") || empty())}
      <h2>日記</h2>
      <textarea id="journal" rows="5" placeholder="今天的紀錄…">${escapeHtml(day.journal)}</textarea>
      <button id="save-btn">儲存</button>`;

    body.querySelectorAll(".check").forEach((btn) =>
      btn.addEventListener("click", () => btn.classList.toggle("done"))
    );

    body.querySelector("#save-btn").addEventListener("click", () =>
      save(root, habits, scoreItems, metricItems)
    );
  } catch (err) {
    body.innerHTML = `<p class="error">載入失敗：${escapeHtml(err.message || "")}</p>`;
  }
}

async function save(root, habits, scoreItems, metricItems) {
  const btn = root.querySelector("#save-btn");
  btn.disabled = true;
  try {
    const checks = habits.map((h) => ({
      habit_id: h.id,
      done: root.querySelector(`.check[data-id="${h.id}"]`).classList.contains("done"),
    }));
    const scores = scoreItems.map((s) => ({
      score_item_id: s.id,
      value: clampScore(Number(root.querySelector(`input[data-score="${s.id}"]`).value)),
    }));
    const metrics = [];
    for (const m of metricItems) {
      const raw = root.querySelector(`input[data-metric="${m.id}"]`).value;
      const v = parseMetricValue(raw);
      if (v !== null) metrics.push({ metric_item_id: m.id, value: v });
    }
    const journal = root.querySelector("#journal").value;
    await saveDay(currentDate, { journal, checks, scores, metrics });
    showToast("已儲存");
  } catch (err) {
    showToast("儲存失敗，請檢查網路");
  } finally {
    btn.disabled = false;
  }
}

function section(title, inner) {
  return `<h2>${title}</h2>${inner}`;
}
function empty() {
  return `<p class="muted">尚未在「設定」新增項目</p>`;
}
function habitRow(h, done) {
  return `<div class="card row">
    <span>${escapeHtml(h.name)}</span>
    <button class="check ${done ? "done" : ""}" data-id="${h.id}" aria-label="完成"></button>
  </div>`;
}
function scoreRow(s, value) {
  return `<div class="card">
    <div class="row"><span>${escapeHtml(s.name)}</span><span class="muted" data-score-val="${s.id}">${value}</span></div>
    <div class="slider-row row">
      <input type="range" min="1" max="10" value="${value}" data-score="${s.id}"
        oninput="this.closest('.card').querySelector('[data-score-val]').textContent=this.value" />
    </div>
  </div>`;
}
function metricRow(m, value) {
  return `<div class="card row">
    <span>${escapeHtml(m.name)}</span>
    <span class="row" style="flex:0 0 auto;width:auto;gap:6px">
      <input type="number" step="any" style="width:110px" data-metric="${m.id}"
        value="${value ?? ""}" />
      <span class="muted">${escapeHtml(m.unit || "")}</span>
    </span>
  </div>`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
```

- [ ] **Step 2: 手動驗證**

先做完 Task 7（設定頁）以新增項目較方便；若先測此頁，可在 Supabase Table editor 手動插入一筆 habit。
啟動 `python3 -m http.server 5173`，登入後在「今天」頁勾選、拉滑桿、填數值、寫日記、按儲存。
Expected: 出現「已儲存」；重整頁面後資料仍在；切換日期可分別記錄。

- [ ] **Step 3: Commit**

```bash
git add js/ui-today.js
git commit -m "feat: add Today tab with habits, scores, metrics and journal"
```

---

## Task 7: 「設定」頁

**Files:**
- Create: `js/ui-settings.js`

- [ ] **Step 1: 實作設定頁**

Create `js/ui-settings.js`:

```javascript
import { listDefinitions, addDefinition, updateDefinition, archiveDefinition } from "./db.js";
import { signOut } from "./auth.js";
import { showToast } from "./app.js";

const GROUPS = [
  { table: "habits", title: "習慣", hasUnit: false },
  { table: "score_items", title: "評分項（1–10）", hasUnit: false },
  { table: "metric_items", title: "數值項", hasUnit: true },
];

export async function renderSettings(root) {
  root.innerHTML = `<h1>設定</h1><div id="settings-body" class="muted">載入中…</div>
    <button id="logout-btn" class="secondary" style="margin-top:24px">登出</button>`;

  root.querySelector("#logout-btn").addEventListener("click", async () => {
    await signOut();
  });

  const body = root.querySelector("#settings-body");
  try {
    const lists = await Promise.all(GROUPS.map((g) => listDefinitions(g.table)));
    body.classList.remove("muted");
    body.innerHTML = GROUPS.map((g, i) => groupBlock(g, lists[i])).join("");
    wireGroups(root);
  } catch (err) {
    body.innerHTML = `<p class="error">載入失敗：${escapeHtml(err.message || "")}</p>`;
  }
}

function groupBlock(g, items) {
  const rows = items
    .map(
      (it) => `<div class="card row" data-id="${it.id}">
        <span>${escapeHtml(it.name)}${g.hasUnit && it.unit ? ` <span class="muted">(${escapeHtml(it.unit)})</span>` : ""}</span>
        <button class="link" data-archive="${it.id}">刪除</button>
      </div>`
    )
    .join("");
  const unitInput = g.hasUnit
    ? `<input data-new-unit="${g.table}" placeholder="單位（如 元、kg）" style="width:120px" />`
    : "";
  return `<h2>${g.title}</h2>${rows}
    <div class="row" style="gap:6px">
      <input data-new-name="${g.table}" placeholder="新增${g.title}名稱" />
      ${unitInput}
      <button data-add="${g.table}" style="flex:0 0 auto">新增</button>
    </div>`;
}

function wireGroups(root) {
  root.querySelectorAll("[data-add]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const table = btn.dataset.add;
      const name = root.querySelector(`[data-new-name="${table}"]`).value.trim();
      if (!name) return;
      const fields = { name };
      const unitEl = root.querySelector(`[data-new-unit="${table}"]`);
      if (unitEl) fields.unit = unitEl.value.trim();
      try {
        await addDefinition(table, fields);
        showToast("已新增");
        renderSettings(root);
      } catch {
        showToast("新增失敗");
      }
    })
  );

  root.querySelectorAll("[data-archive]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.archive;
      const table = GROUPS.find((g) =>
        root.querySelector(`[data-add="${g.table}"]`)
      );
      // 找出此 row 屬於哪個 table：用最近的 [data-add] 區塊判斷
      const block = btn.closest("section") || root;
      // 直接以三表嘗試封存最穩妥：逐一比對 id 來源
      try {
        await archiveAcross(id);
        showToast("已刪除");
        renderSettings(root);
      } catch {
        showToast("刪除失敗");
      }
    })
  );
}

// 封存：因為各表 id 唯一，逐表嘗試（找到屬於哪張表）。
async function archiveAcross(id) {
  for (const g of GROUPS) {
    try {
      await archiveDefinition(g.table, id);
      // archiveDefinition 對不存在的 id 不會報錯，故額外用 list 確認非必要，直接 return。
      return;
    } catch {
      /* 換下一張表 */
    }
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
```

> 注意：`archiveAcross` 對三表逐一 update 同一 id；RLS + id 唯一保證只會命中正確那張表，其餘 update 影響 0 列且不報錯。為求精準，改良版可在 row 上標記 table，見 Step 2 改良。

- [ ] **Step 2: 改良刪除為精準指定 table**

Replace the `groupBlock` 的刪除按鈕與 `wireGroups` 中 archive 區段，改為帶上 table：

在 `groupBlock` 內，把：
```javascript
<button class="link" data-archive="${it.id}">刪除</button>
```
改為：
```javascript
<button class="link" data-archive="${it.id}" data-table="${g.table}">刪除</button>
```

並把 `wireGroups` 中整段 `data-archive` 的事件處理改為：
```javascript
  root.querySelectorAll("[data-archive]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await archiveDefinition(btn.dataset.table, btn.dataset.archive);
        showToast("已刪除");
        renderSettings(root);
      } catch {
        showToast("刪除失敗");
      }
    })
  );
```
並刪除 `archiveAcross` 函式（不再需要）。

- [ ] **Step 3: 手動驗證**

啟動本機伺服器、登入、進「設定」頁：新增一個習慣（如「英文學習」）、一個評分項（如「人際」）、一個數值項（如「存錢」單位「元」）。
Expected: 各項出現在清單；切到「今天」頁能看到對應的打勾 / 滑桿 / 數值輸入；按「刪除」後該項從清單與今天頁消失（歷史資料仍保留於資料庫）。

- [ ] **Step 4: Commit**

```bash
git add js/ui-settings.js
git commit -m "feat: add Settings tab to manage definitions and logout"
```

---

## Task 8: 「回顧」頁

**Files:**
- Create: `js/ui-review.js`

- [ ] **Step 1: 實作回顧頁**

Create `js/ui-review.js`:

```javascript
import { listDefinitions, getRange } from "./db.js";
import { recentDates, completionRate, cumulativeSum, todayISO } from "./logic.js";

const WINDOW = 30;

export async function renderReview(root) {
  root.innerHTML = `<h1>回顧（近 ${WINDOW} 天）</h1><div id="review-body" class="muted">載入中…</div>`;
  const body = root.querySelector("#review-body");
  try {
    const dates = recentDates(todayISO(), WINDOW);
    const from = dates[0];
    const to = dates[dates.length - 1];

    const [habits, scoreItems, metricItems, checks, scores, metrics] = await Promise.all([
      listDefinitions("habits"),
      listDefinitions("score_items"),
      listDefinitions("metric_items"),
      getRange("habit_checks", from, to),
      getRange("scores", from, to),
      getRange("metric_values", from, to),
    ]);

    body.classList.remove("muted");
    body.innerHTML =
      habitSection(habits, checks) +
      scoreSection(scoreItems, scores) +
      metricSection(metricItems, metrics);
  } catch (err) {
    body.innerHTML = `<p class="error">載入失敗：${escapeHtml(err.message || "")}</p>`;
  }
}

function habitSection(habits, checks) {
  if (!habits.length) return "";
  const rows = habits
    .map((h) => {
      const mine = checks.filter((c) => c.habit_id === h.id);
      const rate = completionRate(mine);
      return `<div class="card">
        <div class="row"><span>${escapeHtml(h.name)}</span><span class="muted">${rate}%</span></div>
        <div class="bar"><span style="width:${rate}%"></span></div>
      </div>`;
    })
    .join("");
  return `<h2>習慣完成率</h2>${rows}`;
}

function scoreSection(items, scores) {
  if (!items.length) return "";
  const rows = items
    .map((it) => {
      const mine = scores.filter((s) => s.score_item_id === it.id).map((s) => s.value);
      const avg = mine.length ? (mine.reduce((a, b) => a + b, 0) / mine.length).toFixed(1) : "—";
      return `<div class="card row"><span>${escapeHtml(it.name)}</span>
        <span class="muted">平均 ${avg} ・ ${mine.length} 筆</span></div>`;
    })
    .join("");
  return `<h2>評分平均</h2>${rows}`;
}

function metricSection(items, values) {
  if (!items.length) return "";
  const rows = items
    .map((it) => {
      const mine = values.filter((v) => v.metric_item_id === it.id).map((v) => Number(v.value));
      const total = cumulativeSum(mine).slice(-1)[0] ?? 0;
      const last = mine.length ? mine[mine.length - 1] : "—";
      return `<div class="card row"><span>${escapeHtml(it.name)}</span>
        <span class="muted">累計 ${total}${escapeHtml(it.unit || "")} ・ 最近 ${last}</span></div>`;
    })
    .join("");
  return `<h2>數值統計</h2>${rows}`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
```

- [ ] **Step 2: 手動驗證**

確保「今天」頁已存過至少 1–2 天資料（可切換日期補登），進「回顧」頁。
Expected: 看到各習慣完成率長條、各評分項平均分、各數值項累計與最近值，數字與你輸入的一致。

- [ ] **Step 3: Commit**

```bash
git add js/ui-review.js
git commit -m "feat: add Review tab with completion rates, averages and totals"
```

---

## Task 9: 部署文件與全流程驗收

**Files:**
- Create: `DEPLOY.md`

- [ ] **Step 1: 撰寫部署說明**

Create `DEPLOY.md`:

```markdown
# 部署步驟

## 1. 建立 Supabase 專案
1. 到 https://supabase.com 註冊並建立一個免費專案。
2. 左側 SQL Editor → 貼上 `sql/schema.sql` 全部內容 → Run。
3. 左側 Authentication → Providers → 確認 Email 已啟用。
4. Authentication → Users → Add user，建立你自己的 email + 密碼（記得設定 Auto confirm，或關閉 email 確認）。

## 2. 填入前端設定
1. 專案 Settings → API，複製 `Project URL` 與 `anon public` key。
2. 編輯 `js/config.js`，填入這兩個值。

## 3. 本機測試
在專案根目錄執行：
\`\`\`
python3 -m http.server 5173
\`\`\`
開 http://localhost:5173 ，登入測試。

## 4. 部署到 GitHub Pages
1. 建立 GitHub repo，push 全部檔案。
2. repo Settings → Pages → Source 選 `main` 分支 `/ (root)` → Save。
3. 等待產生網址（https://你的帳號.github.io/repo名/）。
4. 手機開該網址 → 登入 → 瀏覽器選單「加入主畫面」當 App 用。

## 注意
- `js/config.js` 內只有 anon key（可公開）；資料安全由 Auth + RLS 保證。
- 切勿把 service_role key 放進前端。
```

- [ ] **Step 2: 全流程驗收**

依 `DEPLOY.md` 完成 Supabase 設定與 `config.js` 後，於本機跑 `python3 -m http.server 5173`，完整走一遍：
1. 登入。
2. 設定頁新增：習慣「運動」「英文學習」、評分項「心情」「人際」、數值項「存錢(元)」。
3. 今天頁：勾選、評分、填存錢金額、寫日記、儲存 → 出現「已儲存」。
4. 重整頁面 → 資料仍在。
5. 切換到昨天日期補登一筆 → 儲存。
6. 回顧頁 → 完成率/平均/累計數字正確。
7. 登出 → 回到登入畫面；重新登入資料仍在。

Expected: 上述全部通過。

- [ ] **Step 3: 跑單元測試確認未退化**

Run: `node --test tests/`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: add deployment guide"
```

---

## Self-Review 紀錄

- **Spec coverage：** 三種紀錄類型（習慣/評分/數值）→ Task 1 schema + Task 6 今天頁 + Task 7 設定頁；文字日記 → Task 6；回顧統計 → Task 8；登入安全 → Task 1 RLS + Task 4 auth + Task 5 守門；自訂項目 → Task 7；部署 → Task 9。皆有對應任務。
- **型別一致：** db 函式名（`listDefinitions`/`addDefinition`/`archiveDefinition`/`getDay`/`saveDay`/`getRange`）在 UI 任務中引用一致；logic 函式名（`recentDates`/`completionRate`/`cumulativeSum`/`clampScore`/`parseMetricValue`/`todayISO`）測試與使用一致。
- **Placeholder：** 無 TODO/TBD；所有步驟含完整程式碼或確切指令。Task 7 Step 2 為刻意的「先簡單後改良」重構，兩版皆附完整程式碼。
```
