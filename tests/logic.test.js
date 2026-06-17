import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recentDates,
  completionRate,
  cumulativeSum,
  clampScore,
  parseMetricValue,
  todayISO,
} from "../js/logic.js";

test("recentDates 回傳 N 天、含結束日、由舊到新", () => {
  const r = recentDates("2026-06-17", 3);
  assert.deepEqual(r, ["2026-06-15", "2026-06-16", "2026-06-17"]);
});

test("completionRate 計算完成百分比（四捨五入整數）", () => {
  assert.equal(completionRate([{ done: true }, { done: false }, { done: true }]), 67);
  assert.equal(completionRate([]), 0);
});

test("cumulativeSum 回傳逐項累計", () => {
  assert.deepEqual(cumulativeSum([100, 50, 25]), [100, 150, 175]);
  assert.deepEqual(cumulativeSum([]), []);
});

test("clampScore 限制在 1..10 並取整", () => {
  assert.equal(clampScore(0), 1);
  assert.equal(clampScore(11), 10);
  assert.equal(clampScore(7.6), 8);
});

test("parseMetricValue：合法數字回傳 number，非法回傳 null", () => {
  assert.equal(parseMetricValue("1500"), 1500);
  assert.equal(parseMetricValue("62.5"), 62.5);
  assert.equal(parseMetricValue(""), null);
  assert.equal(parseMetricValue("abc"), null);
});

test("todayISO 回傳 YYYY-MM-DD 格式", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
