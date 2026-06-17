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
