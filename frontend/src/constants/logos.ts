export type PlayerLogoDef = {
  id: string;
  name: string;
  price: number;
  icon: string;
  subtitle: string;
};

export const PLAYER_LOGOS: PlayerLogoDef[] = [
  { id: 'shadow_operative', name: 'Shadow Scout', price: 0, icon: 'incognito', subtitle: 'Quiet paths' },
  { id: 'tower_sentinel', name: 'Tower Warden', price: 0, icon: 'shield-half-full', subtitle: 'Holds the gate' },
  { id: 'drone_commander', name: 'Wyvern Captain', price: 0, icon: 'drone', subtitle: 'Rules the sky' },
  { id: 'fortification_expert', name: 'Wallwright', price: 0, icon: 'wall', subtitle: 'Stone and timber' },
  { id: 'wave_breaker', name: 'Wave Breaker', price: 0, icon: 'waves-arrow-up', subtitle: 'Stops the tide' },
  { id: 'radar_hunter', name: 'Far Seer', price: 100, icon: 'radar', subtitle: 'Long sight' },
  { id: 'ember_guard', name: 'Ember Guard', price: 140, icon: 'fire', subtitle: 'Burning ward' },
  { id: 'iron_marshal', name: 'Iron Warden', price: 175, icon: 'account-hard-hat', subtitle: 'Holds the line' },
  { id: 'night_ranger', name: 'Night Ranger', price: 210, icon: 'weather-night', subtitle: 'After dark' },
  { id: 'bastion_vanguard', name: 'Bastion Knight', price: 245, icon: 'shield-star', subtitle: 'Front of the wall' },
  { id: 'storm_controller', name: 'Storm Caller', price: 280, icon: 'weather-lightning-rainy', subtitle: 'Calls the lightning' },
  { id: 'heavy_gunner', name: 'Archer Captain', price: 320, icon: 'bow-arrow', subtitle: 'A rain of arrows' },
  { id: 'minefield_architect', name: 'Trapwright', price: 360, icon: 'land-mine', subtitle: 'Hidden snares' },
  { id: 'siege_master', name: 'Siege Master', price: 400, icon: 'castle', subtitle: 'Knows every wall' },
  { id: 'titan_protocol', name: 'Titan Rune', price: 445, icon: 'robot-industrial', subtitle: 'Old stone will' },
  { id: 'redline_command', name: 'Redline Warden', price: 490, icon: 'vector-polyline', subtitle: 'Holds the pressure' },
  { id: 'warlord_signal', name: 'Warlord Banner', price: 530, icon: 'radio-tower', subtitle: 'The call to arms' },
  { id: 'obsidian_fortress', name: 'Obsidian Fortress', price: 565, icon: 'chess-rook', subtitle: 'Unmoved stone' },
  { id: 'last_stand_elite', name: 'Last Stand Crest', price: 610, icon: 'medal', subtitle: 'The final banner' },
  { id: 'apex_defender', name: 'Apex Defender', price: 680, icon: 'crown-outline', subtitle: 'Peak of the keep' },
];

export const DEFAULT_PLAYER_LOGO_ID = PLAYER_LOGOS[0].id;

export const PLAYER_LOGO_BY_ID: Record<string, PlayerLogoDef> = Object.fromEntries(
  PLAYER_LOGOS.map((logo) => [logo.id, logo])
);
