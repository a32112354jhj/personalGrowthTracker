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
