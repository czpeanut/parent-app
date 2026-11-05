# 家長端部署交接（目前狀態與上線清單）

> 寫於 2026-11-05。給使用者、parent-app 與 student-app 的開發者（或 Claude 工作階段）。
> 共用合約在 [`docs/SYNC.md`](SYNC.md)；這份只講「部署到哪了、還差什麼、照什麼順序做」。

---

## 1. 目前狀態

| 項目 | 狀態 |
|---|---|
| student-app 產生綁定碼（`POST /api/guardian-codes`） | ✅ 已上線 codexstudy.com（commit `ba8fc22`） |
| student-app Vercel 的 `GUARDIAN_CODE_PEPPER` | ⏳ 使用者設定（沒設時老師按「綁定碼」會看到「家長綁定尚未設定」） |
| **parent-app Vercel 專案** | ❌ **還沒有**。repo 沒有 `main` 分支，程式在 `ccr-529ce6a2-416dw7` 分支 |
| parent-app 的 migration（`migrations/2026-11-05-parent-app.sql`） | ⏳ 未執行 |
| 兩邊的雜湊算法 | ✅ 已核對一致（同字元集、大寫碼、`sha256(碼 + pepper)` 小寫 hex；兩邊單元測試同一組已知答案） |

結論：**student-app 現在就可以產生綁定碼，但家長還沒有地方輸入**（家長端沒部署）。

---

## 2. `GUARDIAN_CODE_PEPPER`：家長端還沒有 Vercel，現在怎麼設？

這是**兩個專案共用的一個密鑰**，只要兩邊最後設成同一個值就好，不需要等家長端存在才產生。

1. **現在產生一次**（任選一種，只用英數字，避免複製時夾帶看不見的字元）：
   ```bash
   openssl rand -hex 32
   # 或
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **設到 student-app 的 Vercel**：Settings → Environment Variables → `GUARDIAN_CODE_PEPPER`（Production，要的話 Preview 也設）→ 重新部署（Deployments → 最新一筆 → Redeploy）。
3. **把這個值存在你自己的密碼管理器**（不要貼到對話、GitHub issue 或 repo）。
4. **之後建立家長端 Vercel 專案時，貼同一個值**（第 3 節步驟 2）。

注意：
- **設了之後不要再換**。換了以後，所有還沒用掉的綁定碼都會失效，老師要重新產生。
- **家長端上線前，先不要發綁定碼給真的家長**：綁定碼 7 天就過期，家長端沒上線，家長拿到也沒地方輸入。可以先產生一組自己測試。
- 兩邊都會去掉值前後的空白，但不會處理中間的空白或其他字元，所以用上面的英數字產生方式最安全。

---

## 3. 建立家長端 Vercel 專案（照順序）

### 步驟 1：決定正式分支
Vercel 預設把 `main` 當正式站。建議先把 `ccr-529ce6a2-416dw7` 合併成 `main`（開 PR 合併，跟 student-app 一樣「推 `main` 就上線」）。
也可以先不合併、直接部署這個分支當預覽網址測試。

### 步驟 2：建專案＋環境變數（**先設環境變數再部署**）
Vercel → Add New → Project → 匯入 `czpeanut/parent-app`（框架自動認成 Next.js，其他不用改）。部署前在 Environment Variables 填：

| 變數 | 值從哪來 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 跟 student-app 同值（student-app Vercel 的環境變數頁複製） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 跟 student-app 同值 |
| `SUPABASE_SERVICE_ROLE_KEY` | 跟 student-app 同值 |
| `GUARDIAN_CODE_PEPPER` | **第 2 節存下來的那個值** |
| `STUDENT_APP_URL` | `https://codexstudy.com`（不設也是這個預設值） |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | 在 parent-app 資料夾執行 `npm run vapid` 產生（一次就好，之後不要換，換了家長要重新開通知） |
| `VAPID_SUBJECT` | `mailto:` 加你的聯絡信箱 |
| `NOTIFY_WEBHOOK_SECRET` | 自己產生一段長隨機字串（同第 2 節的指令），步驟 4 也會用到 |

`NEXT_PUBLIC_*` 是 build 時寫進前端的：漏設就部署，登入頁會出現 `supabaseUrl is required`；補設後要重新部署。

### 步驟 3：資料庫（Supabase → SQL Editor）
執行 `migrations/2026-11-05-parent-app.sql`（家長端自己的 4 張表、推播取件函式、`notification_jobs.claimed_at` 欄位）。可重複執行。

### 步驟 4：Supabase 設定（共用，**不要改 Site URL**）
1. Authentication → URL Configuration → Redirect URLs：加 `https://<家長端網址>/auth/callback`。
2. Authentication → Email Templates → Magic Link：內文加上 `{{ .Token }}`（例如「您的登入碼：{{ .Token }}」）。
3. Authentication → SMTP Settings：設自己的寄信服務（內建每小時只能寄很少封，家長一多就收不到登入碼）。
4. Database → Webhooks → 新增：表 `notification_jobs`、事件 Insert、HTTP POST `https://<家長端網址>/api/jobs/notify`、Header `x-notify-secret: <NOTIFY_WEBHOOK_SECRET>`。
5. （建議）補送排程：開啟 `pg_cron`、`pg_net`，執行 `migrations/2026-11-05-optional-schedule.sql`（先把裡面的網址和密鑰換掉）。

### 步驟 5：上線當天
開始推播前執行一次 `migrations/2026-11-05-launch-day.sql`（把上線前積壓的到班通知標成略過，家長不會一次收到好幾天前的通知）。

### 步驟 6：回填網址
- student-app Vercel 設 `PARENT_APP_URL=https://<家長端網址>` 並重新部署（綁定單會印出網址）。
- 更新 `docs/SYNC.md` 第 6 節「網址」和第 8 節變更紀錄。

---

## 4. 上線驗收（用一組真的綁定碼走一次）

1. 老師帳號登入 codexstudy.com → 班級學生 → 某位學生「綁定碼」→ 記下 `ABCD-EFGH`。
2. 手機打開家長端網址 → 用 Email 登入碼登入（確認收得到信、信裡有 6 位數）。
3. 輸入綁定碼 → 看到「已綁定 ○○○」→ 首頁出現這位學生。
   - 如果出現「綁定碼錯誤或已過期」：最常見是兩邊 `GUARDIAN_CODE_PEPPER` 不一樣，或改完沒重新部署。
4. 開啟通知（iPhone 要先「加入主畫面」再從主畫面打開）。
5. 老師在 student-app 按這位學生「上課」→ 幾秒內手機收到「已到班」→ 點開到「到班紀錄」。
6. 老師傳一則訊息給家長 → 手機收到 → 家長在 App 回覆「給老師」→ student-app 收件匣看得到。
7. 確認 Supabase `notification_jobs` 剛才那幾筆是 `sent`。

---

## 5. 誰要做什麼（總表）

| # | 誰 | 事項 | 什麼時候 |
|---|---|---|---|
| 1 | 使用者 | 產生 `GUARDIAN_CODE_PEPPER`，設到 student-app Vercel，值自己保存 | **現在** |
| 2 | 使用者／parent-app | 把開發分支合併成 `main`（可請 parent-app 工作階段開 PR） | 建 Vercel 專案前 |
| 3 | 使用者 | 建 parent-app Vercel 專案＋環境變數（第 3 節步驟 2） | 合併後 |
| 4 | 使用者 | 執行 migration、Supabase 設定（步驟 3、4） | 部署後 |
| 5 | 使用者 | 上線當天 SQL、student-app 設 `PARENT_APP_URL` | 正式開放給家長前 |
| 6 | 使用者 | 驗收（第 4 節） | 正式開放給家長前 |
| 7 | parent-app | 部署後更新 `docs/SYNC.md` 網址與變更紀錄、本文件第 1 節狀態 | 部署後 |
