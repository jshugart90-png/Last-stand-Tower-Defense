import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import type { TowerType } from '../constants/game';

type SfxName =
  | 'mission'
  | 'combo'
  | 'chest'
  | 'record';

const TONE_CONFIG: Record<SfxName, { freq: number; ms: number; volume: number }> = {
  mission: { freq: 880, ms: 90, volume: 0.45 },
  combo: { freq: 1040, ms: 110, volume: 0.5 },
  chest: { freq: 720, ms: 130, volume: 0.5 },
  record: { freq: 1180, ms: 120, volume: 0.55 },
};

/** Distinct weapon profiles (procedural — no asset bundle) */
const WEAPON_TONE: Record<
  TowerType,
  { freq: number; ms: number; volume: number; harmonics?: number }
> = {
  machine_gun: { freq: 380, ms: 48, volume: 0.34, harmonics: 3 },
  sniper: { freq: 180, ms: 140, volume: 0.4 },
  splash: { freq: 120, ms: 180, volume: 0.42, harmonics: 2 },
  freeze: { freq: 920, ms: 160, volume: 0.36 },
  missile: { freq: 200, ms: 200, volume: 0.44, harmonics: 2 },
  laser: { freq: 640, ms: 28, volume: 0.3 },
};

const SAMPLE_RATE = 22050;
const cache = new Map<string, Audio.Sound>();
let audioReady = false;

const write16 = (view: DataView, offset: number, value: number) => view.setInt16(offset, value, true);
const write32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);

const createToneWavBase64 = (freq: number, ms: number, harmonics = 1): string => {
  const samples = Math.max(1, Math.floor((SAMPLE_RATE * ms) / 1000));
  const bytesPerSample = 2;
  const dataSize = samples * bytesPerSample;
  const totalSize = 44 + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  write32(view, 4, 36 + dataSize);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  write32(view, 16, 16);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  write32(view, 24, SAMPLE_RATE);
  write32(view, 28, SAMPLE_RATE * bytesPerSample);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  write32(view, 40, dataSize);

  const amp = 0.38 * 32767;
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.pow(1 - i / samples, 0.85);
    let sample = 0;
    for (let h = 1; h <= harmonics; h++) {
      sample += Math.sin(2 * Math.PI * freq * h * t) / h;
    }
    sample = (sample / harmonics) * amp * env;
    write16(view, 44 + i * 2, sample);
  }

  const bytes = new Uint8Array(buffer);
  return Buffer.from(bytes).toString('base64');
};

const ensureSoundByKey = async (
  key: string,
  freq: number,
  ms: number,
  volume: number,
  harmonics = 1
): Promise<Audio.Sound | null> => {
  const existing = cache.get(key);
  if (existing) return existing;
  try {
    const base64 = createToneWavBase64(freq, ms, harmonics);
    const uri = `${FileSystem.cacheDirectory}sfx_${key}.wav`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, volume, isLooping: false }
    );
    cache.set(key, sound);
    return sound;
  } catch {
    return null;
  }
};

const ensureSound = async (name: SfxName): Promise<Audio.Sound | null> => {
  const { freq, ms, volume } = TONE_CONFIG[name];
  return ensureSoundByKey(`ui_${name}`, freq, ms, volume, 1);
};

export const initializeAudio = async (): Promise<void> => {
  if (audioReady) return;
  try {
    await Audio.setAudioModeAsync({
      /** Respect iPhone silent switch — no SFX when muted */
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      allowsRecordingIOS: false,
    });
    await Promise.all((Object.keys(TONE_CONFIG) as SfxName[]).map((k) => ensureSound(k)));
    audioReady = true;
  } catch {
    audioReady = false;
  }
};

export const playSfx = async (name: SfxName, enabled: boolean): Promise<void> => {
  if (!enabled) return;
  const sound = await ensureSound(name);
  if (!sound) return;
  try {
    await sound.stopAsync();
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // best effort only
  }
};

let lastWeaponAt = 0;
const WEAPON_THROTTLE_MS = 48;

export const playWeaponSfx = async (towerType: TowerType, enabled: boolean): Promise<void> => {
  if (!enabled) return;
  const now = Date.now();
  if (now - lastWeaponAt < WEAPON_THROTTLE_MS && towerType !== 'sniper' && towerType !== 'missile') {
    return;
  }
  lastWeaponAt = now;

  const cfg = WEAPON_TONE[towerType];
  const key = `w_${towerType}`;
  const harmonics = cfg.harmonics ?? 1;
  const sound = await ensureSoundByKey(key, cfg.freq, cfg.ms, cfg.volume, harmonics);
  if (!sound) return;
  try {
    await sound.stopAsync();
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // best effort only
  }
};
