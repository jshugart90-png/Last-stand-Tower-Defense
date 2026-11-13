/** Render free tier can take 40–60s to wake. One attempt must outlast that. */
export const LOGIN_TIMEOUT_MS = 70_000;

export const LOGIN_ATTEMPTS = 2;

export function loginRetryDelayMs(attemptIndex: number): number {
  if (attemptIndex <= 0) return 0;
  return 3000;
}

/** Player-facing copy. Never includes status codes or the word "error". */
export function loginStatusMessage(attempt: number, attempts = LOGIN_ATTEMPTS): string {
  const n = Math.max(1, attempt);
  if (n <= 1) {
    return 'Waking up the servers. A cold start can take a minute. You can wait here.';
  }
  return `Still connecting (try ${n} of ${attempts}). We’ll keep going on this device if the server stays asleep.`;
}

export const OFFLINE_SAVE_NOTE =
  'Playing with this device’s save. We’ll sync when the server wakes up.';

export const OFFLINE_NEW_PROFILE_NOTE =
  'You’re in. The server is still waking up, so this profile stays on your device for now.';
