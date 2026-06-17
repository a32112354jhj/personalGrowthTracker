import { currentUser, signIn, onAuthChange } from "./auth.js";
import { renderToday } from "./ui-today.js";
import { renderReview } from "./ui-review.js";
import { renderSettings } from "./ui-settings.js";

const el = (id) => document.getElementById(id);

export function showToast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2000);
}

const renderers = {
  today: () => renderToday(el("tab-today")),
  review: () => renderReview(el("tab-review")),
  settings: () => renderSettings(el("tab-settings")),
};

function switchTab(name) {
  for (const tab of ["today", "review", "settings"]) {
    el(`tab-${tab}`).classList.toggle("hidden", tab !== name);
  }
  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  renderers[name]();
}

function showLoggedIn() {
  el("login-view").classList.add("hidden");
  el("app-view").classList.remove("hidden");
  el("tabbar").classList.remove("hidden");
  switchTab("today");
}

function showLoggedOut() {
  el("app-view").classList.add("hidden");
  el("tabbar").classList.add("hidden");
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
