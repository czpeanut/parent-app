# CLAUDE.md — CODEX STUDY 家長端

與 czpeanut/student-app **共用同一個 Supabase**。規格：student-app `docs/parent-app-handoff.md`；本專案說明見 `README.md`。

## 原則
- **不要修改 student-app 的表結構**。家長端自己的表放在 `migrations/`；要動共用表只能做向下相容的變更（例如新增可為 NULL 的欄位），並寫進 `docs/student-app-requests.md`。
- 所有資料存取都在伺服器端（`lib/server/*`，service role）。每個與學生有關的 API 都要檢查 `student_guardians.status = 'active'`（`requireLink`）。前端 Supabase client 只用來登入。
- 不要對家長回傳：`sender_staff_email`、熟練度引擎內部數字、教師評估等級。訊息欄位一律經 `toGuardianMessage` 挑選。
- 學生帳號（`@student.local`）不能當家長（`getAuthedUser`）。
- 綁定碼規格（`lib/binding.ts`）與 student-app 共用，改了兩邊都要改。
- 時間：資料庫 UTC，顯示一律 `Asia/Taipei`。
- 文字用繁體中文（台灣用語），寫家長看得懂的話。
- 介面照 student-app `docs/v2-ui-kit/`：`app/codex-v2.css` 是原檔複製，不要改；新樣式放 `app/app.css` 且只用 kit 的 token（一個畫面一張青綠主卡、狀態只用五種膠囊）。不用 Tailwind。

## 指令
- `npm test`：Vitest（`tests/unit` 純函式、`tests/integration` 直接呼叫 route handler，連到 `tests/helpers/fake-supabase.mjs` 記憶體版假 Supabase）。新 API 要加整合測試。
- `npx tsc --noEmit`、`npm run lint`（Vercel build 會跑 ESLint，未使用的 import 會讓部署失敗）。
- `npm run build` 沒有環境變數也能完成，但 `NEXT_PUBLIC_*`（Supabase URL／anon key）是 **build 時寫進前端**的：沒設就 build 出來的頁面會報 `supabaseUrl is required`，無法登入。本機跑起來測試要帶這兩個值 build；Vercel 改了這兩個值要重新部署。
- API 輸入一律用 `zod` 驗證；Next 15 route handler 的 `params` 是 Promise。
