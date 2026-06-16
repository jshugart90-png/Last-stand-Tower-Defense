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
- `APPLE_SHARED_SECRET=<app-store-shared-secret>` (legacy receipt validation fallback)
- `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY` (App Store Server API — recommended for StoreKit 2 / expo-iap)
- `APPLE_BUNDLE_ID=com.horseshoeroundme.laststandtowerdefense`
- `GOOGLE_PLAY_PACKAGE_NAME=com.horseshoeroundme.laststandtowerdefense` (Android IAP)
- `GOOGLE_PLAY_ACCESS_TOKEN=<oauth-access-token>` (Android IAP validation)

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
- `iap.apple_server_api_configured` is `true` (required for StoreKit 2 / TestFlight purchases)

## In-App Purchase Checklist

1. **Supabase** — Create a project, run `backend/supabase_schema.sql` in the SQL editor, and set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on the backend.
2. **Deploy backend** — Use `render.yaml` (service `last-stand-td-api`) or any host running `uvicorn server:app` from `backend/`.
3. **Apple App Store Server API** (Users and Access → Integrations → App Store Connect API):
   - Create an API key with **App Manager** access.
   - Set `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, and `APPLE_PRIVATE_KEY` (paste the `.p8` contents; use `\n` for newlines in Render).
   - Optional fallback: `APPLE_SHARED_SECRET` from App Store Connect → your app → App Information → App-Specific Shared Secret.
4. **Point the app at the API** — In EAS production:

```bash
cd frontend
npx eas env:create --name EXPO_PUBLIC_BACKEND_URL --value https://YOUR-API-URL --environment production
```

5. **New TestFlight build** — `npx eas build --platform ios --profile production` so the URL is baked into the binary.
6. **Verify** — Buy a gem pack in TestFlight; confirm gems update via `GET /api/players/{id}`.

Purchase flow: App Store → `syncPurchaseWithBackend` (`POST /api/purchases`) → backend validates JWS/transaction → grants gems → `completePurchase` finishes the StoreKit transaction.

## Security Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend or mobile builds.
- Keep privileged DB writes behind backend routes only.
- Rotate any previously exposed secrets before production.
