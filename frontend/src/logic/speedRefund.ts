/** Gem-shop speeds. 2x is free now. 3x and 5x are gone. Gems are bought with real money, so each is refunded once. */
export const LEGACY_SPEED_2X_GEMS = 30;
export const LEGACY_SPEED_3X_GEMS = 80;
export const LEGACY_SPEED_5X_GEMS = 150;

export type LegacySpeedOwnership = {
  owned2: boolean;
  owned3: boolean;
  owned5: boolean;
  refund: number;
};

/** 10 was the old top speed and was stored as the 5x unlock. A literal 2 means they bought 2x. */
export function legacySpeedOwnership(input: unknown): LegacySpeedOwnership {
  let owned2 = false;
  let owned3 = false;
  let owned5 = false;
  if (Array.isArray(input)) {
    for (const raw of input) {
      const n = Number(raw);
      if (n === 2) owned2 = true;
      if (n === 3) owned3 = true;
      if (n === 5 || n === 10) owned5 = true;
    }
  }
  const refund =
    (owned2 ? LEGACY_SPEED_2X_GEMS : 0) +
    (owned3 ? LEGACY_SPEED_3X_GEMS : 0) +
    (owned5 ? LEGACY_SPEED_5X_GEMS : 0);
  return { owned2, owned3, owned5, refund };
}

export function speedRefundNotice(
  owned2: boolean,
  owned3: boolean,
  owned5: boolean,
  refund: number
): string | null {
  if (refund <= 0) return null;
  const removed = [owned3 ? '3x' : '', owned5 ? '5x' : ''].filter(Boolean);
  if (owned2 && removed.length > 0) {
    return `${removed.join(' and ')} speed was removed, and 2x is now free. ${refund} gems were refunded.`;
  }
  if (owned2) return `2x speed is now free. ${refund} gems were refunded.`;
  return `${removed.join(' and ')} speed was removed. ${refund} gems were refunded.`;
}
