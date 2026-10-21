/**
 * Original procedural SFX and music (see docs/ASSETS.md).
 *
 * iOS silent switch: playsInSilentModeIOS is true, so the game is audible with
 * the ringer off. The in-game mute and sliders are the controls. Music pauses
 * when the app is backgrounded and resumes on the next active transition.
 */
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, type AppStateStatus } from 'react-native';
import { Buffer } from 'buffer';
import type { TowerType } from '../constants/game';
import { usePlayerStore } from '../stores/playerStore';
import { mixEqualPower, musicGain, sfxGain } from '../logic/audioMix';

export type SfxName = 'mission' | 'combo' | 'chest' | 'record';
export type MusicTrack = 'menu' | 'battle' | 'boss' | 'defeat';

const SAMPLE_RATE = 22050;
const BYTES_PER_SAMPLE = 2;

type Slot = { sound: Audio.Sound; track: MusicTrack; base64Key: string };

const cache = new Map<string, Audio.Sound>();
let audioReady = false;
let audioInitPromise: Promise<void> | null = null;
let gameplaySfxArmed = false;
let appStateBound = false;
let storeBound = false;
let musicSuspended = false;
let currentTrack: MusicTrack | null = null;
let slotA: Slot | null = null;
let slotB: Slot | null = null;
let activeSlot: 'a' | 'b' = 'a';
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let musicToken = 0;
let lastLoseAt = 0;
let lastLaserAt = 0;
let lastMgAt = 0;

const sampleCache = new Map<string, Float32Array>();

function playerAudio() {
  const s = usePlayerStore.getState();
  return {
    sfx: sfxGain(s.soundEnabled, s.sfxVolume),
    music: musicGain(s.musicEnabled, s.musicVolume),
  };
}

function softClip(x: number): number {
  const t = Math.max(-1, Math.min(1, x));
  return t - (t * t * t) / 3;
}

function noise(): number {
  return Math.random() * 2 - 1;
}

function float32ToWavBase64(samples: Float32Array): string {
  let peak = 0.0001;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const norm = 0.9 / peak;
  const dataSize = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, softClip(samples[i] * norm) * 32767, true);
  }
  return Buffer.from(new Uint8Array(buffer)).toString('base64');
}

function tone(freq: number, ms: number, bright = false): Float32Array {
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.pow(1 - i / n, bright ? 0.35 : 0.55);
    let s = Math.sin(2 * Math.PI * freq * t) * 0.55;
    if (bright) s += Math.sin(2 * Math.PI * freq * 2 * t) * 0.18;
    out[i] = s * env;
  }
  return out;
}

function noiseBurst(ms: number, freq: number, amount: number): Float32Array {
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * (ms < 80 ? 40 : 18));
    out[i] =
      Math.sin(2 * Math.PI * freq * t) * 0.45 * env +
      Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.15 * env +
      noise() * amount * env;
  }
  return out;
}

function buildShot(kind: 'mg' | 'sniper' | 'splash' | 'freeze' | 'missile' | 'laser' | 'tesla' | 'flak' | 'cannon'): Float32Array {
  switch (kind) {
    case 'sniper':
      return noiseBurst(180, 980, 0.28);
    case 'splash':
    case 'missile':
    case 'cannon':
      return noiseBurst(220, kind === 'cannon' ? 140 : 220, 0.45);
    case 'freeze':
      return tone(880, 90, true);
    case 'laser':
      return tone(1480, 70, true);
    case 'tesla':
      return noiseBurst(90, 640, 0.35);
    case 'flak':
      return noiseBurst(120, 420, 0.4);
    default:
      return noiseBurst(60, 520, 0.3);
  }
}

function buildImpact(): Float32Array {
  return noiseBurst(100, 360, 0.32);
}

function buildDeath(): Float32Array {
  return noiseBurst(160, 180, 0.4);
}

function buildBuild(): Float32Array {
  return tone(520, 90, true);
}

function buildUpgrade(): Float32Array {
  const a = tone(660, 80, true);
  const b = tone(880, 110, true);
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function buildWave(): Float32Array {
  const notes = [392, 494, 587];
  const n = Math.floor(SAMPLE_RATE * 0.7);
  const out = new Float32Array(n);
  notes.forEach((f, idx) => {
    const start = Math.floor(idx * 0.18 * SAMPLE_RATE);
    const len = Math.floor(0.28 * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < n; i++) {
      const env = Math.sin((Math.PI * i) / len);
      out[start + i] += Math.sin((2 * Math.PI * f * i) / SAMPLE_RATE) * 0.4 * env;
    }
  });
  return out;
}

function buildWin(): Float32Array {
  const notes = [523, 659, 784, 1046];
  const n = Math.floor(SAMPLE_RATE * 0.9);
  const out = new Float32Array(n);
  notes.forEach((f, idx) => {
    const start = Math.floor(idx * 0.16 * SAMPLE_RATE);
    const len = Math.floor(0.28 * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < n; i++) {
      const env = Math.sin((Math.PI * i) / len);
      out[start + i] += Math.sin((2 * Math.PI * f * i) / SAMPLE_RATE) * 0.35 * env;
    }
  });
  return out;
}

function buildLose(): Float32Array {
  const notes = [392, 349, 294, 220];
  const n = Math.floor(SAMPLE_RATE * 1.1);
  const out = new Float32Array(n);
  notes.forEach((f, idx) => {
    const start = Math.floor(idx * 0.2 * SAMPLE_RATE);
    const len = Math.floor(0.32 * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < n; i++) {
      const env = Math.pow(1 - i / len, 0.6);
      out[start + i] += Math.sin((2 * Math.PI * f * i) / SAMPLE_RATE) * 0.4 * env;
    }
  });
  return out;
}

function buildMusic(track: 'menu' | 'battle' | 'boss' | 'defeat'): Float32Array {
  const seconds = track === 'defeat' ? 3.2 : 8;
  const n = Math.floor(SAMPLE_RATE * seconds);
  const out = new Float32Array(n);
  const scale =
    track === 'boss'
      ? [110, 130.81, 146.83, 174.61]
      : track === 'battle'
        ? [146.83, 174.61, 196, 233.08]
        : track === 'defeat'
          ? [196, 174.61, 146.83, 130.81]
          : [220, 246.94, 293.66, 329.63];
  const step = track === 'boss' ? 0.45 : track === 'battle' ? 0.34 : track === 'defeat' ? 0.55 : 0.5;
  const root = scale[0] / 2;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    out[i] += Math.sin(2 * Math.PI * root * t) * 0.16;
    out[i] += Math.sin(2 * Math.PI * root * 2 * t) * 0.04;
    const note = scale[Math.floor(t / step) % scale.length];
    const local = (t % step) / step;
    const env = Math.sin(Math.PI * Math.min(1, local)) * (1 - local * 0.35);
    out[i] += Math.sin(2 * Math.PI * note * t) * 0.2 * env;
    out[i] += Math.sin(2 * Math.PI * note * 2 * t) * 0.05 * env;
    if (track !== 'menu' && local < 0.03) out[i] += noise() * 0.03;
  }
  if (track !== 'defeat') {
    const fade = Math.floor(SAMPLE_RATE * 0.04);
    for (let i = 0; i < fade; i++) {
      const w = i / fade;
      const tail = out[n - fade + i];
      out[i] = out[i] * w + tail * (1 - w);
    }
  }
  return out;
}

function samplesFor(key: string): Float32Array {
  const hit = sampleCache.get(key);
  if (hit) return hit;
  let built: Float32Array;
  if (key.startsWith('music_')) built = buildMusic(key.slice(6) as 'menu' | 'battle' | 'boss' | 'defeat');
  else if (key.startsWith('shot_')) built = buildShot(key.slice(5) as 'mg');
  else if (key === 'impact') built = buildImpact();
  else if (key === 'death') built = buildDeath();
  else if (key === 'build') built = buildBuild();
  else if (key === 'upgrade') built = buildUpgrade();
  else if (key === 'wave') built = buildWave();
  else if (key === 'win') built = buildWin();
  else if (key === 'lose') built = buildLose();
  else if (key === 'ui_mission') built = tone(740, 120, true);
  else if (key === 'ui_combo') built = tone(1040, 140, true);
  else if (key === 'ui_chest') built = tone(620, 160, true);
  else built = tone(1180, 130, true);
  sampleCache.set(key, built);
  return built;
}

async function loadSound(key: string, loop: boolean): Promise<Audio.Sound | null> {
  const existing = cache.get(key);
  if (existing && !loop) return existing;
  try {
    const base64 = float32ToWavBase64(samplesFor(key));
    let uri = `data:audio/wav;base64,${base64}`;
    const dir = FileSystem.cacheDirectory;
    if (dir) {
      const fileUri = `${dir}ls_${key}.wav`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      uri = fileUri;
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, volume: 1, isLooping: loop }
    );
    if (!loop) cache.set(key, sound);
    return sound;
  } catch {
    return null;
  }
}

async function ensureAudioReady(): Promise<boolean> {
  if (audioReady) return true;
  await initializeAudio();
  return audioReady;
}

function clearFade() {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

async function applySlotVolume(slot: Slot | null, linear: number) {
  if (!slot) return;
  try {
    await slot.sound.setVolumeAsync(Math.max(0, Math.min(1, linear * playerAudio().music)));
  } catch {
    /* a single volume miss should not mute the game */
  }
}

async function pauseSlot(slot: Slot | null) {
  if (!slot) return;
  try {
    await slot.sound.pauseAsync();
  } catch {
    /* ignore */
  }
}

async function playSlot(slot: Slot | null) {
  if (!slot) return;
  try {
    await slot.sound.playAsync();
  } catch {
    /* ignore */
  }
}

export async function playMusic(track: MusicTrack): Promise<void> {
  const token = ++musicToken;
  currentTrack = track;
  if (musicSuspended) return;
  if (playerAudio().music <= 0.001) {
    await pauseSlot(slotA);
    await pauseSlot(slotB);
    return;
  }
  const ready = await ensureAudioReady();
  if (!ready || token !== musicToken) return;
  const sound = await loadSound(`music_${track}`, track !== 'defeat');
  if (!sound || token !== musicToken) return;
  const outgoing = activeSlot === 'a' ? slotA : slotB;
  const incomingSlotName = activeSlot === 'a' ? 'b' : 'a';
  const previousIncoming = incomingSlotName === 'a' ? slotA : slotB;
  if (previousIncoming && previousIncoming.sound !== sound) {
    try {
      await previousIncoming.sound.unloadAsync();
    } catch {
      /* ignore */
    }
  }
  const incoming: Slot = { sound, track, base64Key: track };
  if (incomingSlotName === 'a') slotA = incoming;
  else slotB = incoming;
  try {
    await sound.setIsLoopingAsync(track !== 'defeat');
    await sound.setPositionAsync(0);
    await sound.setVolumeAsync(0);
    await sound.playAsync();
  } catch {
    return;
  }
  clearFade();
  const started = Date.now();
  const duration = 700;
  fadeTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - started) / duration);
    const mix = mixEqualPower(t);
    void applySlotVolume(outgoing, mix.outgoing);
    void applySlotVolume(incoming, mix.incoming);
    if (t >= 1) {
      clearFade();
      activeSlot = incomingSlotName;
      if (outgoing && outgoing.sound !== incoming.sound) {
        void outgoing.sound.pauseAsync().catch(() => {});
      }
    }
  }, 70);
}

export async function stopMusic(): Promise<void> {
  musicToken += 1;
  currentTrack = null;
  clearFade();
  await pauseSlot(slotA);
  await pauseSlot(slotB);
}

async function resumeCurrentMusic() {
  if (!currentTrack || playerAudio().music <= 0.001) return;
  const slot = activeSlot === 'a' ? slotA : slotB;
  if (slot && slot.track === currentTrack) {
    await applySlotVolume(slot, 1);
    await playSlot(slot);
    return;
  }
  await playMusic(currentTrack);
}

function bindLifecycle() {
  if (!appStateBound) {
    appStateBound = true;
    AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        musicSuspended = false;
        void refreshAudioModeOnForeground().then(() => resumeCurrentMusic());
      } else {
        musicSuspended = true;
        clearFade();
        void pauseSlot(slotA);
        void pauseSlot(slotB);
      }
    });
  }
  if (!storeBound) {
    storeBound = true;
    usePlayerStore.subscribe((state) => {
      const gain = musicGain(state.musicEnabled, state.musicVolume);
      const slot = activeSlot === 'a' ? slotA : slotB;
      if (gain <= 0.001) {
        void pauseSlot(slotA);
        void pauseSlot(slotB);
        return;
      }
      if (currentTrack && (!slot || musicSuspended)) return;
      void applySlotVolume(slot, 1);
      if (currentTrack) void playSlot(slot);
    });
  }
}

export const initializeAudio = async (): Promise<void> => {
  if (audioReady) return;
  if (audioInitPromise) return audioInitPromise;
  audioInitPromise = (async () => {
    try {
      await Audio.setIsEnabledAsync(true);
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      audioReady = true;
      bindLifecycle();
    } catch {
      audioReady = false;
    } finally {
      audioInitPromise = null;
    }
  })();
  return audioInitPromise;
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
    /* next play retries init */
  }
};

async function replayKey(key: string, baseVolume: number, combat: boolean): Promise<void> {
  if (combat && !gameplaySfxArmed) return;
  const gain = playerAudio().sfx;
  if (gain <= 0.001) return;
  const ready = await ensureAudioReady();
  if (!ready) return;
  if (combat && !gameplaySfxArmed) return;
  const sound = await loadSound(key, false);
  if (!sound) return;
  try {
    await sound.setVolumeAsync(Math.max(0, Math.min(1, baseVolume * gain)));
    await sound.replayAsync();
  } catch {
    /* drop this voice only */
  }
}

function defer(op: () => Promise<void>) {
  queueMicrotask(() => {
    void op();
  });
}

export function setGameplaySfxArmed(armed: boolean): void {
  gameplaySfxArmed = armed;
}

export function isGameplaySfxArmed(): boolean {
  return gameplaySfxArmed;
}

export async function stopAllSounds(): Promise<void> {
  gameplaySfxArmed = false;
  const tasks: Promise<unknown>[] = [];
  for (const sound of cache.values()) tasks.push(sound.stopAsync().catch(() => {}));
  await Promise.all(tasks);
}

export async function cleanupGameplayAudioAfterSession(): Promise<void> {
  await stopAllSounds();
  await playMusic('menu');
}

export function canPlayUiSfx(): boolean {
  return playerAudio().sfx > 0.001;
}

export function playSfx(name: SfxName): void {
  if (!canPlayUiSfx()) return;
  defer(() => replayKey(`ui_${name}`, name === 'record' ? 0.72 : 0.68, false));
}

const SHOT_KEY: Record<TowerType, string> = {
  machine_gun: 'shot_mg',
  sniper: 'shot_sniper',
  splash: 'shot_splash',
  freeze: 'shot_freeze',
  missile: 'shot_missile',
  laser: 'shot_laser',
  tesla: 'shot_tesla',
  flak: 'shot_flak',
  cannon: 'shot_cannon',
};

export function playWeaponFireSound(towerType: TowerType): void {
  if (!gameplaySfxArmed || playerAudio().sfx <= 0.001) return;
  const now = Date.now();
  if (towerType === 'laser') {
    if (now - lastLaserAt < 90) return;
    lastLaserAt = now;
  } else if (towerType === 'machine_gun') {
    if (now - lastMgAt < 45) return;
    lastMgAt = now;
  }
  defer(() => replayKey(SHOT_KEY[towerType], towerType === 'sniper' ? 0.85 : 0.7, true));
}

export function playProjectileImpact(proj: { towerType: TowerType }): void {
  if (!gameplaySfxArmed || playerAudio().sfx <= 0.001) return;
  const loud = proj.towerType === 'splash' || proj.towerType === 'missile' || proj.towerType === 'cannon' || proj.towerType === 'flak';
  defer(() => replayKey('impact', loud ? 0.8 : 0.55, true));
}

export function playEnemyDeathBurst(killCount: number): void {
  if (!gameplaySfxArmed || killCount <= 0 || playerAudio().sfx <= 0.001) return;
  const layers = Math.min(2, killCount);
  for (let i = 0; i < layers; i++) {
    setTimeout(() => {
      if (!gameplaySfxArmed) return;
      void replayKey('death', 0.75, true);
    }, i * 50);
  }
}

export function playBaseDamageSound(): void {
  if (!gameplaySfxArmed || playerAudio().sfx <= 0.001) return;
  defer(() => replayKey('impact', 0.9, true));
}

export function playWaveStartFanfare(): void {
  if (!gameplaySfxArmed || playerAudio().sfx <= 0.001) return;
  defer(() => replayKey('wave', 0.8, true));
}

export function playBuildSound(): void {
  if (playerAudio().sfx <= 0.001) return;
  defer(() => replayKey('build', 0.7, false));
}

export function playUpgradeSound(): void {
  if (playerAudio().sfx <= 0.001) return;
  defer(() => replayKey('upgrade', 0.75, false));
}

export function playWinSound(): void {
  if (playerAudio().sfx <= 0.001) return;
  defer(() => replayKey('win', 0.8, false));
}

export function playLoseSound(): void {
  const now = Date.now();
  if (now - lastLoseAt < 1500) return;
  lastLoseAt = now;
  if (playerAudio().sfx <= 0.001) return;
  defer(() => replayKey('lose', 0.85, false));
  void playMusic('defeat');
}
