-- Baseline schema: the database as it was before the later migrations in this folder.
-- Generated from the live project's catalog (tables, columns, constraints, row-level
-- security policies). Running this and then the later migrations in order reproduces
-- the current schema. Assumes a Supabase project (auth.users and auth.uid() exist).

create table public.resumes (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  content jsonb not null,
  user_id uuid,
  constraint resumes_pkey PRIMARY KEY (id)
);

create table public.applications (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  company text not null,
  role text not null,
  job_url text,
  job_description text,
  status text default 'applied'::text not null,
  notes text,
  tailored_resume jsonb,
  applied_through text,
  fit_analysis jsonb,
  user_id uuid,
  cover_letter text,
  cover_letter_submitted boolean default false not null,
  constraint applications_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'interviewing'::text, 'rejected'::text, 'offer'::text]))),
  constraint applications_pkey PRIMARY KEY (id)
);

create table public.user_settings (
  user_id uuid not null,
  cover_letter_template text,
  updated_at timestamp with time zone default now(),
  constraint user_settings_pkey PRIMARY KEY (user_id)
);

alter table public.resumes add constraint resumes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.applications add constraint applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_settings add constraint user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.resumes enable row level security;
alter table public.applications enable row level security;
alter table public.user_settings enable row level security;

create policy "own applications" on public.applications as permissive for all to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "users_own_applications" on public.applications as permissive for all to public
  using (auth.uid() = user_id);
create policy "own resumes" on public.resumes as permissive for all to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "users_own_resumes" on public.resumes as permissive for all to public
  using (auth.uid() = user_id);
create policy "Users can manage own settings" on public.user_settings as permissive for all to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
