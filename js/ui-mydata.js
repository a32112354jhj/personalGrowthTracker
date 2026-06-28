import {
  countHabitDones, countTodayHabitDones, countCompletedWeeklyGoals,
  listAbilities, addAbility, updateAbility, deleteAbility,
} from "./db.js";
import { levelFromXp, totalXp, todayISO, nextRank, prevRank } from "./logic.js";
import { showToast } from "./app.js";

const RANK_COLORS = { E: "#7fb8d6", D: "#39ff9e", C: "#2bd4ff", B: "#a98bff", A: "#ffd24b", S: "#ff6ad5" };

export async function renderMyData(root) {
  root.innerHTML = `<h1>我的數據</h1><div id="mydata-body" class="loading"><span class="spinner"></span>載入中…</div>`;
  const body = root.querySelector("#mydata-body");
  try {
    const [dones, todayDones, goalsDone, abilities] = await Promise.all([
      countHabitDones(),
      countTodayHabitDones(todayISO()),
      countCompletedWeeklyGoals(),
      listAbilities(),
    ]);
    const xp = totalXp({ habitDones: dones, weeklyGoalsDone: goalsDone });
    const lv = levelFromXp(xp);
    const pct = Math.min(100, Math.round((lv.into / lv.need) * 100));

    body.classList.remove("loading");
    body.innerHTML = `
      <div class="status-card">
        <div class="status-top">
          <div class="lv-badge">Lv<b>${lv.level}</b></div>
          <div class="status-meta">
            <div class="status-title">總等級</div>
            <div class="status-today">總 XP ${xp}</div>
            <div class="muted">習慣完成 ${dones}　週目標達成 ${goalsDone}　今日 +${todayDones * 10} XP</div>
          </div>
        </div>
        <div class="xpbar"><span style="width:${pct}%"></span></div>
        <div class="xp-text">${lv.into} / ${lv.need} XP</div>
      </div>
      <h2>能力等級審核表</h2>
      <p class="muted">每個能力各自一個 E→S 等級，用 ◀ ▶ 由你手動升降。</p>
      ${abilities.map(abilityRow).join("") || `<p class="muted">尚無能力項目，於下方新增（例如 英文、健身、理財）</p>`}
      <div class="row" style="gap:8px">
        <input id="ab-name" placeholder="新增能力項目" style="flex:1" />
        <button id="ab-add" style="flex:0 0 auto">新增</button>
      </div>`;
    wire(root, body);
  } catch (err) {
    body.innerHTML = `<p class="error">載入失敗：${esc(err.message || "")}</p>`;
  }
}

function abilityRow(a) {
  const color = RANK_COLORS[a.rank] || "#2bd4ff";
  return `<div class="card ability-row" data-id="${a.id}">
    <div class="rank-badge" style="--rank-color:${color}">${esc(a.rank)}</div>
    <input class="ability-name" data-name-id="${a.id}" value="${esc(a.name)}" />
    <span class="row" style="flex:0 0 auto;width:auto;gap:6px">
      <button class="secondary ab-down" data-id="${a.id}" aria-label="降階">◀</button>
      <button class="secondary ab-up" data-id="${a.id}" aria-label="升階">▶</button>
      <button class="link ab-del" data-id="${a.id}">刪除</button>
    </span>
  </div>`;
}

function wire(root, body) {
  body.querySelector("#ab-add").addEventListener("click", async () => {
    const name = body.querySelector("#ab-name").value.trim();
    if (!name) return;
    try { await addAbility(name); showToast("已新增"); renderMyData(root); }
    catch { showToast("新增失敗"); }
  });

  body.querySelectorAll(".ab-up").forEach((b) =>
    b.addEventListener("click", () => stepRank(root, b.dataset.id, +1))
  );
  body.querySelectorAll(".ab-down").forEach((b) =>
    b.addEventListener("click", () => stepRank(root, b.dataset.id, -1))
  );
  body.querySelectorAll(".ab-del").forEach((b) =>
    b.addEventListener("click", async () => {
      try { await deleteAbility(b.dataset.id); showToast("已刪除"); renderMyData(root); }
      catch { showToast("刪除失敗"); }
    })
  );
  body.querySelectorAll("[data-name-id]").forEach((inp) =>
    inp.addEventListener("change", async () => {
      const name = inp.value.trim();
      if (!name) return;
      try { await updateAbility(inp.dataset.nameId, { name }); showToast("已更新"); }
      catch { showToast("更新失敗"); }
    })
  );
}

async function stepRank(root, id, dir) {
  const abilities = await listAbilities();
  const a = abilities.find((x) => x.id === id);
  if (!a) return;
  const target = dir > 0 ? nextRank(a.rank) : prevRank(a.rank);
  if (!target) return;
  try { await updateAbility(id, { rank: target }); renderMyData(root); }
  catch { showToast("更新失敗"); }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
