export type DailyMissionType = 'play_games' | 'kill_enemies' | 'survive_waves';
export type WeeklyMissionType = 'play_games' | 'kill_enemies' | 'survive_waves';

export interface DailyMission {
  id: DailyMissionType;
  label: string;
  target: number;
  progress: number;
  rewardGems: number;
  completed: boolean;
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
  rewardGems: number;
  unlocked: boolean;
}

export interface WeeklyMission {
  id: WeeklyMissionType;
  label: string;
  target: number;
  progress: number;
  rewardGems: number;
  completed: boolean;
}

export const DAILY_RESET_HOURS = 24;
export const WEEKLY_RESET_DAYS = 7;

export const createDefaultDailyMissions = (): DailyMission[] => [
  {
    id: 'play_games',
    label: 'Play 3 games',
    target: 3,
    progress: 0,
    rewardGems: 15,
    completed: false,
  },
  {
    id: 'kill_enemies',
    label: 'Eliminate 100 enemies',
    target: 100,
    progress: 0,
    rewardGems: 25,
    completed: false,
  },
  {
    id: 'survive_waves',
    label: 'Survive 20 waves',
    target: 20,
    progress: 0,
    rewardGems: 20,
    completed: false,
  },
];

export const createDefaultAchievements = (): Achievement[] => [
  {
    id: 'first_blood',
    label: 'First Blood',
    description: 'Defeat your first enemy.',
    rewardGems: 20,
    unlocked: false,
  },
  {
    id: 'wave_10',
    label: 'Defender',
    description: 'Reach wave 10.',
    rewardGems: 30,
    unlocked: false,
  },
  {
    id: 'wave_25',
    label: 'Veteran Defender',
    description: 'Reach wave 25.',
    rewardGems: 75,
    unlocked: false,
  },
  {
    id: 'tower_architect',
    label: 'Tower Architect',
    description: 'Place 100 towers across all runs.',
    rewardGems: 40,
    unlocked: false,
  },
];

export const createDefaultWeeklyMissions = (): WeeklyMission[] => [
  {
    id: 'play_games',
    label: 'Play 15 games',
    target: 15,
    progress: 0,
    rewardGems: 90,
    completed: false,
  },
  {
    id: 'kill_enemies',
    label: 'Eliminate 750 enemies',
    target: 750,
    progress: 0,
    rewardGems: 120,
    completed: false,
  },
  {
    id: 'survive_waves',
    label: 'Survive 140 waves',
    target: 140,
    progress: 0,
    rewardGems: 100,
    completed: false,
  },
];
