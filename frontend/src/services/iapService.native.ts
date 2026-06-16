import * as ExpoIAP from 'expo-iap';

export const IAP_PRODUCTS = {
  ARENA_EXPANSION: 'com.laststanddefense.arena_expansion',
  PREMIUM_BUNDLE: 'com.laststanddefense.premium_bundle',
  GEMS_100: 'com.laststanddefense.gems_100',
  GEMS_500: 'com.laststanddefense.gems_500',
  GEMS_1500: 'com.laststanddefense.gems_1500',
  GEMS_4000: 'com.laststanddefense.gems_4000',
};

export const IAP_PRICES: Record<string, string> = {
  [IAP_PRODUCTS.ARENA_EXPANSION]: '$2.99',
  [IAP_PRODUCTS.PREMIUM_BUNDLE]: '$4.99',
  [IAP_PRODUCTS.GEMS_100]: '$0.99',
  [IAP_PRODUCTS.GEMS_500]: '$1.99',
  [IAP_PRODUCTS.GEMS_1500]: '$4.99',
  [IAP_PRODUCTS.GEMS_4000]: '$9.99',
};

export const GEM_PACK_AMOUNTS: Record<string, number> = {
  [IAP_PRODUCTS.GEMS_100]: 100,
  [IAP_PRODUCTS.GEMS_500]: 500,
  [IAP_PRODUCTS.GEMS_1500]: 1500,
  [IAP_PRODUCTS.GEMS_4000]: 4000,
};

export const isIAPAvailable = (): boolean => true;

let iapInitialized = false;

export const initializeIAP = async (): Promise<boolean> => {
  if (iapInitialized) return true;

  try {
    await ExpoIAP.initConnection();
    iapInitialized = true;
    return true;
  } catch {
    return false;
  }
};

export const getProducts = async (): Promise<any[]> => {
  if (!iapInitialized) return [];

  try {
    const skus = Object.values(IAP_PRODUCTS);
    const products = await (ExpoIAP as any).getProducts({ skus });
    return products;
  } catch {
    return [];
  }
};

export const requestPurchase = async (
  productId: string,
): Promise<{ success: boolean; receipt?: string; purchaseToken?: string; error?: string }> => {
  if (!iapInitialized) {
    return { success: false, error: 'IAP not initialized' };
  }

  try {
    const purchase = await ExpoIAP.requestPurchase({ sku: productId });
    if (purchase) {
      const isGemPack = Object.prototype.hasOwnProperty.call(GEM_PACK_AMOUNTS, productId);
      const isConsumable = productId === IAP_PRODUCTS.ARENA_EXPANSION || isGemPack;
      await ExpoIAP.finishTransaction({ purchase, isConsumable });
      return {
        success: true,
        receipt: purchase.transactionReceipt,
        purchaseToken: purchase.purchaseToken,
      };
    }
    return { success: false, error: 'Purchase cancelled' };
  } catch (error: any) {
    if (error.code === 'E_USER_CANCELLED') {
      return { success: false, error: 'Purchase cancelled' };
    }
    return { success: false, error: error.message || 'Purchase failed' };
  }
};

export const restorePurchases = async (): Promise<any[]> => {
  if (!iapInitialized) return [];

  try {
    const purchases = await ExpoIAP.getAvailablePurchases();
    return purchases || [];
  } catch {
    return [];
  }
};

export const endIAPConnection = async (): Promise<void> => {
  if (!iapInitialized) return;
  try {
    await ExpoIAP.endConnection();
    iapInitialized = false;
  } catch {
    /* ignore */
  }
};

export const isIAPInitialized = () => iapInitialized;
