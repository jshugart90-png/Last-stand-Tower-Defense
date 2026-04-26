export interface DailyChallenge {
  id: string;
  name: string;
  description: string;
  enemyHealthMultiplier: number;
  enemySpeedMultiplier: number;
  xpMultiplier: number;
  gemMultiplier: number;
}

const CHALLENGES: DailyChallenge[] = [
  {
    id: 'balanced_training',
    name: 'Balanced Training',
    description: 'Standard run with normal enemy stats.',
    enemyHealthMultiplier: 1,
    enemySpeedMultiplier: 1,
    xpMultiplier: 1,
    gemMultiplier: 1,
  },
  {
    id: 'rush_hour',
    name: 'Rush Hour',
    description: 'Enemies move faster, but rewards are higher.',
    enemyHealthMultiplier: 1,
    enemySpeedMultiplier: 1.2,
    xpMultiplier: 1.15,
    gemMultiplier: 1.15,
  },
  {
    id: 'fortified_lines',
    name: 'Fortified Lines',
    description: 'Enemies are tougher but slower.',
    enemyHealthMultiplier: 1.25,
    enemySpeedMultiplier: 0.9,
    xpMultiplier: 1.2,
    gemMultiplier: 1.2,
  },
  {
    id: 'high_risk_high_reward',
    name: 'High Risk',
    description: 'Enemies are tougher and faster with boosted rewards.',
    enemyHealthMultiplier: 1.2,
    enemySpeedMultiplier: 1.15,
    xpMultiplier: 1.35,
    gemMultiplier: 1.35,
  },
];

const getDaySeed = (date: Date): number => {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor(utc / (24 * 60 * 60 * 1000));
};

export const getDailyChallenge = (date = new Date()): DailyChallenge => {
  const seed = getDaySeed(date);
  return CHALLENGES[seed % CHALLENGES.length];
};
