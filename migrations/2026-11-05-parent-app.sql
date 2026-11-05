-- ════════════════════════════════════════════════════════════════════════════
-- 2026-11-05  家長端第一版：推播訂閱、通知偏好、綁定限流、送達紀錄、取件函式
-- ★ 對 student-app 表的唯一變動：notification_jobs 加一個可為 NULL 的 claimed_at 欄位（見第 5 節）
--
-- ★ 前提：student-app 的 migrations 已執行（2026-11-03-phase1-*、2026-11-04-phase2-*、
--   2026-11-04-phase3-messages-practice.sql）。
-- ★ 新增家長端自己的表與一個函式；可重複執行。
-- ★ 新表一樣開 RLS、不給 policy：只有家長端伺服器（service role）能讀寫。
-- 回復：本檔最後有註解掉的 DROP 區塊。
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Web Push 訂閱（一位家長可有多台裝置）──────────────────────────────────
CREATE TABLE IF NOT EXISTS guardian_push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id   UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  keys          JSONB NOT NULL,                 -- { p256dh, auth }
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gps_guardian ON guardian_push_subscriptions(guardian_id);

-- ── 2. 通知偏好（沒有資料列＝全部開啟）────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardian_notification_prefs (
  guardian_id   UUID PRIMARY KEY REFERENCES guardians(id) ON DELETE CASCADE,
  attendance    BOOLEAN NOT NULL DEFAULT true,  -- 上課／下課
  messages      BOOLEAN NOT NULL DEFAULT true,  -- 老師／主任訊息
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 3. 綁定碼嘗試紀錄（限流：同帳號／同 IP 每小時 10 次）─────────────────────
CREATE TABLE IF NOT EXISTS guardian_bind_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  ip          TEXT,
  success     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gba_user ON guardian_bind_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gba_ip   ON guardian_bind_attempts(ip, created_at DESC);

-- ── 4. 送達紀錄：一筆 job 重試時，已送過的裝置不重送 ─────────────────────────
CREATE TABLE IF NOT EXISTS notification_deliveries (
  job_id           UUID NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
  subscription_id  UUID NOT NULL REFERENCES guardian_push_subscriptions(id) ON DELETE CASCADE,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, subscription_id)
);

ALTER TABLE guardian_push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_notification_prefs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_bind_attempts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries      ENABLE ROW LEVEL SECURITY;

-- ── 5. 推播 worker 取件（交接文件 7.2；FOR UPDATE SKIP LOCKED 防重複）─────────────
-- 與交接文件的差異：「卡住的 processing」改用取件時間 claimed_at 判斷，而不是 created_at。
-- 原本用 created_at 時，超過 10 分鐘的舊 job（例如重試中的 failed）剛被取走，
-- 另一個 worker（webhook 與排程同時跑）馬上又能取走同一筆 → 家長收到兩次。
-- claimed_at 是新增的可為 NULL 欄位，student-app 只 INSERT、不會受影響。
ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_notification_jobs(n int DEFAULT 20)
RETURNS SETOF notification_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notification_jobs SET status = 'processing', attempts = attempts + 1, claimed_at = now()
  WHERE id IN (
    SELECT id FROM notification_jobs
    WHERE (status IN ('pending', 'failed') AND attempts < 5)
       OR (status = 'processing' AND attempts < 5
           AND COALESCE(claimed_at, created_at) < now() - interval '10 minutes')
    ORDER BY created_at LIMIT n FOR UPDATE SKIP LOCKED
  )
  RETURNING *
$$;
REVOKE ALL ON FUNCTION public.claim_notification_jobs(int) FROM public, anon, authenticated;

-- ── 回復（需要時手動執行）──────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.claim_notification_jobs(int);
-- ALTER TABLE notification_jobs DROP COLUMN IF EXISTS claimed_at;
-- DROP TABLE IF EXISTS notification_deliveries, guardian_bind_attempts,
--   guardian_notification_prefs, guardian_push_subscriptions;
