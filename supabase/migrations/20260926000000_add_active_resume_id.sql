-- The app already reads and writes user_settings.active_resume_id (upload page
-- "Active" version, detail page, new application panel), but the column never
-- existed, so the choice was silently dropped and the newest resume was always used.
-- Deleting the chosen resume clears the value; the app then falls back to the newest.
alter table public.user_settings
  add column if not exists active_resume_id uuid
  references public.resumes(id) on delete set null;
