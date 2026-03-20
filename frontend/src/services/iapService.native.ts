import * as ExpoIAP from 'expo-iap';

export const IAP_PRODUCTS = {
  REMOVE_ADS: 'com.laststanddefense.remove_ads',
  ARENA_EXPANSION: 'com.laststanddefense.arena_expansion',
  PREMIUM_BUNDLE: 'com.laststanddefense.premium_bundle',
  COINS_500: 'com.laststanddefense.coins_500',
  COINS_2000: 'com.laststanddefense.coins_2000',
  COINS_5000: 'com.laststanddefense.coins_5000',
  COINS_12000: 'com.laststanddefense.coins_12000',
};

export const IAP_PRICES: Record<string, string> = {
  [IAP_PRODUCTS.REMOVE_ADS]: '$2.99',
  [IAP_PRODUCTS.ARENA_EXPANSION]: '$2.99',
  [IAP_PRODUCTS.PREMIUM_BUNDLE]: '$4.99',
  [IAP_PRODUCTS.COINS_500]: '$0.99',
  [IAP_PRODUCTS.COINS_2000]: '$1.99',
  [IAP_PRODUCTS.COINS_5000]: '$4.99',
  [IAP_PRODUCTS.COINS_12000]: '$9.99',
};

export const COIN_PACK_AMOUNTS: Record<string, number> = {
  [IAP_PRODUCTS.COINS_500]: 500,
  [IAP_PRODUCTS.COINS_2000]: 2000,
  [IAP_PRODUCTS.COINS_5000]: 5000,
  [IAP_PRODUCTS.COINS_12000]: 12000,
};

export const isIAPAvailable = (): boolean => true;

let iapInitialized = false;

export const initializeIAP = async (): Promise<boolean> => {
  if (iapInitialized) return true;

  try {
    await ExpoIAP.initConnection();
    iapInitialized = true;
    console.log('IAP connection initialized');
    return true;
  } catch (error) {
    console.error('Failed to initialize IAP:', error);
    return false;
  }
};

export const getProducts = async (): Promise<any[]> => {
  if (!iapInitialized) return [];

  try {
    const skus = Object.values(IAP_PRODUCTS);
    const products = await ExpoIAP.getProducts({ skus });
    return products;
  } catch (error) {
    console.error('Failed to get products:', error);
    return [];
  }
};

export const requestPurchase = async (productId: string): Promise<{ success: boolean; receipt?: string; error?: string }> => {
  if (!iapInitialized) {
    return { success: false, error: 'IAP not initialized' };
  }

  try {
    const purchase = await ExpoIAP.requestPurchase({ sku: productId });
    if (purchase) {
      const isConsumable = productId === IAP_PRODUCTS.ARENA_EXPANSION || 
        productId.includes('coins_');
      await ExpoIAP.finishTransaction({ purchase, isConsumable });
      return { success: true, receipt: purchase.transactionReceipt };
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
  } catch (error) {
    console.error('Failed to restore purchases:', error);
    return [];
  }
};

export const endIAPConnection = async (): Promise<void> => {
  if (!iapInitialized) return;
  try {
    await ExpoIAP.endConnection();
    iapInitialized = false;
  } catch (error) {
    console.error('Failed to end IAP connection:', error);
  }
};

export const isIAPInitialized = () => iapInitialized;
