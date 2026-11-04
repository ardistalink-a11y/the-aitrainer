alter table projects add column if not exists country_codes text[] not null default '{}';
create index if not exists projects_country_codes_idx on projects using gin (country_codes);
