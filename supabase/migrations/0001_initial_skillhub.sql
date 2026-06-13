create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users,
  username text unique not null,
  bio text,
  avatar_url text,
  verified boolean default false,
  created_at timestamptz default now()
);

create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  author_id uuid references profiles(id),
  description text not null,
  visibility text default 'public' check (visibility in ('public', 'private', 'unlisted')),
  category text,
  tags text[] default '{}',
  ai_targets text[] default '{claude}',
  downloads int default 0,
  stars int default 0,
  repository text,
  homepage text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '') || ' ' || array_to_string(tags, ' '))
  ) stored
);

create table if not exists skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid references skills(id) on delete cascade,
  version text not null,
  changelog text,
  file_url text not null,
  file_size int,
  is_latest boolean default false,
  instructions text,
  published_at timestamptz default now(),
  unique (skill_id, version)
);

create table if not exists skill_stars (
  user_id uuid references profiles(id),
  skill_id uuid references skills(id) on delete cascade,
  starred_at timestamptz default now(),
  primary key (user_id, skill_id)
);

create table if not exists skill_installs (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid references skills(id) on delete set null,
  version_id uuid references skill_versions(id) on delete set null,
  user_id uuid references profiles(id),
  source text check (source in ('cli', 'api', 'web')),
  installed_at timestamptz default now()
);

create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  name text not null,
  token_hash text unique not null,
  scopes text[] default '{read}',
  last_used timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  owner_id uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists org_members (
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'member' check (role in ('owner', 'admin', 'member')),
  primary key (org_id, user_id)
);

create index if not exists skills_search_idx on skills using gin(search_vector);
create index if not exists skills_tags_idx on skills using gin(tags);
create index if not exists skills_name_trgm_idx on skills using gin(name gin_trgm_ops);
create unique index if not exists one_latest_version_per_skill on skill_versions(skill_id) where is_latest;

create or replace view skills_public_view as
select
  s.id,
  s.name,
  s.slug,
  latest.id as version_id,
  latest.version,
  s.description,
  coalesce(p.username, 'anonymous') as author,
  s.visibility,
  s.downloads,
  s.stars,
  s.tags,
  s.category,
  s.ai_targets,
  s.repository,
  s.homepage,
  s.updated_at,
  s.search_vector,
  latest.instructions,
  latest.file_url as download_url,
  '/api/v1/skills/' || s.name || '/content/SKILL.md' as entry_url,
  coalesce(version_list.versions, '{}') as versions
from skills s
left join profiles p on p.id = s.author_id
left join lateral (
  select id, version, file_url, instructions
  from skill_versions sv
  where sv.skill_id = s.id and sv.is_latest
  order by sv.published_at desc
  limit 1
) latest on true
left join lateral (
  select array_agg(version order by published_at) as versions
  from skill_versions sv
  where sv.skill_id = s.id
) version_list on true
where s.visibility = 'public';

alter table profiles enable row level security;
alter table skills enable row level security;
alter table skill_versions enable row level security;
alter table skill_stars enable row level security;
alter table skill_installs enable row level security;
alter table api_tokens enable row level security;
alter table organizations enable row level security;
alter table org_members enable row level security;

create policy "profiles are publicly readable" on profiles for select using (true);
create policy "users manage own profile" on profiles for all using (id = auth.uid());

create policy "public skills readable" on skills for select using (visibility = 'public');
create policy "owner reads non-public skills" on skills for select using (visibility <> 'public' and author_id = auth.uid());
create policy "author manages skill" on skills for all using (author_id = auth.uid());

create policy "public versions readable" on skill_versions for select using (
  exists (select 1 from skills where skills.id = skill_versions.skill_id and skills.visibility = 'public')
);
create policy "authors manage versions" on skill_versions for all using (
  exists (select 1 from skills where skills.id = skill_versions.skill_id and skills.author_id = auth.uid())
);

create policy "users manage own stars" on skill_stars for all using (user_id = auth.uid());
create policy "users read own tokens" on api_tokens for select using (user_id = auth.uid());
create policy "users manage own tokens" on api_tokens for all using (user_id = auth.uid());
create policy "owners manage organizations" on organizations for all using (owner_id = auth.uid());
create policy "members read org membership" on org_members for select using (user_id = auth.uid());
