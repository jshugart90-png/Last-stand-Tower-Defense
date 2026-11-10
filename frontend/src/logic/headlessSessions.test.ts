import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, it, mock } from 'node:test';

const stubAsset = (mod: { exports: unknown }) => {
  mod.exports = 1;
};
for (const ext of ['.wav', '.m4a', '.mp3', '.png', '.jpg']) {
  (Module as unknown as { _extensions: Record<string, (mod: { exports: unknown }, filename: string) => void> })._extensions[ext] = stubAsset;
}

const listenerBag = { app: 0 };
(globalThis as { __lsListenerBag?: { app: number } }).__lsListenerBag = listenerBag;
const audioNative = { creates: 0, replays: 0, volumes: 0 };
(globalThis as { __lsAudio?: typeof audioNative }).__lsAudio = audioNative;

mock.module('react-native', {
  namedExports: {
    AppState: {
      currentState: 'active',
      addEventListener: () => {
        listenerBag.app += 1;
        return {
          remove() {
            listenerBag.app = Math.max(0, listenerBag.app - 1);
          },
        };
      },
    },
    Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios },
  },
});

mock.module('expo-av', {
  namedExports: {
    InterruptionModeIOS: { DuckOthers: 2 },
    InterruptionModeAndroid: { DuckOthers: 2 },
    Audio: {
      setIsEnabledAsync: async () => {},
      setAudioModeAsync: async () => {},
      Sound: {
        createAsync: async () => {
          audioNative.creates += 1;
          return {
            sound: {
              setVolumeAsync: async () => {
                audioNative.volumes += 1;
              },
              replayAsync: async () => {
                audioNative.replays += 1;
              },
              playAsync: async () => {},
              pauseAsync: async () => {},
              stopAsync: async () => {},
              unloadAsync: async () => {},
            },
          };
        },
      },
    },
  },
});

mock.module('expo-file-system/legacy', {
  namedExports: {
    cacheDirectory: null,
    EncodingType: { Base64: 'base64' },
    writeAsStringAsync: async () => {},
  },
});

mock.module('expo-constants', {
  defaultExport: { expoConfig: { extra: {} } },
});

mock.module('@react-native-async-storage/async-storage', {
  defaultExport: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
});

function tailMax(rows: { listeners: number; timers: number; projectiles: number; enemies: number }[], key: 'listeners' | 'timers' | 'projectiles' | 'enemies') {
  return rows.slice(-5).reduce((m, row) => Math.max(m, row[key]), 0);
}

describe('live 2x sessions', () => {
  it('keeps Gale Bastion and 16x20 Free Play from leaking', async () => {
    const { runLiveAcceptance } = await import('./headlessSessions');
    const result = await runLiveAcceptance();
    const brief = (rows: { simSec: number; enemies: number; projectiles: number; particles: number; timers: number; listeners: number }[]) =>
      rows.filter((_, i) => i % 8 === 0 || i === rows.length - 1);
    console.log(`LIVE ${JSON.stringify({
      placed: result.placed,
      freePlaced: result.freePlaced,
      grid: result.grid,
      caps: result.caps,
      peaks: result.peaks,
      tails: result.tails,
      gale1: { boss: result.gale1.bossSeen, cleared: result.gale1.cleared, simSec: Math.round(result.gale1.simMs / 1000), samples: brief(result.gale1.rows) },
      gale2: { boss: result.gale2.bossSeen, cleared: result.gale2.cleared, simSec: Math.round(result.gale2.simMs / 1000), samples: brief(result.gale2.rows) },
      free: { simSec: Math.round(result.free.simMs / 1000), samples: brief(result.free.rows) },
    })}`);

    assert.equal(result.gale1.bossSeen, true);
    assert.equal(result.gale1.cleared, true);
    assert.equal(result.gale2.bossSeen, true);
    assert.equal(result.gale2.cleared, true);
    assert.equal(result.grid.cols, 16);
    assert.equal(result.grid.rows, 20);
    assert.ok(result.placed >= 8);
    assert.ok(result.free.rows.length >= 12);

    assert.ok(result.peaks.gale1.projectiles <= result.caps.projectiles);
    assert.ok(result.peaks.gale2.projectiles <= result.caps.projectiles);
    assert.ok(result.peaks.free.projectiles <= result.caps.projectiles);
    assert.ok(result.peaks.gale1.particles <= result.caps.particles);
    assert.ok(result.peaks.gale2.particles <= result.caps.particles);
    assert.ok(result.peaks.free.particles <= result.caps.particles);

    assert.ok(result.peaks.gale2.enemies <= result.peaks.gale1.enemies + 2);
    assert.ok(result.peaks.gale2.projectiles <= result.peaks.gale1.projectiles + 2);
    assert.ok(result.peaks.gale2.listeners <= result.peaks.gale1.listeners + 1);
    assert.ok(result.peaks.gale2.timers <= result.peaks.gale1.timers + 2);

    const freeListeners = tailMax(result.free.rows, 'listeners');
    const freeTimers = tailMax(result.free.rows, 'timers');
    const freeShots = tailMax(result.free.rows, 'projectiles');
    assert.ok(freeListeners <= result.peaks.free.listeners);
    assert.ok(freeTimers <= Math.max(4, result.peaks.free.timers));
    assert.ok(freeShots <= result.caps.projectiles);
    assert.ok(result.peaks.free.listeners <= 16);
    assert.ok(result.peaks.free.timers <= 24);
    assert.ok(result.tails.gale2.at(-1)!.enemies === 0);
    assert.ok(result.tails.gale2.at(-1)!.projectiles <= result.caps.projectiles);
  });

  it('keeps native sounds bounded across 25 Gale Bastion waves at 2x', async () => {
    const sessions = await import('./headlessSessions');
    const audio = await import('../services/audioService');
    audio.resetAudioBudgetForTests();
    const before = audioNative.creates;
    audioNative.replays = 0;
    const started = Date.now();
    const soak = await sessions.runGaleAudioSoak(25);
    const seconds = Math.max(0.001, (Date.now() - started) / 1000);
    const created = audioNative.creates - before;
    const replayed = audioNative.replays;
    const sounds = audioNative.creates;
    audio.resetAudioBudgetForTests();
    await sessions.runGaleAudioSoak(3);
    const player = await import('../stores/playerStore');
    console.log(`AUDIO ${JSON.stringify({ soak, created, sounds, replayed, later: audioNative.creates, seconds: Number(seconds.toFixed(2)), volumes: audioNative.volumes, armed: audio.isGameplaySfxArmed(), sound: player.usePlayerStore.getState().soundEnabled, sfx: player.usePlayerStore.getState().sfxVolume })}`);
    assert.ok(soak.wave >= 25);
    assert.ok(soak.cleared >= 25);
    assert.ok(sounds > 0);
    assert.ok(sounds <= 40);
    assert.equal(audioNative.creates, sounds);
    assert.ok(replayed > 0);
    assert.ok(replayed <= 20 * Math.max(1, Math.ceil(seconds)));
  });
});
