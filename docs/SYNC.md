# student-app ⇄ parent-app 同步文件

> **兩邊的開發者（或 Claude 工作階段）動到下面任何一項之前，先讀這份文件；改完要更新這份文件。**
> 這是兩個專案之間**唯一**的合約來源。student-app 的 `docs/parent-app-handoff.md` 是 2026-11-04 的起始規格，之後的變動以這份為準。
>
> - 位置：`czpeanut/parent-app` 的 `docs/SYNC.md`
> - 兩個專案共用同一個 Supabase（同一組資料表、同一個 Auth）
> - 最後更新：2026-11-05（parent-app）

---

## 0. 改東西之前的流程

1. 先看第 1 節的「待辦」和第 8 節的「變更紀錄」，確認對方最近改了什麼。
2. 要改的東西如果在第 2～7 節（共用表、API 回應、通知格式、綁定碼、權限規則、Auth、UI kit），先確認**對方會不會壞掉**：
   - 只能做**向下相容**的變更：新增欄位（可為 NULL 或有預設值）、API 回應新增欄位、新增通知 kind。
   - **不可以**直接做：刪除或改名欄位、改欄位型別、改 CHECK 允許值、拿掉 API 回應欄位、改綁定碼雜湊方式、改 payload 既有欄位的意思。這類變更要先在第 1 節寫「待辦」，等對方確認並更新程式後再改。
3. 改完：更新本文件對應的小節，並在第 8 節加一行變更紀錄（日期、哪一邊、改了什麼、對方要不要做事）。
4. 對方需要配合的事寫進第 1 節「待辦」，完成後移到第 8 節。

各自專案內部的東西（只有自己用的表、頁面、內部函式）不用寫在這裡。

---

## 1. 待辦（需要對方配合）

| # | 誰要做 | 事項 | 狀態 |
|---|---|---|---|
| 1 | **student-app** | 老師／主任產生家長綁定碼（規格見第 5 節）。**沒有這個，家長無法綁定，家長端整個不能用** | ⏳ 未開始（2026-11-05 確認 student-app 尚無 `/api/guardian-codes`） |
| 2 | 使用者 | 在兩邊 Vercel 設**同一個** `GUARDIAN_CODE_PEPPER` | ⏳ |
| 3 | 使用者 | 執行 parent-app `migrations/2026-11-05-parent-app.sql`（含 `notification_jobs.claimed_at`，第 2.3 節） | ⏳ |
| 4 | student-app（選用） | 家長傳訊息時通知教職員（目前老師要打開系統才看得到）。可新增 `notification_jobs` kind，例如 `staff.message.new`；家長端遇到不認得的 kind 會標成 `skipped`，不會誤送給家長 | 💡 之後再說 |
| 5 | student-app（選用） | 綁定單／「家長 N」旁放家長端網址（家長端部署後填入第 6 節） | 💡 |

---

## 2. 共用資料表：誰讀、誰寫

建表的 migration 都在 student-app（`migrations/2026-11-03-phase1-mastery-attendance.sql`、`2026-11-04-phase3-messages-practice.sql`），parent-app 只在 `migrations/` 加**自己的表**和向下相容的欄位。
所有表 RLS 開啟、沒有 policy，兩邊都用 service role 在伺服器端存取。

### 2.1 parent-app 會碰的 student-app 表

| 表 | student-app | parent-app 讀的欄位 | parent-app 寫的欄位 |
|---|---|---|---|
| `students` | 寫 | `id`, `display_name` | — |
| `classes` | 寫 | `id`, `name`（到班紀錄顯示班名） | — |
| `attendance_events` | 寫（按上課／下課） | `student_id`, `event_type`, `event_time`, `class_id` | — |
| `guardians` | 讀（算人數、顯示） | `id`, `user_id`, `display_name`, `phone`, `email` | INSERT（`user_id`, `email`, `display_name`）；UPDATE `display_name`, `phone` |
| `student_guardians` | 讀（`status = 'active'` 才算綁定） | `student_id`, `guardian_id`, `relationship`, `status` | UPSERT on `(student_id, guardian_id)`：`status='active'`, `verified_at`, `relationship`；解除綁定 UPDATE `status='revoked'`（不刪） |
| `guardian_binding_codes` | **INSERT（待辦 #1）**、作廢舊碼 | `id`, `student_id`, `code_hash`, `expires_at`, `used_at`, `attempts` | UPDATE `attempts`, `used_at`, `used_by` |
| `message_threads` | 寫 | `id`, `student_id` | UPSERT on `student_id`；UPDATE `last_message_at` |
| `messages` | 寫（`sender_type='staff'`, `recipient='guardians'`） | `id`, `thread_id`, `sender_type`, `sender_name`, `sender_guardian_id`, `recipient`, `body`, `created_at`（**不讀也不回傳 `sender_staff_email`**） | INSERT：`sender_type='guardian'`, `sender_guardian_id`, `sender_name`, `recipient` ∈ `teacher`/`director`, `body`（1–2000 字，去頭尾空白） |
| `message_reads` | 寫（`reader_type='staff'`, `reader_key`=email） | `reader_type='guardian'` 的列 | UPSERT `(thread_id, 'guardian', <guardians.id>, last_read_at)` |
| `notification_jobs` | INSERT（第 4 節） | 全部（經 `claim_notification_jobs`） | UPDATE `status`, `attempts`, `claimed_at`, `processed_at`, `last_error` |

家長傳的訊息 `sender_name`：家長在「我的」設定的名字；沒設就是「<學生名>的<關係>」或「<學生名>的家長」，最多 40 字。

### 2.2 parent-app 自己的表（student-app 不要碰）
`guardian_push_subscriptions`、`guardian_notification_prefs`、`guardian_bind_attempts`、`notification_deliveries`（parent-app `migrations/2026-11-05-parent-app.sql`）。
`guardians` 被刪除時這些表會 CASCADE；`notification_jobs` 被刪除時 `notification_deliveries` 也會 CASCADE。

### 2.3 parent-app 對共用表做過的變更
| 日期 | 變更 | 對 student-app 的影響 |
|---|---|---|
| 2026-11-05 | `notification_jobs` 新增 `claimed_at TIMESTAMPTZ`（可為 NULL） | 無。student-app 只 INSERT、不指定這個欄位。若有 `SELECT *` 比對欄位的測試，要把它算進去 |
| 2026-11-05 | 新增函式 `public.claim_notification_jobs(n int)`（只給 service role） | 無 |

`claimed_at` 的原因：交接文件 7.2 的取件函式用 `created_at` 判斷「卡住」，超過 10 分鐘的舊工作被取走後，另一個 worker 會馬上再取一次，家長收到兩次推播（PGlite 實測重現）。

---

## 3. student-app 提供的 API：`GET /api/guardian/children`

parent-app 的伺服器帶**家長自己的** Supabase access token 呼叫（`Authorization: Bearer <token>`，server-to-server），網址由 parent-app 環境變數 `STUDENT_APP_URL` 設定（預設 `https://codexstudy.com`）。

parent-app **實際用到**的欄位（student-app 不要拿掉或改意思；可以新增欄位）：

```jsonc
{
  "date": "2026-11-04",
  "children": [{
    "student": { "id": "uuid", "display_name": "陳二號" },
    "relationship": "母親",                          // 可為 null
    "attendance_today": {
      "status": "none | in | out",                    // 以今天（台灣時間）最後一筆為準
      "events": [{ "event_type": "check_in | check_out", "event_time": "ISO" }]   // 舊到新
    },
    "readiness": [{                                   // 沒有題庫或沒設範圍 → []
      "scope": { "title": "...", "subject": "數學", "exam_date": "YYYY-MM-DD | null" },
      "days_left": 16,                                // 可為 null
      "readiness": 58,                                // 0–100 整數
      "mastered": 3, "total": 8,
      "weakest": [{ "name": "乘法公式展開", "progress": 40 }]   // 0–100，最多 3 個
    }],
    "recent_assessments": [{ "title": "...", "kind": "exam | quiz | homework", "exam_date": "YYYY-MM-DD | null", "rate": 85.0 }]
  }]
}
```

- 回 401 → parent-app 請家長重新登入；其他非 2xx → 顯示「暫時讀不到」。
- 家長端用 `subject === '數學'` 決定顯示「題型」或「單元」。
- 準備進度分級（兩邊用字要一樣）：≥ 80「準備好了」、50–79「進行中」、< 50「要加緊」。測驗得分率用同一組門檻上色。
- 不要在這支 API 加入熟練度引擎內部數字（BKT、穩定度、證據權重）或教師評估等級——家長端不能顯示這些。

parent-app 自己另外有 `/api/threads`、`/api/attendance/[studentId]` 直接讀共用表（第 2.1 節），不需要 student-app 提供。

---

## 4. 通知佇列 `notification_jobs`

student-app 寫入（`status='pending'`），parent-app 推播 worker 處理。**一筆 job ＝ 一位學生**，送給該學生所有 active 家長的所有訂閱裝置。

| kind | 誰產生 | payload（parent-app 用到的欄位） | 推播內容 | 點開到 |
|---|---|---|---|---|
| `attendance.check_in` | student-app `POST /api/attendance` | `student_name`, `class_name`, `branch_name`, `event_time`（ISO） | 「【CODEX STUDY】陳一號 已於 18:02 到達 分校（班級）」 | `/attendance?child=<student_id>` |
| `attendance.check_out` | 同上 | 同上 | 「……已於 21:05 下課離開」 | 同上 |
| `message.new` | student-app `POST /api/messages`（群發每位學生一筆） | `student_name`, `sender_name`, `preview`（前 80 字）；另有 `thread_id`, `message_id` 目前沒用到 | 「陳老師：本週六停課一次…」 | `/messages/<student_id>` |

規則：
- 欄位缺了不會壞（有預設文字），但請不要改既有欄位的意思。
- **新增 kind**：先寫進這張表。parent-app 還沒支援的 kind 會被標成 `skipped`（`last_error = 'unknown kind …'`）。
- 狀態：`sent`（全部裝置送出）、`failed`（有裝置暫時失敗，會重試，`attempts` 到 5 停）、`skipped`（沒有 active 家長、家長關閉該類通知、沒有裝置、kind 不認得、到班通知超過 12 小時、訊息超過 7 天）。
- 觸發：Supabase Database Webhook（`notification_jobs` INSERT → parent-app `POST /api/jobs/notify`，header `x-notify-secret`），加 pg_cron 每 5 分鐘補送。student-app 不用做任何事。
- 家長端上線當天執行一次 parent-app `migrations/2026-11-05-launch-day.sql`（積壓的舊通知標 `skipped`）。

---

## 5. 綁定碼（待辦 #1 的規格）

**兩邊必須完全一致。** parent-app 實作在 `lib/binding.ts`、`lib/server/bind.ts`。

| 項目 | 規格 |
|---|---|
| 產生者 | student-app `POST /api/guardian-codes`（老師限自己班、主任限自己分校），body `{ student_id }`（建議也支援 `{ class_id }` 整班產生、列印綁定單） |
| 長度／字元 | 8 碼，`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（排除 0/O/1/I），用 `crypto.randomInt` |
| 顯示 | 可印成 `ABCD-EFGH`；家長輸入時忽略大小寫、空白、連字號 |
| 雜湊 | `code_hash = sha256(8 碼大寫明碼 + GUARDIAN_CODE_PEPPER)`，UTF-8，**小寫 hex**。資料庫只存雜湊，明碼只在產生當下回傳一次 |
| 已知答案 | `sha256("ABCDEFGH" + "pepper")` = `ea043ebe4ed383c513dcad2dc2f53c8e6dcf1a93dd855d26fcbcd22548026090` |
| 期限 | `expires_at = now() + 7 天` |
| 一位學生一個有效碼 | 產生新碼時，舊的未使用碼作廢（`expires_at = now()` 或刪除） |
| 其他欄位 | `created_by` = 老師 email；`attempts`、`used_at`、`used_by` 由 parent-app 更新 |
| 碼撞到 | `code_hash` UNIQUE，23505 時重新產生 |
| parent-app 驗證 | 雜湊比對 → 未使用、未過期 → 條件式 UPDATE `used_at`（同時兩人用只有一人成功）→ UPSERT `student_guardians` active。錯誤一律「綁定碼錯誤或已過期」。同帳號或同 IP 每小時 10 次 |

```ts
import { createHash, randomInt } from 'node:crypto'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
const code_hash = createHash('sha256').update(code + process.env.GUARDIAN_CODE_PEPPER!, 'utf8').digest('hex')
// 顯示給老師：`${code.slice(0, 4)}-${code.slice(4)}`
```

建議 student-app e2e 檢查：老師不能幫別班學生產生（403）；產生新碼後舊碼失效；回應明碼與資料庫 `code_hash` 符合上面規格。

---

## 6. 權限、Auth、環境變數

### 訊息可見範圍（兩邊必須一樣）
| recipient | 寫的人 | 家長 | 老師 | 主任 |
|---|---|---|---|---|
| `guardians` | 老師／主任 | ✅ 該學生所有 active 家長 | ✅ | ✅ |
| `teacher` | 家長 | 只有寫的那位家長 | ✅ | ✅ |
| `director` | 家長 | 只有寫的那位家長 | ❌ | ✅ |

未讀：parent-app 算「`recipient='guardians'` 且 `created_at` > 家長的 `last_read_at`」；student-app 算「家長訊息 `created_at` > 教職員的 `last_read_at`」。

### 身份
- 家長帳號：Email 登入碼（OTP／magic link）或 Google，存在共用的 `auth.users`。parent-app 拒絕 `@student.local` 帳號當家長。
- 家長帳號打開 codexstudy.com 會被 `blocked`（student-app 既有行為，請保持）。
- 一個 Google 帳號同時是教職員又是家長：兩邊各自判斷，互不影響。

### Supabase Auth 共用設定（改之前先看這裡）
| 設定 | 值／注意 |
|---|---|
| Site URL | **不要改**（student-app 用） |
| Redirect URLs | 加了 `https://<家長端網域>/auth/callback` |
| Email Templates → Magic Link | parent-app 需要範本含 `{{ .Token }}`（家長輸入 6 位數登入碼）。student-app 不用 magic link |
| SMTP | 正式上線需設自訂 SMTP（內建每小時只能寄少量） |
| 不要開 | 強制 MFA、改密碼規則等會影響學生合成帳號的設定 |

### 共用環境變數
| 變數 | 兩邊 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` | 同值 |
| `GUARDIAN_CODE_PEPPER` | **同值**（只在伺服器端，不要加 `NEXT_PUBLIC_`） |

### 網址
| 專案 | 網址 |
|---|---|
| student-app | `https://codexstudy.com` |
| parent-app | 尚未部署（部署後填這裡） |

---

## 7. 介面：v2 UI kit

- 來源：student-app `docs/v2-ui-kit/`（`codex-v2.css`、`README.md`、`preview.html`），數值取自 student-app `app/v2/industry.css`。
- parent-app 的 `app/codex-v2.css` 是**原檔複製，不修改**；家長端自己的樣式在 `app/app.css`，只用 kit 的 token。
- **student-app 改了 `codex-v2.css`（或 kit 的用字、狀態顏色規則）**：在第 8 節記一行；parent-app 下次開發時重新複製並檢查畫面。
- 用字與顏色兩端一致：到班 未到（mute）／在班（good）／已下課（info）；準備進度 準備好了（good）／進行中（預設）／要加緊（warn）；未讀紅點 `.cx-dot`。

---

## 8. 變更紀錄（新的寫在最上面）

| 日期 | 哪邊 | 變更 | 對方要做的事 |
|---|---|---|---|
| 2026-11-05 | parent-app | 建立本文件，取代原本的 `docs/student-app-requests.md` | 改共用合約前先讀本文件 |
| 2026-11-05 | parent-app | 介面改用 v2 UI kit（`app/codex-v2.css` = student-app commit `fd9404d` 版本）；新增到班紀錄頁、訊息列表；到班推播點開改到 `/attendance` | 無 |
| 2026-11-05 | parent-app | `notification_jobs` 加 `claimed_at`、新增 `claim_notification_jobs`（第 2.3 節） | 無（知悉即可） |
| 2026-11-05 | parent-app | 第一版：登入、綁定、小孩資料、訊息、推播 | 待辦 #1 綁定碼 |
| 2026-11-05 | student-app | `docs/v2-ui-kit/`（commit `fd9404d`） | parent-app 已套用 |
| 2026-11-04 | student-app | `docs/parent-app-handoff.md`、`/api/guardian/children`、訊息三張表、`message.new` 通知（commit `ab91e79`） | parent-app 已實作 |
