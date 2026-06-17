# 圖表分頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為既有的自我成長檢核 app 新增第四個「圖表」分頁，讓每個習慣 / 評分項 / 數值項能以週/月/季/年為單位、在可自訂的查詢區間內，用最適合的圖表（折線 / 長條 / 圓餅 / 月曆熱力圖）檢視趨勢。

**Architecture:** 沿用現有「純前端 ES Module + Supabase」架構。新增 `js/ui-charts.js` 渲染圖表分頁；圖表用 Chart.js（CDN）繪製，習慣的月曆熱力圖用純 HTML/CSS 格子繪製。所有分組與彙總運算抽到 `js/logic.js` 的純函式，以 `node:test` 做 TDD。數值項新增 `agg`（加總/平均）欄位。

**Tech Stack:** Vanilla JS (ES Modules) / Chart.js v4 (CDN) / Supabase / Node `node:test`。

---

## File Structure

```
js/
├─ logic.js        # 既有；新增分組/彙總/月曆純函式
├─ ui-charts.js    # 新增；圖表分頁
├─ ui-settings.js  # 既有；數值項加上「加總/平均」選單
├─ app.js          # 既有；接上第四分頁
index.html          # 既有；載入 Chart.js + 新增第四分頁按鈕與容器
css/styles.css      # 既有；新增月曆熱力圖樣式
sql/migrations/2026-06-18-add-metric-agg.sql  # 新增；ALTER TABLE 遷移
tests/logic.test.js # 既有；新增圖表函式測試
```

既有「今天 / 回顧 / 設定」功能不更動。

> **執行者注意（控制者代辦）：** Task 2 的 `ALTER TABLE` 必須由人在 Supabase SQL Editor 手動執行一次（subagent 無法連 Supabase）。控制者需在執行 Task 2 時請使用者貼上並執行該 SQL。

---

## Task 1: logic.js 圖表純函式（TDD）

**Files:**
- Modify: `tests/logic.test.js`（在檔尾新增測試）
- Modify: `js/logic.js`（在檔尾新增函式）

- [ ] **Step 1: 在 `tests/logic.test.js` 檔尾新增以下測試**

```javascript
import {
  mondayOf,
  bucketKey,
  enumerateBuckets,
  aggregateValues,
  aggregateHabitCounts,
  habitDoneCounts,
  alignSeries,
  bucketLabel,
  calendarGrid,
} from "../js/logic.js";

test("mondayOf 回傳該週週一（週一為起點）", () => {
  assert.equal(mondayOf("2026-06-17"), "2026-06-15");
  assert.equal(mondayOf("2026-06-15"), "2026-06-15");
  assert.equal(mondayOf("2026-06-21"), "2026-06-15");
});

test("bucketKey 依單位分組", () => {
  assert.equal(bucketKey("2026-06-17", "week"), "2026-06-15");
  assert.equal(bucketKey("2026-06-17", "month"), "2026-06");
  assert.equal(bucketKey("2026-06-17", "quarter"), "2026-Q2");
  assert.equal(bucketKey("2026-06-17", "year"), "2026");
});

test("enumerateBuckets 列出區間內所有分組（由舊到新）", () => {
  assert.deepEqual(enumerateBuckets("2026-04-10", "2026-06-17", "month"),
    ["2026-04", "2026-05", "2026-06"]);
  assert.deepEqual(enumerateBuckets("2025-11-01", "2026-02-01", "quarter"),
    ["2025-Q4", "2026-Q1"]);
  assert.deepEqual(enumerateBuckets("2024-06-01", "2026-06-01", "year"),
    ["2024", "2025", "2026"]);
  assert.deepEqual(enumerateBuckets("2026-06-15", "2026-06-29", "week"),
    ["2026-06-15", "2026-06-22", "2026-06-29"]);
});

test("aggregateValues sum 與 avg", () => {
  const rows = [
    { log_date: "2026-06-01", value: 100 },
    { log_date: "2026-06-20", value: 50 },
    { log_date: "2026-05-10", value: 8 },
  ];
  assert.deepEqual(aggregateValues(rows, "month", "sum"), { "2026-06": 150, "2026-05": 8 });
  assert.deepEqual(aggregateValues(rows, "month", "avg"), { "2026-06": 75, "2026-05": 8 });
});

test("aggregateHabitCounts 只計 done=true 的數量", () => {
  const checks = [
    { log_date: "2026-06-01", done: true },
    { log_date: "2026-06-02", done: false },
    { log_date: "2026-06-20", done: true },
  ];
  assert.deepEqual(aggregateHabitCounts(checks, "month"), { "2026-06": 2 });
});

test("habitDoneCounts 統計完成與未完成", () => {
  const checks = [{ done: true }, { done: true }, { done: false }];
  assert.deepEqual(habitDoneCounts(checks), { done: 2, notDone: 1 });
});

test("alignSeries 對齊 buckets，缺漏補 null 或 0", () => {
  assert.deepEqual(alignSeries(["a", "b", "c"], { a: 1, c: 3 }, false), [1, null, 3]);
  assert.deepEqual(alignSeries(["a", "b"], { a: 1 }, true), [1, 0]);
});

test("bucketLabel：週顯示 MM/DD，其餘顯示鍵本身", () => {
  assert.equal(bucketLabel("2026-06-15", "week"), "06/15");
  assert.equal(bucketLabel("2026-06", "month"), "2026-06");
  assert.equal(bucketLabel("2026-Q2", "quarter"), "2026-Q2");
});

test("calendarGrid 產生週欄（週一起），有打勾的日子標記 done", () => {
  const done = new Set(["2026-06-15", "2026-06-18"]);
  const weeks = calendarGrid("2026-06-15", "2026-06-21", done);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].length, 7);
  assert.equal(weeks[0][0].date, "2026-06-15");
  assert.equal(weeks[0][0].done, true);
  assert.equal(weeks[0][3].date, "2026-06-18");
  assert.equal(weeks[0][3].done, true);
  assert.equal(weeks[0][1].done, false);
  assert.equal(weeks[0][6].date, "2026-06-21");
});

test("calendarGrid 區間外的補白格 inRange=false", () => {
  const weeks = calendarGrid("2026-06-17", "2026-06-17", new Set(["2026-06-17"]));
  const cells = weeks.flat();
  const target = cells.find((c) => c.date === "2026-06-17");
  assert.equal(target.inRange, true);
  assert.equal(target.done, true);
  assert.equal(cells.find((c) => c.date === "2026-06-15").inRange, false);
});
```

- [ ] **Step 2: 跑測試確認新測試失敗**

Run: `node --test`
Expected: FAIL（`mondayOf` 等尚未匯出）。

- [ ] **Step 3: 在 `js/logic.js` 檔尾新增以下函式**

```javascript

// ===== 圖表用：分組、彙總、月曆 =====

// 該日期所在週的週一 ISO（週一為一週起點）。
export function mondayOf(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 週一=0 … 週日=6
  dt.setDate(dt.getDate() - dow);
  return isoFromDate(dt);
}

// 某日期在指定單位（week/month/quarter/year）下的分組鍵。
export function bucketKey(dateISO, unit) {
  const y = Number(dateISO.slice(0, 4));
  const m = Number(dateISO.slice(5, 7));
  if (unit === "week") return mondayOf(dateISO);
  if (unit === "month") return `${y}-${String(m).padStart(2, "0")}`;
  if (unit === "quarter") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (unit === "year") return `${y}`;
  throw new Error("unknown unit: " + unit);
}

// from..to（含）之間、指定單位的所有分組鍵，由舊到新。
export function enumerateBuckets(fromISO, toISO, unit) {
  const out = [];
  if (unit === "week") {
    let cur = mondayOf(fromISO);
    const end = mondayOf(toISO);
    while (cur <= end) {
      out.push(cur);
      const [y, m, d] = cur.split("-").map(Number);
      cur = isoFromDate(new Date(y, m - 1, d + 7));
    }
  } else if (unit === "month") {
    let y = Number(fromISO.slice(0, 4));
    let m = Number(fromISO.slice(5, 7));
    const ty = Number(toISO.slice(0, 4));
    const tm = Number(toISO.slice(5, 7));
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
  } else if (unit === "quarter") {
    let y = Number(fromISO.slice(0, 4));
    let q = Math.floor((Number(fromISO.slice(5, 7)) - 1) / 3) + 1;
    const ty = Number(toISO.slice(0, 4));
    const tq = Math.floor((Number(toISO.slice(5, 7)) - 1) / 3) + 1;
    while (y < ty || (y === ty && q <= tq)) {
      out.push(`${y}-Q${q}`);
      q++;
      if (q > 4) { q = 1; y++; }
    }
  } else if (unit === "year") {
    let y = Number(fromISO.slice(0, 4));
    const ty = Number(toISO.slice(0, 4));
    while (y <= ty) { out.push(`${y}`); y++; }
  } else {
    throw new Error("unknown unit: " + unit);
  }
  return out;
}

// rows=[{log_date,value}] 依單位分組並彙總；mode 'sum' 或 'avg'。回傳 { 鍵: number }。
export function aggregateValues(rows, unit, mode) {
  const groups = {};
  for (const r of rows) {
    const k = bucketKey(r.log_date, unit);
    (groups[k] = groups[k] || []).push(Number(r.value));
  }
  const out = {};
  for (const k in groups) {
    const vals = groups[k];
    const sum = vals.reduce((a, b) => a + b, 0);
    out[k] = mode === "sum" ? sum : sum / vals.length;
  }
  return out;
}

// 習慣：依單位分組計算 done=true 的數量。回傳 { 鍵: number }。
export function aggregateHabitCounts(checks, unit) {
  const out = {};
  for (const c of checks) {
    if (!c.done) continue;
    const k = bucketKey(c.log_date, unit);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// 習慣圓餅：有記錄的日子裡完成 vs 未完成。
export function habitDoneCounts(checks) {
  let done = 0, notDone = 0;
  for (const c of checks) { if (c.done) done++; else notDone++; }
  return { done, notDone };
}

// 將彙總對齊 buckets 順序，缺漏補 null（fillZero=true 則補 0）。
export function alignSeries(buckets, aggMap, fillZero) {
  return buckets.map((k) => (k in aggMap ? aggMap[k] : fillZero ? 0 : null));
}

// 分組鍵的顯示標籤。
export function bucketLabel(key, unit) {
  if (unit === "week") return key.slice(5).replace("-", "/"); // MM/DD
  return key;
}

// 月曆熱力圖格子。回傳 weeks 陣列，每個 week 是 7 格（週一..週日）。
// 每格 { date: ISO, done: bool, inRange: bool }。
export function calendarGrid(fromISO, toISO, doneSet) {
  const startMon = mondayOf(fromISO);
  const endMon = mondayOf(toISO);
  const [ey, em, ed] = endMon.split("-").map(Number);
  const endMonDate = new Date(ey, em - 1, ed);
  const [sy, sm, sd] = startMon.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const weeks = [];
  while (cursor <= endMonDate) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const iso = isoFromDate(cursor);
      const inRange = iso >= fromISO && iso <= toISO;
      week.push({ date: iso, done: inRange && doneSet.has(iso), inRange });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// 圖表查詢區間預設起日（依單位往前推合理長度）。
export function defaultFrom(endISO, unit) {
  const [y, m, d] = endISO.split("-").map(Number);
  if (unit === "week") return isoFromDate(new Date(y, m - 1, d - 7 * 11));
  if (unit === "month") return isoFromDate(new Date(y, m - 1 - 11, 1));
  if (unit === "quarter") return isoFromDate(new Date(y, m - 1 - 21, 1));
  if (unit === "year") return isoFromDate(new Date(y - 4, 0, 1));
  return endISO;
}
```

- [ ] **Step 4: 跑測試確認全部通過**

Run: `node --test`
Expected: PASS（原 6 + 新增 10 個測試皆綠）。

- [ ] **Step 5: Commit**

```bash
git add tests/logic.test.js js/logic.js
git commit -m "feat: add chart aggregation and calendar pure functions"
```

---

## Task 2: 資料庫遷移 + 數值項加總/平均設定

**Files:**
- Create: `sql/migrations/2026-06-18-add-metric-agg.sql`
- Modify: `js/ui-settings.js`（整檔取代為下方版本）

- [ ] **Step 1: 建立遷移 SQL**

Create `sql/migrations/2026-06-18-add-metric-agg.sql`:

```sql
-- 數值項新增「彙總方式」欄位：sum=加總、avg=平均，預設 sum。
alter table public.metric_items
  add column if not exists agg text not null default 'sum';
```

- [ ] **Step 2: 整檔取代 `js/ui-settings.js`**

```javascript
import { listDefinitions, addDefinition, updateDefinition, archiveDefinition } from "./db.js";
import { signOut } from "./auth.js";
import { showToast } from "./app.js";

const GROUPS = [
  { table: "habits", title: "習慣", hasUnit: false, hasAgg: false },
  { table: "score_items", title: "評分項（1–10）", hasUnit: false, hasAgg: false },
  { table: "metric_items", title: "數值項", hasUnit: true, hasAgg: true },
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

function aggSelect(table, id, value) {
  const v = value === "avg" ? "avg" : "sum";
  return `<select data-agg-table="${table}" data-agg-id="${id}" style="width:auto">
    <option value="sum" ${v === "sum" ? "selected" : ""}>加總</option>
    <option value="avg" ${v === "avg" ? "selected" : ""}>平均</option>
  </select>`;
}

function groupBlock(g, items) {
  const rows = items
    .map((it) => `<div class="card row" data-id="${it.id}">
        <span>${escapeHtml(it.name)}${g.hasUnit && it.unit ? ` <span class="muted">(${escapeHtml(it.unit)})</span>` : ""}</span>
        <span class="row" style="flex:0 0 auto;width:auto;gap:8px">
          ${g.hasAgg ? aggSelect(g.table, it.id, it.agg) : ""}
          <button class="link" data-archive="${it.id}" data-table="${g.table}">刪除</button>
        </span>
      </div>`)
    .join("");
  const unitInput = g.hasUnit
    ? `<input data-new-unit="${g.table}" placeholder="單位（如 元、kg）" style="width:120px" />`
    : "";
  const aggInput = g.hasAgg
    ? `<select data-new-agg="${g.table}" style="width:auto">
        <option value="sum">加總</option><option value="avg">平均</option>
      </select>`
    : "";
  return `<h2>${g.title}</h2>${rows}
    <div class="row" style="gap:6px; flex-wrap:wrap">
      <input data-new-name="${g.table}" placeholder="新增${g.title}名稱" style="flex:1; min-width:120px" />
      ${unitInput}
      ${aggInput}
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
      const aggEl = root.querySelector(`[data-new-agg="${table}"]`);
      if (aggEl) fields.agg = aggEl.value;
      try {
        await addDefinition(table, fields);
        showToast("已新增");
        renderSettings(root);
      } catch {
        showToast("新增失敗");
      }
    })
  );

  root.querySelectorAll("[data-agg-id]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      try {
        await updateDefinition(sel.dataset.aggTable, sel.dataset.aggId, { agg: sel.value });
        showToast("已更新");
      } catch {
        showToast("更新失敗");
      }
    })
  );

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
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
```

- [ ] **Step 3: 手動驗證（需控制者先在 Supabase 執行 Step 1 的 SQL）**

啟動 `python3 -m http.server 8099`，登入後到「設定」頁：新增一個數值項並選「平均」；既有數值項的下拉改選後出現「已更新」。
Expected: 新增成功、下拉切換顯示「已更新」、重整後設定保留。

- [ ] **Step 4: Commit**

```bash
git add sql/migrations/2026-06-18-add-metric-agg.sql js/ui-settings.js
git commit -m "feat: add metric aggregation (sum/avg) setting"
```

---

## Task 3: 圖表分頁（Chart.js + 月曆熱力圖）

**Files:**
- Modify: `index.html`（整檔取代為下方版本）
- Modify: `js/app.js`（整檔取代為下方版本）
- Modify: `css/styles.css`（在檔尾新增月曆樣式）
- Create: `js/ui-charts.js`

- [ ] **Step 1: 整檔取代 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>成長檢核</title>
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

  <main id="app-view" class="hidden">
    <section id="tab-today" class="tab"></section>
    <section id="tab-review" class="tab hidden"></section>
    <section id="tab-charts" class="tab hidden"></section>
    <section id="tab-settings" class="tab hidden"></section>
  </main>

  <nav id="tabbar" class="hidden">
    <button data-tab="today" class="active">今天</button>
    <button data-tab="review">回顧</button>
    <button data-tab="charts">圖表</button>
    <button data-tab="settings">設定</button>
  </nav>

  <div id="toast" class="toast hidden"></div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 整檔取代 `js/app.js`**

```javascript
import { currentUser, signIn, onAuthChange } from "./auth.js";
import { renderToday } from "./ui-today.js";
import { renderReview } from "./ui-review.js";
import { renderCharts } from "./ui-charts.js";
import { renderSettings } from "./ui-settings.js";

const el = (id) => document.getElementById(id);
const TABS = ["today", "review", "charts", "settings"];

export function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2000);
}

const renderers = {
  today: () => renderToday(el("tab-today")),
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

- [ ] **Step 3: 在 `css/styles.css` 檔尾新增月曆熱力圖樣式**

```css
.hm-wrap { display: flex; gap: 3px; overflow-x: auto; padding: 6px 0; }
.hm-col { display: flex; flex-direction: column; gap: 3px; }
.hm-cell { width: 13px; height: 13px; border-radius: 3px; background: #234b63; }
.hm-cell.on { background: #1ca8c4; }
.hm-cell.off { background: transparent; }
.chart-units button { flex: 0 0 auto; padding: 8px 14px; }
```

- [ ] **Step 4: 建立 `js/ui-charts.js`**

```javascript
import { listDefinitions, getRange } from "./db.js";
import {
  todayISO, defaultFrom, enumerateBuckets, bucketLabel,
  aggregateValues, aggregateHabitCounts, habitDoneCounts,
  alignSeries, calendarGrid,
} from "./logic.js";

const TABLES = { habit: "habit_checks", score: "scores", metric: "metric_values" };
const ITEM_FK = { habit: "habit_id", score: "score_item_id", metric: "metric_item_id" };
const UNITS = [["week", "週"], ["month", "月"], ["quarter", "季"], ["year", "年"]];

const state = { itemKey: null, unit: "month", from: null, to: null };
let defsCache = [];
let chartInstances = [];

function unitName(u) { return ({ week: "週", month: "月", quarter: "季", year: "年" })[u] || u; }

export async function renderCharts(root) {
  root.innerHTML = `<h1>圖表</h1>
    <select id="chart-item"></select>
    <div class="row chart-units" id="chart-units" style="gap:6px;justify-content:flex-start;flex-wrap:wrap"></div>
    <div class="row" style="gap:6px;justify-content:flex-start;flex-wrap:wrap">
      <label class="muted">起</label><input type="date" id="chart-from" style="width:auto;flex:1" />
      <label class="muted">迄</label><input type="date" id="chart-to" style="width:auto;flex:1" />
    </div>
    <div id="chart-area" class="muted">載入中…</div>`;

  try {
    const [habits, scores, metrics] = await Promise.all([
      listDefinitions("habits"),
      listDefinitions("score_items"),
      listDefinitions("metric_items"),
    ]);
    defsCache = [
      ...habits.map((d) => ({ ...d, _type: "habit", _label: `習慣 · ${d.name}` })),
      ...scores.map((d) => ({ ...d, _type: "score", _label: `評分 · ${d.name}` })),
      ...metrics.map((d) => ({ ...d, _type: "metric", _label: `數值 · ${d.name}` })),
    ];
  } catch (err) {
    root.querySelector("#chart-area").innerHTML = `<p class="error">載入失敗：${escapeHtml(err.message || "")}</p>`;
    return;
  }

  const sel = root.querySelector("#chart-item");
  sel.innerHTML = defsCache.length
    ? defsCache.map((d) => `<option value="${d._type}:${d.id}">${escapeHtml(d._label)}</option>`).join("")
    : `<option value="">（尚無項目，請先到設定新增）</option>`;

  root.querySelector("#chart-units").innerHTML = UNITS
    .map(([u, t]) => `<button data-unit="${u}" class="${u === state.unit ? "" : "secondary"}">${t}</button>`)
    .join("");

  if ((!state.itemKey || !defsCache.find((d) => `${d._type}:${d.id}` === state.itemKey)) && defsCache.length) {
    state.itemKey = `${defsCache[0]._type}:${defsCache[0].id}`;
  }
  if (state.itemKey) sel.value = state.itemKey;

  state.to = state.to || todayISO();
  state.from = state.from || defaultFrom(state.to, state.unit);
  root.querySelector("#chart-from").value = state.from;
  root.querySelector("#chart-to").value = state.to;

  sel.addEventListener("change", () => { state.itemKey = sel.value; draw(root); });
  root.querySelectorAll("#chart-units button").forEach((b) =>
    b.addEventListener("click", () => {
      state.unit = b.dataset.unit;
      state.from = defaultFrom(state.to || todayISO(), state.unit);
      renderCharts(root);
    })
  );
  root.querySelector("#chart-from").addEventListener("change", (e) => { state.from = e.target.value; draw(root); });
  root.querySelector("#chart-to").addEventListener("change", (e) => { state.to = e.target.value; draw(root); });

  if (state.itemKey) draw(root);
  else root.querySelector("#chart-area").innerHTML = `<p class="muted">尚無項目，請先到設定新增</p>`;
}

function destroyCharts() {
  for (const c of chartInstances) { try { c.destroy(); } catch (e) { /* ignore */ } }
  chartInstances = [];
}

async function draw(root) {
  destroyCharts();
  const area = root.querySelector("#chart-area");
  const [type, id] = state.itemKey.split(":");
  const def = defsCache.find((d) => d._type === type && d.id === id);
  if (!def) { area.innerHTML = `<p class="muted">請選擇項目</p>`; return; }

  area.classList.remove("muted");
  area.innerHTML = `<p class="muted">載入中…</p>`;

  let rows;
  try {
    const all = await getRange(TABLES[type], state.from, state.to);
    rows = all.filter((r) => r[ITEM_FK[type]] === id);
  } catch (err) {
    area.innerHTML = `<p class="error">載入失敗：${escapeHtml(err.message || "")}</p>`;
    return;
  }

  const buckets = enumerateBuckets(state.from, state.to, state.unit);
  const labels = buckets.map((k) => bucketLabel(k, state.unit));

  if (type === "score" || type === "metric") {
    const mode = type === "metric" ? (def.agg === "avg" ? "avg" : "sum") : "avg";
    const data = alignSeries(buckets, aggregateValues(rows, state.unit, mode), false);
    const unitTxt = type === "metric" && def.unit ? ` (${escapeHtml(def.unit)})` : "";
    const modeTxt = type === "metric" ? (mode === "avg" ? "平均" : "加總") : "平均";
    area.innerHTML = `<p class="muted">${escapeHtml(def.name)}${unitTxt} · 每${unitName(state.unit)}${modeTxt}</p>
      <div style="position:relative;height:280px"><canvas id="c-line"></canvas></div>`;
    chartInstances.push(new Chart(area.querySelector("#c-line"), {
      type: "line",
      data: { labels, datasets: [{ label: def.name, data, borderColor: "#1ca8c4", backgroundColor: "rgba(28,168,196,.2)", spanGaps: true, tension: 0.25, fill: true }] },
      options: axisOpts(false),
    }));
  } else {
    const barData = alignSeries(buckets, aggregateHabitCounts(rows, state.unit), true);
    const { done, notDone } = habitDoneCounts(rows);
    const doneSet = new Set(rows.filter((r) => r.done).map((r) => r.log_date));
    const weeks = calendarGrid(state.from, state.to, doneSet);

    area.innerHTML = `<p class="muted">${escapeHtml(def.name)} · 每${unitName(state.unit)}完成次數</p>
      <div style="position:relative;height:240px"><canvas id="c-bar"></canvas></div>
      <p class="muted" style="margin-top:16px">完成 vs 未完成（區間內有記錄的日子）</p>
      <div style="position:relative;height:220px"><canvas id="c-pie"></canvas></div>
      <p class="muted" style="margin-top:16px">月曆檢視（有打勾就亮起）</p>
      ${heatmapHtml(weeks)}`;

    chartInstances.push(new Chart(area.querySelector("#c-bar"), {
      type: "bar",
      data: { labels, datasets: [{ label: "完成次數", data: barData, backgroundColor: "#1ca8c4" }] },
      options: axisOpts(true),
    }));
    chartInstances.push(new Chart(area.querySelector("#c-pie"), {
      type: "doughnut",
      data: { labels: ["完成", "未完成"], datasets: [{ data: [done, notDone], backgroundColor: ["#1ca8c4", "#234b63"] }] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: "#eaf2f6" } } } },
    }));
  }
}

function heatmapHtml(weeks) {
  const cols = weeks
    .map((week) => `<div class="hm-col">${week
      .map((c) => `<div class="hm-cell ${c.done ? "on" : ""} ${c.inRange ? "" : "off"}" title="${c.date}"></div>`)
      .join("")}</div>`)
    .join("");
  return `<div class="hm-wrap">${cols}</div>`;
}

function axisOpts(intY) {
  const grid = "rgba(143,176,192,.15)";
  return {
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: "#8fb0c0", maxRotation: 0, autoSkip: true }, grid: { color: grid } },
      y: { beginAtZero: intY, ticks: { color: "#8fb0c0", precision: intY ? 0 : undefined }, grid: { color: grid } },
    },
    plugins: { legend: { display: false } },
  };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
```

- [ ] **Step 5: 手動驗證**

啟動 `python3 -m http.server 8099`，登入後：底部出現第四個「圖表」分頁。
- 選一個有資料的評分項 → 看到折線圖；切換 週/月/季/年 圖會變。
- 改起迄日期 → 圖隨之更新。
- 選數值項 → 折線圖，標題顯示「加總」或「平均」依設定。
- 選習慣 → 看到長條圖 + 圓餅圖 + 月曆熱力圖（有打勾的日子亮起）。
Expected: 三種型態都正確呈現、切換單位與日期即時更新、無 console error。

- [ ] **Step 6: 跑單元測試確認未退化**

Run: `node --test`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js css/styles.css js/ui-charts.js
git commit -m "feat: add Charts tab with line/bar/pie charts and habit calendar heatmap"
```

---

## Self-Review 紀錄

- **Spec coverage：** 圖表分頁 → Task 3；週/月/季/年單位 + 自訂區間 → Task 1（enumerateBuckets/defaultFrom）+ Task 3（控制項）；評分折線/數值折線(加總或平均)/習慣長條+圓餅+月曆 → Task 1 函式 + Task 3 draw()；數值 agg 設定 + 遷移 → Task 2。皆有對應。
- **型別一致：** logic 匯出名（mondayOf/bucketKey/enumerateBuckets/aggregateValues/aggregateHabitCounts/habitDoneCounts/alignSeries/bucketLabel/calendarGrid/defaultFrom）在 ui-charts.js 引用一致；db 既有 listDefinitions/getRange/updateDefinition/addDefinition/archiveDefinition 沿用；app.js TABS 與 renderers 鍵一致（today/review/charts/settings）。
- **Placeholder：** 無 TODO/TBD；整檔取代與新增函式皆含完整程式碼。Supabase ALTER 需人工執行已明確標注為控制者代辦。
```
