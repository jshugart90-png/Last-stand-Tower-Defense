import { getWaveConfig } from '../constants/game';
import {
  MAX_BURSTS,
  MAX_FLOAT_TEXTS,
  MAX_PROJECTILES,
  SIM_STEP_MS,
  consumeSimSteps,
} from './simClock';

type Unit = { id: number; hp: number; x: number; speed: number; boss: boolean };
type Shot = { id: number; x: number; target: number };

const PATH_LEN = 16;
const TOWER_COUNT = 8;
const FIRE_EVERY_MS = 280;
const SHOT_SPEED = 6;

/**
 * Late-wave combat at a fixed step. Projectiles, floating numbers, and bursts
 * are capped the same way the live tick is, so a 2x run cannot grow without bound.
 */
export function runLateWaveLoad(opts?: { realMinutes?: number; speed?: number }) {
  const speed = opts?.speed ?? 2;
  const realMs = (opts?.realMinutes ?? 3) * 60 * 1000;
  const frameMs = 1000 / 60;
  const wave = getWaveConfig(20);
  const roster: { boss: boolean; hp: number; speed: number }[] = [];
  for (const group of wave.enemies) {
    for (let i = 0; i < group.count; i++) {
      roster.push({
        boss: group.type === 'boss',
        hp: group.type === 'boss' ? 800 : 40,
        speed: group.type === 'fast' ? 2.2 : group.type === 'boss' ? 0.7 : 1.1,
      });
    }
  }
  if (!roster.some((u) => u.boss)) roster.push({ boss: true, hp: 800, speed: 0.7 });

  let nextId = 1;
  const enemies: Unit[] = [];
  const shots: Shot[] = [];
  let spawnCursor = 0;
  let simMs = 0;
  let accum = 0;
  let fireCarry = 0;
  let maxEnemies = 0;
  let maxShots = 0;
  let maxBursts = 0;
  let maxFloats = 0;
  let maxSteps = 0;
  let bursts = 0;
  let floats = 0;
  const frames = Math.ceil(realMs / frameMs);

  const stepOnce = () => {
    simMs += SIM_STEP_MS;
    const spawnAt = spawnCursor * 420;
    while (spawnCursor < roster.length && spawnAt <= simMs) {
      const spec = roster[spawnCursor];
      enemies.push({
        id: nextId++,
        hp: spec.hp,
        x: 0,
        speed: spec.speed,
        boss: spec.boss,
      });
      spawnCursor += 1;
    }
    for (const enemy of enemies) enemy.x += enemy.speed * (SIM_STEP_MS / 1000);
    fireCarry += SIM_STEP_MS;
    while (fireCarry >= FIRE_EVERY_MS) {
      fireCarry -= FIRE_EVERY_MS;
      if (enemies.length === 0) break;
      for (let t = 0; t < TOWER_COUNT; t++) {
        const target = enemies[t % enemies.length];
        shots.push({ id: nextId++, x: 2, target: target.id });
      }
    }
    const alive = new Set(enemies.map((e) => e.id));
    const nextShots: Shot[] = [];
    for (const shot of shots) {
      if (!alive.has(shot.target)) continue;
      const target = enemies.find((e) => e.id === shot.target);
      if (!target) continue;
      shot.x += SHOT_SPEED * (SIM_STEP_MS / 1000);
      if (shot.x >= target.x) {
        target.hp -= 18;
        bursts = Math.min(MAX_BURSTS, bursts + 1);
        floats = Math.min(MAX_FLOAT_TEXTS, floats + 1);
        continue;
      }
      nextShots.push(shot);
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0 || enemies[i].x >= PATH_LEN) enemies.splice(i, 1);
    }
    if (nextShots.length > MAX_PROJECTILES) nextShots.splice(0, nextShots.length - MAX_PROJECTILES);
    shots.length = 0;
    shots.push(...nextShots);
    if (bursts > 0) bursts -= 1;
    if (floats > 0) floats -= 1;
    maxEnemies = Math.max(maxEnemies, enemies.length);
    maxShots = Math.max(maxShots, shots.length);
    maxBursts = Math.max(maxBursts, bursts);
    maxFloats = Math.max(maxFloats, floats);
  };

  for (let frame = 0; frame < frames; frame++) {
    const consumed = consumeSimSteps(accum, frameMs, speed);
    accum = consumed.accumMs;
    maxSteps = Math.max(maxSteps, consumed.steps);
    for (let s = 0; s < consumed.steps; s++) stepOnce();
  }

  return {
    spawned: roster.length,
    maxEnemies,
    maxShots,
    maxBursts,
    maxFloats,
    maxSteps,
    enemiesLeft: enemies.length,
    shotsLeft: shots.length,
  };
}
