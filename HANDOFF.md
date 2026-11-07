# HANDOFF — CODEX STUDY 家長端（parent-app）

> 給下一位開發者（或新的 Claude 工作階段）。寫於 2026-11-07。
> 開工順序：**這份 → [`docs/SYNC.md`](docs/SYNC.md)（與 student-app 的合約）→ [`docs/DEPLOY.md`](docs/DEPLOY.md)（部署設定）→ `CLAUDE.md`（開發規則）**。

---

## 1. 一分鐘重點

- 家長用的手機網頁 App（PWA，可加入主畫面）。與 [czpeanut/student-app](https://github.com/czpeanut/student-app)（codexstudy.com）**共用同一個 Supabase**：student-app 寫上課紀錄、成績、老師訊息；家長端讀資料、送推播、讓家長回訊息。
- **第一版四項功能都做完了**：看小孩資料、上課／下課推播、收老師訊息、回訊息給老師或主任。另有綁定小孩、到班紀錄、通知設定。
- **已部署到 Vercel 並實際測過**（使用者 2026-11-06～07 回報）：Google 登入、綁定、首頁、推播通知都能用。
- **還沒正式給家長用**。上線前還差：自己的網址（目前被瀏覽器當成陌生網站）、寄信服務（SMTP）、上線當天的 SQL。見第 5 節。
- 程式都在分支 **`ccr-529ce6a2-416dw7`**；repo **沒有 `main`**。

---

## 2. 目前狀態

### 2.1 已確認

| 項目 | 狀態 | 依據 |
|---|---|---|
| student-app 產生綁定碼 | ✅ 已上線（commit `ba8fc22`） | student-app repo |
| 兩邊綁定碼雜湊 | ✅ 一致 | 已核對兩邊程式與同一組已知答案 |
| parent-app Vercel 專案 | ✅ 已建立 | 使用者回報 |
| 家長端 migration（`2026-11-05-parent-app.sql`） | ✅ 已執行 | 使用者查得到 `guardian_push_subscriptions` 表 |
| `GUARDIAN_CODE_PEPPER` 兩邊同值 | ✅ | 使用者綁定成功 |
| Google 登入 | ✅ | 一開始會跳回 codexstudy.com，Redirect URLs 補上家長端網址後正常（見第 6 節） |
| VAPID 金鑰、開啟通知、收到推播 | ✅ | 使用者回報「首頁設定好會跳通知了」 |
| 程式檢查 | ✅ 型別、lint、build、46 項測試通過 | 本機執行 |

### 2.2 不確定（下一位請向使用者確認，確認後更新這張表）

| 項目 | 為什麼要知道 |
|---|---|
| Vercel 正式站跟哪個分支（`ccr-529ce6a2-416dw7` 或之後的 `main`）、正式網址 | 推到哪個分支才會上線；Redirect URLs、Webhook 要填的網址 |
| 推播觸發用哪一種：後台 Integrations → Database Webhooks，還是 SQL 版 trigger（`migrations/2026-11-05-optional-webhook-trigger.sql`） | 兩種都設會多呼叫一次（不會重複推播）；出問題時要知道去哪裡查 |
| 補送排程（`optional-schedule.sql`）有沒有設 | 沒設的話，Webhook 偶爾失敗的通知要等下一次觸發才送 |
| student-app 的 `PARENT_APP_URL` 有沒有設 | 綁定單上要印家長端網址 |
| 上線當天 SQL（`2026-11-05-launch-day.sql`）有沒有跑 | 沒跑的話，舊的待送通知可能補送 |
| `vercel.json`（2026-11-07 新增，函式放東京）部署後是否生效 | 見第 4 節 |

### 2.3 已知問題

| 問題 | 原因 | 處理 |
|---|---|---|
| 瀏覽器把家長端當「不熟悉的網站」，通知被擋 | 網站剛上線，又用 `*.vercel.app` 共用網域（詐騙網站也常用），瀏覽器沒有信譽紀錄 | **換成自己的網址**（例如 `parent.codexstudy.com`），見第 5 節。測試期間可點網址列的鈴鐺或鎖頭圖示改成「允許」 |
| Supabase 內建寄信 | 每小時只能寄幾封，而且依 Supabase 目前規定只寄給專案成員的信箱 | 測試用 Google 登入或專案成員信箱；正式上線前設 SMTP |

---

## 3. 程式地圖

| 路徑 | 用途 |
|---|---|
| `app/page.tsx` | 首頁：今天到班主卡（含最新老師訊息）、段考準備進度、最近測驗；多個小孩用分段切換；沒綁定時導到 `/bind` |
| `app/messages/page.tsx`、`app/messages/[studentId]/page.tsx` | 訊息列表、對話（給老師／給主任） |
| `app/attendance/page.tsx` | 到班紀錄（最近 60 天、本月統計）；到班推播點開到這頁 |
| `app/me/page.tsx` | 我的：顯示名稱、通知開關、這台裝置推播、解除綁定、登出 |
| `app/bind`、`app/login`、`app/auth/callback` | 綁定、登入（Email 登入碼或 Google）、登入回呼 |
| `app/api/children` | 轉呼叫 student-app `GET /api/guardian/children`（帶家長 token），加上未讀數 |
| `app/api/threads`、`app/api/threads/[studentId]` | 訊息列表、讀對話（標已讀）、家長傳訊息 |
| `app/api/attendance/[studentId]` | 到班紀錄 |
| `app/api/bind`、`app/api/me`、`app/api/push`、`app/api/children/[studentId]` | 綁定碼、個人資料與偏好、推播訂閱、解除綁定 |
| `app/api/jobs/notify` | 推播 worker（Webhook／排程呼叫，header `x-notify-secret`） |
| `lib/server/*` | 伺服器端邏輯（service role；每支與學生有關的 API 都用 `requireLink` 檢查綁定） |
| `lib/binding.ts` | 綁定碼正規化與雜湊（**與 student-app 共用規格**） |
| `lib/notify-text.ts` | 推播文字、過期判斷 |
| `lib/display.ts`、`lib/attendance.ts` | 台灣時間用字、到班統計（純函式，有單元測試） |
| `components/AppShell.tsx` | 外殼：手機頂部列＋底部四格分頁，≥1180px 左側欄 |
| `components/PushBanner.tsx`、`lib/client/push.ts` | 開啟通知（失敗時會顯示原因） |
| `public/sw.js` | service worker：顯示推播、點通知開頁面 |
| `app/codex-v2.css` | student-app `docs/v2-ui-kit/codex-v2.css` **原檔複製，不要改** |
| `app/app.css` | 家長端自己的樣式（只用 kit 的 token） |
| `migrations/` | 家長端 SQL（見 DEPLOY.md） |
| `tests/` | `unit`（純函式）、`integration`（直接呼叫 route handler，接記憶體版假 Supabase） |
| `vercel.json` | 函式區域東京 `hnd1`（與 Supabase 同區） |

---

## 4. 這次交接前的最後一個改動（2026-11-07）

新增 `vercel.json`（`regions: ["hnd1"]`），跟 student-app commit `ea75172` 一樣。
原因：student-app 實測 Vercel 預設把函式放在美國（iad1），資料庫在東京，每查一次資料庫要跨太平洋 0.2～0.3 秒。家長端的推播 worker 一筆通知要查 5～8 次、首頁要查十幾次，放東京會快很多。
**部署後請確認**：Vercel 專案 → 最新一筆 Deployment → Functions（或 Settings → Functions → Function Region）顯示 Tokyo / hnd1。

---

## 5. 下一步（照優先順序）

| # | 事項 | 誰 | 說明 |
|---|---|---|---|
| 1 | 確認第 2.2 節的不確定項目 | 使用者 | 更新本文件 |
| 2 | 換成自己的網址（例如 `parent.codexstudy.com`） | 使用者 | Vercel → Settings → Domains 加網域，再到網域註冊商加 DNS。改完同步改：Supabase Redirect URLs（加 `https://<新網址>/**`）、Webhook 網址（或重跑 SQL 版 trigger）、補送排程網址、student-app `PARENT_APP_URL`、`docs/SYNC.md` 第 6 節。**家長要用新網址重新開一次通知**（舊網址的訂閱不會帶過去） |
| 3 | 設 SMTP | 使用者 | Supabase → Authentication → SMTP Settings（例如 Resend），需要用自己的網域寄信 |
| 4 | 決定正式分支 | 使用者／開發 | 建議把 `ccr-529ce6a2-416dw7` 合併成 `main`，Vercel 正式站跟 `main`（跟 student-app 一樣） |
| 5 | 正式開放前跑 `migrations/2026-11-05-launch-day.sql` | 使用者 | 避免家長一綁定就收到舊通知 |
| 6 | 照 DEPLOY.md 第 4 節完整驗收一次 | 使用者 | 綁定 → 到班推播 → 老師訊息 → 家長回覆 → student-app 收件匣看得到 |
| 7 | （之後）LINE 通知、即時更新、附件、教職員收到家長訊息的推播 | 開發 | 見 README「已知限制」；教職員推播要 student-app 配合（SYNC.md 待辦 #4） |

---

## 6. 排查紀錄（之前真的發生過的問題）

| 症狀 | 原因 | 解法 |
|---|---|---|
| 按 Google 登入後跳到 codexstudy.com | Supabase Redirect URLs 沒有家長端網址，Supabase 就送回 Site URL（student-app） | Authentication → URL Configuration → Redirect URLs 加 `https://<家長端網址>/**`（要跟網址列完全一樣；**不要改 Site URL**）。2026-11-06 起程式跳回時不帶參數，只填 `/auth/callback` 也能比對 |
| 綁定了但收不到通知，`guardian_push_subscriptions` 是 0 筆 | 綁定和開啟通知是兩件事，這台裝置還沒成功開通知 | 先開 `https://<網址>/api/push` 看 `enabled` 是否為 true（false＝VAPID 金鑰沒設或沒重新部署）；iPhone 要「加入主畫面」後從圖示打開；再按首頁「開啟通知」 |
| 「開啟通知」按了卡片就消失 | 舊版失敗時不顯示原因 | 2026-11-06 已修，現在會顯示失敗原因 |
| 後台 Database 底下找不到 Webhooks | Supabase 後台改版，移到左側主選單 **Integrations → Database Webhooks** | 或改用 SQL 版：先開 `pg_net`，再執行 `optional-webhook-trigger.sql`（要先換掉網址和密鑰） |
| SQL 版 trigger 設了但沒推播 | `pg_net` 沒開或網址、密鑰沒換掉；這個 trigger 失敗時故意不報錯（避免影響 student-app） | 看 `notification_jobs` 最新一筆是不是一直 `pending`；手動呼叫 worker 見下方 |
| build 出來的頁面報 `supabaseUrl is required` | `NEXT_PUBLIC_*` 是 build 時寫進前端的，build 時沒設 | Vercel 設好後重新部署；本機測試要帶這兩個值 build |

**通知不見時的檢查順序**：
1. SQL：`select kind, status, attempts, last_error, created_at from notification_jobs order by created_at desc limit 5;`
   - 沒有新的一筆：student-app 沒產生（例如學生已在班上，再按上課會被略過）
   - `pending`：家長端沒被叫醒 → Webhook／trigger
   - `skipped`：看 `last_error`（`no push subscriptions`、`no active guardians`、`guardians opted out`、`stale`）
   - `failed`：看 `last_error`
   - `sent`：問題在手機（通知權限、勿擾模式、瀏覽器擋陌生網站）
2. 手動呼叫 worker（PowerShell）：
   `Invoke-RestMethod -Method Post -Uri "https://<網址>/api/jobs/notify" -Headers @{ "x-notify-secret" = "<密鑰>" }`
   → 回 `ok`＝家長端沒問題、是觸發沒接好；`unauthorized`＝密鑰不對；「推播尚未設定」＝VAPID 沒設。

---

## 7. 開發時要記得

- **改到共用的東西**（共用表、`/api/guardian/children` 欄位、通知 payload、綁定碼、訊息權限、Supabase Auth 設定、UI kit）：先讀 `docs/SYNC.md` 第 0 節，只做向下相容的變更，改完更新 SYNC.md 並記變更紀錄。student-app 那邊也會照這份文件改。
- **Supabase Auth 是兩邊共用的**：不要改 Site URL、不要開強制 MFA 或改密碼規則（學生是合成 email 帳號）。
- 新 API 用 `zod` 驗證、加整合測試；推送前跑 `npx tsc --noEmit`、`npm run lint`、`npm test`。
- 介面照 `docs/v2-ui-kit`（student-app）：`app/codex-v2.css` 不要改；student-app 更新 kit 時重新複製。
- 家長看到的文字要白話，不顯示熟練度內部數字、老師 email。
- 金鑰和密鑰（Supabase service role、pepper、VAPID 私鑰、webhook 密鑰）只放 Vercel 環境變數，不要寫進 repo 或貼到對話。

---

## 8. 文件索引

| 文件 | 內容 |
|---|---|
| `HANDOFF.md`（本文件） | 目前狀態、下一步、排查紀錄 |
| `docs/SYNC.md` | 與 student-app 的合約：共用表讀寫、API 欄位、通知格式、綁定碼、權限、Auth、待辦、變更紀錄 |
| `docs/DEPLOY.md` | 部署設定步驟、環境變數、Supabase 設定、驗收 |
| `README.md` | 功能、目錄、開發指令、推播規則、已知限制 |
| `CLAUDE.md` | 開發規則（給 Claude 工作階段） |
| student-app `docs/parent-app-handoff.md` | 2026-11-04 的起始規格（之後以 SYNC.md 為準） |
| student-app `docs/v2-ui-kit/` | 介面樣式來源 |
