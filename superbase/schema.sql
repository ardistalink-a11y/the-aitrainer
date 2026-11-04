create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  platform text not null,
  task_type text,
  language text,
  country text,
  country_codes text[] not null default '{}',
  pay text,
  status text not null default 'open',
  indonesia_status text not null default 'unknown',
  work_mode text,
  raw_location text,
  source_url text not null unique,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

alter table projects enable row level security;

drop policy if exists "public read" on projects;
create policy "public read" on projects
  for select using (true);

create index if not exists projects_country_codes_idx on projects using gin (country_codes);

create index if not exists projects_indonesia_status_idx
  on projects (indonesia_status, status);

-- Daftar platform untuk dropdown filter di situs
create or replace view platform_list with (security_invoker = true) as
  select distinct platform from projects;
grant select on platform_list to anon, authenticated;
