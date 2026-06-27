import { currentUser, signIn, onAuthChange } from "./auth.js";
import { renderToday } from "./ui-today.js";
import { renderWeekly } from "./ui-weekly.js";
import { renderReview } from "./ui-review.js";
import { renderCharts } from "./ui-charts.js";
import { renderSettings } from "./ui-settings.js";
import { listWeeklyGoals, getWeeklyReview } from "./db.js";
import { todayISO, mondayOf, addDays } from "./logic.js";

const el = (id) => document.getElementById(id);
const TABS = ["today", "weekly", "review", "charts", "settings"];

export function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2000);
}

const renderers = {
  today: () => renderToday(el("tab-today")),
  weekly: () => renderWeekly(el("tab-weekly")),
  review: () => renderReview(el("tab-review")),
  charts: () => renderCharts(el("tab-charts")),
  settings: () => renderSettings(el("tab-settings")),
};

function switchTab(name) {
  for (const tab of TABS) {
    el(`tab-${tab}`).classList.toggle("hidden", tab !== name);
  }
  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  renderers[name]();
}

// 週五～週日：下週尚無目標 或 本週尚無復盤 → 顯示頁面內提醒（非推播）
async function maybeReminder() {
  const today = todayISO();
  const dow = new Date(today + "T00:00:00").getDay(); // 0=日,5=五,6=六
  const isWeekend = dow === 5 || dow === 6 || dow === 0;
  const thisWeek = mondayOf(today);
  if (!isWeekend) return;
  if (localStorage.getItem("reminderDismissed") === thisWeek) return;
  try {
    const nextWeek = addDays(thisWeek, 7);
    const [nextGoals, review] = await Promise.all([
      listWeeklyGoals(nextWeek),
      getWeeklyReview(thisWeek),
    ]);
    if (nextGoals.length > 0 && review.trim() !== "") return;
    const bar = el("reminder");
    bar.innerHTML = `該復盤並規劃下週了
      <span class="row" style="flex:0 0 auto;width:auto;gap:8px">
        <button id="reminder-go">前往</button>
        <button class="secondary" id="reminder-x">關閉</button>
      </span>`;
    bar.classList.remove("hidden");
    el("reminder-go").addEventListener("click", () => { bar.classList.add("hidden"); switchTab("weekly"); });
    el("reminder-x").addEventListener("click", () => {
      bar.classList.add("hidden");
      localStorage.setItem("reminderDismissed", thisWeek);
    });
  } catch (e) { /* 提醒失敗不影響主流程 */ }
}

function showLoggedIn() {
  el("login-view").classList.add("hidden");
  el("app-view").classList.remove("hidden");
  el("tabbar").classList.remove("hidden");
  switchTab("today");
  maybeReminder();
}

function showLoggedOut() {
  el("app-view").classList.add("hidden");
  el("tabbar").classList.add("hidden");
  el("reminder").classList.add("hidden");
  el("login-view").classList.remove("hidden");
}

function wire() {
  el("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    el("login-error").textContent = "";
    try {
      await signIn(el("login-email").value, el("login-password").value);
    } catch (err) {
      el("login-error").textContent = "登入失敗：" + (err.message || "請檢查帳密");
    }
  });

  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );

  onAuthChange((user) => {
    if (user) showLoggedIn();
    else showLoggedOut();
  });
}

(async function init() {
  wire();
  const user = await currentUser();
  if (user) showLoggedIn();
  else showLoggedOut();
})();
