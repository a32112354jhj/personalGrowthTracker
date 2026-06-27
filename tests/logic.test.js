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

import {
  mondayOf,
  bucketKey,
  enumerateBuckets,
  aggregateValues,
  aggregateHabitCounts,
  habitDoneCounts,
  alignSeries,
  bucketLabel,
  calendarGrid,
} from "../js/logic.js";

test("mondayOf 回傳該週週一（週一為起點）", () => {
  assert.equal(mondayOf("2026-06-17"), "2026-06-15");
  assert.equal(mondayOf("2026-06-15"), "2026-06-15");
  assert.equal(mondayOf("2026-06-21"), "2026-06-15");
});

test("bucketKey 依單位分組", () => {
  assert.equal(bucketKey("2026-06-17", "week"), "2026-06-15");
  assert.equal(bucketKey("2026-06-17", "month"), "2026-06");
  assert.equal(bucketKey("2026-06-17", "quarter"), "2026-Q2");
  assert.equal(bucketKey("2026-06-17", "year"), "2026");
});

test("enumerateBuckets 列出區間內所有分組（由舊到新）", () => {
  assert.deepEqual(enumerateBuckets("2026-04-10", "2026-06-17", "month"),
    ["2026-04", "2026-05", "2026-06"]);
  assert.deepEqual(enumerateBuckets("2025-11-01", "2026-02-01", "quarter"),
    ["2025-Q4", "2026-Q1"]);
  assert.deepEqual(enumerateBuckets("2024-06-01", "2026-06-01", "year"),
    ["2024", "2025", "2026"]);
  assert.deepEqual(enumerateBuckets("2026-06-15", "2026-06-29", "week"),
    ["2026-06-15", "2026-06-22", "2026-06-29"]);
});

test("aggregateValues sum 與 avg", () => {
  const rows = [
    { log_date: "2026-06-01", value: 100 },
    { log_date: "2026-06-20", value: 50 },
    { log_date: "2026-05-10", value: 8 },
  ];
  assert.deepEqual(aggregateValues(rows, "month", "sum"), { "2026-06": 150, "2026-05": 8 });
  assert.deepEqual(aggregateValues(rows, "month", "avg"), { "2026-06": 75, "2026-05": 8 });
});

test("aggregateHabitCounts 只計 done=true 的數量", () => {
  const checks = [
    { log_date: "2026-06-01", done: true },
    { log_date: "2026-06-02", done: false },
    { log_date: "2026-06-20", done: true },
  ];
  assert.deepEqual(aggregateHabitCounts(checks, "month"), { "2026-06": 2 });
});

test("habitDoneCounts 統計完成與未完成", () => {
  const checks = [{ done: true }, { done: true }, { done: false }];
  assert.deepEqual(habitDoneCounts(checks), { done: 2, notDone: 1 });
});

test("alignSeries 對齊 buckets，缺漏補 null 或 0", () => {
  assert.deepEqual(alignSeries(["a", "b", "c"], { a: 1, c: 3 }, false), [1, null, 3]);
  assert.deepEqual(alignSeries(["a", "b"], { a: 1 }, true), [1, 0]);
});

test("bucketLabel：週顯示 MM/DD，其餘顯示鍵本身", () => {
  assert.equal(bucketLabel("2026-06-15", "week"), "06/15");
  assert.equal(bucketLabel("2026-06", "month"), "2026-06");
  assert.equal(bucketLabel("2026-Q2", "quarter"), "2026-Q2");
});

test("calendarGrid 產生週欄（週一起），有打勾的日子標記 done", () => {
  const done = new Set(["2026-06-15", "2026-06-18"]);
  const weeks = calendarGrid("2026-06-15", "2026-06-21", done);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].length, 7);
  assert.equal(weeks[0][0].date, "2026-06-15");
  assert.equal(weeks[0][0].done, true);
  assert.equal(weeks[0][3].date, "2026-06-18");
  assert.equal(weeks[0][3].done, true);
  assert.equal(weeks[0][1].done, false);
  assert.equal(weeks[0][6].date, "2026-06-21");
});

test("calendarGrid 區間外的補白格 inRange=false", () => {
  const weeks = calendarGrid("2026-06-17", "2026-06-17", new Set(["2026-06-17"]));
  const cells = weeks.flat();
  const target = cells.find((c) => c.date === "2026-06-17");
  assert.equal(target.inRange, true);
  assert.equal(target.done, true);
  assert.equal(cells.find((c) => c.date === "2026-06-15").inRange, false);
});

import { daysInRange, countDaysPerBucket } from "../js/logic.js";

test("daysInRange 計算含起迄的天數", () => {
  assert.equal(daysInRange("2026-06-15", "2026-06-21"), 7);
  assert.equal(daysInRange("2026-06-17", "2026-06-17"), 1);
  assert.equal(daysInRange("2026-05-19", "2026-06-17"), 30);
});

test("countDaysPerBucket 計算每桶在區間內的日曆天數", () => {
  assert.deepEqual(countDaysPerBucket("2026-06-15", "2026-06-21", "week"), { "2026-06-15": 7 });
  assert.deepEqual(countDaysPerBucket("2026-05-30", "2026-06-02", "month"), { "2026-05": 2, "2026-06": 2 });
  assert.deepEqual(countDaysPerBucket("2026-06-15", "2026-06-17", "week"), { "2026-06-15": 3 });
});

import { addDays, weekRange, weekLabel, weeklySummary } from "../js/logic.js";

test("addDays 加減天數（跨月）", () => {
  assert.equal(addDays("2026-06-20", 3), "2026-06-23");
  assert.equal(addDays("2026-06-30", 1), "2026-07-01");
  assert.equal(addDays("2026-06-01", -1), "2026-05-31");
});

test("weekRange 回傳週一到週日", () => {
  assert.deepEqual(weekRange("2026-06-15"), { from: "2026-06-15", to: "2026-06-21" });
});

test("weekLabel 顯示 M/D–M/D", () => {
  assert.equal(weekLabel("2026-06-15"), "6/15–6/21");
});

test("weeklySummary 統計 todo 完成數與 count 達標數", () => {
  const goals = [
    { type: "todo", done: true, target: 1, progress: 0 },
    { type: "todo", done: false, target: 1, progress: 0 },
    { type: "count", done: false, target: 4, progress: 4 },
    { type: "count", done: false, target: 3, progress: 1 },
  ];
  assert.deepEqual(weeklySummary(goals), { todoDone: 1, todoTotal: 2, countDone: 1, countTotal: 2 });
});
