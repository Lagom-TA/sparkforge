-- SparkForge 数据库 Schema v1
-- 目标平台：Supabase / PostgreSQL
-- 应用数据归属 Project（而非 Version），记录用 JSONB 保存以支持字段演进。

create extension if not exists "pgcrypto";

-- ============ 平台核心表 ============

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  guest_session_id text,
  name text not null,
  initial_prompt text not null,
  status text not null default 'intake'
    check (status in ('intake','planning','awaiting_approval','building','validating','repairing','ready','failed','refining')),
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  request_text text not null,
  status text not null default 'running' check (status in ('running','succeeded','failed','cancelled')),
  current_stage text check (current_stage in ('planning','building','validating','repairing')),
  attempt int not null default 1,
  product_spec jsonb,
  public_log jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version_number int not null,
  product_spec jsonb,
  app_spec jsonb not null,
  source_bundle jsonb,
  test_spec jsonb,
  change_summary text default '',
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create table if not exists app_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  collection_key text not null,
  record_id uuid not null default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists app_records_lookup_idx
  on app_records (project_id, collection_key) where deleted_at is null;

create table if not exists verification_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version_id uuid references versions(id) on delete cascade,
  status text not null default 'running' check (status in ('running','passed','failed')),
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  token_hash text not null unique,
  permission text not null default 'view' check (permission in ('view','interact')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ 行级安全（RLS）============
-- 平台 API 通过 service key 访问；RLS 是第二道防线。

alter table projects enable row level security;
alter table generations enable row level security;
alter table versions enable row level security;
alter table app_records enable row level security;
alter table verification_runs enable row level security;
alter table share_links enable row level security;

-- Guest 访问策略：guest_session_id 匹配当前会话声明（通过 request.jwt.claims 透传）
create policy "guest own projects" on projects
  for all using (guest_session_id is not null and guest_session_id = current_setting('request.guest_session', true));

create policy "guest own records" on app_records
  for all using (
    project_id in (
      select id from projects
      where guest_session_id is not null
        and guest_session_id = current_setting('request.guest_session', true)
    )
  );
