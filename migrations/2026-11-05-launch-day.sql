-- ════════════════════════════════════════════════════════════════════════════
-- 家長端上線第一天執行一次（交接文件 7.3）：把上線前積壓的舊通知標成 skipped，
-- 避免家長一綁定就收到好幾天前的到班通知。
-- 執行時機：家長端部署完成、開始處理推播之前。只動 notification_jobs 的狀態欄位。
-- ════════════════════════════════════════════════════════════════════════════
UPDATE notification_jobs
SET status = 'skipped', processed_at = now(), last_error = 'before parent app launch'
WHERE status = 'pending' AND created_at < now() - interval '1 hour';
