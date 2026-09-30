-- The dashboard goal is now set as "N applications a day × D days a week"
-- (weekly target = daily_goal * goal_days). Existing weekly goals carry over as
-- a 5-day week. weekly_goal is no longer read by the app; kept so a deploy in
-- progress doesn't break, and can be dropped later.
alter table public.user_settings
  add column if not exists daily_goal integer not null default 2
    check (daily_goal between 1 and 50),
  add column if not exists goal_days integer not null default 5
    check (goal_days between 1 and 7);

update public.user_settings
  set daily_goal = greatest(1, round(weekly_goal / 5.0)::int)
  where weekly_goal is not null;
