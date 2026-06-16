import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || '';

/** True when a real HTTP(S) backend base URL is set (Expo env or app.json extra). */
export const isBackendConfigured = (): boolean => {
  const u = API_URL.trim();
  return u.startsWith('http://') || u.startsWith('https://');
};

/** Local-only profiles use this prefix and must not call Mongo-backed routes. */
export const isServerBackedPlayerId = (playerId: string | null | undefined): boolean =>
  Boolean(playerId && !String(playerId).startsWith('local_'));

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Player APIs
export const playerApi = {
  create: (nickname: string, deviceId: string) =>
    api.post('/players', { nickname, device_id: deviceId }),
  
  getById: (playerId: string) =>
    api.get(`/players/${playerId}`),
  
  getByDevice: (deviceId: string) =>
    api.get(`/players/device/${deviceId}`),
  
  update: (playerId: string, data: any) =>
    api.patch(`/players/${playerId}`, data),
};

// Game APIs
export const gameApi = {
  endGame: (data: {
    player_id: string;
    wave_reached: number;
    enemies_killed: number;
    towers_placed: number;
    duration_seconds: number;
    coins_earned: number;
    /** Daily challenge gem bonus for this run (capped on server). */
    run_bonus_gems?: number;
  }) => api.post('/games/end', data),
};

// Purchase APIs
export const purchaseApi = {
  process: (data: {
    player_id: string;
    item_type: string;
    item_id?: string;
    gems_amount?: number;
    platform: string;
    receipt_data?: string;
    purchase_token?: string;
    transaction_id?: string;
  }) => api.post('/purchases', data),
};

// Analytics APIs
export const analyticsApi = {
  log: (data: {
    player_id: string;
    event_type: string;
    event_data?: Record<string, any>;
  }) => api.post('/analytics', data),
};

// Skins APIs
export const skinsApi = {
  getAll: () => api.get('/skins'),
  
  equip: (playerId: string, towerType: string, skinId: string) =>
    api.post(`/skins/equip?player_id=${playerId}&tower_type=${towerType}&skin_id=${skinId}`),
  
  purchase: (playerId: string, skinId: string) =>
    api.post(`/skins/purchase?player_id=${playerId}&skin_id=${skinId}`),
};

export default api;
