import { listDefinitions, addDefinition, archiveDefinition } from "./db.js";
import { signOut } from "./auth.js";
import { showToast } from "./app.js";

const GROUPS = [
  { table: "habits", title: "習慣", hasUnit: false },
  { table: "score_items", title: "評分項（1–10）", hasUnit: false },
  { table: "metric_items", title: "數值項", hasUnit: true },
];

export async function renderSettings(root) {
  root.innerHTML = `<h1>設定</h1><div id="settings-body" class="muted">載入中…</div>
    <button id="logout-btn" class="secondary" style="margin-top:24px">登出</button>`;

  root.querySelector("#logout-btn").addEventListener("click", async () => {
    await signOut();
  });

  const body = root.querySelector("#settings-body");
  try {
    const lists = await Promise.all(GROUPS.map((g) => listDefinitions(g.table)));
    body.classList.remove("muted");
    body.innerHTML = GROUPS.map((g, i) => groupBlock(g, lists[i])).join("");
    wireGroups(root);
  } catch (err) {
    body.innerHTML = `<p class="error">載入失敗：${escapeHtml(err.message || "")}</p>`;
  }
}

function groupBlock(g, items) {
  const rows = items
    .map(
      (it) => `<div class="card row" data-id="${it.id}">
        <span>${escapeHtml(it.name)}${g.hasUnit && it.unit ? ` <span class="muted">(${escapeHtml(it.unit)})</span>` : ""}</span>
        <button class="link" data-archive="${it.id}" data-table="${g.table}">刪除</button>
      </div>`
    )
    .join("");
  const unitInput = g.hasUnit
    ? `<input data-new-unit="${g.table}" placeholder="單位（如 元、kg）" style="width:120px" />`
    : "";
  return `<h2>${g.title}</h2>${rows}
    <div class="row" style="gap:6px">
      <input data-new-name="${g.table}" placeholder="新增${g.title}名稱" />
      ${unitInput}
      <button data-add="${g.table}" style="flex:0 0 auto">新增</button>
    </div>`;
}

function wireGroups(root) {
  root.querySelectorAll("[data-add]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const table = btn.dataset.add;
      const name = root.querySelector(`[data-new-name="${table}"]`).value.trim();
      if (!name) return;
      const fields = { name };
      const unitEl = root.querySelector(`[data-new-unit="${table}"]`);
      if (unitEl) fields.unit = unitEl.value.trim();
      try {
        await addDefinition(table, fields);
        showToast("已新增");
        renderSettings(root);
      } catch {
        showToast("新增失敗");
      }
    })
  );

  root.querySelectorAll("[data-archive]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await archiveDefinition(btn.dataset.table, btn.dataset.archive);
        showToast("已刪除");
        renderSettings(root);
      } catch {
        showToast("刪除失敗");
      }
    })
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
