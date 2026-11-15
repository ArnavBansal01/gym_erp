-- Key queries for the viva (all run on the AURA schema).
-- 1. Admin KPIs: revenue, expenses, profit
SELECT (SELECT COALESCE(SUM(amount),0) FROM payments) AS revenue,
       (SELECT COALESCE(SUM(amount),0) FROM expenses) AS expenses,
       (SELECT COALESCE(SUM(amount),0) FROM payments) - (SELECT COALESCE(SUM(amount),0) FROM expenses) AS profit;
-- 2. Revenue per plan (GROUP BY)
SELECT plan_name, COUNT(*) renewals, SUM(amount) revenue FROM payments GROUP BY plan_name ORDER BY revenue DESC;
-- 3. Members per trainer (JOIN + GROUP BY; NULL = General Floor Coach)
SELECT COALESCE(t.name,'General Floor Coach') AS trainer, COUNT(*) members
FROM users m LEFT JOIN users t ON t.uid = m.assigned_trainer_uid WHERE m.role='member' GROUP BY 1 ORDER BY 2 DESC;
-- 4. Membership status via the view
SELECT status, COUNT(*) FROM membership_status GROUP BY status;
-- 5. Attendance streak per member (window function: consecutive-day groups)
WITH days AS (SELECT DISTINCT user_uid, (logged_at AT TIME ZONE 'Asia/Kolkata')::date AS d FROM attendance_logs WHERE type='CHECK-IN'),
grp AS (SELECT user_uid, d, d - (ROW_NUMBER() OVER (PARTITION BY user_uid ORDER BY d))::int AS g FROM days)
SELECT user_uid, MIN(d) AS streak_start, MAX(d) AS streak_end, COUNT(*) AS streak_days
FROM grp GROUP BY user_uid, g ORDER BY streak_days DESC;
-- 6. Busiest hours (EXTRACT)
SELECT EXTRACT(HOUR FROM logged_at AT TIME ZONE 'Asia/Kolkata') AS hr, COUNT(*) FROM attendance_logs WHERE type='CHECK-IN' GROUP BY 1 ORDER BY 2 DESC;
-- 7. Index demo
EXPLAIN ANALYZE SELECT * FROM attendance_logs WHERE user_uid = 'm1' ORDER BY logged_at DESC LIMIT 60;
-- 8. Concurrency: the app's check-in does  BEGIN; SELECT ... FROM users WHERE uid=$1 FOR UPDATE; ...; COMMIT;
