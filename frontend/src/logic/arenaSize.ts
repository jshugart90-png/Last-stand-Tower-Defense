/** Free Play field sizes. Tier N is a non-consumable that unlocks sizes 0..N. */
export const ARENA_TIER_COUNT = 3;
export const ARENA_TIER_PRICE_USD = 2.99;

/** Old consumable. No longer sold. A pending transaction still grants one size. */
export const LEGACY_ARENA_PRODUCT_ID = 'com.laststanddefense.arena_expansion';

export const ARENA_TIER_PRODUCT_IDS = {
  1: 'com.horseshoeroundme.laststandtowerdefense.arena1',
  2: 'com.horseshoeroundme.laststandtowerdefense.arena2',
  3: 'com.horseshoeroundme.laststandtowerdefense.arena3',
} as const;

export type ArenaTier = 1 | 2 | 3;

const BASE_COLS = 10;
const BASE_ROWS = 14;

export function arenaTierProductId(tier: ArenaTier): string {
  return ARENA_TIER_PRODUCT_IDS[tier];
}

export function tierFromArenaProductId(productId: string): ArenaTier | null {
  if (productId === ARENA_TIER_PRODUCT_IDS[1]) return 1;
  if (productId === ARENA_TIER_PRODUCT_IDS[2]) return 2;
  if (productId === ARENA_TIER_PRODUCT_IDS[3]) return 3;
  return null;
}

export function ownedArenaTier(expansions: number): number {
  if (!Number.isFinite(expansions)) return 0;
  return Math.max(0, Math.floor(expansions));
}

/** Selected size is always inside 0..owned. Missing selection keeps the size they already play. */
export function clampSelectedArenaSize(selected: number | null | undefined, owned: number): number {
  const max = ownedArenaTier(owned);
  if (selected == null || !Number.isFinite(selected)) return max;
  return Math.max(0, Math.min(max, Math.floor(selected)));
}

export function ownedAfterTierUnlock(owned: number, tier: ArenaTier): number {
  return Math.max(ownedArenaTier(owned), tier);
}

/** Buying a larger tier selects it. Buying a tier you already own leaves the choice alone. */
export function selectedAfterUnlock(selected: number, ownedBefore: number, ownedAfter: number): number {
  const before = ownedArenaTier(ownedBefore);
  const after = ownedArenaTier(ownedAfter);
  if (after > before) return after;
  return clampSelectedArenaSize(selected, after);
}

export function applyArenaProduct(owned: number, productId: string): number | null {
  const tier = tierFromArenaProductId(productId);
  if (tier) return ownedAfterTierUnlock(owned, tier);
  if (productId === LEGACY_ARENA_PRODUCT_ID) return ownedAfterLegacyConsumable(owned);
  return null;
}

/** A pending store transaction grants once per transaction id. Tiers and the old consumable both qualify. */
export function shouldApplyPendingArenaPurchase(
  productId: string,
  transactionId: string | null | undefined,
  seenTransactionIds: readonly string[]
): boolean {
  const tier = tierFromArenaProductId(productId);
  const legacy = productId === LEGACY_ARENA_PRODUCT_ID;
  if (!tier && !legacy) return false;
  const tx = (transactionId || '').trim();
  if (!tx) return false;
  return !seenTransactionIds.includes(tx);
}

/** A leftover consumable transaction still adds one size. It is not sold in the shop. */
export function ownedAfterLegacyConsumable(owned: number): number {
  return ownedArenaTier(owned) + 1;
}

/**
 * Non-consumable tiers restore to the highest tier Apple still has.
 * The legacy consumable is not restorable; owned from a save is kept.
 */
export function ownedAfterRestore(currentOwned: number, productIds: string[]): number {
  let owned = ownedArenaTier(currentOwned);
  for (const id of productIds) {
    const tier = tierFromArenaProductId(id);
    if (tier) owned = Math.max(owned, tier);
  }
  return owned;
}

export function gridForArenaSize(size: number): { cols: number; rows: number; cell: number } {
  const n = Math.max(0, Math.floor(size));
  return {
    cols: BASE_COLS + n * 2,
    rows: BASE_ROWS + n * 2,
    cell: n > 3 ? 28 : n > 1 ? 30 : 32,
  };
}

export function changeArenaSizeDuringSavedRun<T extends { gridCols: number; gridRows: number; arenaExpansions: number }>(
  saved: T,
  nextSelected: number,
  owned: number
): { saved: T; selected: number } {
  return {
    saved: { ...saved },
    selected: clampSelectedArenaSize(nextSelected, owned),
  };
}
