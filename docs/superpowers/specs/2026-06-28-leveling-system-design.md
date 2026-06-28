# 等級／階級遊戲化系統 — 設計文件

日期：2026-06-28
作者：jiahao
狀態：設計定案（已核可）

## 目標

把生活檢核變成「玩家養成」體驗：完成日常會累積經驗值（XP）、一階一階升等（Level），達到門檻可手動「審核晉階」字母階級（E→S）。介面上 STATUS 狀態區要**大而醒目**，完成任務時給**強烈即時回饋**（浮出 +XP、經驗條發光增長、跨級時 LEVEL UP 特效），強化成就感。

## XP 來源（由既有紀錄即時換算，不另記帳）

- 每完成 1 個**習慣**打勾（`habit_checks.done=true`）：**+10 XP**
- 每達成 1 個**週目標**：**+50 XP**
  - 待辦目標 `done=true`；或手動次數目標 `manual_count >= target`
  - （連動習慣的次數目標不另計，因其達成已由底層習慣打勾計入，避免重複）
- **總 XP** = 歷史習慣完成數 ×10 + 已達成週目標數 ×50
- **今日 XP** = 今天的習慣完成數 ×10（顯示「今日 +X」）

XP 為衍生值，不存獨立欄位；避免重複計算與資料不一致。

## 等級 Level

- 升一級所需 XP：`xpToNext(level) = 100 + (level - 1) * 50`（Lv1→2 需 100、Lv2→3 需 150…）
- `levelFromXp(totalXp)` 回傳 `{ level, into, need }`（目前等級、已進入該級的 XP、升下一級所需 XP）。

## 階級 Rank（E→S，手動審核 + 自訂條件）

- 六階順序：`["E","D","C","B","A","S"]`
- 各階等級門檻：E=Lv1、D=Lv5、C=Lv12、B=Lv22、A=Lv35、S=Lv50
- `rankForLevel(level)` 回傳該等級「可達到」的最高階（門檻 <= level 的最高者）。
- **目前階級**由使用者手動審核決定，存於 DB（預設 E）。
- 當「可達階級 > 目前階級」→ 解鎖「⚡ 晉階審核」。
- **晉階審核面板**（System NOTIFICATION 風格）顯示「目前階 → 下一階」、列出該階**自訂條件清單**（逐項勾選，全勾才可通過）、**晉階感言**輸入、「審核通過」按鈕。通過後：
  - 目前階級 +1 階（一次升一階；若仍可晉階則可再次審核）。
  - 寫入晉階紀錄（階級、感言、時間）。
  - 跳出升階特效。
- 每階的自訂條件文字可在「設定 → 階級設定」編輯。

## 介面與即時回饋

### STATUS 狀態卡（今天頁最上方，醒目）
- 大型卡片：左側 **Rank 徽章**（E~S，發光、依階級換色）、右側 **Lv N**。
- **經驗條**（粗、發光）顯示 into/need，旁標 `XP into / need`。
- 「今日 +X XP」小字。
- 可晉階時：顯示發光脈動的「⚡ 晉階審核」按鈕。

### 完成任務的即時回饋（重點）
- 今天頁打勾完成習慣時：
  - 於該列附近**浮出「+10 XP」**（上升淡出動畫）。
  - STATUS 經驗條**即時增長**（樂觀更新：baseline + 本次未存的勾選變化 ×10），數字滾動。
  - 若跨越等級門檻 → 畫面中央閃現 **「LEVEL UP ▶ Lv N」** 特效（短暫、發光）。
  - 取消打勾則經驗條回退（不播 LEVEL UP）。
- 週目標頁完成 todo / 次數達標時：浮出「+50 XP」提示（STATUS 條於下次進今天頁更新）。
- 實際持久化仍由既有「儲存 / 週目標更新」流程完成；衍生 XP 會與樂觀值一致。

### 設定 → 階級設定
- 編輯每一階（D/C/B/A/S）的晉階自訂條件（多行＝多個勾選項）。
- 查看晉階紀錄（階級、感言、時間）。

## 資料模型（2 張新表）

### player（每人一列）
| 欄位 | 型別 | 說明 |
|---|---|---|
| user_id | uuid pk | |
| rank | text | 目前階級，預設 'E' |
| criteria | jsonb | 各階自訂條件，如 `{ "D": "...", "C": "..." }`，預設 `{}` |
| updated_at | timestamptz | |

### rank_promotions（晉階紀錄）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| rank | text | 晉到的階級 |
| note | text | 晉階感言 |
| approved_at | timestamptz | |

兩表啟用 RLS（`user_id = auth.uid()`）。以建表 SQL 在 Supabase SQL Editor 手動執行（控制者代辦）。

## 純函式（logic.js，TDD）

- `RANKS = ["E","D","C","B","A","S"]`
- `xpToNext(level)` → number
- `levelFromXp(totalXp)` → `{ level, into, need }`
- `rankForLevel(level)` → 階級字母（門檻表）
- `nextRank(rank)` → 下一階或 null（S 之後 null）
- `totalXp({ habitDones, weeklyGoalsDone })` → number（habitDones×10 + weeklyGoalsDone×50）

## db 層（db.js 擴充）

- `getPlayer()` → `{ rank, criteria }`（無則回預設 `{ rank:'E', criteria:{} }`）。
- `setPlayerRank(rank)` / `setRankCriteria(criteriaObj)`（upsert player，onConflict user_id）。
- `addPromotion(rank, note)` / `listPromotions()`。
- `countHabitDones()` → number（`select count head` where done=true）。
- `countTodayHabitDones(today)` → number。
- 完成週目標數：沿用 `listWeeklyGoals` 不可（跨週），改 `countCompletedWeeklyGoals()`：抓 `weekly_goals` 全部（單人量小）計算 `done` 或 `manual_count>=target` 的數量。

## 模組與檔案

- 新增 `js/ui-status.js`：STATUS 卡渲染、XP 浮出 / 經驗條動畫 / LEVEL UP 特效、晉階審核面板。
  - `renderStatus(containerEl)`（載入 player + 計數 → 渲染卡）
  - `gainXp(delta, anchorEl)`（浮出 +XP、更新條、偵測升級）
- 修改 `js/ui-today.js`：頁頂掛入 STATUS 卡；習慣打勾時呼叫 `gainXp(±10, 該列)`。
- 修改 `js/ui-weekly.js`：完成目標時浮出「+50 XP」。
- 修改 `js/ui-settings.js`：新增「階級設定」區（編輯條件、晉階紀錄）。
- 修改 `js/logic.js`（+ 測試）：上述純函式。
- 修改 `css/styles.css`：STATUS 卡、Rank 徽章、經驗條、+XP 浮出、LEVEL UP 特效樣式（動畫沿用 transform/opacity，省效能；尊重 prefers-reduced-motion）。
- 新增 `sql/migrations/2026-06-28-leveling.sql`（建表 + RLS）。

## 錯誤處理

- player 不存在 → 視為預設 E（首次 setPlayerRank/criteria 時 upsert 建立）。
- 晉階審核：未勾完自訂條件則「審核通過」按鈕停用。
- 載入 / 儲存失敗 → 明確錯誤訊息，不靜默吞錯。

## 測試策略

- logic 純函式以 `node:test` 單元測試（xpToNext / levelFromXp / rankForLevel / nextRank / totalXp）。
- UI / db 手動測試（步驟記於計畫）：打勾浮 +XP 與經驗條增長、跨級 LEVEL UP、達門檻解鎖晉階、審核通過後階級更新與紀錄、設定編輯條件。

## 影響範圍

不更動既有資料表與既有頁面核心功能；STATUS 卡為今天頁新增區塊。維持 System 深色霓虹風格。

## 非目標（YAGNI）

- 不做 XP 數值/曲線的使用者自訂（本版固定，數值集中於 logic.js 易調）。
- 不做掉落物/技能/任務獎勵等額外遊戲系統。
- 日記、評分不計 XP（依使用者選擇）。
