-- Weekly application goal shown on the dashboard (Monday–Sunday weeks)
alter table public.user_settings
  add column if not exists weekly_goal integer not null default 10
  check (weekly_goal between 1 and 100);
