// Web-safe IAP service - no native modules

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

export const isIAPAvailable = (): boolean => false;

export const initializeIAP = async (): Promise<boolean> => {
  console.log('IAP not available on web');
  return false;
};

export const getProducts = async (): Promise<any[]> => [];

export const requestPurchase = async (productId: string): Promise<{ success: boolean; receipt?: string; error?: string }> => {
  return { success: false, error: 'IAP not available on web' };
};

export const restorePurchases = async (): Promise<any[]> => [];

export const endIAPConnection = async (): Promise<void> => {};

export const isIAPInitialized = () => false;
