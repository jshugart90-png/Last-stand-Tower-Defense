// Web-safe IAP service - no native modules

export const IAP_PRODUCTS = {
  ARENA_EXPANSION: 'com.laststanddefense.arena_expansion',
  ARENA_SIZE_1: 'com.horseshoeroundme.laststandtowerdefense.arena1',
  ARENA_SIZE_2: 'com.horseshoeroundme.laststandtowerdefense.arena2',
  ARENA_SIZE_3: 'com.horseshoeroundme.laststandtowerdefense.arena3',
  PREMIUM_BUNDLE: 'com.laststanddefense.premium_bundle',
  GEMS_100: 'com.laststanddefense.gems_100',
  GEMS_500: 'com.laststanddefense.gems_500',
  GEMS_1500: 'com.laststanddefense.gems_1500',
  GEMS_4000: 'com.laststanddefense.gems_4000',
};

export const IAP_PRICES: Record<string, string> = {
  [IAP_PRODUCTS.ARENA_EXPANSION]: '$2.99',
  [IAP_PRODUCTS.ARENA_SIZE_1]: '$2.99',
  [IAP_PRODUCTS.ARENA_SIZE_2]: '$2.99',
  [IAP_PRODUCTS.ARENA_SIZE_3]: '$2.99',
  [IAP_PRODUCTS.PREMIUM_BUNDLE]: '$4.99',
  [IAP_PRODUCTS.GEMS_100]: '$0.99',  // 120 gems (2.3 ladder fix)
  [IAP_PRODUCTS.GEMS_500]: '$2.99',
  [IAP_PRODUCTS.GEMS_1500]: '$5.99',
  [IAP_PRODUCTS.GEMS_4000]: '$9.99',
};

export const GEM_PACK_AMOUNTS: Record<string, number> = {
  [IAP_PRODUCTS.GEMS_100]: 120, // 2.3: was 100 — small pack must not be strictly dominated
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

export const completePurchase = async (_purchase?: any, _productId?: string): Promise<void> => {};

export const setPendingPurchaseHandler = (_handler: ((purchase: any) => void) | null): void => {};

export const endIAPConnection = async (): Promise<void> => {};

export const isIAPInitialized = () => false;
