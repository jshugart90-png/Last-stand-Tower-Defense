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

/** @deprecated Calendar resets use local midnight / Monday; kept for reference only. */
export const DAILY_RESET_HOURS = 24;
/** @deprecated Weekly resets align to local Monday 00:00. */
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
    id: 'wave_50',
    label: 'Fortress',
    description: 'Reach wave 50.',
    rewardGems: 120,
    unlocked: false,
  },
  {
    id: 'wave_75',
    label: 'Last Stand Legend',
    description: 'Reach wave 75.',
    rewardGems: 200,
    unlocked: false,
  },
  {
    id: 'tower_architect',
    label: 'Tower Architect',
    description: 'Place 100 towers across all runs.',
    rewardGems: 40,
    unlocked: false,
  },
  {
    id: 'master_builder',
    label: 'Master Builder',
    description: 'Place 500 towers across all runs.',
    rewardGems: 90,
    unlocked: false,
  },
  {
    id: 'slayer_500',
    label: 'Slayer',
    description: 'Defeat 500 enemies total.',
    rewardGems: 35,
    unlocked: false,
  },
  {
    id: 'slayer_5000',
    label: 'Exterminator',
    description: 'Defeat 5,000 enemies total.',
    rewardGems: 150,
    unlocked: false,
  },
  {
    id: 'games_25',
    label: 'Committed',
    description: 'Complete 25 games.',
    rewardGems: 45,
    unlocked: false,
  },
  {
    id: 'gem_hoarder',
    label: 'Gem Hoarder',
    description: 'Hold at least 2,500 gems at once.',
    rewardGems: 50,
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
