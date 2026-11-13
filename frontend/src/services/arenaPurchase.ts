import {
  LEGACY_ARENA_PRODUCT_ID,
  shouldApplyPendingArenaPurchase,
  tierFromArenaProductId,
} from '../logic/arenaSize';
import { usePlayerStore } from '../stores/playerStore';
import { isBackendConfigured, isServerBackedPlayerId } from '../hooks/useApi';
import { syncPurchaseWithBackend } from '../utils/iapBackend';
import { completePurchase } from './iapService';

function transactionIdOf(purchase: any): string {
  const id =
    purchase?.transactionId ||
    purchase?.originalTransactionIdentifierIOS ||
    purchase?.purchaseToken ||
    purchase?.id;
  return id != null ? String(id).trim() : '';
}

function productIdOf(purchase: any): string {
  const id = purchase?.productId || purchase?.id;
  return id != null ? String(id) : '';
}

/** Grant a store transaction that arrived outside the buy button, then finish it. */
export async function grantPendingArenaPurchase(purchase: any): Promise<void> {
  const productId = productIdOf(purchase);
  const tier = tierFromArenaProductId(productId);
  const legacy = productId === LEGACY_ARENA_PRODUCT_ID;
  if (!tier && !legacy) return;

  const tx = transactionIdOf(purchase);
  const store = usePlayerStore.getState();
  if (!shouldApplyPendingArenaPurchase(productId, tx, store.processedIapTransactionIds)) {
    await completePurchase(purchase, productId);
    return;
  }

  if (tier) store.unlockArenaTier(tier);
  else store.addArenaExpansion();
  if (tx) usePlayerStore.getState().rememberIapTransaction(tx);

  const playerId = usePlayerStore.getState().playerId;
  if (playerId && isServerBackedPlayerId(playerId) && isBackendConfigured()) {
    try {
      await syncPurchaseWithBackend({
        playerId,
        itemType: 'arena_expansion',
        itemId: productId,
        receipt: typeof purchase?.transactionReceipt === 'string' ? purchase.transactionReceipt : undefined,
        purchaseToken: typeof purchase?.purchaseToken === 'string' ? purchase.purchaseToken : undefined,
        transactionId: tx || undefined,
      });
    } catch {
      // The device already unlocked the size. Restore can sync the account later.
    }
  }
  await completePurchase(purchase, productId);
}
