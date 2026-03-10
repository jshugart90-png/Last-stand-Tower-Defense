# In-App Purchases Setup Guide for Last Stand Defense

## Overview
This guide explains what you need to set up for real in-app purchases when the app goes live on the App Store (iOS) and Google Play Store (Android).

---

## Current Implementation Status
The app currently has **MOCKED** IAP - clicking purchase buttons simulates a successful purchase for testing. To make purchases real, you need to:

1. Set up products in App Store Connect and Google Play Console
2. Install and configure `expo-iap` library
3. Implement receipt validation on the backend

---

## Products to Create

### Apple App Store (App Store Connect)

| Product ID | Type | Price | Description |
|------------|------|-------|-------------|
| `arena_expansion_299` | Consumable | $2.99 | Expand arena by 1 row on each side |
| `premium_upgrade_499` | Non-Consumable | $4.99 | Remove all ads permanently |

### Google Play Store (Play Console)

| Product ID | Type | Price | Description |
|------------|------|-------|-------------|
| `arena_expansion_299` | Managed Product | $2.99 | Expand arena by 1 row on each side |
| `premium_upgrade_499` | Managed Product | $4.99 | Remove all ads permanently |

---

## Step 1: App Store Connect Setup (iOS)

1. **Create App Store Connect Account**
   - Go to https://appstoreconnect.apple.com
   - Enroll in Apple Developer Program ($99/year)

2. **Create Your App**
   - Go to "My Apps" → "+" → "New App"
   - Fill in app details

3. **Set Up In-App Purchases**
   - Go to your app → "Features" → "In-App Purchases"
   - Click "+" to create each product:
   
   **For Arena Expansion (Consumable):**
   - Type: Consumable
   - Reference Name: Arena Expansion
   - Product ID: `arena_expansion_299`
   - Price: Tier 3 ($2.99)
   - Add localization (display name & description)
   - Add screenshot for review
   
   **For Premium (Non-Consumable):**
   - Type: Non-Consumable
   - Reference Name: Premium Upgrade
   - Product ID: `premium_upgrade_499`
   - Price: Tier 5 ($4.99)
   - Add localization
   - Add screenshot

4. **Create Sandbox Tester**
   - Go to "Users and Access" → "Sandbox" → "Testers"
   - Add a test email (use a new email not linked to any Apple ID)

---

## Step 2: Google Play Console Setup (Android)

1. **Create Google Play Developer Account**
   - Go to https://play.google.com/console
   - Pay one-time $25 registration fee

2. **Create Your App**
   - Go to "All apps" → "Create app"
   - Fill in app details

3. **Set Up In-App Products**
   - Go to your app → "Monetize" → "Products" → "In-app products"
   - Click "Create product":
   
   **For Arena Expansion:**
   - Product ID: `arena_expansion_299`
   - Name: Arena Expansion
   - Description: Expand your battlefield
   - Default price: $2.99
   - Status: Active
   
   **For Premium:**
   - Product ID: `premium_upgrade_499`
   - Name: Premium Upgrade
   - Description: Remove all ads
   - Default price: $4.99
   - Status: Active

4. **License Testing**
   - Go to "Setup" → "License testing"
   - Add Gmail addresses for testers

---

## Step 3: Install expo-iap Library

```bash
cd frontend
npx expo install expo-iap
```

---

## Step 4: Code Implementation

### Initialize IAP Connection (App.tsx or _layout.tsx)

```typescript
import * as IAP from 'expo-iap';

// Product IDs - must match App Store/Play Console
const PRODUCT_IDS = ['arena_expansion_299', 'premium_upgrade_499'];

// Initialize on app start
useEffect(() => {
  const initIAP = async () => {
    try {
      await IAP.initConnection();
      const products = await IAP.getProducts(PRODUCT_IDS);
      console.log('Products:', products);
    } catch (error) {
      console.error('IAP init error:', error);
    }
  };
  
  initIAP();
  
  return () => {
    IAP.endConnection();
  };
}, []);
```

### Purchase Flow

```typescript
const handlePurchase = async (productId: string) => {
  try {
    // Request purchase
    const purchase = await IAP.requestPurchase(productId);
    
    // Verify receipt on your backend
    const verified = await verifyReceiptOnBackend(purchase.transactionReceipt);
    
    if (verified) {
      // Grant the item
      if (productId === 'arena_expansion_299') {
        playerStore.addArenaExpansion();
      } else if (productId === 'premium_upgrade_499') {
        playerStore.setPremium(true);
      }
      
      // Acknowledge/finish the purchase
      await IAP.finishTransaction(purchase, false);
    }
  } catch (error) {
    console.error('Purchase error:', error);
    Alert.alert('Purchase Failed', 'Please try again.');
  }
};
```

---

## Step 5: Backend Receipt Validation

Add this endpoint to your FastAPI backend:

```python
# backend/server.py

from fastapi import HTTPException
import httpx

@app.post("/api/verify-receipt")
async def verify_receipt(data: dict):
    receipt_data = data.get("receipt")
    platform = data.get("platform")  # "ios" or "android"
    
    if platform == "ios":
        # Verify with Apple
        result = await verify_apple_receipt(receipt_data)
    else:
        # Verify with Google
        result = await verify_google_receipt(receipt_data)
    
    return {"valid": result.valid, "product_id": result.product_id}

async def verify_apple_receipt(receipt: str):
    # Production URL
    url = "https://buy.itunes.apple.com/verifyReceipt"
    # For sandbox testing, use: https://sandbox.itunes.apple.com/verifyReceipt
    
    payload = {
        "receipt-data": receipt,
        "password": "YOUR_SHARED_SECRET"  # From App Store Connect
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        return response.json()

async def verify_google_receipt(receipt: str):
    # Use Google Play Developer API
    # Requires setting up a service account in Google Cloud Console
    pass
```

---

## Step 6: Testing

### iOS Testing
1. Build app with `eas build --platform ios`
2. Install on test device via TestFlight
3. Sign out of real Apple ID on device
4. Sign in with Sandbox Tester account
5. Make purchases (no real charges)

### Android Testing
1. Build app with `eas build --platform android`
2. Upload to Internal Testing track in Play Console
3. Add testers to License Testing list
4. Install from Play Store (internal track)
5. Make purchases (no real charges for license testers)

---

## Checklist Before Going Live

### Apple
- [ ] Apple Developer Program enrollment ($99/year)
- [ ] App created in App Store Connect
- [ ] In-app purchases created and approved
- [ ] Sandbox testers added
- [ ] Paid Applications Agreement signed
- [ ] Tax and banking information filled

### Google
- [ ] Google Play Developer account ($25 one-time)
- [ ] App created in Play Console
- [ ] In-app products created and activated
- [ ] License testers added
- [ ] Merchant account set up

### Code
- [ ] `expo-iap` installed
- [ ] Purchase flow implemented
- [ ] Receipt validation on backend
- [ ] Error handling for failed purchases
- [ ] Restore purchases functionality (for non-consumables)

---

## Estimated Timeline
- App Store Connect setup: 1-2 hours
- Google Play Console setup: 1-2 hours
- Code implementation: 2-4 hours
- Testing: 1-2 days
- App Review (Apple): 1-7 days
- App Review (Google): 1-3 days

---

## Costs
- Apple Developer Program: $99/year
- Google Play Developer: $25 one-time
- Apple takes 30% of each purchase (15% for small businesses <$1M/year)
- Google takes 30% of each purchase (15% for first $1M/year)

---

## Resources
- [expo-iap Documentation](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [Apple Server-to-Server Notifications](https://developer.apple.com/documentation/appstoreservernotifications)
- [Google Real-time Developer Notifications](https://developer.android.com/google/play/billing/rtdn)
