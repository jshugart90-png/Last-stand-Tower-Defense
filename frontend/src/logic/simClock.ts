/** Fixed simulation step. Speed changes how many of these run per real second, not how large each one is. */
export const SIM_STEP_MS = 1000 / 30;

/** Ignore hitches longer than this so one stall cannot schedule a minute of ticks. */
export const MAX_FRAME_DELTA_MS = 50;

/** Hard cap. 2x at 60fps needs about two steps; a hitch must not run dozens. */
export const MAX_SUBSTEPS_PER_FRAME = 4;

export const MAX_PROJECTILES = 72;
export const MAX_FLOAT_TEXTS = 12;
export const MAX_BURSTS = 16;
export const MAX_IMPACT_SFX_PER_TICK = 4;

export function consumeSimSteps(
  accumMs: number,
  frameDeltaMs: number,
  gameSpeed: number
): { accumMs: number; steps: number } {
  const speed = !Number.isFinite(gameSpeed) || gameSpeed < 1 ? 1 : Math.min(2, gameSpeed);
  const frame = Math.min(MAX_FRAME_DELTA_MS, Math.max(0, frameDeltaMs));
  let accum = (Number.isFinite(accumMs) ? accumMs : 0) + frame * speed;
  let steps = 0;
  while (accum >= SIM_STEP_MS && steps < MAX_SUBSTEPS_PER_FRAME) {
    accum -= SIM_STEP_MS;
    steps += 1;
  }
  if (accum > SIM_STEP_MS) accum = SIM_STEP_MS;
  return { accumMs: accum, steps };
}
