import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || '';

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
  }) => api.post('/games/end', data),
};

// Leaderboard APIs
export const leaderboardApi = {
  getGlobal: (limit = 100, skip = 0) =>
    api.get(`/leaderboard?limit=${limit}&skip=${skip}`),
  
  getPlayerRank: (playerId: string) =>
    api.get(`/leaderboard/player/${playerId}`),
};

// Reward APIs
export const rewardApi = {
  claim: (data: {
    player_id: string;
    reward_type: string;
    ad_type: string;
  }) => api.post('/rewards/claim', data),
};

// Purchase APIs
export const purchaseApi = {
  process: (data: {
    player_id: string;
    item_type: string;
    item_id?: string;
    gems_amount?: number;
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
