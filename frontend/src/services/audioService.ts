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

const SAMPLE_RATE = 44100;
const BYTES_PER_SAMPLE = 2;

const cache = new Map<string, Audio.Sound>();
const pools = new Map<string, { sounds: Audio.Sound[]; i: number }>();
let audioReady = false;
let audioInitPromise: Promise<void> | null = null;
let audioLastError: string | null = null;
const AUDIO_DEBUG = __DEV__;

/** When false, combat SFX (weapons, impacts, deaths, base, wave horn) do not start. */
let gameplaySfxArmed = false;
/** Incremented to cancel pending `playEnemyDeathBurst` timeouts. */
let deathBurstGeneration = 0;

function logAudio(...args: unknown[]) {
  if (AUDIO_DEBUG) console.log('[audioService]', ...args);
}

function warnAudio(...args: unknown[]) {
  console.warn('[audioService]', ...args);
}

export type SfxName = 'mission' | 'combo' | 'chest' | 'record';

function getSfxGain(): number {
  const s = usePlayerStore.getState();
  logAudio('getSfxGain()', { soundEnabled: s.soundEnabled, sfxVolume: s.sfxVolume });
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
      sound.stopAsync().catch((err) => {
        logAudio('silenceAllLoadedSounds cache stopAsync', err);
      })
    );
  }
  for (const pool of pools.values()) {
    for (const sound of pool.sounds) {
      tasks.push(
        sound.stopAsync().catch((err) => {
          logAudio('silenceAllLoadedSounds pool stopAsync', err);
        })
      );
    }
  }
  await Promise.all(tasks);
}

/** Stops every loaded SFX instance, invalidates staggered death timers, and disarms gameplay audio. */
export async function stopAllSounds(): Promise<void> {
  deathBurstGeneration++;
  gameplaySfxArmed = false;
  await silenceAllLoadedSounds();
}

/** Enable/disable combat SFX. Setting false stops playback and pending death-burst schedules. */
export function setGameplaySfxArmed(armed: boolean): void {
  gameplaySfxArmed = armed;
  if (!armed) {
    deathBurstGeneration++;
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

function buildMachineGunBurst(): Float32Array {
  const ms = 340;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  const shots = 8;
  const spacing = Math.floor(SAMPLE_RATE * 0.028);
  const shotLen = Math.floor(SAMPLE_RATE * 0.014);
  for (let s = 0; s < shots; s++) {
    const start = s * spacing;
    const f0 = 520 - s * 38;
    for (let i = 0; i < shotLen && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.pow(1 - i / shotLen, 1.4);
      const kick = Math.sin(2 * Math.PI * f0 * t) * 0.55;
      const crack =
        (Math.sin(2 * Math.PI * f0 * 2.3 * t) * 0.22 +
          Math.sin(2 * Math.PI * f0 * 3.7 * t) * 0.12) *
        env;
      const tail =
        whiteNoise() * 0.55 * env * (1 + Math.sin(i * 0.35) * 0.15);
      out[start + i] += (kick + crack + tail) * 0.55;
    }
  }
  return out;
}

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

function buildLaserZapHum(): Float32Array {
  const ms = 200;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  const zapEnd = Math.floor(SAMPLE_RATE * 0.022);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    if (i < zapEnd) {
      const env = Math.pow(1 - i / zapEnd, 0.5);
      out[i] +=
        Math.sin(2 * Math.PI * 2650 * t) * 0.55 * env +
        Math.sin(2 * Math.PI * 5300 * t) * 0.15 * env +
        whiteNoise() * 0.12 * env;
    } else {
      const j = i - zapEnd;
      const humEnv = Math.min(1, j / (SAMPLE_RATE * 0.04)) * Math.pow(1 - j / (n - zapEnd), 0.35);
      out[i] +=
        Math.sin(2 * Math.PI * 155 * t) * 0.42 * humEnv +
        Math.sin(2 * Math.PI * 310 * t) * 0.15 * humEnv +
        Math.sin(2 * Math.PI * 620 * t) * 0.08 * humEnv;
    }
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

function buildFreezeShatter(): Float32Array {
  const ms = 420;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  const crackEnd = Math.floor(SAMPLE_RATE * 0.14);
  for (let i = 0; i < crackEnd; i++) {
    const env = Math.pow(1 - i / crackEnd, 0.35);
    out[i] += whiteNoise() * 0.65 * env * (0.7 + Math.random() * 0.5);
  }
  const shards = [3100, 4200, 2800, 5100, 3600];
  for (let k = 0; k < shards.length; k++) {
    const start = crackEnd + Math.floor(SAMPLE_RATE * 0.018 * k);
    const len = Math.floor(SAMPLE_RATE * 0.045);
    const f = shards[k];
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.pow(1 - i / len, 2.2);
      out[start + i] += Math.sin(2 * Math.PI * f * t) * 0.35 * env;
    }
  }
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    out[i] += Math.sin(2 * Math.PI * 220 * t) * 0.08 * Math.pow(1 - i / n, 1.5);
  }
  return out;
}

function buildExplosion(): Float32Array {
  const ms = 520;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  const boom = Math.floor(SAMPLE_RATE * 0.22);
  for (let i = 0; i < boom; i++) {
    const t = i / SAMPLE_RATE;
    const pitch = 140 * Math.exp(-t * 12) + 38;
    const env = Math.pow(1 - i / boom, 0.15);
    out[i] += Math.sin(2 * Math.PI * pitch * t) * 0.65 * env;
  }
  for (let i = 0; i < n; i++) {
    const env = Math.pow(1 - i / n, 0.45);
    out[i] += whiteNoise() * 0.55 * env;
  }
  for (let i = 0; i < Math.min(n, SAMPLE_RATE * 0.12); i++) {
    const env = Math.pow(1 - i / (SAMPLE_RATE * 0.12), 3);
    out[i] += whiteNoise() * 0.35 * env;
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

function buildEnemyDeath(): Float32Array {
  const ms = 200;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const drop = 880 * Math.exp(-t * 14) + 180;
    const env = Math.pow(1 - i / n, 0.25);
    out[i] =
      Math.sin(2 * Math.PI * drop * t) * 0.45 * env +
      whiteNoise() * 0.2 * env;
  }
  return out;
}

function buildBaseHit(): Float32Array {
  const ms = 280;
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  const thud = Math.floor(SAMPLE_RATE * 0.14);
  for (let i = 0; i < thud; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.pow(1 - i / thud, 0.5);
    out[i] +=
      Math.sin(2 * Math.PI * 58 * t) * 0.7 * env +
      Math.sin(2 * Math.PI * 120 * t) * 0.25 * env;
  }
  for (let i = 0; i < n; i++) {
    const env = Math.pow(1 - i / n, 1.2);
    out[i] += whiteNoise() * 0.12 * env;
  }
  for (let i = 0; i < Math.min(n, SAMPLE_RATE * 0.08); i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 35);
    out[i] += Math.sin(2 * Math.PI * 420 * t) * 0.15 * env;
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
    logAudio('writeAndLoadSound() start', { fileKey, baseVolume });
    const uri = `${FileSystem.cacheDirectory}sfx_${fileKey}.wav`;
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, volume: baseVolume, isLooping: false }
    );
    logAudio('writeAndLoadSound() success', { fileKey, uri });
    return sound;
  } catch (err) {
    warnAudio('writeAndLoadSound() failed', { fileKey, err });
    return null;
  }
}

async function ensureSoundFromFloat(
  key: string,
  samples: Float32Array,
  baseVolume: number
): Promise<Audio.Sound | null> {
  logAudio('ensureSoundFromFloat()', { key });
  const existing = cache.get(key);
  if (existing) {
    logAudio('ensureSoundFromFloat() cache hit', { key });
    return existing;
  }
  let base64 = '';
  try {
    base64 = float32ToWavBase64(samples);
  } catch (err) {
    warnAudio('ensureSoundFromFloat() wav generation failed', { key, err });
    return null;
  }
  const s = await writeAndLoadSound(key, base64, baseVolume);
  if (s) cache.set(key, s);
  else warnAudio('ensureSoundFromFloat() load failed', { key });
  return s;
}

async function ensurePoolFromFloat(
  poolKey: string,
  samples: Float32Array,
  baseVolume: number,
  count: number
): Promise<void> {
  logAudio('ensurePoolFromFloat()', { poolKey, count });
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
    logAudio('ensurePoolFromFloat() success', { poolKey, count });
  } catch (err) {
    warnAudio('ensurePoolFromFloat() failed', { poolKey, err });
  }
}

async function playSoundKey(key: string, baseVolume: number): Promise<boolean> {
  logAudio('playSoundKey() start', { key, baseVolume });
  const ready = await ensureAudioReady();
  if (!ready) {
    warnAudio('playSoundKey() skipped: audio not ready', { key });
    return false;
  }
  if (!gameplaySfxArmed && isGameplaySoundKey(key)) {
    logAudio('playSoundKey() skipped after init: gameplay disarmed', { key });
    return false;
  }
  if (!shouldPlaySfx()) {
    logAudio('playSoundKey() skipped by shouldPlaySfx()', { key });
    return false;
  }
  const gain = getSfxGain();
  let sound = cache.get(key);
  if (!sound && key.startsWith('ui_')) {
    warnAudio('playSoundKey() cache miss for UI sound, attempting fallback build', { key });
    const fallback = key.replace('ui_', '') as SfxName;
    const built = buildUiTone(fallback === 'record' ? 1180 : fallback === 'combo' ? 1040 : fallback === 'chest' ? 620 : 740, fallback === 'chest' ? 160 : fallback === 'combo' ? 140 : fallback === 'record' ? 130 : 120, true);
    sound = await ensureSoundFromFloat(key, built, 1);
  }
  if (!sound) {
    warnAudio('playSoundKey() failed: no sound in cache', { key });
    return false;
  }
  if (!gameplaySfxArmed && isGameplaySoundKey(key)) {
    logAudio('playSoundKey() skipped before replay: gameplay disarmed', { key });
    return false;
  }
  try {
    const finalVolume = baseVolume * gain;
    await sound.setVolumeAsync(finalVolume);
    await sound.replayAsync();
    logAudio('playSoundKey() replay success', { key, gain, finalVolume });
    return true;
  } catch (err) {
    warnAudio('playSoundKey() replay failed', { key, err });
    return false;
  }
}

async function playPooled(poolKey: string, baseVolume: number): Promise<boolean> {
  logAudio('playPooled() start', { poolKey, baseVolume });
  const ready = await ensureAudioReady();
  if (!ready) {
    warnAudio('playPooled() skipped: audio not ready', { poolKey });
    return false;
  }
  if (!shouldPlaySfx()) {
    logAudio('playPooled() skipped by shouldPlaySfx()', { poolKey });
    return false;
  }
  if (!gameplaySfxArmed) {
    logAudio('playPooled() skipped: gameplay disarmed', { poolKey });
    return false;
  }
  const gain = getSfxGain();
  const p = pools.get(poolKey);
  if (!p) {
    warnAudio('playPooled() missing pool', { poolKey });
    return false;
  }
  const snd = p.sounds[p.i % p.sounds.length];
  p.i++;
  if (!gameplaySfxArmed) {
    logAudio('playPooled() skipped before replay: gameplay disarmed', { poolKey });
    return false;
  }
  try {
    const finalVolume = baseVolume * gain;
    await snd.setVolumeAsync(finalVolume);
    await snd.replayAsync();
    logAudio('playPooled() replay success', { poolKey, gain, finalVolume });
    return true;
  } catch (err) {
    warnAudio('playPooled() replay failed', { poolKey, err });
    return false;
  }
}

let lastLaserFireAt = 0;
let lastMgFireAt = 0;

/** Weapon discharge — splash/missile only use impact (explosion), not this */
export async function playWeaponFireSound(towerType: TowerType): Promise<void> {
  logAudio('playWeaponFireSound()', { towerType });
  if (!gameplaySfxArmed) return;
  if (!shouldPlaySfx()) return;
  if (towerType === 'splash' || towerType === 'missile') return;

  if (towerType === 'laser') {
    const now = Date.now();
    if (now - lastLaserFireAt < 88) return;
    lastLaserFireAt = now;
    return playSoundKey('weapon_laser', 0.92);
  }

  if (towerType === 'machine_gun') {
    const now = Date.now();
    if (now - lastMgFireAt < 38) return;
    lastMgFireAt = now;
    return playSoundKey('weapon_mg', 0.88);
  }

  const map: Partial<Record<TowerType, string>> = {
    sniper: 'weapon_sniper',
    freeze: 'weapon_freeze_launch',
  };
  const k = map[towerType];
  if (!k) return;
  const vol = towerType === 'sniper' ? 0.9 : 0.72;
  return playSoundKey(k, vol);
}

/** Projectile reached target */
export async function playProjectileImpact(proj: {
  isSplash?: boolean;
  isFreeze?: boolean;
  towerType: TowerType;
}): Promise<void> {
  logAudio('playProjectileImpact()', proj);
  if (!gameplaySfxArmed) return;
  if (!shouldPlaySfx()) return;
  if (proj.isSplash || proj.towerType === 'missile' || proj.towerType === 'splash') {
    return playPooled('impact_explosion', 0.94);
  }
  if (proj.isFreeze || proj.towerType === 'freeze') {
    return playPooled('impact_freeze', 0.95);
  }
  return playPooled('impact_bullet', 0.62);
}

export async function playEnemyDeath(): Promise<void> {
  if (!gameplaySfxArmed) return;
  return playPooled('enemy_death', 0.78);
}

/** Staggered stings when many enemies die the same tick (capped) */
export async function playEnemyDeathBurst(killCount: number): Promise<void> {
  logAudio('playEnemyDeathBurst()', { killCount });
  if (!gameplaySfxArmed || !shouldPlaySfx() || killCount <= 0) return;
  const n = Math.min(killCount, 6);
  const gen = deathBurstGeneration;
  for (let i = 0; i < n; i++) {
    const delay = i * 34;
    setTimeout(() => {
      if (gen !== deathBurstGeneration) return;
      if (!gameplaySfxArmed) return;
      void playEnemyDeath();
    }, delay);
  }
}

export async function playBaseDamageSound(): Promise<void> {
  if (!gameplaySfxArmed) return;
  return playPooled('base_hit', 0.85);
}

export async function playWaveStartFanfare(): Promise<void> {
  if (!gameplaySfxArmed) return;
  return playSoundKey('wave_horn', 0.82);
}

export const initializeAudio = async (): Promise<void> => {
  logAudio('initializeAudio() called', {
    audioReady,
    hasInitPromise: !!audioInitPromise,
    soundEnabled: usePlayerStore.getState().soundEnabled,
  });
  if (audioReady) return;
  if (audioInitPromise) return audioInitPromise;
  audioInitPromise = (async () => {
  try {
    await Audio.setIsEnabledAsync(true);
    logAudio('initializeAudio() Audio.setIsEnabledAsync success');
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
    logAudio('initializeAudio() Audio.setAudioModeAsync success');

    await ensureSoundFromFloat('weapon_mg', buildMachineGunBurst(), 1);
    await ensureSoundFromFloat('weapon_sniper', buildSniperCrack(), 1);
    await ensureSoundFromFloat('weapon_laser', buildLaserZapHum(), 1);
    await ensureSoundFromFloat('weapon_freeze_launch', buildFreezeLaunch(), 1);

    await ensurePoolFromFloat('impact_explosion', buildExplosion(), 1, 4);
    await ensurePoolFromFloat('impact_freeze', buildFreezeShatter(), 1, 3);
    await ensurePoolFromFloat('impact_bullet', buildBulletImpact(), 1, 3);
    await ensurePoolFromFloat('enemy_death', buildEnemyDeath(), 1, 4);
    await ensurePoolFromFloat('base_hit', buildBaseHit(), 1, 2);

    await ensureSoundFromFloat('wave_horn', buildWaveHorn(), 1);

    const ui: Record<SfxName, Float32Array> = {
      mission: buildUiTone(740, 120, true),
      combo: buildUiTone(1040, 140, true),
      chest: buildUiTone(620, 160, true),
      record: buildUiTone(1180, 130, true),
    };
    for (const k of Object.keys(ui) as SfxName[]) {
      await ensureSoundFromFloat(`ui_${k}`, ui[k], 1);
    }

    audioReady = true;
    audioLastError = null;
    logAudio('initializeAudio() success', { cacheCount: cache.size, poolCount: pools.size });
  } catch (err) {
    audioReady = false;
    audioLastError = err instanceof Error ? err.message : 'Audio initialization failed';
    warnAudio('initializeAudio() failed', { err, audioLastError });
  } finally {
    audioInitPromise = null;
  }
  })();
  return audioInitPromise;
};

export const ensureAudioReady = async (): Promise<boolean> => {
  logAudio('ensureAudioReady() start', { audioReady, hasInitPromise: !!audioInitPromise });
  if (audioInitPromise) {
    try {
      await audioInitPromise;
    } catch (err) {
      warnAudio('ensureAudioReady() waiting init promise failed', { err });
    }
  }
  if (!audioReady) {
    await initializeAudio();
  }
  logAudio('ensureAudioReady() end', { audioReady, lastError: audioLastError });
  return audioReady;
};

export const refreshAudioModeOnForeground = async (): Promise<void> => {
  try {
    logAudio('refreshAudioModeOnForeground() start');
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    logAudio('refreshAudioModeOnForeground() success');
  } catch (err) {
    warnAudio('refreshAudioModeOnForeground() failed', { err });
    // ignore; next playback attempt will retry full init if needed
  }
};

export const getAudioDebugState = () => ({
  ready: audioReady,
  cacheCount: cache.size,
  poolCount: pools.size,
  lastError: audioLastError,
});

/** UI / reward stingers — reads soundEnabled + sfxVolume from player store */
export const playSfx = async (name: SfxName): Promise<boolean> => {
  logAudio('playSfx()', { name });
  return playSoundKey(`ui_${name}`, name === 'record' ? 0.72 : 0.68);
};
