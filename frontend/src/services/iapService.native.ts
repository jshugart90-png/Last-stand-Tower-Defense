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

export type PurchaseResult = {
  success: boolean;
  purchase?: any;
  receipt?: string;
  purchaseToken?: string;
  transactionId?: string;
  error?: string;
};

export const isIAPAvailable = (): boolean => true;

let iapInitialized = false;
let purchaseUpdatedSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;
let pendingPurchaseResolve: ((purchase: any) => void) | null = null;
let pendingPurchaseReject: ((error: Error) => void) | null = null;
let pendingProductId: string | null = null;

function clearPendingPurchase() {
  pendingPurchaseResolve = null;
  pendingPurchaseReject = null;
  pendingProductId = null;
}

function extractPurchaseFields(purchase: any) {
  const receipt =
    purchase?.purchaseToken ||
    purchase?.transactionReceipt ||
    purchase?.dataAndroid ||
    '';
  const transactionId =
    purchase?.transactionId ||
    purchase?.id ||
    purchase?.originalTransactionIdentifierIOS ||
    undefined;
  return {
    receipt: typeof receipt === 'string' ? receipt : '',
    purchaseToken: typeof purchase?.purchaseToken === 'string' ? purchase.purchaseToken : undefined,
    transactionId: transactionId != null ? String(transactionId) : undefined,
  };
}

function waitForPurchase(productId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    pendingProductId = productId;
    pendingPurchaseResolve = resolve;
    pendingPurchaseReject = reject;

    setTimeout(() => {
      if (pendingPurchaseReject) {
        pendingPurchaseReject(new Error('Purchase timed out'));
        clearPendingPurchase();
      }
    }, 120000);
  });
}

export const initializeIAP = async (): Promise<boolean> => {
  if (iapInitialized) return true;

  try {
    await ExpoIAP.initConnection();

    purchaseUpdatedSub = ExpoIAP.purchaseUpdatedListener((purchase) => {
      if (!pendingPurchaseResolve) return;
      const expected = pendingProductId;
      const actual = purchase?.productId || purchase?.id;
      if (expected && actual && actual !== expected) {
        return;
      }
      pendingPurchaseResolve(purchase);
      clearPendingPurchase();
    });

    purchaseErrorSub = ExpoIAP.purchaseErrorListener((error: any) => {
      if (!pendingPurchaseReject) return;
      if (error?.code === 'E_USER_CANCELLED' || error?.code === 'UserCancelled') {
        pendingPurchaseReject(new Error('Purchase cancelled'));
      } else {
        pendingPurchaseReject(new Error(error?.message || 'Purchase failed'));
      }
      clearPendingPurchase();
    });

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
    const products = await (ExpoIAP as any).fetchProducts({ skus, type: 'in-app' });
    return products || [];
  } catch {
    try {
      const skus = Object.values(IAP_PRODUCTS);
      const products = await (ExpoIAP as any).getProducts({ skus });
      return products || [];
    } catch {
      return [];
    }
  }
};

export const requestPurchase = async (productId: string): Promise<PurchaseResult> => {
  if (!iapInitialized) {
    return { success: false, error: 'IAP not initialized' };
  }

  try {
    const purchasePromise = waitForPurchase(productId);
    await ExpoIAP.requestPurchase({
      request: {
        apple: { sku: productId },
        google: { skus: [productId] },
      },
      type: 'in-app',
    });

    const purchase = await purchasePromise;
    const fields = extractPurchaseFields(purchase);
    if (!fields.receipt && !fields.transactionId) {
      return { success: false, error: 'Missing purchase receipt from App Store.' };
    }

    return {
      success: true,
      purchase,
      receipt: fields.receipt,
      purchaseToken: fields.purchaseToken,
      transactionId: fields.transactionId,
    };
  } catch (error: any) {
    const message = error?.message || 'Purchase failed';
    if (message === 'Purchase cancelled') {
      return { success: false, error: 'Purchase cancelled' };
    }
    return { success: false, error: message };
  }
};

export const completePurchase = async (purchase: any, productId: string): Promise<void> => {
  if (!iapInitialized || !purchase) return;
  const isGemPack = Object.prototype.hasOwnProperty.call(GEM_PACK_AMOUNTS, productId);
  const isConsumable = productId === IAP_PRODUCTS.ARENA_EXPANSION || isGemPack;
  await ExpoIAP.finishTransaction({ purchase, isConsumable });
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
    purchaseUpdatedSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdatedSub = null;
    purchaseErrorSub = null;
    clearPendingPurchase();
    await ExpoIAP.endConnection();
    iapInitialized = false;
  } catch {
    /* ignore */
  }
};

export const isIAPInitialized = () => iapInitialized;
