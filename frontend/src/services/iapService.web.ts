// Web-safe IAP service - no native modules

export const IAP_PRODUCTS = {
  REMOVE_ADS: 'com.laststanddefense.remove_ads',
  ARENA_EXPANSION: 'com.laststanddefense.arena_expansion',
  PREMIUM_BUNDLE: 'com.laststanddefense.premium_bundle',
};

export const IAP_PRICES: Record<string, string> = {
  [IAP_PRODUCTS.REMOVE_ADS]: '$2.99',
  [IAP_PRODUCTS.ARENA_EXPANSION]: '$2.99',
  [IAP_PRODUCTS.PREMIUM_BUNDLE]: '$4.99',
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
