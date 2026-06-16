# Production backend setup

## 1. Supabase schema (required after resume)

Open the SQL editor and run `backend/migrations/001_schema_patches.sql`:

https://supabase.com/dashboard/project/fdsleazzlgtgypalnabh/sql/new

Or paste:

```sql
alter table public.players add column if not exists lifetime_enemies_killed int not null default 0;
alter table public.players add column if not exists reward_cooldowns jsonb not null default '{}'::jsonb;
alter table public.leaderboard add column if not exists lifetime_enemies_killed int not null default 0;
alter table public.leaderboard add column if not exists last_run_gems int not null default 0;
alter table public.leaderboard add column if not exists last_run_enemies_killed int not null default 0;
alter table public.leaderboard add column if not exists leaderboard_score bigint not null default 0;
```

## 2. Deploy API on Render (no API key needed)

1. Open: https://dashboard.render.com/blueprint/new?repo=https://github.com/jshugart90-png/Last-stand-Tower-Defense
2. Connect GitHub if prompted, deploy the `last-stand-td-api` service.
3. Set these environment variables on the service:

| Variable | Value |
|----------|--------|
| `SUPABASE_URL` | From Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Settings → API (service_role) |
| `CORS_ORIGINS` | `*` or your domains |
| `APPLE_KEY_ID` | App Store Connect API key ID |
| `APPLE_ISSUER_ID` | App Store Connect → Users and Access → Issuer ID |
| `APPLE_PRIVATE_KEY` | Full `.p8` file contents (use `\n` for line breaks on Render) |
| `APPLE_SHARED_SECRET` | Optional legacy fallback |

4. Wait for deploy; note the URL, e.g. `https://last-stand-td-api.onrender.com`.

## 3. Point the app at the API

```bash
cd frontend
npx eas env:create --name EXPO_PUBLIC_BACKEND_URL --value https://YOUR-RENDER-URL --environment production --visibility plaintext --non-interactive
```

## 4. New TestFlight build

```bash
cd frontend
npx eas build --platform ios --profile production --non-interactive
```

## 5. Verify

```bash
curl https://YOUR-RENDER-URL/api/health
```

Expect `iap.apple_server_api_configured: true` after Apple keys are set.
