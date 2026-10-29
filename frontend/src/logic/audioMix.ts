/** Equal-power crossfade. t=0 is fully outgoing, t=1 is fully incoming. */
export function mixEqualPower(t: number): { outgoing: number; incoming: number } {
  const x = Math.max(0, Math.min(1, t));
  return {
    outgoing: Math.cos((x * Math.PI) / 2),
    incoming: Math.sin((x * Math.PI) / 2),
  };
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Music gain after the user mute and slider. */
export function musicGain(enabled: boolean, volume: number): number {
  if (!enabled) return 0;
  return clamp01(volume);
}

export function sfxGain(enabled: boolean, volume: number): number {
  if (!enabled) return 0;
  return clamp01(volume);
}
