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
