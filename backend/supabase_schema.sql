-- Last Stand Defense - Supabase schema bootstrap
-- Run in Supabase SQL editor before switching DB_PROVIDER.

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  device_id text not null unique,
  xp int not null default 0,
  level int not null default 1,
  gems int not null default 0,
  total_waves_survived int not null default 0,
  games_played int not null default 0,
  best_wave int not null default 0,
  lifetime_enemies_killed int not null default 0,
  unlocked_towers jsonb not null default '["machine_gun"]'::jsonb,
  unlocked_skins jsonb not null default '["default"]'::jsonb,
  equipped_skins jsonb not null default '{}'::jsonb,
  premium boolean not null default false,
  arena_expansions int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  nickname text not null,
  best_wave int not null default 0,
  total_waves_survived int not null default 0,
  games_played int not null default 0,
  lifetime_enemies_killed int not null default 0,
  last_run_gems int not null default 0,
  last_run_enemies_killed int not null default 0,
  leaderboard_score bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_leaderboard_best_wave on public.leaderboard (best_wave desc);
create index if not exists idx_leaderboard_player_id on public.leaderboard (player_id);
create index if not exists idx_leaderboard_score on public.leaderboard (leaderboard_score desc);

-- If tables already exist from an older bootstrap, add columns (safe to re-run):
alter table public.players add column if not exists lifetime_enemies_killed int not null default 0;
alter table public.leaderboard add column if not exists lifetime_enemies_killed int not null default 0;
alter table public.leaderboard add column if not exists last_run_gems int not null default 0;
alter table public.leaderboard add column if not exists last_run_enemies_killed int not null default 0;
alter table public.leaderboard add column if not exists leaderboard_score bigint not null default 0;

create table if not exists public.analytics (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

