# AdMob Setup — Last Stand Tower Defense

Ads are implemented with `react-native-google-mobile-ads` (+ `expo-tracking-transparency` for iOS ATT).
The code ships with **Google test IDs**, so every build works out of the box but earns nothing until
the real IDs below are filled in.

## What's in the app

| Placement | Type | Where | Ad-free (premium) players |
|---|---|---|---|
| Home screen bottom | Anchored adaptive banner | `app/index.tsx` | hidden |
| Shop bottom | Anchored adaptive banner | `app/shop.tsx` | hidden |
| Shop → Gems tab → "Watch a video" | Rewarded video → +10 gems | `app/shop.tsx` | shown (opt-in) |
| Game over → Run results → "Watch a video: +10 bonus gems" | Rewarded video (once per run) | `app/game.tsx` | shown (opt-in) |
| Game over → Home / Play again | Interstitial (skips the 1st game over, then max 1 per 3 min) | `app/game.tsx` | skipped |
| Settings → Legal → "Ad Privacy Options" | UMP consent form (only appears in EEA/UK/CH) | `app/settings.tsx` | — |

Gem grants for server-backed players go through `POST /api/rewards/claim` (`reward_type: "gems"`), which
already enforces a 30 s cooldown and the 10-gem amount server-side. Local/guest profiles are credited on-device.

Key files: `frontend/src/constants/ads.ts`, `frontend/src/services/adsService.native.ts`,
`frontend/src/hooks/useRewardedGems.ts`, `frontend/src/components/AdBanner.native.tsx`.

## 1. Create the app + ad units in AdMob

1. AdMob → **Apps → Add app** → platform **iOS** → "Is the app listed on a supported app store?" **Yes** →
   search "Last Stand Tower Defense" (App Store ID `6765792833`) → Add.
2. Copy the **App ID** (`ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`).
3. In that app → **Ad units → Add ad unit**, create three:
   - **Banner** — name `LS iOS Banner`
   - **Interstitial** — name `LS iOS Interstitial`
   - **Rewarded** — name `LS iOS Rewarded` (reward: `10` `gems` — cosmetic only; the app decides the amount)
4. Copy each **Ad unit ID** (`ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`).
5. Repeat for **Android** when you ship there (separate app + units).
6. AdMob → **Privacy & messaging** → create a **GDPR** message (required for EEA/UK users) and,
   optionally, an **IDFA explainer** message. Publish them.
7. AdMob → **Payments** → finish payee profile + tax info, or nothing pays out.

## 2. Put the IDs in the project

**App IDs** → `frontend/app.json`, `react-native-google-mobile-ads` plugin:

```json
"iosAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY",
"androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~AAAAAAAAAA"
```

(Wrong/missing App ID = native crash on launch. iOS App ID is set; Android still uses Google's test App ID until an Android app is created in AdMob.)

**Ad unit IDs** → environment variables (never hard-coded):

- Local dev: `frontend/.env` (copy from `.env.example`). Dev builds always use test ads anyway.
- Production: EAS → project → **Environment variables**, environment **production**, visibility *plain text*:

```
EXPO_PUBLIC_ADMOB_IOS_BANNER=ca-app-pub-.../...
EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL=ca-app-pub-.../...
EXPO_PUBLIC_ADMOB_IOS_REWARDED=ca-app-pub-.../...
```

Missing var → that placement falls back to a Google test unit (harmless, no revenue).
`EXPO_PUBLIC_ADMOB_TEST_ADS=1` forces test ads in a release build (use for TestFlight QA, then remove).

## 3. Build & ship

```bash
cd frontend
npm install                       # pulls the two new native deps
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

`eas.json` uses `appVersionSource: remote`, so the build number auto-increments; the marketing version
comes from `app.json` (`2.2.0` in this change).

### App Store Connect for the new version
- Create the new iOS version, attach the build, replace the wrong 2nd screenshot.
- **App Privacy** → add: *Identifiers → Device ID*, *Usage Data → Advertising Data / Product Interaction*,
  *Diagnostics → Crash Data* (if applicable) — used for **Third-Party Advertising**, linked to user per your ATT choice.
  Answer **Yes** to "Do you or your third-party partners use data for tracking?" (IDFA via ATT).
- Review notes: "This build adds Google AdMob banner, interstitial and opt-in rewarded ads. ATT prompt
  appears once after first launch."
- After approval, Apple's **App Store Connect → Agreements** already covers this; nothing else to sign.

## 4. Testing checklist
- Dev build: ATT prompt shows once on iOS; "Test Ad" label on banner; rewarded → gems +10; interstitial appears on
  2nd game over, not again for 3 min.
- Buy/restore premium → banners disappear, no interstitials, rewarded buttons still available.
- Airplane mode → no crash, banner collapses, rewarded button says "Video loading".
- Never click live ads in your own production build — AdMob will flag the account. Add your device as a
  test device in AdMob → Settings → Test devices instead.
