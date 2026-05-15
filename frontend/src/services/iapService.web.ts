// Web-safe IAP service - no native modules

export const IAP_PRODUCTS = {
  REMOVE_ADS: 'com.laststanddefense.remove_ads',
  ARENA_EXPANSION: 'com.laststanddefense.arena_expansion',
  PREMIUM_BUNDLE: 'com.laststanddefense.premium_bundle',
  GEMS_100: 'com.laststanddefense.gems_100',
  GEMS_500: 'com.laststanddefense.gems_500',
  GEMS_1500: 'com.laststanddefense.gems_1500',
  GEMS_4000: 'com.laststanddefense.gems_4000',
};

export const IAP_PRICES: Record<string, string> = {
  [IAP_PRODUCTS.REMOVE_ADS]: '$2.99',
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

export const isIAPAvailable = (): boolean => false;

export const initializeIAP = async (): Promise<boolean> => {
  return false;
};

export const getProducts = async (): Promise<any[]> => [];

export const requestPurchase = async (productId: string): Promise<{ success: boolean; receipt?: string; error?: string }> => {
  return { success: false, error: 'IAP not available on web' };
};

export const restorePurchases = async (): Promise<any[]> => [];

export const endIAPConnection = async (): Promise<void> => {};

export const isIAPInitialized = () => false;
