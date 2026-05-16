/**
 * Cinematic SFX: layered procedural WAV + expo-av mixing.
 * — iOS silent switch: playsInSilentModeIOS true (SFX still audible in silent mode).
 * — User mute: soundEnabled + sfxVolume in player store.
 */
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import type { TowerType } from '../constants/game';
import { usePlayerStore } from '../stores/playerStore';

export type SfxName = 'mission' | 'combo' | 'chest' | 'record';

const SAMPLE_RATE = 44100;
const BYTES_PER_SAMPLE = 2;

const cache = new Map<string, Audio.Sound>();
const pools = new Map<string, { sounds: Audio.Sound[]; i: number }>();
let audioReady = false;
let audioInitPromise: Promise<void> | null = null;

/** When false, combat SFX (weapons, impacts, deaths, base, wave horn) do not start. */
let gameplaySfxArmed = false;
/** Set after a native gameplay playback failure — no combat SFX until `stopAllSounds` clears it. */
let gameplayNativeHardOff = false;
/** Incremented to cancel pending `playEnemyDeathBurst` timeouts. */
let deathBurstGeneration = 0;

/** Single shared pool for all high-rate combat SFX (iOS: few `Sound` instances). */
const COMBAT_POOL_KEY = 'combat_pool';
/** Target 6–8 concurrent combat voices; one WAV file on disk, round-robin instances. */
const COMBAT_POOL_SIZE = 7;

/** Procedural buffers built once per process (never per play). */
let cachedCombatImpact: Float32Array | null = null;
let cachedSniperCrack: Float32Array | null = null;
let cachedFreezeLaunch: Float32Array | null = null;
let cachedWaveHorn: Float32Array | null = null;
let cachedUiTones: Partial<Record<SfxName, Float32Array>> | null = null;

function getCachedCombatImpact(): Float32Array {
  if (!cachedCombatImpact) cachedCombatImpact = buildBulletImpact();
  return cachedCombatImpact;
}

function getCachedSniperCrack(): Float32Array {
  if (!cachedSniperCrack) cachedSniperCrack = buildSniperCrack();
  return cachedSniperCrack;
}

function getCachedFreezeLaunch(): Float32Array {
  if (!cachedFreezeLaunch) cachedFreezeLaunch = buildFreezeLaunch();
  return cachedFreezeLaunch;
}

function getCachedWaveHorn(): Float32Array {
  if (!cachedWaveHorn) cachedWaveHorn = buildWaveHorn();
  return cachedWaveHorn;
}

function getCachedUiTones(): Record<SfxName, Float32Array> {
  if (!cachedUiTones) {
    cachedUiTones = {
      mission: buildUiTone(740, 120, true),
      combo: buildUiTone(1040, 140, true),
      chest: buildUiTone(620, 160, true),
      record: buildUiTone(1180, 130, true),
    };
  }
  return cachedUiTones as Record<SfxName, Float32Array>;
}

function disableGameplaySfxAfterNativeError(): void {
  if (gameplayNativeHardOff) return;
  gameplayNativeHardOff = true;
  gameplaySfxArmed = false;
  deathBurstGeneration += 1;
  lastAppliedVolume.clear();
  deathRateWindowStart = 0;
  deathRateWindowCount = 0;
  void silenceAllLoadedSounds().catch(() => {});
}

/** Skip native bridge work when master switch is off (strict, sync). */
function isSoundMasterOff(): boolean {
  try {
    return !usePlayerStore.getState().soundEnabled;
  } catch {
    return true;
  }
}

/** Last setVolumeAsync value per logical slot — avoids redundant native calls. */
const lastAppliedVolume = new Map<string, number>();
const VOLUME_SKIP_EPSILON = 0.025;

/** Gameplay / pooled SFX — any rejection disables native combat audio until `stopAllSounds`. */
function deferGameplaySfx(op: () => Promise<unknown>): void {
  queueMicrotask(() => {
    void (async () => {
      try {
        if (gameplayNativeHardOff) return;
        await op();
      } catch {
        disableGameplaySfxAfterNativeError();
      }
    })();
  });
}

/** UI stingers — never disables combat path; failures are swallowed. */
function deferUiSfx(op: () => Promise<unknown>): void {
  queueMicrotask(() => {
    void (async () => {
      try {
        await op();
      } catch {
        /* ignore */
      }
    })();
  });
}

function getSfxGain(): number {
  const s = usePlayerStore.getState();
  if (!s.soundEnabled) return 0;
  return Math.max(0, Math.min(1, s.sfxVolume));
}

function isGameplaySoundKey(key: string): boolean {
  return !key.startsWith('ui_');
}

async function silenceAllLoadedSounds(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const sound of cache.values()) {
    tasks.push(
      sound.stopAsync().catch(() => {})
    );
  }
  for (const pool of pools.values()) {
    for (const sound of pool.sounds) {
      tasks.push(
        sound.stopAsync().catch(() => {})
      );
    }
  }
  await Promise.all(tasks);
}

/** Stops every loaded SFX instance, invalidates staggered death timers, and disarms gameplay audio. */
export async function stopAllSounds(): Promise<void> {
  deathBurstGeneration++;
  gameplaySfxArmed = false;
  lastAppliedVolume.clear();
  deathRateWindowStart = 0;
  deathRateWindowCount = 0;
  try {
    await silenceAllLoadedSounds();
  } catch {
    /* ignore */
  } finally {
    gameplayNativeHardOff = false;
  }
}

/** Enable/disable combat SFX. Setting false stops playback and pending death-burst schedules. */
export function setGameplaySfxArmed(armed: boolean): void {
  gameplaySfxArmed = armed;
  if (!armed) {
    deathBurstGeneration++;
    lastAppliedVolume.clear();
    void silenceAllLoadedSounds();
  }
}

export function isGameplaySfxArmed(): boolean {
  return gameplaySfxArmed;
}

function shouldPlaySfx(): boolean {
  return getSfxGain() > 0.001;
}

const write16 = (view: DataView, offset: number, value: number) =>
  view.setInt16(offset, value, true);
const write32 = (view: DataView, offset: number, value: number) =>
  view.setUint32(offset, value, true);

function softClip(x: number): number {
  const t = Math.max(-1, Math.min(1, x));
  return t - (t * t * t) / 3; // tanh-ish
}

function whiteNoise(): number {
  return Math.random() * 2 - 1;
}

function float32ToWavBase64(samples: Float32Array): string {
  let peak = 0.0001;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const norm = 0.92 / peak;
  const dataSize = samples.length * BYTES_PER_SAMPLE;
  const totalSize = 44 + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  view.setUint8(0, 0x52);
  view.setUint8(1, 0x49);
  view.setUint8(2, 0x46);
  view.setUint8(3, 0x46);
  write32(view, 4, 36 + dataSize);
  view.setUint8(8, 0x57);
  view.setUint8(9, 0x41);
  view.setUint8(10, 0x56);
  view.setUint8(11, 0x45);
  view.setUint8(12, 0x66);
  view.setUint8(13, 0x6d);
  view.setUint8(14, 0x74);
  view.setUint8(15, 0x20);
  write32(view, 16, 16);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  write32(view, 24, SAMPLE_RATE);
  write32(view, 28, SAMPLE_RATE * BYTES_PER_SAMPLE);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, 0x64);
  view.setUint8(37, 0x61);
  view.setUint8(38, 0x74);
  view.setUint8(39, 0x61);
  write32(view, 40, dataSize);

  for (let i = 0; i < samples.length; i++) {
    const v = softClip(samples[i] * norm) * 32767;
    write16(view, 44 + i * 2, v);
  }

  return Buffer.from(new Uint8Array(buffer)).toString('base64');
}

// ——— Layered generators ———

function buildSniperCrack(): Float32Array {
  const ms = 220;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 38);
    const snap =
      Math.sin(2 * Math.PI * 920 * t) * 0.45 +
      Math.sin(2 * Math.PI * 1840 * t) * 0.25 * env;
    const air = whiteNoise() * 0.35 * env;
    out[i] = (snap + air) * Math.pow(1 - i / n, 0.2);
  }
  return out;
}

function buildFreezeLaunch(): Float32Array {
  const ms = 95;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.pow(1 - i / n, 0.8);
    const t = i / SAMPLE_RATE;
    out[i] =
      whiteNoise() * 0.22 * env +
      Math.sin(2 * Math.PI * 880 * t) * 0.25 * env +
      Math.sin(2 * Math.PI * 1320 * t) * 0.12 * env;
  }
  return out;
}

function buildBulletImpact(): Float32Array {
  const ms = 110;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 55);
    out[i] =
      Math.sin(2 * Math.PI * 680 * t) * 0.35 * env +
      Math.sin(2 * Math.PI * 1220 * t) * 0.18 * env +
      whiteNoise() * 0.22 * env;
  }
  return out;
}

function buildWaveHorn(): Float32Array {
  const ms = 820;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  const notes = [
    { f: 196, len: 0.22, start: 0 },
    { f: 246.94, len: 0.22, start: 0.24 },
    { f: 293.66, len: 0.34, start: 0.48 },
  ];
  for (const note of notes) {
    const start = Math.floor(note.start * SAMPLE_RATE);
    const len = Math.floor(note.len * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env =
        Math.sin((Math.PI * i) / len) *
        (0.55 + 0.15 * Math.sin(2 * Math.PI * 5 * t));
      const br =
        Math.sin(2 * Math.PI * note.f * t) * 0.55 +
        Math.sin(2 * Math.PI * note.f * 2 * t) * 0.22 +
        Math.sin(2 * Math.PI * note.f * 3 * t) * 0.1;
      out[start + i] += br * env;
    }
  }
  return out;
}

function buildUiTone(freq: number, ms: number, bright = false): Float32Array {
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.pow(1 - i / n, bright ? 0.35 : 0.55);
    let s = Math.sin(2 * Math.PI * freq * t) * 0.55;
    if (bright) s += Math.sin(2 * Math.PI * freq * 2.02 * t) * 0.2;
    out[i] = s * env;
  }
  return out;
}

async function writeAndLoadSound(
  fileKey: string,
  base64: string,
  baseVolume: number
): Promise<Audio.Sound | null> {
  try {
    const uri = `${FileSystem.cacheDirectory}sfx_${fileKey}.wav`;
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, volume: baseVolume, isLooping: false }
    );
    return sound;
  } catch {
    return null;
  }
}

async function ensureSoundFromFloat(
  key: string,
  samples: Float32Array,
  baseVolume: number
): Promise<Audio.Sound | null> {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  let base64 = '';
  try {
    base64 = float32ToWavBase64(samples);
  } catch {
    return null;
  }
  const s = await writeAndLoadSound(key, base64, baseVolume);
  if (s) cache.set(key, s);
  return s;
}

async function ensurePoolFromFloat(
  poolKey: string,
  samples: Float32Array,
  baseVolume: number,
  count: number
): Promise<void> {
  if (pools.has(poolKey)) return;
  try {
    const base64 = float32ToWavBase64(samples);
    const uri = `${FileSystem.cacheDirectory}sfx_${poolKey}.wav`;
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const sounds: Audio.Sound[] = [];
    for (let i = 0; i < count; i++) {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false, volume: baseVolume, isLooping: false }
      );
      sounds.push(sound);
    }
    pools.set(poolKey, { sounds, i: 0 });
  } catch {
    /* ignore pool init failure */
  }
}

async function applyVolumeThenReplay(sound: Audio.Sound, slotKey: string, finalVolume: number): Promise<void> {
  const prev = lastAppliedVolume.get(slotKey);
  if (prev === undefined || Math.abs(prev - finalVolume) >= VOLUME_SKIP_EPSILON) {
    await sound.setVolumeAsync(finalVolume);
    lastAppliedVolume.set(slotKey, finalVolume);
  }
  await sound.replayAsync();
}

async function playSoundKeyAsync(key: string, baseVolume: number): Promise<boolean> {
  try {
    const ready = await ensureAudioReady();
    if (!ready) return false;
    if (gameplayNativeHardOff && isGameplaySoundKey(key)) return false;
    if (!gameplaySfxArmed && isGameplaySoundKey(key)) return false;
    if (!shouldPlaySfx()) return false;
    const gain = getSfxGain();
    let sound: Audio.Sound | null | undefined = cache.get(key);
    if (!sound && key.startsWith('ui_')) {
      const fallback = key.replace('ui_', '') as SfxName;
      const built = getCachedUiTones()[fallback];
      if (!built) return false;
      sound = await ensureSoundFromFloat(key, built, 1);
    }
    if (!sound) return false;
    if (!gameplaySfxArmed && isGameplaySoundKey(key)) return false;
    const finalVolume = baseVolume * gain;
    await applyVolumeThenReplay(sound, `key:${key}`, finalVolume);
    return true;
  } catch {
    if (isGameplaySoundKey(key)) {
      disableGameplaySfxAfterNativeError();
    }
    return false;
  }
}

async function playPooledAsync(poolKey: string, baseVolume: number): Promise<boolean> {
  try {
    if (gameplayNativeHardOff) return false;
    const ready = await ensureAudioReady();
    if (!ready) return false;
    if (!shouldPlaySfx()) return false;
    if (!gameplaySfxArmed) return false;
    const gain = getSfxGain();
    const p = pools.get(poolKey);
    if (!p) return false;
    const idx = p.i % p.sounds.length;
    const snd = p.sounds[idx];
    p.i++;
    if (!gameplaySfxArmed) return false;
    const finalVolume = baseVolume * gain;
    await applyVolumeThenReplay(snd, `pool:${poolKey}:${idx}`, finalVolume);
    return true;
  } catch {
    disableGameplaySfxAfterNativeError();
    return false;
  }
}

async function playCombatPooled(baseVolume: number): Promise<boolean> {
  return playPooledAsync(COMBAT_POOL_KEY, baseVolume);
}

let lastLaserFireAt = 0;
let lastMgFireAt = 0;

/** Global cap so mass kills cannot flood the native audio bridge. */
const DEATH_PLAY_WINDOW_MS = 1000;
/** ~9 enemy-death voices per second max (native bridge budget). */
const DEATH_MAX_PLAYS_PER_WINDOW = 9;
let deathRateWindowStart = 0;
let deathRateWindowCount = 0;

function tryConsumeDeathPlaySlot(): boolean {
  const t = Date.now();
  if (t - deathRateWindowStart >= DEATH_PLAY_WINDOW_MS) {
    deathRateWindowStart = t;
    deathRateWindowCount = 0;
  }
  if (deathRateWindowCount >= DEATH_MAX_PLAYS_PER_WINDOW) return false;
  deathRateWindowCount += 1;
  return true;
}

async function playWeaponFireSoundAsync(towerType: TowerType): Promise<void> {
  if (gameplayNativeHardOff) return;
  if (!gameplaySfxArmed) return;
  if (!shouldPlaySfx()) return;
  if (towerType === 'splash' || towerType === 'missile') return;
  const map: Partial<Record<TowerType, string>> = {
    sniper: 'weapon_sniper',
    freeze: 'weapon_freeze_launch',
  };
  const k = map[towerType];
  if (!k) return;
  const vol = towerType === 'sniper' ? 0.9 : 0.72;
  await playSoundKeyAsync(k, vol);
}

/** Weapon discharge — splash/missile only use impact (explosion), not this */
export function playWeaponFireSound(towerType: TowerType): void {
  try {
    if (gameplayNativeHardOff) return;
    if (!gameplaySfxArmed) return;
    if (isSoundMasterOff()) return;
    if (getSfxGain() <= 0.001) return;
    if (towerType === 'splash' || towerType === 'missile') return;

    if (towerType === 'laser') {
      const now = Date.now();
      if (now - lastLaserFireAt < 88) return;
      lastLaserFireAt = now;
      deferGameplaySfx(() => playCombatPooled(0.92));
      return;
    }

    if (towerType === 'machine_gun') {
      const now = Date.now();
      if (now - lastMgFireAt < 38) return;
      lastMgFireAt = now;
      deferGameplaySfx(() => playCombatPooled(0.88));
      return;
    }

    deferGameplaySfx(() => playWeaponFireSoundAsync(towerType));
  } catch {
    disableGameplaySfxAfterNativeError();
  }
}

/** Projectile reached target */
export function playProjectileImpact(proj: {
  isSplash?: boolean;
  isFreeze?: boolean;
  towerType: TowerType;
}): void {
  try {
    if (gameplayNativeHardOff) return;
    if (!gameplaySfxArmed) return;
    if (isSoundMasterOff()) return;
    if (getSfxGain() <= 0.001) return;
    deferGameplaySfx(async () => {
      if (!gameplaySfxArmed) return;
      if (proj.isSplash || proj.towerType === 'missile' || proj.towerType === 'splash') {
        await playCombatPooled(0.94);
      } else if (proj.isFreeze || proj.towerType === 'freeze') {
        await playCombatPooled(0.95);
      } else {
        await playCombatPooled(0.62);
      }
    });
  } catch {
    disableGameplaySfxAfterNativeError();
  }
}

function playEnemyDeathOneShot(): void {
  try {
    if (gameplayNativeHardOff) return;
    if (!gameplaySfxArmed) return;
    if (isSoundMasterOff()) return;
    if (getSfxGain() <= 0.001) return;
    deferGameplaySfx(async () => {
      if (!gameplaySfxArmed) return;
      if (!tryConsumeDeathPlaySlot()) return;
      await playCombatPooled(0.78);
    });
  } catch {
    disableGameplaySfxAfterNativeError();
  }
}

/** Staggered stings when many enemies die the same tick (capped + rate limited). */
export function playEnemyDeathBurst(killCount: number): void {
  try {
    if (gameplayNativeHardOff) return;
    if (!gameplaySfxArmed || killCount <= 0) return;
    if (isSoundMasterOff()) return;
    if (getSfxGain() <= 0.001) return;
    const gen = deathBurstGeneration;
    const layers = Math.min(2, killCount);
    for (let i = 0; i < layers; i++) {
      const delay = i * 56;
      setTimeout(() => {
        if (gen !== deathBurstGeneration) return;
        if (!gameplaySfxArmed) return;
        playEnemyDeathOneShot();
      }, delay);
    }
  } catch {
    disableGameplaySfxAfterNativeError();
  }
}

export function playBaseDamageSound(): void {
  try {
    if (gameplayNativeHardOff) return;
    if (!gameplaySfxArmed) return;
    if (isSoundMasterOff()) return;
    if (getSfxGain() <= 0.001) return;
    deferGameplaySfx(() => playCombatPooled(0.85));
  } catch {
    disableGameplaySfxAfterNativeError();
  }
}

export function playWaveStartFanfare(): void {
  try {
    if (gameplayNativeHardOff) return;
    if (!gameplaySfxArmed) return;
    if (isSoundMasterOff()) return;
    if (getSfxGain() <= 0.001) return;
    deferGameplaySfx(() => playSoundKeyAsync('wave_horn', 0.82));
  } catch {
    disableGameplaySfxAfterNativeError();
  }
}

export const initializeAudio = async (): Promise<void> => {
  if (audioReady) return;
  if (audioInitPromise) return audioInitPromise;
  audioInitPromise = (async () => {
  try {
    await Audio.setIsEnabledAsync(true);
    await Audio.setAudioModeAsync({
      // Force SFX to work even when iOS hardware silent switch is on.
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    /** One shared combat WAV + small round-robin pool; rare stingers stay single cached `Sound`s. */
    await ensurePoolFromFloat(COMBAT_POOL_KEY, getCachedCombatImpact(), 1, COMBAT_POOL_SIZE);
    await ensureSoundFromFloat('weapon_sniper', getCachedSniperCrack(), 1);
    await ensureSoundFromFloat('weapon_freeze_launch', getCachedFreezeLaunch(), 1);
    await ensureSoundFromFloat('wave_horn', getCachedWaveHorn(), 1);

    const ui = getCachedUiTones();
    for (const k of Object.keys(ui) as SfxName[]) {
      await ensureSoundFromFloat(`ui_${k}`, ui[k], 1);
    }

    audioReady = true;
  } catch {
    audioReady = false;
  } finally {
    audioInitPromise = null;
  }
  })();
  return audioInitPromise;
};

export const ensureAudioReady = async (): Promise<boolean> => {
  if (audioReady) return true;
  if (audioInitPromise) {
    try {
      await audioInitPromise;
    } catch {
      /* ignore */
    }
  }
  if (!audioReady) {
    await initializeAudio();
  }
  return audioReady;
};

export const refreshAudioModeOnForeground = async (): Promise<void> => {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    /* ignore; next playback attempt will retry full init if needed */
  }
};

/** True when UI stingers are allowed — use in React to skip `playSfx` entirely when muted. */
export function canPlayUiSfx(): boolean {
  try {
    if (isSoundMasterOff()) return false;
    return getSfxGain() > 0.001;
  } catch {
    return false;
  }
}

/** Call when leaving the game screen or ending a run — stops SFX and cancels pending death bursts. */
export async function cleanupGameplayAudioAfterSession(): Promise<void> {
  await stopAllSounds();
}

/** UI / reward stingers — reads soundEnabled + sfxVolume from player store */
export function playSfx(name: SfxName): void {
  try {
    if (!canPlayUiSfx()) return;
    deferUiSfx(() => playSoundKeyAsync(`ui_${name}`, name === 'record' ? 0.72 : 0.68));
  } catch {
    /* ignore */
  }
}
