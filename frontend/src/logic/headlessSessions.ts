import { GAME_CONFIG, TOWERS, getWaveConfig, type EnemyType, type TowerType } from '../constants/game';
import { getMapById, promoteEnemyType } from '../constants/maps';
import { getDifficultyModifiers } from '../logic/difficulty';
import { activeAudioVoices } from '../services/audioService';
import { useGameStore } from '../stores/gameStore';
import { usePlayerStore } from '../stores/playerStore';
import { MAX_BURSTS, MAX_FLOAT_TEXTS, MAX_PROJECTILES, SIM_STEP_MS, consumeSimSteps } from './simClock';

export type LiveCensus = {
  simSec: number;
  enemies: number;
  projectiles: number;
  particles: number;
  timers: number;
  listeners: number;
};

type Scheduled = { atMs: number; type: EnemyType };

const ALL_TOWERS = Object.keys(TOWERS) as TowerType[];
const FRAME_MS = 1000 / 60;

type TimerItem = { id: number; at: number; fn: () => void; every?: number };

function installFakeClock() {
  const queue: TimerItem[] = [];
  let now = 0;
  let nextId = 1;
  const orig = {
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
  };

  const arm = (fn: TimerHandler, ms?: number, every?: number) => {
    const id = nextId++;
    queue.push({
      id,
      at: now + Math.max(0, Number(ms) || 0),
      every,
      fn: () => {
        if (typeof fn === 'function') fn();
      },
    });
    return id as unknown as ReturnType<typeof setTimeout>;
  };

  global.setTimeout = ((fn: TimerHandler, ms?: number) => arm(fn, ms)) as unknown as typeof setTimeout;
  global.setInterval = ((fn: TimerHandler, ms?: number) => arm(fn, ms, Math.max(1, Number(ms) || 1))) as unknown as typeof setInterval;
  const clear = (id?: number) => {
    const idx = queue.findIndex((item) => item.id === id);
    if (idx >= 0) queue.splice(idx, 1);
  };
  global.clearTimeout = clear as typeof clearTimeout;
  global.clearInterval = clear as typeof clearInterval;

  return {
    pending: () => queue.length,
    advance(ms: number) {
      now += ms;
      for (let guard = 0; guard < 1000; guard++) {
        let next = -1;
        for (let i = 0; i < queue.length; i++) {
          if (queue[i].at <= now && (next < 0 || queue[i].at < queue[next].at)) next = i;
        }
        if (next < 0) break;
        const item = queue[next];
        queue.splice(next, 1);
        item.fn();
        if (item.every) queue.push({ ...item, at: now + item.every });
      }
    },
    restore() {
      global.setTimeout = orig.setTimeout;
      global.clearTimeout = orig.clearTimeout;
      global.setInterval = orig.setInterval;
      global.clearInterval = orig.clearInterval;
    },
  };
}

function scheduleFor(wave: number, mapId: string): Scheduled[] {
  const map = getMapById(mapId);
  const waveConfig = getWaveConfig(wave);
  const schedule: Scheduled[] = [];
  const mapSpawnMult = map?.spawnDelayMultiplier ?? 1;
  const tierShift = map?.enemyTierShift ?? 0;
  let delay = 500;
  for (const group of waveConfig.enemies) {
    for (let i = 0; i < group.count; i++) {
      schedule.push({ atMs: delay, type: promoteEnemyType(group.type, tierShift) });
      delay += GAME_CONFIG.ENEMY_SPAWN_DELAY * mapSpawnMult;
    }
  }
  return schedule;
}

function multipliers(wave: number, mapId: string) {
  const map = getMapById(mapId);
  const waveConfig = getWaveConfig(wave);
  const diff = getDifficultyModifiers(usePlayerStore.getState().difficultyMode);
  return {
    health:
      waveConfig.healthMultiplier *
      (map?.enemyHealthMultiplier ?? 1) *
      diff.enemyHealth,
    speed:
      waveConfig.speedMultiplier *
      (map?.enemySpeedMultiplier ?? 1) *
      diff.enemySpeed,
  };
}

function note(high: LiveCensus, row: LiveCensus) {
  high.enemies = Math.max(high.enemies, row.enemies);
  high.projectiles = Math.max(high.projectiles, row.projectiles);
  high.particles = Math.max(high.particles, row.particles);
  high.timers = Math.max(high.timers, row.timers);
  high.listeners = Math.max(high.listeners, row.listeners);
}

function placeBatteries(limit: number) {
  const store = useGameStore.getState();
  store.selectTower('machine_gun');
  useGameStore.setState({ coins: 500000, baseHealth: 50000 });
  const { gridCols, gridRows, arenaRoute } = useGameStore.getState();
  const spots: { x: number; y: number }[] = [];
  if (arenaRoute.length >= 2) {
    for (const cell of arenaRoute) {
      spots.push(
        { x: cell.x + 1, y: cell.y },
        { x: cell.x - 1, y: cell.y },
        { x: cell.x, y: cell.y + 1 },
        { x: cell.x, y: cell.y - 1 }
      );
    }
  } else {
    for (let y = 1; y < gridRows - 1; y++) {
      for (let x = 1; x < gridCols - 1; x++) {
        if ((x + y) % 4 === 1) spots.push({ x, y });
      }
    }
  }
  let placed = 0;
  for (const spot of spots) {
    if (placed >= limit) break;
    useGameStore.getState().selectTower(placed < limit - 4 ? 'machine_gun' : 'cannon');
    if (useGameStore.getState().placeTower(spot)) placed += 1;
  }
  if (placed < limit) {
    const { gridCols, gridRows } = useGameStore.getState();
    for (let y = 0; y < gridRows && placed < limit; y++) {
      for (let x = 0; x < gridCols && placed < limit; x++) {
        useGameStore.getState().selectTower('machine_gun');
        if (useGameStore.getState().placeTower({ x, y })) placed += 1;
      }
    }
  }
  return placed;
}

async function flushVoices() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Gale Bastion boss wave at 2x, twice, then a long 16×20 Free Play at 2x.
 * Drives the live store tick, spawn schedule, projectile cap, and audio voice set.
 */
export async function runLiveAcceptance() {
  const clock = installFakeClock();
  const samples: { phase: string; row: LiveCensus }[] = [];
  const appListeners = () => {
    const bag = (globalThis as { __lsListenerBag?: { app: number } }).__lsListenerBag;
    return bag?.app ?? 0;
  };

  const census = (simMs: number): LiveCensus => {
    const s = useGameStore.getState();
    return {
      simSec: Math.round(simMs / 1000),
      enemies: s.enemies.length,
      projectiles: s.projectiles.length,
      particles: s.floatTexts.length + s.bursts.length,
      timers: clock.pending(),
      listeners: activeAudioVoices() + appListeners(),
    };
  };

  const drive = async (phase: string, mapId: string, realMs: number, stopWhenClear: boolean) => {
    let accum = 0;
    let elapsed = 0;
    let cursor = 0;
    let schedule: Scheduled[] = [];
    let waveKey = '';
    let simMs = 0;
    let sinceSample = 0;
    const phaseRows: LiveCensus[] = [];
    const frames = Math.ceil(realMs / FRAME_MS);
    let bossSeen = false;
    const high: LiveCensus = { simSec: 0, enemies: 0, projectiles: 0, particles: 0, timers: 0, listeners: 0 };

    for (let frame = 0; frame < frames; frame++) {
      const live = useGameStore.getState();
      if (!live.isPlaying || live.isGameOver) break;
      const consumed = consumeSimSteps(accum, FRAME_MS, live.gameSpeed);
      accum = consumed.accumMs;
      for (let step = 0; step < consumed.steps; step++) {
        useGameStore.getState().gameTick(SIM_STEP_MS);
        clock.advance(SIM_STEP_MS);
        simMs += SIM_STEP_MS;
        const state = useGameStore.getState();
        if (state.waveInProgress) {
          const key = String(state.currentWave);
          if (key !== waveKey) {
            schedule = scheduleFor(state.currentWave, mapId);
            cursor = 0;
            elapsed = 0;
            waveKey = key;
          }
          elapsed += SIM_STEP_MS;
          const due: { type: EnemyType; healthMultiplier: number; speedMultiplier: number }[] = [];
          const mult = multipliers(state.currentWave, mapId);
          while (cursor < schedule.length && schedule[cursor].atMs <= elapsed) {
            if (schedule[cursor].type === 'boss') bossSeen = true;
            due.push({ type: schedule[cursor].type, healthMultiplier: mult.health, speedMultiplier: mult.speed });
            cursor += 1;
          }
          if (due.length > 0) useGameStore.getState().spawnEnemyBatch(due);
          const after = useGameStore.getState();
          if (cursor >= schedule.length && after.enemies.length === 0 && after.waveInProgress) {
            after.endWave();
            waveKey = '';
            if (stopWhenClear) {
              const row = census(simMs);
              note(high, row);
              phaseRows.push(row);
              samples.push({ phase, row });
              return { rows: phaseRows, bossSeen, cleared: true, simMs, high };
            }
          }
        }
        note(high, census(simMs));
        sinceSample += SIM_STEP_MS;
        if (sinceSample >= 2000) {
          sinceSample = 0;
          await flushVoices();
          const row = census(simMs);
          phaseRows.push(row);
          samples.push({ phase, row });
        }
      }
    }
    const row = census(simMs);
    phaseRows.push(row);
    samples.push({ phase, row });
    const state = useGameStore.getState();
    return {
      rows: phaseRows,
      bossSeen,
      cleared: !state.waveInProgress && state.enemies.length === 0 && !state.isGameOver,
      simMs,
      high,
    };
  };

  try {
    useGameStore.getState().startGame(ALL_TOWERS, [1, 2], {} as Record<TowerType, number>, {}, 0, 'gale_bastion');
    const placed = placeBatteries(18);
    useGameStore.getState().setGameSpeed(2);
    useGameStore.setState({ currentWave: 9, autoWaveTimer: 0 });
    useGameStore.getState().startWave();
    const gale1 = await drive('gale-1', 'gale_bastion', 180_000, true);

    useGameStore.setState({ currentWave: 9, autoWaveTimer: 0, enemies: [], projectiles: [], floatTexts: [], bursts: [] });
    useGameStore.getState().startWave();
    const gale2 = await drive('gale-2', 'gale_bastion', 180_000, true);

    useGameStore.getState().startGame(ALL_TOWERS, [1, 2], {} as Record<TowerType, number>, {}, 3, 'classic');
    const freePlaced = placeBatteries(16);
    useGameStore.getState().setGameSpeed(2);
    useGameStore.getState().startWave();
    const free = await drive('free-16x20', 'classic', 70_000, false);

    return {
      placed,
      freePlaced,
      grid: {
        cols: useGameStore.getState().gridCols,
        rows: useGameStore.getState().gridRows,
      },
      gale1,
      gale2,
      free,
      peaks: {
        gale1: gale1.high,
        gale2: gale2.high,
        free: free.high,
      },
      tails: {
        gale1: gale1.rows.slice(-2),
        gale2: gale2.rows.slice(-2),
        free: free.rows.slice(-4),
      },
      caps: {
        projectiles: MAX_PROJECTILES,
        particles: MAX_FLOAT_TEXTS + MAX_BURSTS,
      },
    };
  } finally {
    clock.restore();
  }
}

/** Gale Bastion at 2x for many full waves. Used to prove native audio stays bounded. */
export async function runGaleAudioSoak(waveCount = 25, hooks?: { onStep?: (step: number) => void }) {
  const clock = installFakeClock();
  try {
    useGameStore.getState().startGame(ALL_TOWERS, [1, 2], {} as Record<TowerType, number>, {}, 0, 'gale_bastion');
    const placed = placeBatteries(18);
    useGameStore.getState().setGameSpeed(2);
    let cleared = 0;
    let simSteps = 0;
    for (let n = 0; n < waveCount; n++) {
      useGameStore.getState().startWave();
      let accum = 0;
      let elapsed = 0;
      let cursor = 0;
      let schedule: Scheduled[] = [];
      let done = false;
      for (let frame = 0; frame < 2400 && !done; frame++) {
        const live = useGameStore.getState();
        if (!live.isPlaying || live.isGameOver) break;
        const consumed = consumeSimSteps(accum, FRAME_MS, live.gameSpeed);
        accum = consumed.accumMs;
        for (let step = 0; step < consumed.steps; step++) {
          useGameStore.getState().gameTick(SIM_STEP_MS);
          clock.advance(SIM_STEP_MS);
          simSteps += 1;
          hooks?.onStep?.(simSteps);
          const state = useGameStore.getState();
          if (schedule.length === 0) schedule = scheduleFor(state.currentWave, 'gale_bastion');
          elapsed += SIM_STEP_MS;
          const due: { type: EnemyType; healthMultiplier: number; speedMultiplier: number }[] = [];
          const mult = multipliers(state.currentWave, 'gale_bastion');
          while (cursor < schedule.length && schedule[cursor].atMs <= elapsed) {
            due.push({
              type: schedule[cursor].type,
              healthMultiplier: mult.health,
              speedMultiplier: mult.speed,
            });
            cursor += 1;
          }
          if (due.length > 0) useGameStore.getState().spawnEnemyBatch(due);
          const after = useGameStore.getState();
          if (cursor >= schedule.length && after.enemies.length === 0 && after.waveInProgress) {
            after.endWave();
            cleared += 1;
            done = true;
          }
        }
      }
      if (!done && useGameStore.getState().waveInProgress) {
        useGameStore.getState().endWave();
      }
    }
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    return {
      placed,
      cleared,
      wave: useGameStore.getState().currentWave,
      playing: useGameStore.getState().isPlaying,
    };
  } finally {
    clock.restore();
  }
}
