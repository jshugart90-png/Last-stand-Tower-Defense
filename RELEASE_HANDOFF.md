# Release Handoff

## What Was Prepared

- Production-oriented app metadata updated in `frontend/app.json`.
- Ad/tracking Expo plugins removed from app config.
- `frontend/eas.json` added for EAS build profiles (`development`, `preview`, `production`).
- `frontend/.env.example` added with backend URL variable.
- Backend CORS now supports env-based allowlist (`CORS_ORIGINS`).
- Backend health response now includes environment info.
- `backend/.env.example` expanded with production keys.
- Automated release preflight script added at `scripts/release-preflight.mjs`.
- Launch/deploy docs added:
  - `LAUNCH_CHECKLIST.md`
  - `DEPLOY_BACKEND.md`

## Morning Steps (Fast Path)

1. Fill env files:
   - `backend/.env`
   - `frontend/.env`
2. Run checks:
   - `npm run lint`
   - `npm run qc:release`
3. Deploy backend using `DEPLOY_BACKEND.md` (or `render.yaml` blueprint).
4. Build app binaries with EAS preview profile.
5. Run final device QA.
6. Submit to Play/TestFlight.

## Notes

- Keep Supabase service role key in backend env only.
- Rotate any previously exposed secrets before production release.
- Verify deploy with `BACKEND_URL=https://<your-api-host> npm run smoke:backend`.

## Hard Blockers Requiring Your Account Actions

These cannot be completed from this headless session:

1. Expo authentication (`eas login`) is required before EAS can configure/build.
2. Cloud provider auth (Render/Railway/Fly) is required to create the production service.
3. Play Console / App Store Connect submissions require your account approvals and legal forms.
