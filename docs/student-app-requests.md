# 需要 student-app 配合的項目

> 給 student-app 的開發者（或 Claude 工作階段）。家長端（czpeanut/parent-app）已完成第一版，以下是 student-app 要做的事。
> 家長端**沒有修改** student-app 的程式碼。

## 1. 【必要】老師產生家長綁定碼（交接文件 6.1）

家長端 `POST /api/bind` 已經做好，但要等 student-app 能產生綁定碼，家長才綁得了。

### API：`POST /api/guardian-codes`
- 權限：老師限自己班的學生、主任限自己分校（同 `canAccessStudent`）。
- Body：`{ student_id }`（建議也支援 `{ class_id }` 一次產生全班，用於列印綁定單）。
- 回應：`{ code: "ABCD-EFGH", expires_at }`，**明碼只回這一次**。
- 同一位學生產生新碼時，舊的未使用碼作廢（`DELETE` 或把 `expires_at` 設成 `now()`）。

### 綁定碼規格（**兩邊必須完全一致**，家長端實作在 `lib/binding.ts`）
| 項目 | 規格 |
|---|---|
| 長度 | 8 碼 |
| 字元集 | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（排除 0/O/1/I）。用 `crypto.randomInt` 產生 |
| 顯示 | 可以印成 `ABCD-EFGH`；家長輸入時大小寫、空白、連字號都會被忽略 |
| 雜湊 | `code_hash = sha256(8 碼大寫明碼（不含連字號） + GUARDIAN_CODE_PEPPER)`，**小寫 hex** |
| 期限 | `expires_at = now() + 7 天` |
| 其他欄位 | `created_by` = 老師 email；`attempts`、`used_at`、`used_by` 由家長端更新 |

驗證用的已知答案：`sha256("ABCDEFGH" + "pepper")` = `ea043ebe4ed383c513dcad2dc2f53c8e6dcf1a93dd855d26fcbcd22548026090`

```ts
import { createHash, randomInt } from 'node:crypto'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
const code_hash = createHash('sha256').update(code + process.env.GUARDIAN_CODE_PEPPER!, 'utf8').digest('hex')
// 顯示給老師：`${code.slice(0, 4)}-${code.slice(4)}`
```
`code_hash` 是 UNIQUE；撞到（23505）就重新產生一次。

### 畫面
- 放在「班級學生」卡片（`/v2/teacher/students`），「家長 N」旁邊加「產生綁定碼」。
- 可印綁定單：學生姓名、綁定碼、到期日、家長端網址（QR code）、步驟說明「打開網址 → 登入 → 綁定 → 輸入綁定碼」。

### 環境變數
- `GUARDIAN_CODE_PEPPER`：與家長端 Vercel 設**同一個值**（伺服器端密鑰，不要加 `NEXT_PUBLIC_`）。

### 建議的 e2e 檢查
- 老師不能幫別班學生產生綁定碼（403）。
- 產生新碼後，舊碼的 `expires_at <= now()`。
- 資料庫只存雜湊，回應中的明碼與 `code_hash` 符合上面的規格。

## 2. 【已處理，請知悉】`notification_jobs.claimed_at` 欄位

家長端 migration（`migrations/2026-11-05-parent-app.sql`）在 `notification_jobs` 新增一個**可為 NULL** 的 `claimed_at` 欄位，供推播 worker 判斷「卡住的工作」。
原因：交接文件 7.2 的取件函式用 `created_at` 判斷卡住，超過 10 分鐘的舊工作被取走後，另一個 worker 會立刻再取一次，造成家長收到重複推播（已在 PGlite 實測重現）。
student-app 只 INSERT 這張表、不指定這個欄位，**不需要改任何程式**。若 student-app 之後有 `SELECT *` 比對欄位的測試，記得把它算進去。

## 3. 【選用】家長傳訊息時通知教職員

目前家長傳的訊息，老師要打開 CODEX STUDY 才看得到（交接文件第 8 節）。若要推播給老師，可在 `notification_jobs` 增加教職員通道（例如 `kind = 'staff.message.new'`），由 student-app 或家長端寫入；家長端 worker 目前遇到不認得的 kind 會標成 `skipped`，不會誤送給家長。

## 4. 【選用】家長端網址
教職員端的「家長 N」或綁定單上可放家長端網址（家長端部署後告知）。
