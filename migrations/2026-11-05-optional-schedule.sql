-- ════════════════════════════════════════════════════════════════════════════
-- （選用）補送排程：每 5 分鐘呼叫家長端 /api/jobs/notify，處理 pending／failed。
-- 主要觸發是 Database Webhook（README「推播設定」），這個只是補漏。
-- 需要 Supabase 的 pg_cron 與 pg_net 擴充（Database → Extensions 開啟）。
--
-- 執行前把兩個值換掉（不要把密鑰 commit 進 repo）：
--   <PARENT_APP_URL>          例：https://parent.codexstudy.com
--   <NOTIFY_WEBHOOK_SECRET>   與家長端 Vercel 環境變數同值
-- ════════════════════════════════════════════════════════════════════════════
SELECT cron.schedule(
  'parent-app-notify-retry',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := '<PARENT_APP_URL>/api/jobs/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', '<NOTIFY_WEBHOOK_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
-- 取消：SELECT cron.unschedule('parent-app-notify-retry');
