-- ════════════════════════════════════════════════════════════════════════════
-- （選用）家長前端直接讀 Supabase（例如 Realtime）時才需要。第一版全部走伺服器 API，不必執行。
-- 內容與 student-app docs/parent-app-handoff.md 第 5 節相同；只有 SELECT，不影響 student-app（service role）。
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.my_guardian_student_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sg.student_id FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
  WHERE g.user_id = auth.uid() AND sg.status = 'active'
$$;
REVOKE ALL ON FUNCTION public.my_guardian_student_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_guardian_student_ids() TO authenticated;

DROP POLICY IF EXISTS guardian_self ON guardians;
CREATE POLICY guardian_self ON guardians FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS guardian_links ON student_guardians;
CREATE POLICY guardian_links ON student_guardians FOR SELECT TO authenticated
  USING (guardian_id IN (SELECT id FROM guardians WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS guardian_attendance ON attendance_events;
CREATE POLICY guardian_attendance ON attendance_events FOR SELECT TO authenticated
  USING (student_id IN (SELECT public.my_guardian_student_ids()));
DROP POLICY IF EXISTS guardian_threads ON message_threads;
CREATE POLICY guardian_threads ON message_threads FOR SELECT TO authenticated
  USING (student_id IN (SELECT public.my_guardian_student_ids()));
DROP POLICY IF EXISTS guardian_messages ON messages;
CREATE POLICY guardian_messages ON messages FOR SELECT TO authenticated
  USING (thread_id IN (SELECT id FROM message_threads WHERE student_id IN (SELECT public.my_guardian_student_ids()))
         AND (recipient = 'guardians' OR sender_guardian_id IN (SELECT id FROM guardians WHERE user_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.my_children()
RETURNS TABLE (id uuid, display_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.display_name::text FROM students s WHERE s.id IN (SELECT public.my_guardian_student_ids())
$$;
REVOKE ALL ON FUNCTION public.my_children() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_children() TO authenticated;
