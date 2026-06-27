import { listDefinitions, getRange } from "./db.js";
import {
  todayISO, defaultFrom, enumerateBuckets, bucketLabel,
  aggregateValues, aggregateHabitCounts,
  alignSeries, calendarGrid, countDaysPerBucket, daysInRange,
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
    <div class="chart-controls">
      <span class="ctl-label">項目</span>
      <select id="chart-item"></select>
      <span class="ctl-label">單位</span>
      <div class="chart-units" id="chart-units"></div>
      <span class="ctl-label">查詢區間</span>
      <div class="date-range">
        <input type="date" id="chart-from" />
        <span class="muted">~</span>
        <input type="date" id="chart-to" />
      </div>
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
      data: { labels, datasets: [{ label: def.name, data, borderColor: "#2bd4ff", backgroundColor: "rgba(43,212,255,.18)", spanGaps: true, tension: 0.25, fill: true }] },
      options: axisOpts(false),
    }));
  } else {
    // 完成率 = 該期完成天數 ÷ 該期涵蓋的日曆天數（週=7、月=當月天數…）。
    const doneCounts = aggregateHabitCounts(rows, state.unit);
    const dayCounts = countDaysPerBucket(state.from, state.to, state.unit);
    const rateData = buckets.map((k) =>
      dayCounts[k] ? Math.round(((doneCounts[k] || 0) / dayCounts[k]) * 100) : 0
    );
    const totalDays = daysInRange(state.from, state.to);
    const doneDays = rows.filter((r) => r.done).length;
    const notDoneDays = Math.max(0, totalDays - doneDays);
    const doneSet = new Set(rows.filter((r) => r.done).map((r) => r.log_date));
    const weeks = calendarGrid(state.from, state.to, doneSet);

    area.innerHTML = `<p class="muted">${escapeHtml(def.name)} · 每${unitName(state.unit)}完成率（%）</p>
      <div style="position:relative;height:240px"><canvas id="c-bar"></canvas></div>
      <p class="muted" style="margin-top:16px">達成 vs 未達成（區間內共 ${totalDays} 天）</p>
      <div style="position:relative;height:220px"><canvas id="c-pie"></canvas></div>
      <p class="muted" style="margin-top:16px">月曆檢視（有打勾就亮起）</p>
      ${heatmapHtml(weeks)}`;

    chartInstances.push(new Chart(area.querySelector("#c-bar"), {
      type: "bar",
      data: { labels, datasets: [{ label: "完成率 %", data: rateData, backgroundColor: "#2bd4ff" }] },
      options: pctAxisOpts(),
    }));
    chartInstances.push(new Chart(area.querySelector("#c-pie"), {
      type: "doughnut",
      data: { labels: ["達成", "未達成"], datasets: [{ data: [doneDays, notDoneDays], backgroundColor: ["#2bd4ff", "#15323f"] }] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: "#dff4ff" } } } },
    }));

    const tip = area.querySelector("#hm-tip");
    area.querySelectorAll(".hm-cell[data-date]").forEach((cell) =>
      cell.addEventListener("click", () => {
        tip.textContent = `${cell.dataset.date}　${cell.dataset.done === "1" ? "已完成 ✓" : "未完成"}`;
      })
    );
  }
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function heatmapHtml(weeks) {
  let prevMonth = null;
  const monthCells = weeks
    .map((week) => {
      const ref = week.find((c) => c.inRange) || week[0];
      const mo = Number(ref.date.slice(5, 7));
      let label = "";
      if (mo !== prevMonth) { label = mo + "月"; prevMonth = mo; }
      return `<div class="hm-mlabel">${label}</div>`;
    })
    .join("");

  const weekdayCol = WEEKDAYS.map((d) => `<div class="hm-wd">${d}</div>`).join("");

  const cols = weeks
    .map((week) => `<div class="hm-col">${week
      .map((c) => `<div class="hm-cell ${c.done ? "on" : ""} ${c.inRange ? "" : "off"}"${c.inRange ? ` data-date="${c.date}" data-done="${c.done ? 1 : 0}"` : ""}></div>`)
      .join("")}</div>`)
    .join("");

  return `<div class="hm-scroll"><div class="hm">
      <div class="hm-monthrow"><div class="hm-left"></div><div class="hm-cols">${monthCells}</div></div>
      <div class="hm-bodyrow"><div class="hm-wdcol">${weekdayCol}</div><div class="hm-cols">${cols}</div></div>
    </div></div>
    <p id="hm-tip" class="muted" style="margin-top:6px">點任一格看日期</p>`;
}

function axisOpts(intY) {
  const grid = "rgba(43,212,255,.12)";
  return {
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: "#7fb8d6", maxRotation: 0, autoSkip: true }, grid: { color: grid } },
      y: { beginAtZero: intY, ticks: { color: "#7fb8d6", precision: intY ? 0 : undefined }, grid: { color: grid } },
    },
    plugins: { legend: { display: false } },
  };
}

function pctAxisOpts() {
  const grid = "rgba(43,212,255,.12)";
  return {
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: "#7fb8d6", maxRotation: 0, autoSkip: true }, grid: { color: grid } },
      y: { min: 0, max: 100, ticks: { color: "#7fb8d6", stepSize: 25, callback: (v) => v + "%" }, grid: { color: grid } },
    },
    plugins: { legend: { display: false } },
  };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
