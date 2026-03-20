# Last Stand Defense - AdMob & IAP Setup Guide

## AdMob Configuration

### App ID
- **AdMob App ID**: `ca-app-pub-9533265028371895~3363655461`

### Ad Unit IDs
| Ad Type | Unit ID | Usage |
|---------|---------|-------|
| Banner | `ca-app-pub-9533265028371895/3866386218` | Shown on Home, Leaderboard, Shop screens |
| Interstitial | `ca-app-pub-9533265028371895/2757585578` | Every 10 waves, after game over |
| Rewarded Video | `ca-app-pub-9533265028371895/7614059534` | Watch ads for coins, revive |

### Where Ads Appear
1. **Rewarded Video Ads**:
   - Shop: "Watch Ad for 25 Coins" button
   - Game Over: "Watch Ad to Revive" button (1x per game)
2. **Banner Ads**:
   - Home screen (bottom)
   - Leaderboard screen (bottom)
   - Shop screen (bottom)
   - Banner ads are hidden when user purchases "Remove Ads"
3. **Interstitial Ads** (full-screen):
   - Every 10 waves during gameplay (wave 10, 20, 30...)
   - After game over (when player dies)
   - Interstitial ads are skipped for premium users ("Remove Ads" purchased)

---

## In-App Purchase Products

### Product IDs (Placeholder - Update after uploading to stores)

| Product | ID | Type | Price |
|---------|-----|------|-------|
| Remove Ads | `com.laststanddefense.remove_ads` | Non-consumable | $2.99 |
| Arena Expansion | `com.laststanddefense.arena_expansion` | Consumable | $2.99 |
| 500 Coins | `com.laststanddefense.coins_500` | Consumable | $0.99 |
| 2,000 Coins | `com.laststanddefense.coins_2000` | Consumable | $1.99 |
| 5,000 Coins | `com.laststanddefense.coins_5000` | Consumable | $4.99 |
| 12,000 Coins | `com.laststanddefense.coins_12000` | Consumable | $9.99 |
| Premium Bundle | `com.laststanddefense.premium_bundle` | Non-consumable | $4.99 |

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

#### Remove Ads ($2.99)
- **Type**: Non-consumable
- **Description**: Remove all banner ads permanently
- Stored in player's `premium` field

#### Arena Expansion ($2.99)
- **Type**: Consumable
- **Description**: Adds 1 row of cells to each side of battlefield
- Can be purchased multiple times

#### Premium Bundle ($4.99) - Future
- **Type**: Non-consumable  
- **Description**: Remove ads + exclusive skins + bonus coins
- Not yet implemented in shop

---

## Technical Implementation

### Files Modified/Created
- `app.json` - AdMob App ID, build properties, permissions
- `src/services/adService.ts` - AdMob initialization, rewarded ads, banner ads
- `src/services/iapService.ts` - IAP connection, purchases, restore
- `src/components/BannerAdComponent.tsx` - Banner ad React component
- `app/_layout.tsx` - Initializes ads & IAP on app launch
- `app/shop.tsx` - Real ad/IAP integration for shop
- `app/game.tsx` - Real rewarded ad for revive
- `app/index.tsx` - Banner ad on home screen
- `app/leaderboard.tsx` - Banner ad on leaderboard

### Dependencies Added
- `react-native-google-mobile-ads` - AdMob SDK
- `expo-build-properties` - iOS static frameworks
- `expo-tracking-transparency` - iOS ATT permission
- `expo-iap` - In-App Purchases

### Development vs Production
- In **web preview / Expo Go**: Ads and IAP show simulated behavior with fallback UI
- In **native build**: Real AdMob ads and App/Play Store IAP are used
- Build with `eas build` to test real functionality

### Building for Testing
```bash
# Install EAS CLI
npm install -g eas-cli

# Build for Android (internal testing)
eas build --platform android --profile preview

# Build for iOS (internal testing)  
eas build --platform ios --profile preview
```
