# 每週任務（週目標 + 復盤）— 設計文件

日期：2026-06-20
作者：jiahao
狀態：設計定案（已核可）

## 目標

在既有的自我成長檢核 app 上新增「每週任務」機制：每一週可定義該週目標、追蹤進度，並對該週做文字復盤。目標支援兩種型態（待辦 todo / 次數 count），次數型可手動計次或連動每日習慣自動累計。週五～週日提供「頁面內」提醒（非系統推播），提示復盤與規劃下週。

## 非目標（YAGNI）

- 不做系統推播（Web Push / 排程）。改用 app 內提示橫幅。使用者已明確選擇先不做推播。
- 不做「未完成 todo 一鍵帶到下週」（保留未來擴充）。
- 不做多人 / 分享。

## 週的定義

- 一週 = 週一～週日。以該週「週一日期」（`week_start`，YYYY-MM-DD）作為識別，沿用既有 `mondayOf()`。
- 週目標頁可切換檢視的週（上一週 / 本週 / 下一週…）；規劃下週即切到下週新增目標。

## 兩種週目標

- **待辦（todo）**：一次性任務，打勾完成。`type='todo'`、`target=1`、以 `done` 記錄完成。
- **次數（count）**：本週要做 N 次，顯示 `[x/N]` 與進度條。`type='count'`、`target=N`。進度來源二擇一：
  - **連動習慣**：`linked_habit_id` 指向一個每日習慣；進度 x = 本週（week_start..week_start+6）該習慣 `habit_checks.done=true` 的天數（即時計算，不另存）。
  - **手動計次**：`linked_habit_id` 為空；進度 x = `manual_count`，使用者按 +1 / −1 調整。

達標（count）：`x >= target`。

## 復盤

- 每週一筆文字復盤（`weekly_reviews.reflection`，每人每週唯一）。
- 復盤區同時顯示該週目標達成摘要：todo 完成數 / 總數、count 達標數 / 總數。

## 提醒（頁面內，非推播）

- App 載入後，若「今天是週五/六/日」且（下週尚無任何目標 或 本週尚無復盤），於頁面頂端顯示可關閉的提示橫幅：「該復盤並規劃下週了」，點擊切到週目標頁。
- 純前端判斷，無背景排程、無後端。橫幅關閉狀態存於 `localStorage`（當週只提示到你處理或關閉）。

## 畫面

底部導覽新增第 5 個分頁，順序：今天 / 週目標 / 回顧 / 圖表 / 設定。

週目標頁（`ui-weekly.js`）：
- 週切換列：`‹  6/16–6/22（本週）  ›`，點箭頭切換週。
- 本週目標清單：
  - todo：打勾框 + 標題（點整列切換完成），可刪除。
  - count：標題 + `[x/N]` + 進度條；手動型有 −/＋ 鈕；連動型顯示「連動：運動」且進度唯讀。
  - 「新增目標」表單：輸入標題、選型態（待辦 / 次數）、次數型可設目標數與「連動習慣（無＝手動）」。
- 復盤區：該週達成摘要 + 文字框 + 儲存。

## 資料模型（2 張新表）

### weekly_goals
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | 擁有者 |
| week_start | date | 該週週一 |
| title | text | 目標描述 |
| type | text | 'todo' \| 'count'，預設 'todo' |
| target | int | 次數型目標數；todo 為 1，預設 1 |
| done | boolean | todo 是否完成，預設 false |
| linked_habit_id | uuid null | 連動的每日習慣（count 用），可空（on delete set null） |
| manual_count | int | 手動計次進度，預設 0 |
| sort_order | int | 排序 |
| created_at | timestamptz | |

### weekly_reviews
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| week_start | date | 該週週一 |
| reflection | text | 文字復盤 |
| created_at / updated_at | timestamptz | |

唯一約束：`(user_id, week_start)`。

兩表皆啟用 RLS：`user_id = auth.uid()` 才可讀寫。以一段建表 SQL 在 Supabase SQL Editor 執行（控制者代辦，subagent 無法連 Supabase）。

## 純函式（logic.js，TDD）

- `addDays(dateISO, n)`：日期加減天數。
- `weekRange(weekStartISO)`：回傳 `{ from: weekStart, to: weekStart+6 }`。
- `weekLabel(weekStartISO)`：回傳 `"M/D–M/D"`。
- `weeklySummary(goals)`：給定已附帶 `progress` 的目標陣列，回傳 `{ todoDone, todoTotal, countDone, countTotal }`（count 以 progress>=target 計達標）。

（既有 `mondayOf` 作為 `week_start` 計算；連動次數的實際讀取在 db/ui 層，非純函式。）

## db 層（db.js 擴充）

- `listWeeklyGoals(weekStart)`：取某週目標（依 sort_order）。
- `addWeeklyGoal(fields)` / `updateWeeklyGoal(id, fields)` / `deleteWeeklyGoal(id)`。
- `getWeeklyReview(weekStart)` / `saveWeeklyReview(weekStart, reflection)`（upsert，onConflict user_id,week_start）。
- 連動次數：沿用既有 `getRange('habit_checks', from, to)`，於 ui 層 filter habit_id 且 done 計數。

## 錯誤處理

- 載入 / 儲存失敗 → 明確錯誤訊息，不靜默吞錯。
- 新增目標基本驗證：標題非空；次數型 target ≥ 1。
- 刪除目標前不需確認（與既有習慣刪除一致）。

## 測試策略

- logic 純函式以 `node:test` 單元測試（addDays / weekRange / weekLabel / weeklySummary）。
- UI / db 以手動測試（步驟記於計畫各任務）：新增 todo/count 目標、切換週、連動習慣自動計次、手動 +/−、復盤儲存後重整仍在、提醒橫幅於週五後出現。

## 影響檔案

- 新增 `js/ui-weekly.js`。
- 修改 `index.html`（第 5 分頁與容器）、`js/app.js`（接上分頁 + 提醒橫幅）、`js/db.js`（週目標/復盤 CRUD）、`js/logic.js`（週純函式 + 測試）、`css/styles.css`（目標/進度條/橫幅樣式）。
- 新增 `sql/migrations/2026-06-20-weekly.sql`（建表 + RLS，使用者手動執行）。

不更動既有「今天 / 回顧 / 圖表 / 設定」功能與《System》風格樣式。
