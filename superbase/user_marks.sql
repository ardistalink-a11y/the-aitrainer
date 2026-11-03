-- Status lamaran per akun (tersinkron antar perangkat)
create table if not exists user_marks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  mark text not null check (mark in ('applied', 'process')),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table user_marks enable row level security;

drop policy if exists "own marks" on user_marks;
create policy "own marks" on user_marks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on user_marks to authenticated;
