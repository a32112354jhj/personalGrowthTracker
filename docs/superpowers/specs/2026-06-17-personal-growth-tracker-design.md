# 自我成長檢核系統 — 設計文件

日期：2026-06-17
作者：jiahao
狀態：設計定案（待使用者最終審閱）

## 目標

打造一個單人使用的「自我成長檢核與追蹤」系統。每天記錄習慣完成情況、自訂評分項目（1–10 分）、自訂數值項目（帶單位的自由數字，如存錢金額、體重）與文字日記，並能回顧過去趨勢。所有追蹤項目皆可由使用者自行新增與自訂。手機連網即可使用，資料存於免費雲端資料庫，換手機或清快取都不遺失。

## 使用情境

- 使用者：只有本人一人。
- 主要裝置：手機（瀏覽器，可加到主畫面當 App 用），偶爾電腦。
- 典型流程：每天打開「今天」分頁 → 勾選已完成習慣、拉評分滑桿、寫幾句日記 → 儲存。週期性打開「回顧」看完成率與分數趨勢。

## 非目標（YAGNI）

- 不做多人 / 社群 / 分享功能。
- 不做提醒推播（第一版不做，未來可加）。
- 不做原生 App（用網頁加到主畫面即可）。
- 不做複雜權限系統（單一帳號即可）。

## 技術選型

- **前端**：純 HTML + JavaScript（單頁應用），手機優先 RWD。不使用重量級框架，降低維護成本，可直接以靜態檔案部署。
- **資料庫 / 後端**：Supabase 免費方案（PostgreSQL + 自動 REST API + Auth）。前端透過 supabase-js 直接讀寫。
- **驗證**：Supabase Auth，email + 密碼登入。單一帳號（使用者本人）。登入狀態長期保存於瀏覽器，平常免重複登入。
- **部署**：GitHub Pages（或 Netlify），免費固定網址。

## 整體架構

```
手機/電腦瀏覽器 (前端單頁網頁)
        │  supabase-js (HTTPS)
        ▼
Supabase 雲端
  ├─ Auth（email + 密碼）
  └─ PostgreSQL（資料表 + Row Level Security）
```

前端不含任何祕密金鑰邏輯；Supabase anon key 為公開金鑰，資料安全由 **Auth 登入 + Row Level Security（RLS）** 保證：所有資料表僅允許「已登入且為資料擁有者」讀寫。

## 資料模型

所有表都有 `user_id`（對應 auth.users.id）欄位，並啟用 RLS：`user_id = auth.uid()` 才可讀寫。

### habits（習慣定義）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid | 擁有者 |
| name | text | 習慣名稱，例：運動 |
| sort_order | int | 排序 |
| is_archived | bool | 是否封存（停止追蹤但保留歷史） |
| created_at | timestamptz | |

### score_items（自訂評分項定義）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid | |
| name | text | 評分項名稱，例：心情、專注力 |
| sort_order | int | |
| is_archived | bool | |
| created_at | timestamptz | |

### daily_logs（每日總紀錄）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid | |
| log_date | date | 日期，與 user_id 組成唯一鍵（每天一筆） |
| journal | text | 文字日記，可空 |
| created_at / updated_at | timestamptz | |

唯一約束：`(user_id, log_date)`。

### habit_checks（習慣打勾）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid | |
| habit_id | uuid (fk → habits) | |
| log_date | date | |
| done | bool | 是否完成 |

唯一約束：`(habit_id, log_date)`。

### scores（每日評分值）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid | |
| score_item_id | uuid (fk → score_items) | |
| log_date | date | |
| value | int | 1–10 |

唯一約束：`(score_item_id, log_date)`。

### metric_items（自訂數值項定義）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid | |
| name | text | 數值項名稱，例：存錢、體重、喝水 |
| unit | text | 單位，例：元、kg、杯（可空） |
| sort_order | int | |
| is_archived | bool | |
| created_at | timestamptz | |

### metric_values（每日數值值）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid (pk) | |
| user_id | uuid | |
| metric_item_id | uuid (fk → metric_items) | |
| log_date | date | |
| value | numeric | 自由數字（可含小數，如 1500、62.5） |

唯一約束：`(metric_item_id, log_date)`。

## 畫面與功能

單頁應用，底部三個分頁（手機友善）：

### 今天（預設頁）
- 顯示今天日期，可切換到其他日期補登。
- 習慣清單：每個習慣一個可點的打勾開關。
- 評分項清單：每項一個 1–10 滑桿（或數字按鈕）。
- 數值項清單：每項一個數字輸入框，旁邊顯示單位（如「存錢 ___ 元」）。
- 文字日記輸入框。
- 「儲存」：將當天的 daily_logs / habit_checks / scores / metric_values 一次寫入（upsert）。

### 回顧
- 月曆或列表檢視，點某天可看該天紀錄。
- 統計：
  - 各習慣近 30 天完成率（百分比 + 簡單長條）。
  - 各評分項近 30 天折線趨勢。
  - 各數值項近 30 天趨勢與累積（如存錢累計總額、體重變化）。
- 唯讀為主，點進某天可跳回「今天」頁編輯該日。

### 設定
- 登入 / 登出。
- 新增 / 改名 / 排序 / 封存 習慣。
- 新增 / 改名 / 排序 / 封存 評分項。
- 新增 / 改名（含單位）/ 排序 / 封存 數值項。
- 設定中放置 Supabase 連線資訊由開發階段寫死於設定檔（非使用者輸入）。

## 錯誤處理

- 未登入 → 顯示登入畫面，擋住主功能。
- 網路 / Supabase 失敗 → 顯示明確錯誤訊息（例：「儲存失敗，請檢查網路後重試」），不靜默吞錯。
- 儲存採 upsert，避免重複按造成重複資料。
- 表單基本驗證：評分限制 1–10，日記長度上限。

## 安全性

- Auth 登入 + 全表 RLS（`user_id = auth.uid()`）。
- 前端僅內含 Supabase URL 與公開 anon key（設計上可公開）。
- 不在前端硬寫任何密碼或 service key。

## 測試策略

- 資料層：以 Supabase SQL / 測試帳號驗證 RLS（未登入或他人無法讀寫）。
- 前端關鍵流程手動 + 可行的自動化：登入、今天頁儲存後重整資料仍在、回顧頁統計數字正確、設定頁增刪習慣。
- 跨日：補登過去日期、同一天重複儲存（upsert 正確）。

## 部署步驟（概要）

1. 在 Supabase 建立專案，執行建表 + RLS 的 SQL。
2. 建立使用者帳號（本人 email + 密碼）。
3. 將前端設定檔填入該專案的 URL 與 anon key。
4. 推上 GitHub，啟用 GitHub Pages，取得網址。
5. 手機開網址、登入、加到主畫面。

## 擴充功能：圖表分頁（2026-06-18 追加，已核可）

新增第四個分頁「圖表」，讓每個項目能以圖表檢視趨勢，並可自訂查詢區間。

**控制項**
- 選項目：下拉，列出所有習慣 / 評分項 / 數值項。
- 單位：週 / 月 / 季 / 年（X 軸每一格代表的期間長度）。
- 查詢區間：起、迄日期，可自訂；預設依單位給合理區間（週→近12週、月→近12月、季→近8季、年→近5年）。

**圖表對應**
- 評分項 → 折線圖，每格 = 該期平均分數。
- 數值項 → 折線圖，每格 = 該期加總或平均（依該項 `agg` 設定）。
- 習慣 → 長條圖（每格完成次數）＋ 圓餅圖（區間內完成 vs 未完成）＋ 月曆熱力圖（GitHub 貢獻圖風格，每天一格、有打勾就亮起，週一為列起點）。

**資料模型變更**
- `metric_items` 新增欄位 `agg text not null default 'sum'`（值：`sum` | `avg`）。以一段 `ALTER TABLE` 遷移於既有專案套用。

**技術**
- 圖表以 Chart.js（CDN）繪製；月曆熱力圖以純 HTML/CSS 格子繪製（Chart.js 不支援）。
- 週/月/季/年的分組與彙總、月曆格子配置抽成 `logic.js` 純函式並寫單元測試。
- 不影響既有「今天 / 回顧 / 設定」功能。

**影響檔案**：新增 `js/ui-charts.js`；修改 `index.html`（載入 Chart.js + 第四分頁）、`js/app.js`（接上分頁）、`js/logic.js`（彙總/月曆純函式 + 測試）、`js/ui-settings.js`（數值項 agg 選單）、`js/db.js`（沿用既有 CRUD，metric 定義帶 agg）。

## 未來可擴充（不在本版）

- 提醒推播、習慣連續天數（streak）徽章、資料匯出 CSV、深色模式切換。
