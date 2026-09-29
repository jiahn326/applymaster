-- Two new application statuses:
--   saved        — found a posting, not applied yet (shown in its own Saved tab)
--   no_response  — applied, never heard back (set by the user; the dashboard flags
--                  applications still "applied" after 30 days)
-- All existing values stay allowed, so current rows are unaffected.
alter table public.applications drop constraint applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status = any (array['saved', 'applied', 'interviewing', 'no_response', 'rejected', 'offer']));
