# Last Stand Defense - IAP Setup Guide

Ads are retired. See **[ADMOB_SETUP.md](./ADMOB_SETUP.md)**. Do not add AdMob back. The product ids below are the live ones in `frontend/src/services/iapService.native.ts`. Do not rename them.

---

## In-App Purchase Products

### Product IDs (live — do not change)

| Product | ID | Type | Price |
|---------|-----|------|-------|
| Commander Bundle (was sold as remove-ads; still `premium`) | `com.laststanddefense.premium_bundle` | Non-consumable | $4.99 |
| Arena Expansion | `com.laststanddefense.arena_expansion` | Consumable | $2.99 |
| 120 Gems | `com.laststanddefense.gems_100` | Consumable | $0.99 |
| 500 Gems | `com.laststanddefense.gems_500` | Consumable | $2.99 |
| 1,500 Gems | `com.laststanddefense.gems_1500` | Consumable | $5.99 |
| 4,000 Gems | `com.laststanddefense.gems_4000` | Consumable | $9.99 |

### How to Set Up IAP Products

#### Google Play Console
1. Upload the app to Google Play Console
2. Go to **Monetize > Products > In-app products**
3. Create products with the IDs above
4. Set prices as listed
5. Activate the products

#### Apple App Store Connect
1. Upload the app to App Store Connect
2. Go to **Features > In-App Purchases**
3. Create products with the IDs above
4. Set prices as listed
5. Submit for review

### Product Details

#### Commander Bundle ($4.99)
- **Type**: Non-consumable
- **Product id**: `com.laststanddefense.premium_bundle` (unchanged)
- **What it does now**: +15% coins from battles, and unlocks the Champion Gold skin
- Stored in the player's `premium` field. Existing buyers keep the flag. The game is ad-free for everyone, so this is no longer sold as ad removal. Update the App Store product description to match before the next release.

#### Arena Expansion ($2.99)
- **Type**: Consumable
- **Description**: Adds 1 row of cells to each side of the battlefield
- Can be purchased multiple times

---

## Technical Implementation

### Files
- `frontend/src/services/iapService.native.ts` — StoreKit connection, purchases, restore
- `frontend/app/shop.tsx` — gem packs, Commander Bundle, arena expansion
- `frontend/app/_layout.tsx` — initializes IAP after launch. It does not initialize ads.

### Dependencies
- `expo-iap` — In-App Purchases
- `expo-build-properties` — iOS static frameworks

`react-native-google-mobile-ads` and `expo-tracking-transparency` were removed. Do not add them back.

### Development vs Production
- Web preview has no StoreKit. Purchases are unavailable there.
- A native EAS build uses the real App Store products.
- Build with `eas build` when you are ready to test purchases. This revamp does not submit a build.

### Building for Testing
```bash
# Install EAS CLI
npm install -g eas-cli

# Build for Android (internal testing)
eas build --platform android --profile preview

# Build for iOS (internal testing)  
eas build --platform ios --profile preview
```
