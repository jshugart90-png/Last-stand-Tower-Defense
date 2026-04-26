# Backend Deploy Guide (Supabase + FastAPI)

## Runtime

- Python 3.11+
- Start command:

```bash
uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
```

## Required Environment Variables

Use `backend/.env.example` as source of truth:

- `ENVIRONMENT=production`
- `DB_PROVIDER=supabase`
- `SUPABASE_URL=<your-project-url>`
- `SUPABASE_SERVICE_ROLE_KEY=<server-side-secret>`
- `SUPABASE_DB_SCHEMA=public`
- `CORS_ORIGINS=https://your-web-url.com,https://your-other-origin.com`

Optional fallback Mongo vars (not needed for Supabase mode):

- `MONGO_URL`
- `DB_NAME`

## Deploy Steps

1. Create a new backend service and point it at `backend/`.
2. Install dependencies from `backend/requirements.txt`.
3. Set start command to the `uvicorn` command above.
4. Add all required env vars.
5. Deploy.

## Smoke Test After Deploy

Replace `<API_BASE>` with deployed URL.

```bash
curl <API_BASE>/api/health
curl <API_BASE>/api/
```

Expected:

- `status` is `healthy`
- `db_provider` is `supabase`
- `environment` is `production` (or your selected value)

## Security Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend or mobile builds.
- Keep privileged DB writes behind backend routes only.
- Rotate any previously exposed secrets before production.
