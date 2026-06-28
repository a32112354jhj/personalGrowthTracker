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
  const lv = levelFromXp(state.liveXp);
  const fill = state.container && state.container.querySelector("#xpbar-fill");
  const into = state.container && state.container.querySelector("#xp-into");
  const lvEl = state.container && state.container.querySelector("#st-lv");
  if (fill) fill.style.width = Math.min(100, Math.round((lv.into / lv.need) * 100)) + "%";
  if (into) into.textContent = lv.into;
  if (lvEl) lvEl.textContent = lv.level;
  if (delta > 0 && lv.level > before) levelUp(lv.level);
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
  void box.offsetWidth;
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
