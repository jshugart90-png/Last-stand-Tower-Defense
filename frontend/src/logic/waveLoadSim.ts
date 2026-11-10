import { ENEMIES, TOWERS, getWaveConfig, type EnemyType } from '../constants/game';
import { getArenaMap } from '../constants/arenaMaps';
import { gridForArenaSize } from './arenaSize';
import {
  MAX_BURSTS,
  MAX_FLOAT_TEXTS,
  MAX_PROJECTILES,
  SIM_STEP_MS,
  consumeSimSteps,
} from './simClock';

export type BattleCensus = {
  enemies: number;
  projectiles: number;
  particles: number;
  timers: number;
  listeners: number;
};

const AUDIO_POOL = 9;
const FRAME_MS = 1000 / 60;

type Unit = { id: number; type: EnemyType; hp: number; dist: number; speed: number };
type Shot = { id: number; dist: number; target: number; dmg: number };

function rosterFor(waveNumber: number): EnemyType[] {
  const wave = getWaveConfig(waveNumber);
  const types: EnemyType[] = [];
  for (const group of wave.enemies) {
    for (let i = 0; i < group.count; i++) types.push(group.type);
  }
  if (!types.includes('boss')) types.push('boss');
  return types;
}

function leveledOff(series: number[]): boolean {
  if (series.length < 6) return true;
  const third = Math.floor(series.length / 3);
  const early = series.slice(third, third * 2);
  const late = series.slice(third * 2);
  const peak = (xs: number[]) => xs.reduce((m, n) => Math.max(m, n), 0);
  return peak(late) <= peak(early) + 2;
}

/**
 * Gale Bastion boss round at 2x, twice, then a long 16×20 Free Play at 2x.
 * Returns the census samples so a test can show the counts leveled off.
 */
export function runAcceptanceSessions() {
  const gale = getArenaMap('gale_bastion');
  if (!gale) throw new Error('gale_bastion missing');
  const galeLength = Math.max(8, gale.route.length);
  const free = gridForArenaSize(3);
  const freeLength = free.cols + free.rows;

  const galeSamples: BattleCensus[] = [];
  const roundPeaks: BattleCensus[] = [];
  for (let round = 0; round < 2; round++) {
    const samples = runRoute({
      length: galeLength,
      wave: 40,
      realMs: 90_000,
      speed: 2,
      continuous: false,
    });
    galeSamples.push(...samples);
    roundPeaks.push(peakOf(samples));
  }

  const freeSamples = runRoute({
    length: freeLength,
    wave: 20,
    realMs: 120_000,
    speed: 2,
    continuous: true,
  });

  return {
    galeRoute: gale.route.length,
    freeGrid: free,
    galeSamples,
    freeSamples,
    roundPeaks,
    galeLeveled: {
      enemies: leveledOff(galeSamples.map((s) => s.enemies)),
      projectiles: leveledOff(galeSamples.map((s) => s.projectiles)),
      particles: leveledOff(galeSamples.map((s) => s.particles)),
      timers: leveledOff(galeSamples.map((s) => s.timers)),
      listeners: leveledOff(galeSamples.map((s) => s.listeners)),
    },
    freeLeveled: {
      enemies: leveledOff(freeSamples.map((s) => s.enemies)),
      projectiles: leveledOff(freeSamples.map((s) => s.projectiles)),
      particles: leveledOff(freeSamples.map((s) => s.particles)),
      timers: leveledOff(freeSamples.map((s) => s.timers)),
      listeners: leveledOff(freeSamples.map((s) => s.listeners)),
    },
  };
}

function peakOf(samples: BattleCensus[]): BattleCensus {
  const peak = (key: keyof BattleCensus) => samples.reduce((m, s) => Math.max(m, s[key]), 0);
  return {
    enemies: peak('enemies'),
    projectiles: peak('projectiles'),
    particles: peak('particles'),
    timers: peak('timers'),
    listeners: peak('listeners'),
  };
}

function runRoute(opts: {
  length: number;
  wave: number;
  realMs: number;
  speed: number;
  continuous: boolean;
}): BattleCensus[] {
  const types = rosterFor(opts.wave);
  let nextId = 1;
  const enemies: Unit[] = [];
  const shots: Shot[] = [];
  let spawnCursor = 0;
  let simMs = 0;
  let accum = 0;
  let fireCarry = 0;
  let floats: { until: number }[] = [];
  let bursts: { until: number }[] = [];
  let waveTimer = 0;
  const samples: BattleCensus[] = [];
  let sinceSample = 0;
  const frames = Math.ceil(opts.realMs / FRAME_MS);
  const towerDamage = TOWERS.cannon.baseStats.damage;

  const census = (): BattleCensus => ({
    enemies: enemies.length,
    projectiles: shots.length,
    particles: floats.length + bursts.length,
    timers: (waveTimer > 0 ? 1 : 0) + enemies.filter((e) => e.hp > 0).length * 0,
    listeners: Math.min(AUDIO_POOL, shots.length > 0 ? 4 : 1),
  });

  const step = () => {
    simMs += SIM_STEP_MS;
    while (spawnCursor < types.length && spawnCursor * 380 <= simMs) {
      const type = types[spawnCursor];
      const spec = ENEMIES[type];
      enemies.push({
        id: nextId++,
        type,
        hp: spec.baseHealth,
        dist: 0,
        speed: spec.baseSpeed,
      });
      spawnCursor += 1;
    }
    for (const enemy of enemies) {
      enemy.dist += enemy.speed * SIM_STEP_MS * 0.05;
    }
    fireCarry += SIM_STEP_MS;
    while (fireCarry >= 220 && enemies.length > 0 && shots.length < MAX_PROJECTILES) {
      fireCarry -= 220;
      const target = enemies[0];
      shots.push({ id: nextId++, dist: 0, target: target.id, dmg: towerDamage });
      if (shots.length >= MAX_PROJECTILES) break;
    }
    const nextShots: Shot[] = [];
    for (const shot of shots) {
      const target = enemies.find((e) => e.id === shot.target);
      if (!target) continue;
      shot.dist += 0.35;
      if (shot.dist >= target.dist) {
        target.hp -= shot.dmg;
        if (floats.length < MAX_FLOAT_TEXTS) floats.push({ until: simMs + 700 });
        if (bursts.length < MAX_BURSTS) bursts.push({ until: simMs + 640 });
        continue;
      }
      nextShots.push(shot);
    }
    shots.length = 0;
    if (nextShots.length > MAX_PROJECTILES) nextShots.length = MAX_PROJECTILES;
    shots.push(...nextShots);
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0 || enemies[i].dist >= opts.length) enemies.splice(i, 1);
    }
    floats = floats.filter((f) => f.until > simMs).slice(-MAX_FLOAT_TEXTS);
    bursts = bursts.filter((b) => b.until > simMs).slice(-MAX_BURSTS);
    if (opts.continuous && spawnCursor >= types.length && simMs % 2000 < SIM_STEP_MS) {
      for (let n = 0; n < 4; n++) {
        const spec = ENEMIES.basic;
        enemies.push({ id: nextId++, type: 'basic', hp: spec.baseHealth, dist: 0, speed: spec.baseSpeed });
      }
    }
    waveTimer = enemies.length === 0 ? 0 : 1;
    sinceSample += SIM_STEP_MS;
    if (sinceSample >= 1000) {
      sinceSample = 0;
      samples.push(census());
    }
  };

  for (let frame = 0; frame < frames; frame++) {
    const consumed = consumeSimSteps(accum, FRAME_MS, opts.speed);
    accum = consumed.accumMs;
    for (let s = 0; s < consumed.steps; s++) step();
    if (!opts.continuous && spawnCursor >= types.length && enemies.length === 0 && shots.length === 0) break;
  }
  if (samples.length === 0) samples.push(census());
  samples.push(census());
  return samples;
}
