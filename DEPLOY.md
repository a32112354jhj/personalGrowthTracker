# 部署步驟

## 1. 建立 Supabase 專案
1. 到 https://supabase.com 註冊並建立一個免費專案。
2. 左側 SQL Editor → 貼上 `sql/schema.sql` 全部內容 → Run。
3. 左側 Authentication → Providers → 確認 Email 已啟用。
4. Authentication → Users → Add user，建立你自己的 email + 密碼（記得設定 Auto confirm，或關閉 email 確認）。

## 2. 填入前端設定
1. 專案 Settings → API，複製 `Project URL` 與 `anon public` key。
2. 編輯 `js/config.js`，填入這兩個值。

## 3. 本機測試
在專案根目錄執行：
```
python3 -m http.server 5173
```
開 http://localhost:5173 ，登入測試。

## 4. 部署到 GitHub Pages
1. 建立 GitHub repo，push 全部檔案。
2. repo Settings → Pages → Source 選 `main` 分支 `/ (root)` → Save。
3. 等待產生網址（https://你的帳號.github.io/repo名/）。
4. 手機開該網址 → 登入 → 瀏覽器選單「加入主畫面」當 App 用。

## 注意
- `js/config.js` 內只有 anon key（可公開）；資料安全由 Auth + RLS 保證。
- 切勿把 service_role key 放進前端。
