import { countHabitDones, countTodayHabitDones, countCompletedWeeklyGoals } from "./db.js";
import { levelFromXp, totalXp, todayISO } from "./logic.js";

// 今天頁的 STATUS 小卡：只顯示 Lv + 經驗條 + 今日 XP（階級已改為各能力項目，見「數據」頁）
let state = { liveXp: 0, todayXp: 0, container: null };

export async function renderStatus(container) {
  state.container = container;
  container.innerHTML = `<div class="status-card loading"><span class="spinner"></span>載入狀態…</div>`;
  try {
    const [dones, todayDones, goalsDone] = await Promise.all([
      countHabitDones(),
      countTodayHabitDones(todayISO()),
      countCompletedWeeklyGoals(),
    ]);
    state.liveXp = totalXp({ habitDones: dones, weeklyGoalsDone: goalsDone });
    state.todayXp = todayDones * 10;
    paint();
  } catch (err) {
    container.innerHTML = `<div class="status-card"><p class="error">狀態載入失敗：${esc(err.message || "")}</p></div>`;
  }
}

function paint() {
  const lv = levelFromXp(state.liveXp);
  const pct = Math.min(100, Math.round((lv.into / lv.need) * 100));
  state.container.innerHTML = `<div class="status-card">
    <div class="status-top">
      <div class="lv-badge">Lv<b id="st-lv">${lv.level}</b></div>
      <div class="status-meta">
        <div class="status-title">STATUS</div>
        <div class="status-today">今日 +${state.todayXp} XP</div>
      </div>
    </div>
    <div class="xpbar"><span id="xpbar-fill" style="width:${pct}%"></span></div>
    <div class="xp-text"><span id="xp-into">${lv.into}</span> / ${lv.need} XP</div>
  </div>`;
}

// 完成任務時呼叫：浮出 +XP、更新經驗條、偵測升級
export function gainXp(delta, anchorEl) {
  const before = levelFromXp(state.liveXp).level;
  state.liveXp = Math.max(0, state.liveXp + delta);
  if (delta > 0 && anchorEl) floatXp(delta, anchorEl);
  const lv = levelFromXp(state.liveXp);
  const fill = state.container && state.container.querySelector("#xpbar-fill");
  const into = state.container && state.container.querySelector("#xp-into");
  const lvEl = state.container && state.container.querySelector("#st-lv");
  if (fill) fill.style.width = Math.min(100, Math.round((lv.into / lv.need) * 100)) + "%";
  if (into) into.textContent = lv.into;
  if (lvEl) lvEl.textContent = lv.level;
  if (delta > 0 && lv.level > before) levelUp(lv.level);
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
  void box.offsetWidth;
  box.classList.add("show");
  setTimeout(() => { box.classList.remove("show"); box.classList.add("hidden"); }, 1600);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
