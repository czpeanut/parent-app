# CODEX STUDY 家長端（parent-app）

家長用的手機網頁 App（PWA，可「加入主畫面」）。與 [student-app](https://github.com/czpeanut/student-app) **共用同一個 Supabase**：
student-app 負責「寫」上課記錄、成績、熟練度、老師訊息；家長端負責「讀」、「推播」與「家長回訊息」。
規格來源：student-app `docs/parent-app-handoff.md`（2026-11-04）。

## 第一版功能

| 功能 | 做法 |
|---|---|
| 家長登入 | Email 登入碼（OTP／登入連結）或 Google。學生帳號（`@student.local`）會被擋 |
| 綁定小孩 | 輸入老師給的 8 碼綁定碼（`POST /api/bind`），同帳號／同 IP 每小時 10 次限流 |
| ① 看小孩資料 | `/api/children` 帶家長 token 轉呼叫 student-app `GET /api/guardian/children`：今天到班狀態、段考準備進度、最近測驗，另外加上未讀訊息數 |
| ② 上課／下課通知 | 推播 worker 處理 `notification_jobs`（`attendance.check_in`／`check_out`）→ Web Push |
| ③ 收老師訊息 | 同上（`message.new`）＋ 訊息畫面 |
| ④ 傳訊息給老師或主任 | `POST /api/threads/:studentId` 寫入 `messages`（`recipient = 'teacher'`／`'director'`），student-app 收件匣看得到 |
| 到班紀錄 | 最近 60 天上課／下課（台灣時間分日）、本月／本週到班天數、平均時數；到班推播點進來就是這頁 |
| 我的 | 顯示名稱（老師看到的名字）、到班／訊息通知開關、這台裝置推播開關、解除綁定、登出 |

## 技術棧
Next.js 15（App Router）＋ React 19 ＋ TypeScript ＋ Supabase ＋ `web-push`。部署在 Vercel（另開專案，與 student-app 互不影響）。

## 介面
照 student-app 的 `docs/v2-ui-kit/`（學生端 v2「今日動態」同一套外觀）：
- `app/codex-v2.css` 是 kit 的 `codex-v2.css` **原封不動複製**過來（student-app 改了就重新複製，不要在這裡改）；家長端自己的少量樣式在 `app/app.css`，只用 kit 的 token。
- 外殼 `components/AppShell.tsx`：手機頂部列＋底部浮動四格分頁列（首頁、訊息、到班、我的），≥1180px 換左側欄。
- 五個畫面對照 kit 第 5 節：首頁 `/`、訊息 `/messages`、對話 `/messages/[studentId]`、到班紀錄 `/attendance`、綁定 `/bind`（沒有綁定時首頁直接導過去）；另有「我的」`/me`、登入 `/login`。
- 圖示是 `components/Icon.tsx` 的內嵌 SVG（與 kit 預覽相同路徑），沒有另外裝圖示套件。

## 目錄

| 路徑 | 用途 |
|---|---|
| `app/api/me` | 目前家長（第一次呼叫建立 `guardians` 列）、改名字、通知偏好 |
| `app/api/children` | 轉呼叫 student-app；`[studentId]` DELETE＝解除綁定（改 `revoked`） |
| `app/api/bind` | 綁定碼 |
| `app/api/threads` | 訊息列表：每位小孩最後一則＋未讀數 |
| `app/api/threads/[studentId]` | 讀對話串（標已讀）／家長傳訊息 |
| `app/api/attendance/[studentId]` | 到班紀錄：最近 60 天＋本月統計（`lib/attendance.ts`） |
| `app/api/push` | VAPID 公鑰、訂閱／取消訂閱這台裝置 |
| `app/api/jobs/notify` | 推播 worker（webhook／排程呼叫） |
| `lib/server/*` | 伺服器端邏輯（全部用 service role，每次都檢查 `student_guardians.status = 'active'`） |
| `lib/notify-text.ts` | 推播文字 |
| `lib/binding.ts` | 綁定碼正規化與雜湊（**與 student-app 共用的規格**） |
| `public/sw.js` | service worker：顯示推播、點通知開 App |
| `migrations/` | 家長端自己的 SQL（見下方） |
| `docs/DEPLOY.md` | **部署狀態與上線清單**（目前還沒有 Vercel 專案） |
| `docs/SYNC.md` | **與 student-app 的同步文件**（共用表、API、通知格式、綁定碼、待辦、變更紀錄）。改共用的東西前先讀 |

## 開發

```bash
npm install
cp .env.example .env.local   # 填入值（不要 commit）
npm run dev
npm test                     # 單元＋API 整合測試（記憶體版假 Supabase，不連真的資料庫）
npx tsc --noEmit && npm run lint
```

## 上線步驟（照順序）

### 1. 資料庫（Supabase SQL Editor）
1. 確認 student-app 的 `2026-11-03-phase1-*`、`2026-11-04-phase2-*`、`2026-11-04-phase3-messages-practice.sql` 都已執行。
2. 執行 `migrations/2026-11-05-parent-app.sql`：家長端自己的 4 張表、`claim_notification_jobs` 函式。
   對 student-app 表的唯一變動是 `notification_jobs` **新增一個可為 NULL 的 `claimed_at` 欄位**（修正交接文件取件函式的重複送出問題，見檔案第 5 節註解）。student-app 只 INSERT 這張表，不受影響。
3. `migrations/2026-11-05-optional-guardian-rls.sql` **第一版不用執行**（全部走伺服器 API）；之後要讓前端直接讀（Realtime）再執行。

### 2. Vercel 環境變數（新專案，值不要貼到對話或 repo）
見 `.env.example`。`NEXT_PUBLIC_*` 是 build 時寫進前端的，設定或修改後要重新部署：

| 變數 | 說明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` | 與 student-app 同值 |
| `STUDENT_APP_URL` | 預設 `https://codexstudy.com` |
| `GUARDIAN_CODE_PEPPER` | 綁定碼雜湊密鑰，**student-app 也要設同一個值** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | `npm run vapid` 產生 |
| `VAPID_SUBJECT` | `mailto:` 聯絡信箱 |
| `NOTIFY_WEBHOOK_SECRET` | 推播 worker 密鑰（自己產生一段長隨機字串） |

### 3. Supabase Auth（共用設定，小心不要動到 student-app）
- **Authentication → URL Configuration → Redirect URLs**：加入 `https://<家長端網域>/auth/callback`。**不要改 Site URL**。
- **Authentication → Providers**：Email 已開（student-app 學生帳密就是用 Email provider）；Google 已開（教職員用）。家長直接共用，不需要新增 provider。
- **Email 登入碼**：Authentication → Email Templates →「Magic Link」範本加上 `{{ .Token }}`（例如「您的登入碼：{{ .Token }}」），家長就能在 App 裡輸入 6 位數登入碼（iPhone 主畫面 App 點信件連結會跳去 Safari，用登入碼最順）。student-app 不用 magic link，改這個範本不影響它。
- **SMTP**：Supabase 內建寄信每小時只能寄很少封，正式上線請在 Authentication → SMTP Settings 設定自己的寄信服務（例如 Resend、SendGrid）。
- 手機簡訊 OTP 第一版沒做（需要 Twilio 等付費服務）。

### 4. 推播觸發
- **主要**：Supabase → Database → Webhooks → Create a new hook
  - Table：`notification_jobs`，Events：`Insert`
  - Type：HTTP Request，Method：`POST`，URL：`https://<家長端網域>/api/jobs/notify`
  - HTTP Headers：`x-notify-secret: <NOTIFY_WEBHOOK_SECRET>`
- **補送**（失敗重試、webhook 漏掉的）：開啟 `pg_cron`、`pg_net` 擴充，把 `migrations/2026-11-05-optional-schedule.sql` 裡的網址與密鑰換掉後執行（每 5 分鐘）。
  也可以用 Vercel Cron（`GET /api/jobs/notify`，header `Authorization: Bearer <CRON_SECRET>`），但免費方案一天只能跑一次。

### 5. 上線當天
**開始處理推播之前**執行一次 `migrations/2026-11-05-launch-day.sql`，把上線前積壓的舊通知標成 `skipped`。
（worker 本身也會把超過 12 小時的到班通知標成 `skipped`，雙重保險。）

### 6. student-app 那邊
綁定碼要由老師在 student-app 產生，見 [`docs/SYNC.md`](docs/SYNC.md) 第 5 節。這個做好之前家長無法綁定。

## 推播規則
- 一筆 job＝一位學生：送給所有 active 家長的每台已訂閱裝置。
- 狀態：全部送出 `sent`；有裝置暫時失敗 `failed`（下次重試，已送過的裝置記在 `notification_deliveries` 不重送；`attempts` 到 5 停）；
  沒有 active 家長、家長關閉該類通知、沒有訂閱裝置、到班通知超過 12 小時 → `skipped`（`last_error` 寫原因）。
- 裝置回 404／410（已取消訂閱）會自動刪除該訂閱。
- iPhone／iPad：iOS 16.4 以上，且要先「加入主畫面」再從主畫面開啟才能收推播；App 會提示。

## 權限規則（與 student-app 一致）

| recipient | 誰寫的 | 家長看得到 |
|---|---|---|
| `guardians` | 老師／主任 | ✅ 這位學生所有 active 家長 |
| `teacher` | 家長 | 只有寫的那位家長 |
| `director` | 家長 | 只有寫的那位家長 |

家長端不會回傳老師 email（`sender_staff_email`）、熟練度引擎內部數字或哪位老師給了幾級評估。

## 已知限制
1. 沒有 LINE 通知（LINE Notify 已於 2025-03 停止服務；改用 LINE 官方帳號 Messaging API 需要另外申請與帳號綁定流程）。
2. 訊息沒有即時更新：在對話畫面每 30 秒、回到 App 時重新讀取；推播會即時提醒。
3. 只有文字訊息（`messages` 表沒有附件欄位）。
4. 教職員收到家長訊息沒有推播（student-app 端的限制）。
