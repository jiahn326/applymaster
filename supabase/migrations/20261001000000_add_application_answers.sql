-- Answers to application questions ("Why do you want to work here?", "What part of
-- this role energizes you most?", ...), kept per application so they can be copied,
-- edited, and regenerated later. A list of
-- { id, question, answer, length, maxChars, updated_at }.
alter table public.applications
  add column if not exists answers jsonb not null default '[]'::jsonb;
