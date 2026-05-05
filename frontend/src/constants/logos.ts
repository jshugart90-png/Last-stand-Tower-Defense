export type PlayerLogoDef = {
  id: string;
  name: string;
  price: number;
  icon: string;
  subtitle: string;
};

export const PLAYER_LOGOS: PlayerLogoDef[] = [
  { id: 'shadow_operative', name: 'Shadow Operative', price: 0, icon: 'incognito', subtitle: 'Stealth command' },
  { id: 'tower_sentinel', name: 'Tower Sentinel', price: 0, icon: 'shield-half-full', subtitle: 'Defensive line' },
  { id: 'drone_commander', name: 'Drone Commander', price: 0, icon: 'drone', subtitle: 'Air superiority' },
  { id: 'fortification_expert', name: 'Fortification Expert', price: 0, icon: 'wall', subtitle: 'Steel perimeter' },
  { id: 'wave_breaker', name: 'Wave Breaker', price: 0, icon: 'waves-arrow-up', subtitle: 'Relentless stops' },
  { id: 'radar_hunter', name: 'Radar Hunter', price: 100, icon: 'radar', subtitle: 'Target lock' },
  { id: 'ember_guard', name: 'Ember Guard', price: 140, icon: 'fire', subtitle: 'Burning defense' },
  { id: 'iron_marshal', name: 'Iron Marshal', price: 175, icon: 'account-hard-hat', subtitle: 'Line commander' },
  { id: 'night_ranger', name: 'Night Ranger', price: 210, icon: 'weather-night', subtitle: 'Dark ops' },
  { id: 'bastion_vanguard', name: 'Bastion Vanguard', price: 245, icon: 'shield-star', subtitle: 'Frontline honor' },
  { id: 'storm_controller', name: 'Storm Controller', price: 280, icon: 'weather-lightning-rainy', subtitle: 'Shock doctrine' },
  { id: 'heavy_gunner', name: 'Heavy Gunner', price: 320, icon: 'machine-gun', subtitle: 'Suppression fire' },
  { id: 'minefield_architect', name: 'Minefield Architect', price: 360, icon: 'land-mine', subtitle: 'Precision traps' },
  { id: 'siege_master', name: 'Siege Master', price: 400, icon: 'castle', subtitle: 'Siege discipline' },
  { id: 'titan_protocol', name: 'Titan Protocol', price: 445, icon: 'robot-industrial', subtitle: 'Mechanized will' },
  { id: 'redline_command', name: 'Redline Command', price: 490, icon: 'vector-polyline', subtitle: 'Pressure tactics' },
  { id: 'warlord_signal', name: 'Warlord Signal', price: 530, icon: 'radio-tower', subtitle: 'Signal control' },
  { id: 'obsidian_fortress', name: 'Obsidian Fortress', price: 565, icon: 'chess-rook', subtitle: 'Unmoved anchor' },
  { id: 'last_stand_elite', name: 'Last Stand Elite', price: 610, icon: 'medal', subtitle: 'Veteran crest' },
  { id: 'apex_defender', name: 'Apex Defender', price: 680, icon: 'crown-outline', subtitle: 'Peak command' },
];

export const DEFAULT_PLAYER_LOGO_ID = PLAYER_LOGOS[0].id;

export const PLAYER_LOGO_BY_ID: Record<string, PlayerLogoDef> = Object.fromEntries(
  PLAYER_LOGOS.map((logo) => [logo.id, logo])
);
