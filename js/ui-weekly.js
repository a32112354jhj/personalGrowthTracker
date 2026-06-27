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
    <div id="weekly-body" class="loading"><span class="spinner"></span>載入中…</div>`;

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

    body.classList.remove("muted", "loading");
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
