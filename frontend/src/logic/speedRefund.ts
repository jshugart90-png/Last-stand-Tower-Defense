import { SUPPORT_EMAIL } from '../constants/legal';

/** Gem-shop speeds. 2x is free now. 3x and 5x are gone. Gems spent on them are returned once. */
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

/**
 * Ownership to store. A clamped speed list is [1, 2] for anyone who owned a
 * speed above 1, so that 2 counts as a purchase only when 3x and 5x were not.
 * A 2 that is still sitting next to a 3 or 5 in the raw list is a real purchase.
 */
export function legacySpeedFlagsFromSave(input: {
  unlockedSpeeds: unknown;
  owned2Flag?: boolean;
  owned3Flag?: boolean;
  owned5Flag?: boolean;
}): { owned2: boolean; owned3: boolean; owned5: boolean } {
  const fromList = legacySpeedOwnership(input.unlockedSpeeds);
  const owned3 = !!input.owned3Flag || fromList.owned3;
  const owned5 = !!input.owned5Flag || fromList.owned5;
  const listStillHasHigher = fromList.owned3 || fromList.owned5;
  const owned2 = !!input.owned2Flag || (fromList.owned2 && (listStillHasHigher || (!owned3 && !owned5)));
  return { owned2, owned3, owned5 };
}

/**
 * What this save still owes. Only the saved ownership flags count.
 * The speed list is not read here: after the clamp it contains 2 for every
 * player who owned any faster speed. Revision 0 has not been paid.
 * Revision 1 already paid 3x/5x. Revision 2 is finished.
 */
export function legacySpeedRefundDue(input: {
  revision: number;
  owned2Flag?: boolean;
  owned3Flag?: boolean;
  owned5Flag?: boolean;
}): { pay2: boolean; pay3: boolean; pay5: boolean; refund: number } {
  const revision = input.revision;
  const pay2 = revision < 2 && !!input.owned2Flag;
  const pay3 = revision < 1 && !!input.owned3Flag;
  const pay5 = revision < 1 && !!input.owned5Flag;
  return {
    pay2,
    pay3,
    pay5,
    refund: (pay2 ? LEGACY_SPEED_2X_GEMS : 0) + (pay3 ? LEGACY_SPEED_3X_GEMS : 0) + (pay5 ? LEGACY_SPEED_5X_GEMS : 0),
  };
}

export function speedRefundNotice(
  owned2: boolean,
  owned3: boolean,
  owned5: boolean,
  gemsReturned: number
): string | null {
  if (gemsReturned <= 0) return null;
  const removed = [owned3 ? '3x' : '', owned5 ? '5x' : ''].filter(Boolean);
  let lead: string;
  if (removed.length > 0 && owned2) {
    const verb = removed.length > 1 ? 'were' : 'was';
    lead = `${removed.join(' and ')} speed ${verb} removed and 2x is now free.`;
  } else if (owned2) {
    lead = '2x is now free.';
  } else {
    const verb = removed.length > 1 ? 'were' : 'was';
    lead = `${removed.join(' and ')} speed ${verb} removed.`;
  }
  return `${lead} The ${gemsReturned} gems you spent were returned to you. Questions? ${SUPPORT_EMAIL}`;
}
