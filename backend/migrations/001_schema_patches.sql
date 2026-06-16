-- Run in Supabase SQL Editor if players insert fails (paused project / older schema).
alter table public.players add column if not exists lifetime_enemies_killed int not null default 0;
alter table public.players add column if not exists reward_cooldowns jsonb not null default '{}'::jsonb;
alter table public.leaderboard add column if not exists lifetime_enemies_killed int not null default 0;
alter table public.leaderboard add column if not exists last_run_gems int not null default 0;
alter table public.leaderboard add column if not exists last_run_enemies_killed int not null default 0;
alter table public.leaderboard add column if not exists leaderboard_score bigint not null default 0;
