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
