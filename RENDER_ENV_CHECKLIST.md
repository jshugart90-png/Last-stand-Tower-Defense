# Render environment variables (copy into Render dashboard)

Set these on the `last-stand-td-api` service after deploying the Blueprint.

## Database (from Supabase → Settings → API)

- `SUPABASE_URL` — your project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service_role key (not anon)
- `CORS_ORIGINS` — `*`

## Apple App Store Server API

- `APPLE_KEY_ID` — `5G8MJHYX5G`
- `APPLE_ISSUER_ID` — Issuer ID from App Store Connect → Users and Access (UUID)
- `APPLE_PRIVATE_KEY` — full `.p8` contents; on Render use `\n` between lines in one value
- `APPLE_BUNDLE_ID` — `com.horseshoeroundme.laststandtowerdefense` (already in render.yaml)

## Optional

- `APPLE_SHARED_SECRET` — legacy fallback only

## Verify after deploy

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
```

Expect `"apple_server_api_configured": true` once all three Apple vars are set.
