-- ════════════════════════════════════════════════════════════════════════════
-- （替代方案）用 SQL 設定「有新通知就叫家長端送推播」。
-- 跟後台 Integrations → Database Webhooks 做的事一樣，二選一就好（兩個都設不會重複推播，
-- 因為 worker 用 claim 取件，但會多打一次 API）。
--
-- 需要：Database → Extensions 開啟 pg_net。
-- 執行前把兩個值換掉（不要 commit 換好的版本）：
--   <PARENT_APP_URL>          例：https://parent-app-xxxx.vercel.app（Vercel 正式網址，結尾不要斜線）
--   <NOTIFY_WEBHOOK_SECRET>   與家長端 Vercel 環境變數同值
--
-- 安全設計：
--   - FOR EACH STATEMENT：老師群發 30 位學生也只打 1 次 API（worker 一次取多筆）
--   - pg_net 是非同步，不會拖慢老師按「上課」
--   - 任何錯誤（pg_net 沒開、網址錯）都吞掉，絕不讓 student-app 寫入 notification_jobs 失敗；
--     沒送出的通知留在 pending，由補送排程或下一次觸發處理
-- 取消：DROP TRIGGER IF EXISTS parent_app_notify ON notification_jobs;
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.parent_app_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url     := '<PARENT_APP_URL>/api/jobs/notify',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', '<NOTIFY_WEBHOOK_SECRET>'),
      body    := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'parent_app_notify: %', SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.parent_app_notify() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS parent_app_notify ON notification_jobs;
CREATE TRIGGER parent_app_notify AFTER INSERT ON notification_jobs
  FOR EACH STATEMENT EXECUTE FUNCTION public.parent_app_notify();
