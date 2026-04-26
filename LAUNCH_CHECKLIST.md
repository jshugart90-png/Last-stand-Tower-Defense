# Last Stand Tower Defense Launch Checklist

## 1) Production Environment

- [ ] Create `backend/.env` from `backend/.env.example`
- [ ] Set `ENVIRONMENT=production`
- [ ] Set `DB_PROVIDER=supabase`
- [ ] Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Set `CORS_ORIGINS` to your production frontend origins
- [ ] Create `frontend/.env` from `frontend/.env.example`
- [ ] Set `EXPO_PUBLIC_BACKEND_URL` to deployed backend URL

## 2) Backend Deployment

- [ ] Deploy backend app using `uvicorn server:app --host 0.0.0.0 --port $PORT`
- [ ] Verify `/api/health` returns `status: healthy`
- [ ] Confirm `db_provider` is `supabase`
- [ ] Confirm CORS allows app origins

## 3) Database and Security

- [ ] Run `backend/supabase_schema.sql` in Supabase SQL editor
- [ ] Verify service role has table access for backend operations
- [ ] Keep service role key server-side only (never in mobile app)
- [ ] Rotate any key that was ever exposed in chat or logs

## 4) Mobile Build Setup

- [ ] Log in to Expo account (`npx eas login`)
- [ ] Configure EAS project (`npx eas build:configure`)
- [ ] Build Android internal test (`npx eas build --platform android --profile preview`)
- [ ] Build iOS TestFlight (`npx eas build --platform ios --profile preview`)
- [ ] Run production builds when QA passes (`--profile production`)

## 5) QA Gates

- [ ] `npm run lint`
- [ ] `npm run qc:release`
- [ ] Playtest 20+ minutes on at least one low-end device
- [ ] Verify daily missions/weekly missions/achievements progression
- [ ] Verify run-results flow and rematch CTA
- [ ] Verify leaderboard global and daily modes
- [ ] Verify audio, haptics, and performance-mode toggles

## 6) Store Submission

- [ ] Final app name, icon, screenshots, and descriptions
- [ ] Privacy policy URL and support email ready
- [ ] Complete tax/banking/compliance forms in Play and App Store dashboards
- [ ] Submit Android and iOS builds

## 7) Post-Launch Monitoring

- [ ] Monitor backend logs and health endpoint
- [ ] Track crash rate and session retention (D1/D7)
- [ ] Watch leaderboard endpoint latency and DB usage
- [ ] Ship first balance patch in 3-7 days based on data
