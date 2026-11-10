/** Gem-shop speeds that are no longer sold. Gems are bought with real money, so these are refunded once. */
export const LEGACY_SPEED_3X_GEMS = 80;
export const LEGACY_SPEED_5X_GEMS = 150;

export type LegacySpeedOwnership = {
  owned3: boolean;
  owned5: boolean;
  refund: number;
};

/** 10 was the old top speed and was stored as the 5x unlock. */
export function legacySpeedOwnership(input: unknown): LegacySpeedOwnership {
  let owned3 = false;
  let owned5 = false;
  if (Array.isArray(input)) {
    for (const raw of input) {
      const n = Number(raw);
      if (n === 3) owned3 = true;
      if (n === 5 || n === 10) owned5 = true;
    }
  }
  const refund = (owned3 ? LEGACY_SPEED_3X_GEMS : 0) + (owned5 ? LEGACY_SPEED_5X_GEMS : 0);
  return { owned3, owned5, refund };
}

export function speedRefundNotice(owned3: boolean, owned5: boolean, refund: number): string | null {
  if (refund <= 0) return null;
  const which = owned3 && owned5 ? '3x and 5x' : owned3 ? '3x' : '5x';
  return `${which} speed was removed. ${refund} gems were refunded.`;
}
