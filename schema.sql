create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  platform text not null,
  task_type text,
  language text,
  country text,
  pay text,
  status text not null default 'open',
  source_url text not null unique,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

alter table projects enable row level security;

drop policy if exists "public read" on projects;
create policy "public read" on projects
  for select using (true);

insert into projects (project_name, platform, task_type, language, country, source_url)
values
  ('Contoh: Evaluasi Respons AI (Bahasa Indonesia)', 'Contoh Platform A', 'Rating', 'Indonesian', 'Indonesia', 'https://example.com/a1'),
  ('Contoh: Transkripsi Audio', 'Contoh Platform B', 'Transkripsi', 'Indonesian', 'Worldwide', 'https://example.com/b1')
on conflict (source_url) do nothing;
