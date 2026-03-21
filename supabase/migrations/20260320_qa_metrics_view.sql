-- QA Dashboard view: daily pass rate by check_type for last 30 days
CREATE OR REPLACE VIEW public.qa_dashboard AS
SELECT
  date_trunc('day', created_at)::date AS day,
  check_type,
  count(*) AS total_checks,
  count(*) FILTER (WHERE passed = true) AS passed,
  count(*) FILTER (WHERE passed = false) AS failed,
  CASE
    WHEN count(*) > 0
    THEN round((count(*) FILTER (WHERE passed = true))::numeric / count(*) * 100, 1)
    ELSE 0
  END AS pass_rate
FROM qa_log
WHERE created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY day DESC, check_type;

-- Grant access to authenticated users (admins will query this)
GRANT SELECT ON public.qa_dashboard TO authenticated;
