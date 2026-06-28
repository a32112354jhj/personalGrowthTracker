# 等級／階級遊戲化系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 app 加入遊戲化等級系統：完成習慣/週目標累積 XP、自動升等（Level）、達門檻手動審核晉階字母階級（E→S）；今天頁有醒目 STATUS 卡，完成任務時浮出 +XP、經驗條增長、跨級 LEVEL UP 特效。

**Architecture:** 沿用「純前端 ES Module + Supabase」。XP 為衍生值（由 habit_checks 與 weekly_goals 計算，不另存）。等級/階級運算抽進 `js/logic.js`（TDD）。新增 `js/ui-status.js` 負責 STATUS 卡、即時回饋與晉階審核。新增 `player` / `rank_promotions` 兩表（RLS）。

**Tech Stack:** Vanilla JS (ES Modules) / Supabase (PostgreSQL + RLS) / Node `node:test`。

## Global Constraints

- 不新增 npm 相依；測試用 `node --test`。
- 維持既有 class 名稱與 System 深色霓虹樣式；新樣式沿用 CSS 變數（`--accent` #2bd4ff、`--good` #39ff9e、`--muted`、`--panel`、`--panel-solid`）。
- 所有 commit 訊息結尾加：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- Supabase 建表 DDL 由人手動執行（控制者代辦）。
- 動畫只用 transform/opacity；尊重 `prefers-reduced-motion`。
- XP 規則：習慣完成 +10、週目標達成 +50（固定，集中於 logic.js）。
- 階級順序 `["E","D","C","B","A","S"]`；門檻 E=1,D=5,C=12,B=22,A=35,S=50。

---

## File Structure

```
js/
├─ logic.js        # 既有；新增 xpToNext/levelFromXp/rankForLevel/nextRank/totalXp（+測試）
├─ db.js           # 既有；新增 player / rank_promotions / 計數查詢
├─ ui-status.js    # 新增；STATUS 卡 + 即時回饋 + 晉階審核
├─ ui-today.js     # 既有；頁頂掛入 STATUS 卡、打勾時 gainXp
├─ ui-weekly.js    # 既有；完成目標浮出 +50 XP
├─ ui-settings.js  # 既有；新增「階級設定」區
index.html          # 既有；新增 LEVEL UP 特效容器
css/styles.css      # 既有；STATUS 卡 / 徽章 / 經驗條 / +XP 浮出 / LEVEL UP 樣式
sql/migrations/2026-06-28-leveling.sql  # 新增；建表 + RLS
tests/logic.test.js # 既有；新增等級測試
```

---

## Task 1: logic.js 等級/階級純函式（TDD）

**Files:**
- Modify: `tests/logic.test.js`（檔尾新增）
- Modify: `js/logic.js`（檔尾新增）

**Interfaces:**
- Produces:
  - `RANKS: string[]`（`["E","D","C","B","A","S"]`）
  - `xpToNext(level:number) => number`
  - `levelFromXp(totalXp:number) => { level:number, into:number, need:number }`
  - `rankForLevel(level:number) => string`
  - `nextRank(rank:string) => string | null`
  - `totalXp(opts:{ habitDones:number, weeklyGoalsDone:number }) => number`

- [ ] **Step 1: 在 `tests/logic.test.js` 檔尾新增測試**

```javascript
import { RANKS, xpToNext, levelFromXp, rankForLevel, nextRank, totalXp } from "../js/logic.js";

test("RANKS 由弱到強", () => {
  assert.deepEqual(RANKS, ["E", "D", "C", "B", "A", "S"]);
});

test("xpToNext 遞增（每級 +50）", () => {
  assert.equal(xpToNext(1), 100);
  assert.equal(xpToNext(2), 150);
  assert.equal(xpToNext(3), 200);
});

test("levelFromXp 換算等級與進度", () => {
  assert.deepEqual(levelFromXp(0), { level: 1, into: 0, need: 100 });
  assert.deepEqual(levelFromXp(99), { level: 1, into: 99, need: 100 });
  assert.deepEqual(levelFromXp(100), { level: 2, into: 0, need: 150 });
  assert.deepEqual(levelFromXp(260), { level: 3, into: 10, need: 200 });
});

test("rankForLevel 依門檻 E=1,D=5,C=12,B=22,A=35,S=50", () => {
  assert.equal(rankForLevel(1), "E");
  assert.equal(rankForLevel(4), "E");
  assert.equal(rankForLevel(5), "D");
  assert.equal(rankForLevel(12), "C");
  assert.equal(rankForLevel(49), "A");
  assert.equal(rankForLevel(50), "S");
  assert.equal(rankForLevel(999), "S");
});

test("nextRank 回傳下一階，S 之後為 null", () => {
  assert.equal(nextRank("E"), "D");
  assert.equal(nextRank("A"), "S");
  assert.equal(nextRank("S"), null);
});

test("totalXp 習慣×10 + 週目標×50", () => {
  assert.equal(totalXp({ habitDones: 12, weeklyGoalsDone: 3 }), 12 * 10 + 3 * 50);
  assert.equal(totalXp({ habitDones: 0, weeklyGoalsDone: 0 }), 0);
});
```

- [ ] **Step 2: 跑測試確認新測試失敗**

Run: `node --test`
Expected: FAIL（`RANKS` 等未匯出）。

- [ ] **Step 3: 在 `js/logic.js` 檔尾新增實作**

```javascript

// ===== 遊戲化等級 / 階級 =====

export const RANKS = ["E", "D", "C", "B", "A", "S"];

// 各階所需「最低等級」門檻，對應 RANKS。
const RANK_LEVELS = [1, 5, 12, 22, 35, 50];

// 升一級（從 level 到 level+1）所需 XP。
export function xpToNext(level) {
  return 100 + (level - 1) * 50;
}

// 由總 XP 換算 { level, into, need }。
export function levelFromXp(totalXpValue) {
  let level = 1;
  let acc = 0;
  while (acc + xpToNext(level) <= totalXpValue) {
    acc += xpToNext(level);
    level++;
  }
  return { level, into: totalXpValue - acc, need: xpToNext(level) };
}

// 該等級可達到的最高階級字母。
export function rankForLevel(level) {
  let r = RANKS[0];
  for (let i = 0; i < RANKS.length; i++) {
    if (level >= RANK_LEVELS[i]) r = RANKS[i];
  }
  return r;
}

// 下一階；S 之後為 null。
export function nextRank(rank) {
  const i = RANKS.indexOf(rank);
  if (i < 0 || i >= RANKS.length - 1) return null;
  return RANKS[i + 1];
}

// 由完成數換算總 XP。
export function totalXp({ habitDones, weeklyGoalsDone }) {
  return habitDones * 10 + weeklyGoalsDone * 50;
}
```

- [ ] **Step 4: 跑測試確認全部通過**

Run: `node --test`
Expected: PASS（既有 22 + 新增 6 = 28）。

- [ ] **Step 5: Commit**

```bash
git add tests/logic.test.js js/logic.js
git commit -m "feat: add leveling/rank pure functions"
```

---

## Task 2: 資料庫遷移 + db 層

**Files:**
- Create: `sql/migrations/2026-06-28-leveling.sql`
- Modify: `js/db.js`（檔尾新增）

**Interfaces:**
- Consumes: 既有 `sb`、`uid()`。
- Produces（async，錯誤 throw）:
  - `getPlayer() => { rank:string, criteria:object }`（無則回 `{ rank:"E", criteria:{} }`）
  - `setPlayerRank(rank:string) => void`
  - `setRankCriteria(criteria:object) => void`
  - `addPromotion(rank:string, note:string) => void`
  - `listPromotions() => Array<{ rank, note, approved_at }>`
  - `countHabitDones() => number`
  - `countTodayHabitDones(today:string) => number`
  - `countCompletedWeeklyGoals() => number`

- [ ] **Step 1: 建立遷移 SQL**

Create `sql/migrations/2026-06-28-leveling.sql`:

```sql
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
```

- [ ] **Step 2: 在 `js/db.js` 檔尾新增**

```javascript

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
```

- [ ] **Step 3: 語法檢查**

Run: `node --check js/db.js && echo OK`
Expected: `OK`。

- [ ] **Step 4: Commit**

```bash
git add sql/migrations/2026-06-28-leveling.sql js/db.js
git commit -m "feat: add player/promotions schema and data access"
```

> **控制者代辦：** 執行後請使用者在 Supabase SQL Editor 執行 `sql/migrations/2026-06-28-leveling.sql`。

---

## Task 3: STATUS 卡 + 即時回饋 + 晉階審核（ui-status.js）

**Files:**
- Create: `js/ui-status.js`
- Modify: `index.html`（在 `<div id="toast">` 後新增 `<div id="levelup" class="levelup hidden"></div>`）
- Modify: `css/styles.css`（檔尾新增樣式）

**Interfaces:**
- Consumes: `getPlayer/setPlayerRank/addPromotion/countHabitDones/countTodayHabitDones/countCompletedWeeklyGoals`（Task 2）、`levelFromXp/rankForLevel/nextRank/totalXp/RANKS/todayISO`（logic）、`showToast`（app.js）。
- Produces:
  - `renderStatus(containerEl) => Promise<void>`（載入資料並把 STATUS 卡渲染進 containerEl）
  - `gainXp(delta:number, anchorEl:Element|null) => void`（浮出 +XP、更新經驗條、偵測升級）

- [ ] **Step 1: 建立 `js/ui-status.js`**

```javascript
import {
  getPlayer, setPlayerRank, addPromotion,
  countHabitDones, countTodayHabitDones, countCompletedWeeklyGoals,
} from "./db.js";
import { levelFromXp, rankForLevel, nextRank, totalXp, RANKS, todayISO } from "./logic.js";
import { showToast } from "./app.js";

// 模組層狀態（單一 STATUS 卡）
let state = { baseXp: 0, liveXp: 0, rank: "E", criteria: {}, todayXp: 0, container: null };

const RANK_COLORS = { E: "#7fb8d6", D: "#39ff9e", C: "#2bd4ff", B: "#a98bff", A: "#ffd24b", S: "#ff6ad5" };

export async function renderStatus(container) {
  state.container = container;
  container.innerHTML = `<div class="status-card loading"><span class="spinner"></span>載入狀態…</div>`;
  try {
    const [player, dones, todayDones, goalsDone] = await Promise.all([
      getPlayer(),
      countHabitDones(),
      countTodayHabitDones(todayISO()),
      countCompletedWeeklyGoals(),
    ]);
    state.rank = player.rank;
    state.criteria = player.criteria || {};
    state.baseXp = totalXp({ habitDones: dones, weeklyGoalsDone: goalsDone });
    state.liveXp = state.baseXp;
    state.todayXp = todayDones * 10;
    paint();
  } catch (err) {
    container.innerHTML = `<div class="status-card"><p class="error">狀態載入失敗：${esc(err.message || "")}</p></div>`;
  }
}

function paint() {
  const lv = levelFromXp(state.liveXp);
  const eligible = rankForLevel(lv.level);
  const canPromote = RANKS.indexOf(eligible) > RANKS.indexOf(state.rank);
  const pct = Math.min(100, Math.round((lv.into / lv.need) * 100));
  const color = RANK_COLORS[state.rank] || "#2bd4ff";
  state.container.innerHTML = `<div class="status-card">
    <div class="status-top">
      <div class="rank-badge" style="--rank-color:${color}">${state.rank}</div>
      <div class="status-meta">
        <div class="status-lv">Lv <b id="st-lv">${lv.level}</b></div>
        <div class="status-today">今日 +${state.todayXp} XP</div>
      </div>
      ${canPromote ? `<button id="promote-btn" class="promote-btn">⚡ 晉階審核</button>` : ""}
    </div>
    <div class="xpbar"><span id="xpbar-fill" style="width:${pct}%"></span></div>
    <div class="xp-text"><span id="xp-into">${lv.into}</span> / ${lv.need} XP</div>
  </div>`;
  const pb = state.container.querySelector("#promote-btn");
  if (pb) pb.addEventListener("click", () => openPromotion(eligible));
}

// 完成任務時呼叫：浮出 +XP、更新條、偵測升級
export function gainXp(delta, anchorEl) {
  const before = levelFromXp(state.liveXp).level;
  state.liveXp = Math.max(0, state.liveXp + delta);
  if (delta > 0 && anchorEl) floatXp(delta, anchorEl);
  // 只更新經驗條與 Lv 數字（不整段重繪，動畫才連續）
  const lv = levelFromXp(state.liveXp);
  const fill = state.container && state.container.querySelector("#xpbar-fill");
  const into = state.container && state.container.querySelector("#xp-into");
  const lvEl = state.container && state.container.querySelector("#st-lv");
  if (fill) fill.style.width = Math.min(100, Math.round((lv.into / lv.need) * 100)) + "%";
  if (into) into.textContent = lv.into;
  if (lvEl) lvEl.textContent = lv.level;
  if (delta > 0 && lv.level > before) levelUp(lv.level);
  // 升級或可能解鎖晉階 → 重繪以顯示晉階鈕
  if (lv.level !== before) paint();
}

function floatXp(delta, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "xp-float";
  el.textContent = `+${delta} XP`;
  el.style.left = rect.left + rect.width / 2 + "px";
  el.style.top = rect.top + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function levelUp(level) {
  const box = document.getElementById("levelup");
  if (!box) return;
  box.textContent = `LEVEL UP ▶ Lv ${level}`;
  box.classList.remove("hidden");
  void box.offsetWidth; // 重啟動畫
  box.classList.add("show");
  setTimeout(() => { box.classList.remove("show"); box.classList.add("hidden"); }, 1600);
}

function openPromotion(targetRank) {
  const lines = String(state.criteria[targetRank] || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const checklist = lines.length
    ? lines.map((t, i) => `<label class="crit"><input type="checkbox" data-crit="${i}" /> ${esc(t)}</label>`).join("")
    : `<p class="muted">（此階未設定條件，可直接審核通過。到「設定 → 階級設定」可自訂條件）</p>`;
  const overlay = document.createElement("div");
  overlay.className = "promo-overlay";
  overlay.innerHTML = `<div class="promo-panel">
    <div class="promo-title">RANK UP 審核</div>
    <div class="promo-rank"><span>${state.rank}</span> ▶ <span class="promo-next">${targetRank}</span></div>
    <div class="promo-crit">${checklist}</div>
    <textarea id="promo-note" rows="3" placeholder="晉階感言…"></textarea>
    <div class="row" style="gap:8px;margin-top:10px">
      <button id="promo-cancel" class="secondary">取消</button>
      <button id="promo-ok" disabled>審核通過</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const boxes = [...overlay.querySelectorAll("[data-crit]")];
  const okBtn = overlay.querySelector("#promo-ok");
  const refresh = () => { okBtn.disabled = boxes.some((b) => !b.checked); };
  boxes.forEach((b) => b.addEventListener("change", refresh));
  refresh();

  overlay.querySelector("#promo-cancel").addEventListener("click", () => overlay.remove());
  okBtn.addEventListener("click", async () => {
    okBtn.disabled = true;
    try {
      await setPlayerRank(targetRank);
      await addPromotion(targetRank, overlay.querySelector("#promo-note").value);
      state.rank = targetRank;
      overlay.remove();
      showToast(`晉階成功：${targetRank} 階`);
      levelUp(levelFromXp(state.liveXp).level);
      paint();
    } catch {
      showToast("晉階失敗");
      okBtn.disabled = false;
    }
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
```

- [ ] **Step 2: 在 `index.html` 的 `<div id="toast" class="toast hidden"></div>` 之後新增**

找到該行，於其後加入：
```html
  <div id="levelup" class="levelup hidden"></div>
```

- [ ] **Step 3: 在 `css/styles.css` 檔尾新增樣式**

```css
/* 等級 STATUS 卡 */
.status-card {
  background: var(--panel-solid); border: 1px solid var(--accent);
  box-shadow: 0 0 16px rgba(43, 212, 255, 0.25), inset 0 0 20px rgba(43, 212, 255, 0.06);
  padding: 14px 16px; margin: 0 0 18px;
}
.status-top { display: flex; align-items: center; gap: 14px; }
.rank-badge {
  width: 56px; height: 56px; flex: 0 0 56px; display: flex; align-items: center; justify-content: center;
  font-family: "Orbitron", sans-serif; font-weight: 700; font-size: 26px;
  color: var(--rank-color); border: 2px solid var(--rank-color);
  box-shadow: 0 0 14px var(--rank-color), inset 0 0 12px color-mix(in srgb, var(--rank-color) 30%, transparent);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}
.status-meta { flex: 1; }
.status-lv { font-family: "Orbitron", sans-serif; font-size: 1.2rem; color: var(--text); }
.status-lv b { color: var(--accent); text-shadow: 0 0 10px rgba(43, 212, 255, 0.7); }
.status-today { color: var(--good); font-size: 0.9rem; }
.promote-btn {
  flex: 0 0 auto; background: var(--good); color: #04301c;
  animation: promo-pulse 1.2s ease-in-out infinite;
}
@keyframes promo-pulse { 0%,100% { filter: drop-shadow(0 0 6px rgba(57,255,158,0.6)); } 50% { filter: drop-shadow(0 0 16px rgba(57,255,158,1)); } }
.xpbar { height: 12px; margin-top: 12px; background: rgba(43, 212, 255, 0.12); overflow: hidden; }
.xpbar > span { display: block; height: 100%; background: var(--accent); box-shadow: 0 0 12px rgba(43, 212, 255, 0.9); transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
.xp-text { margin-top: 6px; color: var(--muted); font-size: 0.85rem; letter-spacing: 1px; }

/* +XP 浮出 */
.xp-float {
  position: fixed; z-index: 30; transform: translate(-50%, 0); pointer-events: none;
  color: var(--good); font-family: "Orbitron", sans-serif; font-weight: 700; font-size: 16px;
  text-shadow: 0 0 10px rgba(57, 255, 158, 0.9); animation: xp-rise 1.1s ease-out forwards;
}
@keyframes xp-rise { 0% { opacity: 0; transform: translate(-50%, 6px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -34px); } }

/* LEVEL UP 特效 */
.levelup {
  position: fixed; left: 50%; top: 38%; transform: translate(-50%, -50%); z-index: 40; pointer-events: none;
  font-family: "Orbitron", sans-serif; font-weight: 700; font-size: 28px; letter-spacing: 3px;
  color: var(--good); text-shadow: 0 0 18px rgba(57, 255, 158, 1);
}
.levelup.show { animation: levelup-pop 1.6s ease-out; }
@keyframes levelup-pop {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
  20% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -60%) scale(1); }
}

/* 晉階審核面板 */
.promo-overlay {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  background: rgba(2, 6, 12, 0.78); padding: 16px;
}
.promo-panel {
  width: 100%; max-width: 420px; background: var(--panel-solid); border: 1px solid var(--accent);
  box-shadow: 0 0 24px rgba(43, 212, 255, 0.4); padding: 20px;
}
.promo-title { font-family: "Orbitron", sans-serif; letter-spacing: 3px; color: var(--accent); text-shadow: 0 0 10px rgba(43,212,255,0.8); border: 1px solid var(--accent); padding: 8px 12px; text-align: center; }
.promo-rank { text-align: center; font-family: "Orbitron", sans-serif; font-size: 22px; margin: 16px 0; color: var(--text); }
.promo-next { color: var(--good); text-shadow: 0 0 10px rgba(57,255,158,0.8); }
.promo-crit { margin: 10px 0; }
.crit { display: flex; align-items: center; gap: 8px; padding: 6px 0; color: var(--text); }

/* 減少動態 */
@media (prefers-reduced-motion: reduce) {
  .promote-btn, .levelup.show, .xp-float { animation: none; }
  .xpbar > span { transition: none; }
}
```

- [ ] **Step 4: 語法檢查**

Run: `node --check js/ui-status.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`。

- [ ] **Step 5: Commit**

```bash
git add js/ui-status.js index.html css/styles.css
git commit -m "feat: add STATUS card, XP feedback, level-up and rank-promotion UI"
```

---

## Task 4: 接線（今天頁 STATUS、週目標 +XP、設定階級區）

**Files:**
- Modify: `js/ui-today.js`
- Modify: `js/ui-weekly.js`
- Modify: `js/ui-settings.js`

**Interfaces:**
- Consumes: `renderStatus/gainXp`（Task 3）、`getPlayer/setRankCriteria/listPromotions`（Task 2）、`RANKS`（logic）。

- [ ] **Step 1: 今天頁掛入 STATUS 卡並在打勾時 gainXp**

在 `js/ui-today.js` 最上方 import 區後新增：
```javascript
import { renderStatus, gainXp } from "./ui-status.js";
```

把 `renderToday` 中 `body.innerHTML = ...` 之前插入 STATUS 容器：將這段
```javascript
    body.classList.remove("muted", "loading");
    body.innerHTML = `
```
改為（在 body 內容最前面加一個 status 容器，並於渲染後呼叫 renderStatus）：
```javascript
    body.classList.remove("muted", "loading");
    body.innerHTML = `
      <div id="status-slot"></div>
```
（即在原本第一個 `${section("習慣"...)}` 之前加上 `<div id="status-slot"></div>` 一行。）

接著把既有習慣打勾的監聽改成完成時加 XP、取消時扣 XP。找到：
```javascript
    body.querySelectorAll(".habit-row").forEach((row) =>
      row.addEventListener("click", () => {
        const chk = row.querySelector(".check");
        const on = chk.classList.toggle("done");
        row.classList.toggle("done", on);
        row.classList.toggle("filled", on);
      })
    );
```
改為：
```javascript
    body.querySelectorAll(".habit-row").forEach((row) =>
      row.addEventListener("click", () => {
        const chk = row.querySelector(".check");
        const on = chk.classList.toggle("done");
        row.classList.toggle("done", on);
        row.classList.toggle("filled", on);
        gainXp(on ? 10 : -10, chk);
      })
    );
```

在 `body.querySelector("#save-btn").addEventListener(...)` 之後（仍在 try 內），加入渲染 STATUS：
```javascript
    renderStatus(body.querySelector("#status-slot"));
```

- [ ] **Step 2: 週目標完成時浮出 +50 XP**

在 `js/ui-weekly.js` import 區新增：
```javascript
import { gainXp } from "./ui-status.js";
```

找到 todo 切換完成的處理：
```javascript
  body.querySelectorAll(".goal-todo").forEach((rowEl) =>
    rowEl.addEventListener("click", async (e) => {
      if (e.target.closest(".wk-del")) return;
      const id = rowEl.dataset.id;
      const done = !rowEl.classList.contains("done");
      try { await updateWeeklyGoal(id, { done }); renderWeekly(root); }
      catch { showToast("更新失敗"); }
    })
  );
```
改為（完成時浮 +50）：
```javascript
  body.querySelectorAll(".goal-todo").forEach((rowEl) =>
    rowEl.addEventListener("click", async (e) => {
      if (e.target.closest(".wk-del")) return;
      const id = rowEl.dataset.id;
      const done = !rowEl.classList.contains("done");
      try {
        await updateWeeklyGoal(id, { done });
        if (done) gainXp(50, rowEl.querySelector(".check"));
        renderWeekly(root);
      } catch { showToast("更新失敗"); }
    })
  );
```

- [ ] **Step 3: 設定頁新增「階級設定」區**

在 `js/ui-settings.js` import 區新增：
```javascript
import { getPlayer, setRankCriteria, listPromotions } from "./db.js";
import { RANKS } from "./logic.js";
```

在 `renderSettings` 的 `body.innerHTML = GROUPS.map(...)` 後（仍在 try 內，wireGroups 之前）改為先組好階級設定 HTML 再一起呈現。將：
```javascript
    body.innerHTML = GROUPS.map((g, i) => groupBlock(g, lists[i])).join("");
    wireGroups(root);
```
改為：
```javascript
    const [player, promos] = await Promise.all([getPlayer(), listPromotions()]);
    body.innerHTML = GROUPS.map((g, i) => groupBlock(g, lists[i])).join("") + rankBlock(player, promos);
    wireGroups(root);
    wireRank(root);
```

並在檔尾 `escapeHtml` 函式之前新增：
```javascript
function rankBlock(player, promos) {
  const crit = player.criteria || {};
  const editors = RANKS.slice(1).map((r) =>
    `<div class="card">
      <div class="muted">晉到 ${r} 階的條件（每行一項）</div>
      <textarea data-crit-rank="${r}" rows="3" placeholder="例如：連續打卡 14 天；完成 2 個週目標…">${escapeHtml(crit[r] || "")}</textarea>
    </div>`
  ).join("");
  const log = promos.length
    ? promos.map((p) => `<div class="card row"><span>${escapeHtml(p.rank)} 階</span><span class="muted">${escapeHtml((p.approved_at || "").slice(0, 10))}　${escapeHtml(p.note || "")}</span></div>`).join("")
    : `<p class="muted">尚無晉階紀錄</p>`;
  return `<h2>階級設定</h2>${editors}
    <button id="save-crit">儲存晉階條件</button>
    <h2>晉階紀錄</h2>${log}`;
}

function wireRank(root) {
  const btn = root.querySelector("#save-crit");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const criteria = {};
    root.querySelectorAll("[data-crit-rank]").forEach((t) => {
      const v = t.value.trim();
      if (v) criteria[t.dataset.critRank] = v;
    });
    try { await setRankCriteria(criteria); showToast("已儲存"); }
    catch { showToast("儲存失敗"); }
  });
}
```

- [ ] **Step 4: 語法檢查 + 既有測試 + import 整合**

Run: `node --check js/ui-today.js && node --check js/ui-weekly.js && node --check js/ui-settings.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`。
Run: `node --test`
Expected: PASS（28 個測試）。
Run（import 整合檢查）:
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

- [ ] **Step 5: 手動驗證（需先完成 Task 2 的 Supabase 建表）**

啟動 `python3 -m http.server 8099`，登入後：
1. 今天頁頂出現 STATUS 卡（Rank 徽章 E、Lv、經驗條）。
2. 打勾一個習慣 → 浮出「+10 XP」、經驗條增長；取消 → 條回退。
3. 連續打勾累積到跨級 → 中央閃現「LEVEL UP ▶ Lv N」。
4. 累積到 Lv5 → 出現「⚡ 晉階審核」；點開、勾選條件、寫感言、審核通過 → 徽章變 D，設定頁出現晉階紀錄。
5. 週目標頁完成一個 todo → 浮出「+50 XP」。
6. 設定頁「階級設定」編輯 D 階條件 → 儲存 → 重整後仍在。
Expected：皆正確、無 console error。

- [ ] **Step 6: Commit**

```bash
git add js/ui-today.js js/ui-weekly.js js/ui-settings.js
git commit -m "feat: wire STATUS card into Today, XP feedback in Weekly, rank settings in Settings"
```

---

## Self-Review 紀錄

- **Spec coverage：** XP 來源（習慣/週目標）→ Task 1 totalXp + Task 2 計數；等級曲線 → Task 1 xpToNext/levelFromXp；階級 E→S 門檻 → Task 1 rankForLevel/RANKS；手動審核 + 自訂條件 → Task 3 openPromotion + Task 4 設定編輯；STATUS 醒目卡 → Task 3 status-card + Task 4 掛入今天頁頂；完成回饋（+XP 浮出/經驗條/LEVEL UP）→ Task 3 gainXp/floatXp/levelUp + Task 4 打勾接線；資料模型 2 表 → Task 2 SQL；db CRUD/計數 → Task 2。皆有對應。
- **型別一致：** logic 匯出（RANKS/xpToNext/levelFromXp/rankForLevel/nextRank/totalXp）測試與使用一致；db 匯出（getPlayer/setPlayerRank/setRankCriteria/addPromotion/listPromotions/countHabitDones/countTodayHabitDones/countCompletedWeeklyGoals）在 ui-status/ui-settings 引用一致；ui-status 匯出（renderStatus/gainXp）在 ui-today/ui-weekly 引用一致。
- **Placeholder：** 無 TODO/TBD；所有步驟含完整程式碼或確切指令。Supabase 建表標注控制者代辦。
- **YAGNI：** XP 數值不開放使用者自訂、不做額外遊戲系統、日記/評分不計 XP（依使用者選擇）。
