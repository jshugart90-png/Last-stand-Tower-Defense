import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  Component,
  ErrorInfo,
  ReactNode,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Modal,
  Alert,
  BackHandler,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  useGameStore,
  PlacedTower,
  SavedGameStateForExport,
  Enemy,
} from '../src/stores/gameStore';
import { usePlayerStore, SavedGameState } from '../src/stores/playerStore';
import { 
  TOWERS, ENEMIES, GAME_CONFIG, getWaveConfig, TowerType, 
  TARGETING_MODES, TargetingMode, getInfiniteUpgradeStats, 
  GameSpeed,
  SPEED_UNLOCK_PRICES,
  getRunCoinIncomeMultiplier,
  ALLOWED_GAME_SPEEDS,
  normalizeUnlockedSpeeds,
  scaledTotalPerformanceGems,
  endGamePerformanceRemainder,
  COMBO_BONUS_GEMS,
  type EnemyType,
} from '../src/constants/game';
import { gameApi, analyticsApi, isServerBackedPlayerId } from '../src/hooks/useApi';
import { findPath, wouldBlockPath } from '../src/utils/pathfinding';
import { getDailyChallenge } from '../src/constants/challenges';
import { playSfx, stopAllSounds, setGameplaySfxArmed, cleanupGameplayAudioAfterSession, canPlayUiSfx } from '../src/services/audioService';
import { getArenaMap, CLASSIC_MAP_ID, isCellOnArenaRoute } from '../src/constants/arenaMaps';
import {
  SESSION_SLAUGHTER_WIN_KILLS,
  SESSION_BOUNTY_TRIUMPHS_NEEDED,
} from '../src/constants/sessionProgress';
import { getMapById, promoteEnemyType } from '../src/constants/maps';
import { TacticalTheme } from '../src/theme/colors';
import { PlayerLogoBadge } from '../src/components/PlayerLogoBadge';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Pinch zoom limits (keep in sync with gameStore.setZoomLevel clamp) */
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2.5;

const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

class GestureAreaErrorBoundary extends Component<
  {
    children: ReactNode;
    style?: object;
  },
  { err: Error | null }
> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(_err: Error, _info: ErrorInfo) {
    /* production: no console — gesture layer recovers via UI */
  }

  reset = () => {
    this.setState({ err: null });
  };

  render() {
    if (this.state.err) {
      return (
        <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }, this.props.style]}>
          <Text style={{ color: TacticalTheme.accent, textAlign: 'center', marginBottom: 12 }}>
            Map gestures paused after an error. You can retry or leave the game and return.
          </Text>
          <TouchableOpacity
            onPress={this.reset}
            style={{ backgroundColor: TacticalTheme.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry map</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

class GameRuntimeErrorBoundary extends Component<
  { children: ReactNode; onRecover?: () => void },
  { err: Error | null }
> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(_err: Error, _info: ErrorInfo) {
    /* production: no console */
  }

  render() {
    if (this.state.err) {
      return (
        <SafeAreaView style={[styles.container, styles.runtimeErrorWrap]}>
          <Text style={styles.runtimeErrorTitle}>Game recovered from a runtime error</Text>
          <Text style={styles.runtimeErrorBody}>
            The run was stopped to prevent a crash. You can safely restart.
          </Text>
          <TouchableOpacity
            style={styles.runtimeErrorButton}
            onPress={this.props.onRecover}
          >
            <Text style={styles.runtimeErrorButtonText}>Return Home</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}
const getUtcDayKey = (ts: number) => {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const LOOP_STEP_MS = 1000 / 30;
const MAX_FRAME_DELTA_MS = 250;
/** Base simulation slices per rendered frame (scaled up when gameSpeed is high). */
const BASE_MAX_SUBSTEPS_PER_FRAME = 6;
const MAX_SUBSTEPS_CAP = 14;

/** Build wave spawn schedule synchronously inside RAF — never rely on useEffect for this (effects run after RAF, causing empty schedules and instant erroneous endWave). */
function ensureWaveSpawnSchedule(args: {
  waveKeyRef: React.MutableRefObject<string>;
  scheduleRef: React.MutableRefObject<{ atMs: number; type: EnemyType }[]>;
  spawnCursorRef: React.MutableRefObject<number>;
  elapsedRef: React.MutableRefObject<number>;
  spawningCompleteRef: React.MutableRefObject<boolean>;
  currentWave: number;
  waveChallengeKey: string;
  selectedMap: ReturnType<typeof getMapById> | undefined;
}) {
  const {
    waveKeyRef,
    scheduleRef,
    spawnCursorRef,
    elapsedRef,
    spawningCompleteRef,
    currentWave,
    waveChallengeKey,
    selectedMap,
  } = args;
  if (waveKeyRef.current === waveChallengeKey && scheduleRef.current.length > 0) return;

  const waveConfig = getWaveConfig(currentWave);
  const schedule: { atMs: number; type: EnemyType }[] = [];
  const mapSpawnMult = selectedMap?.spawnDelayMultiplier ?? 1;
  const tierShift = selectedMap?.enemyTierShift ?? 0;
  let delay = 500;
  for (const { type, count } of waveConfig.enemies) {
    for (let i = 0; i < count; i++) {
      const promoted = promoteEnemyType(type, tierShift);
      schedule.push({ atMs: delay, type: promoted });
      delay += GAME_CONFIG.ENEMY_SPAWN_DELAY * mapSpawnMult;
    }
  }

  scheduleRef.current = schedule;
  spawnCursorRef.current = 0;
  elapsedRef.current = 0;
  spawningCompleteRef.current = false;
  waveKeyRef.current = waveChallengeKey;
}

// Helper function for tower icons
const getTowerIcon = (type: TowerType, size = 20) => {
  const iconProps = { size, color: '#fff' };
  switch (type) {
    case 'machine_gun':
      return <MaterialCommunityIcons name="pistol" {...iconProps} />;
    case 'sniper':
      return <MaterialCommunityIcons name="crosshairs-gps" {...iconProps} />;
    case 'splash':
      return <MaterialCommunityIcons name="bomb" {...iconProps} />;
    case 'freeze':
      return <MaterialCommunityIcons name="snowflake" {...iconProps} />;
    case 'missile':
      return <MaterialCommunityIcons name="rocket-launch" {...iconProps} />;
    case 'laser':
      return <MaterialCommunityIcons name="flashlight" {...iconProps} />;
    default:
      return <Ionicons name="help" {...iconProps} />;
  }
};

/** Confirm / cancel bar shown after tapping a cell to preview tower placement. */
const PlacementConfirmBar = ({
  towerType,
  cost,
  canAfford,
  onConfirm,
  onCancel,
}: {
  towerType: TowerType;
  cost: number;
  canAfford: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <View style={styles.placementConfirmBar}>
    <TouchableOpacity style={styles.placementCancelButton} onPress={onCancel} accessibilityLabel="Cancel placement">
      <Ionicons name="close" size={22} color="#fff" />
    </TouchableOpacity>
    <View style={styles.placementConfirmInfo}>
      <Text style={styles.placementConfirmTitle}>Place {TOWERS[towerType].name}?</Text>
      <View style={styles.placementConfirmCostRow}>
        <FontAwesome5 name="coins" size={12} color="#FFD700" />
        <Text style={[styles.placementConfirmCost, !canAfford && styles.placementConfirmCostRed]}>
          {cost}
        </Text>
      </View>
    </View>
    <TouchableOpacity
      style={[styles.placementConfirmButton, !canAfford && styles.disabledButton]}
      onPress={onConfirm}
      disabled={!canAfford}
      accessibilityLabel="Confirm placement"
    >
      <Ionicons name="checkmark" size={26} color="#fff" />
    </TouchableOpacity>
  </View>
);

// Tower panel — tap to select a tower, then tap a cell and confirm
const TowerPanelItem = React.memo(
  ({
    type,
    tower,
    cost,
    isUnlocked,
    canAfford,
    isSelected,
    onTap,
  }: {
    type: TowerType;
    tower: (typeof TOWERS)[TowerType];
    cost: number;
    isUnlocked: boolean;
    canAfford: boolean;
    isSelected: boolean;
    onTap: (t: TowerType) => void;
  }) => {
    const costLabel = isUnlocked ? `${cost}` : 'Locked';

    if (!isUnlocked) {
      return (
        <View style={[styles.towerButton, styles.towerButtonLocked]}>
          <View style={[styles.towerIcon, { backgroundColor: tower.color }]}>{getTowerIcon(type)}</View>
          <Text style={styles.towerName} numberOfLines={1}>
            {tower.name}
          </Text>
          <Text style={styles.towerCost}>{costLabel}</Text>
        </View>
      );
    }

    if (!canAfford) {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.towerButton,
            isSelected && styles.towerButtonSelected,
            styles.towerButtonCantAfford,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => onTap(type)}
        >
          <View style={[styles.towerIcon, { backgroundColor: tower.color }]}>{getTowerIcon(type)}</View>
          <Text style={styles.towerName} numberOfLines={1}>
            {tower.name}
          </Text>
          <Text style={[styles.towerCost, styles.towerCostRed]}>{costLabel}</Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        style={({ pressed }) => [
          styles.towerButton,
          isSelected && styles.towerButtonSelected,
          pressed && { opacity: 0.85 },
        ]}
        onPress={() => onTap(type)}
      >
        <View style={[styles.towerIcon, { backgroundColor: tower.color }]}>{getTowerIcon(type)}</View>
        <Text style={styles.towerName} numberOfLines={1}>
          {tower.name}
        </Text>
        <Text style={styles.towerCost}>{costLabel}</Text>
      </Pressable>
    );
  }
);

TowerPanelItem.displayName = 'TowerPanelItem';

const TowerPanel = ({
  onSelect,
  selectedType,
  coins,
  unlockedTowers,
  getTowerCost,
}: {
  onSelect: (type: TowerType | null) => void;
  selectedType: TowerType | null;
  coins: number;
  unlockedTowers: TowerType[];
  getTowerCost: (type: TowerType) => number;
}) => {
  const onTap = useCallback(
    (type: TowerType) => {
      const isSelected = selectedType === type;
      onSelect(isSelected ? null : type);
    },
    [onSelect, selectedType]
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.towerPanel}
      contentContainerStyle={styles.towerPanelContent}
      keyboardShouldPersistTaps="handled"
    >
      {(Object.keys(TOWERS) as TowerType[]).map((type) => {
        const tower = TOWERS[type];
        const isUnlocked = unlockedTowers.includes(type);
        const cost = getTowerCost(type);
        const canAfford = coins >= cost;
        const isSelected = selectedType === type;

        return (
          <TowerPanelItem
            key={type}
            type={type}
            tower={tower}
            cost={cost}
            isUnlocked={isUnlocked}
            canAfford={canAfford}
            isSelected={isSelected}
            onTap={onTap}
          />
        );
      })}
    </ScrollView>
  );
};

// In-game auto-start waves toggle (synced with settings)
const AutoStartToggle = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) => (
  <TouchableOpacity
    style={[styles.autoStartToggle, enabled && styles.autoStartToggleActive]}
    onPress={onToggle}
  >
    <Ionicons name="play-forward" size={14} color={enabled ? '#fff' : TacticalTheme.textMuted} />
    <Text style={[styles.autoStartToggleText, enabled && styles.autoStartToggleTextActive]}>
      Auto {enabled ? 'ON' : 'OFF'}
    </Text>
  </TouchableOpacity>
);

// Speed control buttons — unlocks cost gems only (see shop / player store)
const SpeedControls = ({
  currentSpeed,
  onSpeedChange,
  unlockedSpeeds,
  onPurchaseSpeed,
  gems,
  autoStartWaves,
  onToggleAutoStart,
}: {
  currentSpeed: GameSpeed;
  onSpeedChange: (speed: GameSpeed) => void;
  unlockedSpeeds: GameSpeed[];
  onPurchaseSpeed: (speed: GameSpeed) => void;
  gems: number;
  autoStartWaves: boolean;
  onToggleAutoStart: () => void;
}) => {
  const speeds = [...ALLOWED_GAME_SPEEDS];

  return (
    <View style={styles.speedControls}>
      {speeds.map((speed) => {
        const isUnlocked = unlockedSpeeds.includes(speed);
        const price = SPEED_UNLOCK_PRICES[speed];
        const canAfford = gems >= price;

        return (
          <TouchableOpacity
            key={speed}
            style={[
              styles.speedButton,
              currentSpeed === speed && styles.speedButtonActive,
              !isUnlocked && styles.speedButtonLocked,
            ]}
            onPress={() => {
              if (isUnlocked) {
                onSpeedChange(speed);
              } else if (canAfford && price > 0) {
                Alert.alert(
                  `Unlock ${speed}x Speed`,
                  `Spend ${price} gems to unlock ${speed}x speed forever?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Unlock', onPress: () => onPurchaseSpeed(speed) },
                  ]
                );
              } else if (!canAfford && price > 0) {
                Alert.alert(
                  'Not enough gems',
                  `Need ${price} gems to unlock ${speed}x speed. Earn gems by playing or visit the Shop.`,
                );
              }
            }}
          >
            <Text style={[
              styles.speedButtonText,
              currentSpeed === speed && styles.speedButtonTextActive,
              !isUnlocked && styles.speedButtonTextLocked,
            ]}>
              {speed}x
              {!isUnlocked && <Text style={styles.lockIcon}> 🔒</Text>}
            </Text>
          </TouchableOpacity>
        );
      })}
      <AutoStartToggle enabled={autoStartWaves} onToggle={onToggleAutoStart} />
    </View>
  );
};

// Tower options panel
const TowerOptionsPanel = ({
  tower,
  onUpgrade,
  onSell,
  onTargetingChange,
  onClose,
  coins,
  getUpgradeCost,
  getSellValue,
  shopUpgradeLevel,
}: {
  tower: PlacedTower;
  onUpgrade: () => void;
  onSell: () => void;
  onTargetingChange: (mode: TargetingMode) => void;
  onClose: () => void;
  coins: number;
  getUpgradeCost: (tower: PlacedTower) => number;
  getSellValue: (tower: PlacedTower) => number;
  shopUpgradeLevel: number;
}) => {
  const towerDef = TOWERS[tower.type];
  const upgradeCost = getUpgradeCost(tower);
  const sellValue = getSellValue(tower);
  const canUpgrade = coins >= upgradeCost;
  
  // Apply both in-game and shop upgrades
  let stats = getInfiniteUpgradeStats(towerDef.baseStats, tower.level);
  if (shopUpgradeLevel > 0) {
    const shopMultiplier = Math.pow(1.05, shopUpgradeLevel);
    stats = {
      ...stats,
      damage: Math.floor(stats.damage * shopMultiplier),
      range: stats.range * (1 + shopUpgradeLevel * 0.02),
    };
  }

  return (
    <View style={styles.towerOptionsPanel}>
      <View style={styles.towerOptionHeader}>
        <View style={[styles.towerOptionIcon, { backgroundColor: towerDef.color }]}>
          {getTowerIcon(tower.type, 16)}
        </View>
        <View style={styles.towerTitleContainer}>
          <Text style={styles.towerOptionTitle}>{towerDef.name} Lv.{tower.level + 1}</Text>
          {shopUpgradeLevel > 0 && (
            <Text style={styles.shopUpgradeBadge}>+{shopUpgradeLevel} Shop</Text>
          )}
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.towerStatsRow}>
        <Text style={styles.towerStatText}>DMG: {stats.damage}</Text>
        <Text style={styles.towerStatText}>RNG: {stats.range.toFixed(1)}</Text>
        <Text style={styles.towerStatText}>SPD: {(1000 / stats.fireRate).toFixed(1)}/s</Text>
      </View>

      <Text style={styles.targetingLabel}>Target:</Text>
      <View style={styles.targetingRow}>
        {TARGETING_MODES.map(mode => (
          <TouchableOpacity
            key={mode.id}
            style={[
              styles.targetingButton,
              tower.targetingMode === mode.id && styles.targetingButtonActive,
            ]}
            onPress={() => onTargetingChange(mode.id)}
          >
            <Text style={[
              styles.targetingButtonText,
              tower.targetingMode === mode.id && styles.targetingButtonTextActive,
            ]}>
              {mode.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.towerActionsRow}>
        <TouchableOpacity
          style={[styles.upgradeButton, !canUpgrade && styles.disabledButton]}
          onPress={onUpgrade}
          disabled={!canUpgrade}
        >
          <Ionicons name="arrow-up" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>{upgradeCost}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sellButton} onPress={onSell}>
          <Ionicons name="trash" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>+{sellValue}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// —— Map / entity views (memoized; selection & layout props drive updates) ——
const GameMapCell = React.memo(
  function GameMapCell({
    col,
    row,
    scaledCellSize,
    onPath,
    isSpawn,
    isBase,
    canPlace,
    hasTower,
    isPlacementPreview,
    onCellPress,
    mapTheme,
  }: {
    col: number;
    row: number;
    scaledCellSize: number;
    onPath: boolean;
    isSpawn: boolean;
    isBase: boolean;
    canPlace: boolean;
    hasTower: boolean;
    isPlacementPreview?: boolean;
    onCellPress: (x: number, y: number) => void;
    mapTheme?: { floor: string; path: string; pathAccent: string } | null;
  }) {
    const cellStyle = useMemo(
      () => [
        styles.cell,
        {
          width: scaledCellSize,
          height: scaledCellSize,
          left: col * scaledCellSize,
          top: row * scaledCellSize,
          backgroundColor: mapTheme?.floor ?? '#1a1a2e',
          borderColor: mapTheme?.pathAccent ?? '#2a2a4e',
        },
        onPath && [
          styles.pathCell,
          mapTheme?.path ? { backgroundColor: mapTheme.path } : null,
        ],
        canPlace && onPath && styles.canPlaceOnPath,
        canPlace && !onPath && styles.canPlaceCell,
        isPlacementPreview && styles.canPlaceCellPreview,
        isSpawn && styles.spawnCell,
        isBase && styles.baseCell,
      ],
      [scaledCellSize, col, row, onPath, canPlace, isPlacementPreview, isSpawn, isBase, mapTheme]
    );

    if (hasTower) {
      return <View style={cellStyle} />;
    }

    return (
      <TouchableOpacity
        style={cellStyle}
        onPress={() => onCellPress(col, row)}
        activeOpacity={0.7}
      />
    );
  }
);

const GameLaserBeam = React.memo(function GameLaserBeam({
  startX,
  startY,
  length,
  angleDeg,
}: {
  startX: number;
  startY: number;
  length: number;
  angleDeg: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.laserBeam,
        {
          left: startX,
          top: startY - 2,
          width: length,
          transform: [{ rotate: `${angleDeg}deg` }],
          transformOrigin: 'left center',
        },
      ]}
    />
  );
});

const GameEnemySprite = React.memo(function GameEnemySprite({
  enemy,
  scaledCellSize,
  finalScale,
  nowTs,
}: {
  enemy: Enemy;
  scaledCellSize: number;
  finalScale: number;
  nowTs: number;
}) {
  const enemyDef = ENEMIES[enemy.type];
  const healthPercent = enemy.health / enemy.maxHealth;
  const isSlowed = nowTs < enemy.slowedUntil;
  const enemySize = enemyDef.size * finalScale;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.enemy,
        {
          left: enemy.position.x * scaledCellSize + (scaledCellSize - enemySize) / 2,
          top: enemy.position.y * scaledCellSize + (scaledCellSize - enemySize) / 2,
          width: enemySize,
          height: enemySize,
          backgroundColor: isSlowed ? TacticalTheme.freezeTint : enemyDef.color,
        },
      ]}
    >
      <View style={styles.healthBarContainer}>
        <View style={[styles.healthBar, { width: `${healthPercent * 100}%` }]} />
      </View>
    </View>
  );
});

const GameProjectileSprite = React.memo(function GameProjectileSprite({
  left,
  top,
  backgroundColor,
}: {
  left: number;
  top: number;
  backgroundColor: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.projectile,
        {
          left,
          top,
          backgroundColor,
        },
      ]}
    />
  );
});

const GameTowerSprite = React.memo(function GameTowerSprite({
  tower,
  scaledCellSize,
  rangeRadius,
  isSelected,
  getTowerColor,
  onCellPress,
}: {
  tower: PlacedTower;
  scaledCellSize: number;
  rangeRadius: number;
  isSelected: boolean;
  getTowerColor: (t: PlacedTower) => string;
  onCellPress: (x: number, y: number) => void;
}) {
  const cx = tower.position.x * scaledCellSize;
  const cy = tower.position.y * scaledCellSize;

  return (
    <React.Fragment>
      {isSelected && (
        <View
          pointerEvents="none"
          style={[
            styles.rangeIndicator,
            {
              left: cx + scaledCellSize / 2 - rangeRadius,
              top: cy + scaledCellSize / 2 - rangeRadius,
              width: rangeRadius * 2,
              height: rangeRadius * 2,
              borderRadius: rangeRadius,
            },
          ]}
        />
      )}
      <Pressable
        hitSlop={12}
        style={[
          styles.towerHit,
          {
            left: cx,
            top: cy,
            width: scaledCellSize,
            height: scaledCellSize,
          },
        ]}
        onPress={() => onCellPress(tower.position.x, tower.position.y)}
      >
        <View
          style={[
            styles.tower,
            {
              width: scaledCellSize * 0.8,
              height: scaledCellSize * 0.8,
              backgroundColor: getTowerColor(tower),
              borderWidth: isSelected ? 3 : tower.level > 0 ? 2 : 0,
              borderColor: isSelected ? '#FFD700' :
                tower.level >= 5 ? '#FF00FF' :
                tower.level >= 3 ? '#00FF88' :
                tower.level >= 1 ? '#C0C0C0' : 'transparent',
            },
          ]}
        >
          {getTowerIcon(tower.type, scaledCellSize * 0.4)}
          {tower.level > 0 && (
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>{tower.level}</Text>
            </View>
          )}
        </View>
      </Pressable>
    </React.Fragment>
  );
});

const GameSpawnBaseMarkers = React.memo(function GameSpawnBaseMarkers({
  spawnPoint,
  basePosition,
  scaledCellSize,
}: {
  spawnPoint: { x: number; y: number };
  basePosition: { x: number; y: number };
  scaledCellSize: number;
}) {
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.spawnPoint,
          {
            left: spawnPoint.x * scaledCellSize,
            top: spawnPoint.y * scaledCellSize,
            width: scaledCellSize,
            height: scaledCellSize,
          },
        ]}
      >
        <MaterialCommunityIcons name="location-enter" size={scaledCellSize * 0.5} color="#E74C3C" />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.base,
          {
            left: basePosition.x * scaledCellSize,
            top: basePosition.y * scaledCellSize,
            width: scaledCellSize,
            height: scaledCellSize,
          },
        ]}
      >
        <Ionicons name="home" size={scaledCellSize * 0.6} color="#FFD700" />
      </View>
    </>
  );
});

/** Grid + path only — avoids re-rendering hundreds of cells every simulation tick when enemy positions update. */
const GameBoardStaticCells = React.memo(function GameBoardStaticCells({
  onCellPress,
  scaledCellSize,
  effectivePreview,
}: {
  onCellPress: (x: number, y: number) => void;
  scaledCellSize: number;
  effectivePreview: { col: number; row: number } | null;
}) {
  const {
    towers,
    gridCols,
    gridRows,
    spawnPoint,
    basePosition,
    selectedTowerType,
    selectedPlacedTower,
    arenaRoute,
    mapTheme,
  } = useGameStore(
    useShallow((s) => ({
      towers: s.towers,
      gridCols: s.gridCols,
      gridRows: s.gridRows,
      spawnPoint: s.spawnPoint,
      basePosition: s.basePosition,
      selectedTowerType: s.selectedTowerType,
      selectedPlacedTower: s.selectedPlacedTower,
      arenaRoute: s.arenaRoute,
      mapTheme: s.mapTheme,
    }))
  );

  const blockedCells = useMemo(
    () => new Set(towers.map((t) => `${t.position.x},${t.position.y}`)),
    [towers]
  );

  const pathSet = useMemo(() => {
    if (arenaRoute.length >= 2) {
      return new Set(arenaRoute.map((p) => `${p.x},${p.y}`));
    }
    const currentPath = findPath(spawnPoint, basePosition, gridCols, gridRows, blockedCells);
    return new Set((currentPath || []).map((p) => `${p.x},${p.y}`));
  }, [arenaRoute, spawnPoint, basePosition, gridCols, gridRows, blockedCells]);

  const placeableCellKeys = useMemo(() => {
    if (!selectedTowerType || selectedPlacedTower) return null as Set<string> | null;
    try {
      const keys = new Set<string>();
      const towerPositions = towers.map((t) => ({
        x: Math.floor(t.position.x),
        y: Math.floor(t.position.y),
      }));
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const k = `${col},${row}`;
          if (col === spawnPoint.x && row === spawnPoint.y) continue;
          if (col === basePosition.x && row === basePosition.y) continue;
          if (blockedCells.has(k)) continue;
          if (arenaRoute.length >= 2) {
            if (isCellOnArenaRoute({ x: col, y: row }, arenaRoute)) continue;
            keys.add(k);
            continue;
          }
          if (
            wouldBlockPath(
              { x: col, y: row },
              spawnPoint,
              basePosition,
              gridCols,
              gridRows,
              towerPositions
            )
          ) {
            continue;
          }
          keys.add(k);
        }
      }
      return keys;
    } catch {
      return new Set<string>();
    }
  }, [
    selectedTowerType,
    selectedPlacedTower,
    towers,
    gridCols,
    gridRows,
    spawnPoint,
    basePosition,
    arenaRoute,
    blockedCells,
  ]);

  const gridCells = useMemo(
    () =>
      Array.from({ length: gridRows * gridCols }, (_, index) => ({
        row: Math.floor(index / gridCols),
        col: index % gridCols,
      })),
    [gridRows, gridCols]
  );

  return (
    <>
      {gridCells.map(({ row, col }) => {
        const isPath = pathSet.has(`${col},${row}`);
        const isSpawn = col === spawnPoint.x && row === spawnPoint.y;
        const isBase = col === basePosition.x && row === basePosition.y;
        const canPlace =
          !!placeableCellKeys &&
          !!selectedTowerType &&
          !selectedPlacedTower &&
          placeableCellKeys.has(`${col},${row}`);
        const hasTowerHere = blockedCells.has(`${col},${row}`);
        const onPathCorridor = isPath && !isSpawn && !isBase;

        const isPreview =
          effectivePreview !== null &&
          effectivePreview.col === col &&
          effectivePreview.row === row;

        return (
          <GameMapCell
            key={`${col}-${row}`}
            mapTheme={mapTheme ?? undefined}
            col={col}
            row={row}
            scaledCellSize={scaledCellSize}
            onPath={onPathCorridor}
            isSpawn={isSpawn}
            isBase={isBase}
            canPlace={canPlace}
            hasTower={hasTowerHere}
            isPlacementPreview={isPreview && canPlace}
            onCellPress={onCellPress}
          />
        );
      })}
    </>
  );
});
GameBoardStaticCells.displayName = 'GameBoardStaticCells';

/** Lasers, enemies, projectiles, towers — isolated from the static grid so cell highlights are not recomputed on every tick. */
const GameBoardCombatEntities = React.memo(function GameBoardCombatEntities({
  onCellPress,
  scaledCellSize,
  finalScale,
  performanceMode,
  vfxQuality,
}: {
  onCellPress: (x: number, y: number) => void;
  scaledCellSize: number;
  finalScale: number;
  performanceMode: boolean;
  vfxQuality: 0 | 1 | 2;
}) {
  const {
    towers,
    enemies,
    projectiles,
    laserBeams,
    towerUpgradeLevels,
    getTowerColor,
    selectedPlacedTower,
  } = useGameStore(
    useShallow((s) => ({
      towers: s.towers,
      enemies: s.enemies,
      projectiles: s.projectiles,
      laserBeams: s.laserBeams,
      towerUpgradeLevels: s.towerUpgradeLevels,
      getTowerColor: s.getTowerColor,
      selectedPlacedTower: s.selectedPlacedTower,
    }))
  );

  const visibleLaserBeams = useMemo(() => {
    if (vfxQuality >= 2 && !performanceMode) return laserBeams;
    const maxBeams = vfxQuality === 0 || performanceMode ? 48 : 80;
    if (laserBeams.length <= maxBeams) return laserBeams;
    const step = Math.max(1, Math.ceil(laserBeams.length / maxBeams));
    return laserBeams.filter((_, idx) => idx % step === 0);
  }, [laserBeams, performanceMode, vfxQuality]);

  const visibleProjectiles = useMemo(() => {
    const maxProjectiles =
      vfxQuality === 0 || performanceMode ? 80 : vfxQuality === 1 ? 130 : 200;
    if (projectiles.length <= maxProjectiles) return projectiles;
    const step = Math.max(1, Math.ceil(projectiles.length / maxProjectiles));
    return projectiles.filter((_, idx) => idx % step === 0);
  }, [projectiles, performanceMode, vfxQuality]);

  const towerById = useMemo(() => {
    const map = new Map<string, PlacedTower>();
    for (const t of towers) map.set(t.id, t);
    return map;
  }, [towers]);

  const enemyById = useMemo(() => {
    const map = new Map<string, (typeof enemies)[number]>();
    for (const e of enemies) map.set(e.id, e);
    return map;
  }, [enemies]);

  const nowTs = Date.now();

  return (
    <>
      {visibleLaserBeams.map((beam, idx) => {
        const tower = towerById.get(beam.towerId);
        const enemy = enemyById.get(beam.targetId);
        if (!tower || !enemy) return null;

        const startX = tower.position.x * scaledCellSize + scaledCellSize / 2;
        const startY = tower.position.y * scaledCellSize + scaledCellSize / 2;
        const endX = enemy.position.x * scaledCellSize + scaledCellSize / 2;
        const endY = enemy.position.y * scaledCellSize + scaledCellSize / 2;

        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

        return (
          <GameLaserBeam
            key={`laser-${idx}`}
            startX={startX}
            startY={startY}
            length={length}
            angleDeg={angleDeg}
          />
        );
      })}

      {enemies.map((enemy) => (
        <GameEnemySprite
          key={enemy.id}
          enemy={enemy}
          scaledCellSize={scaledCellSize}
          finalScale={finalScale}
          nowTs={nowTs}
        />
      ))}

      {visibleProjectiles.map((proj) => {
        const target = enemyById.get(proj.targetId);
        let px = proj.position.x;
        let py = proj.position.y;
        if (target) {
          const dx = target.position.x - proj.position.x;
          const dy = target.position.y - proj.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.001) {
            const renderLead = proj.speed * 0.016 * (performanceMode ? 0.2 : 0.35);
            const lead = Math.min(renderLead, dist * 0.6);
            px += (dx / dist) * lead;
            py += (dy / dist) * lead;
          }
        }
        const bg = proj.isFreeze ? TacticalTheme.freezeTint : proj.isSplash ? '#FF6B35' : '#FFD700';
        return (
          <GameProjectileSprite
            key={proj.id}
            left={px * scaledCellSize + scaledCellSize / 2 - 4}
            top={py * scaledCellSize + scaledCellSize / 2 - 4}
            backgroundColor={bg}
          />
        );
      })}

      {towers.map((tower) => {
        const towerDef = TOWERS[tower.type];
        const shopBonus = towerUpgradeLevels[tower.type] || 0;
        let stats = getInfiniteUpgradeStats(towerDef.baseStats, tower.level);
        if (shopBonus > 0) {
          stats = { ...stats, range: stats.range * (1 + shopBonus * 0.02) };
        }
        const rangeRadius = stats.range * scaledCellSize;
        const isSelected = selectedPlacedTower?.id === tower.id;

        return (
          <GameTowerSprite
            key={tower.id}
            tower={tower}
            scaledCellSize={scaledCellSize}
            rangeRadius={rangeRadius}
            isSelected={isSelected}
            getTowerColor={getTowerColor}
            onCellPress={onCellPress}
          />
        );
      })}
    </>
  );
});
GameBoardCombatEntities.displayName = 'GameBoardCombatEntities';

// Game board: pinch zoom runs on UI thread; store zoom commits once per pinch (no React churn while zooming)
const GameBoard = React.memo(
  ({
    onCellPress,
    scale,
    zoomLevel,
    performanceMode,
    vfxQuality,
    previewCell,
  }: {
    onCellPress: (x: number, y: number) => void;
    scale: number;
    zoomLevel: number;
    performanceMode: boolean;
    vfxQuality: 0 | 1 | 2;
    /** Highlighted cell for pending tower placement preview. */
    previewCell?: { col: number; row: number } | null;
  }) => {
    const { gridCols, gridRows, cellSize, selectedTowerType, selectedPlacedTower, mapTheme, spawnPoint, basePosition } =
      useGameStore(
        useShallow((s) => ({
          gridCols: s.gridCols,
          gridRows: s.gridRows,
          cellSize: s.cellSize,
          selectedTowerType: s.selectedTowerType,
          selectedPlacedTower: s.selectedPlacedTower,
          mapTheme: s.mapTheme,
          spawnPoint: s.spawnPoint,
          basePosition: s.basePosition,
        }))
      );

    const pinchMultSV = useSharedValue(1);
    const startZoomSV = useSharedValue(zoomLevel);
    const committedZoomSV = useSharedValue(zoomLevel);

    const boardSurfaceRef = useRef<View | null>(null);
    const boardScreenRectRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const boardSyncRafRef = useRef<number | null>(null);

    const syncBoardScreenRect = useCallback(() => {
      const node = boardSurfaceRef.current;
      if (!node) return;
      node.measureInWindow((x, y, w, h) => {
        if (typeof x === 'number' && typeof y === 'number' && w > 0 && h > 0) {
          boardScreenRectRef.current = { x, y, w, h };
        }
      });
    }, []);

    const scheduleBoardScreenSync = useCallback(() => {
      if (boardSyncRafRef.current != null) return;
      boardSyncRafRef.current = requestAnimationFrame(() => {
        boardSyncRafRef.current = null;
        syncBoardScreenRect();
      });
    }, [syncBoardScreenRect]);

    useEffect(() => {
      return () => {
        if (boardSyncRafRef.current != null) {
          cancelAnimationFrame(boardSyncRafRef.current);
          boardSyncRafRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      committedZoomSV.value = zoomLevel;
    }, [zoomLevel, committedZoomSV]);

    useEffect(() => {
      scheduleBoardScreenSync();
    }, [zoomLevel, scale, gridCols, gridRows, cellSize, scheduleBoardScreenSync]);

    const commitZoom = useCallback((z: number) => {
      try {
        const nz = clampZoom(typeof z === 'number' && Number.isFinite(z) ? z : ZOOM_MIN);
        useGameStore.getState().setZoomLevel(nz);
      } catch {
        /* ignore */
      }
    }, []);

    const pinchOnBeginJS = useCallback(() => {}, []);

    const pinchOnEndJS = useCallback(() => {}, []);

    const pinchOnFinalizeJS = useCallback(() => {}, []);

    const pinchGesture = useMemo(
      () =>
        Gesture.Pinch()
          .onBegin(() => {
            'worklet';
            startZoomSV.value = committedZoomSV.value;
            pinchMultSV.value = 1;
          })
          .onUpdate((e) => {
            'worklet';
            const raw = e?.scale;
            const factor =
              typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1;
            const base = startZoomSV.value;
            if (!Number.isFinite(base) || base <= 0) return;
            const abs = Math.max(0.8, Math.min(2.5, base * factor));
            const ratio = abs / base;
            pinchMultSV.value = Math.min(3, Math.max(0.35, Number.isFinite(ratio) ? ratio : 1));
          })
          .onEnd((e) => {
            'worklet';
            const raw = e?.scale;
            const factor =
              typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1;
            const base = startZoomSV.value;
            const abs =
              Number.isFinite(base) && base > 0
                ? Math.max(0.8, Math.min(2.5, base * factor))
                : committedZoomSV.value;
            pinchMultSV.value = 1;
            runOnJS(commitZoom)(abs);
            runOnJS(pinchOnEndJS)();
          })
          .onFinalize(() => {
            'worklet';
            pinchMultSV.value = 1;
            runOnJS(pinchOnFinalizeJS)();
          }),
      [
        commitZoom,
        committedZoomSV,
        pinchMultSV,
        pinchOnEndJS,
        pinchOnFinalizeJS,
        startZoomSV,
      ]
    );

    const pinchAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: pinchMultSV.value }],
    }));

    const finalScale = scale * zoomLevel;
    const scaledCellSize = cellSize * finalScale;
    const boardWidth = gridCols * scaledCellSize;
    const boardHeight = gridRows * scaledCellSize;
    const scrollLocked = !!selectedTowerType && !selectedPlacedTower;

    const boardGestures = pinchGesture;

    const effectivePreview = previewCell ?? null;

    return (
    <ScrollView
      style={styles.boardScrollContainer}
      contentContainerStyle={styles.boardScrollContent}
      horizontal
      scrollEnabled={!scrollLocked}
      removeClippedSubviews
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={24}
      onScroll={scheduleBoardScreenSync}
      onMomentumScrollEnd={scheduleBoardScreenSync}
    >
      <ScrollView
        scrollEnabled={!scrollLocked}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.boardInnerScrollContent}
        scrollEventThrottle={24}
        onScroll={scheduleBoardScreenSync}
        onMomentumScrollEnd={scheduleBoardScreenSync}
      >
        <GestureAreaErrorBoundary>
          <GestureDetector gesture={boardGestures}>
            <Animated.View
              ref={boardSurfaceRef}
              collapsable={false}
              onLayout={scheduleBoardScreenSync}
              style={[
                styles.gameBoard,
                {
                  width: boardWidth,
                  height: boardHeight,
                  backgroundColor: mapTheme?.floor ?? '#0f0f23',
                },
                pinchAnimatedStyle,
              ]}
            >
              <GameBoardStaticCells
                onCellPress={onCellPress}
                scaledCellSize={scaledCellSize}
                effectivePreview={effectivePreview}
              />
              <GameBoardCombatEntities
                onCellPress={onCellPress}
                scaledCellSize={scaledCellSize}
                finalScale={finalScale}
                performanceMode={performanceMode}
                vfxQuality={vfxQuality}
              />

              <GameSpawnBaseMarkers
                spawnPoint={spawnPoint}
                basePosition={basePosition}
                scaledCellSize={scaledCellSize}
              />
            </Animated.View>
          </GestureDetector>
        </GestureAreaErrorBoundary>
      </ScrollView>
    </ScrollView>
  );
});

GameBoard.displayName = 'GameBoard';

/** Step 1: short game over — step 2: results summary */
const GameOverFlowModal = ({
  visible,
  step,
  wave,
  score,
  enemiesKilled,
  towersPlaced,
  bestWaveRecord,
  slaughterQualified,
  slaughterThreshold,
  triumphCount,
  triumphsNeeded,
  rewardSummary,
  onSeeResults,
  onHome,
  onPlayAgain,
}: {
  visible: boolean;
  step: 'over' | 'results';
  wave: number;
  score: number;
  enemiesKilled: number;
  towersPlaced: number;
  bestWaveRecord: number;
  slaughterQualified: boolean;
  slaughterThreshold: number;
  triumphCount: number;
  triumphsNeeded: number;
  rewardSummary: {
    challengeName: string;
    xpEarned: number;
    gemsEarned: number;
  };
  onSeeResults: () => void;
  onHome: () => void;
  onPlayAgain: () => void;
}) => {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.modalOverlay}>
        {step === 'over' ? (
          <View style={styles.gameOverModal}>
            <Text style={styles.gameOverTitle}>Game over</Text>
            <View style={styles.gameOverKillsBlock}>
              <Text style={styles.gameOverKillsNumber}>{enemiesKilled}</Text>
              <Text style={styles.gameOverKillsCaption}>enemies destroyed this run</Text>
            </View>
            {slaughterQualified ? (
              <View style={styles.slaughterEarnedBadge}>
                <MaterialCommunityIcons name="skull" size={20} color="#1a0f0a" />
                <Text style={styles.slaughterEarnedText}>
                  Slaughter earned — {slaughterThreshold}+ enemies destroyed
                </Text>
              </View>
            ) : (
              <Text style={styles.gameOverSlaughterHint}>
                Reach {slaughterThreshold}+ enemies destroyed in one run to earn a slaughter star toward your bounty.
              </Text>
            )}
            <Text style={styles.gameOverTriumphLine}>
              Slaughter stars (bounty): {triumphCount}/{triumphsNeeded}
            </Text>
            <Text style={styles.gameOverWave}>Wave {wave} • Score {score}</Text>
            <TouchableOpacity style={styles.resultsPrimaryButton} onPress={onSeeResults}>
              <Text style={styles.resultsPrimaryText}>See results</Text>
              <Ionicons name="chevron-forward" size={22} color={TacticalTheme.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.gameOverModal}>
            <Text style={styles.resultsScreenTitle}>Run results</Text>
            <Text style={styles.resultsChallenge}>{rewardSummary.challengeName}</Text>

            <View style={styles.resultsHeroCard}>
              <Text style={styles.resultsHeroLabel}>This run</Text>
              <Text style={styles.resultsHeroValue}>{enemiesKilled}</Text>
              <Text style={styles.resultsHeroSub}>enemies destroyed</Text>
              {slaughterQualified && (
                <View style={styles.resultsHeroRibbon}>
                  <Text style={styles.resultsHeroRibbonText}>
                    Slaughter milestone ({slaughterThreshold}+ enemies)
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.resultsStatGrid}>
              <View style={styles.resultsStat}>
                <Text style={styles.resultsStatLabel}>Slaughter stars</Text>
                <Text style={styles.resultsStatValue}>
                  {triumphCount}/{triumphsNeeded}
                </Text>
              </View>
              <View style={styles.resultsStat}>
                <Text style={styles.resultsStatLabel}>Wave reached</Text>
                <Text style={styles.resultsStatValue}>{wave}</Text>
              </View>
              <View style={styles.resultsStat}>
                <Text style={styles.resultsStatLabel}>Best wave (record)</Text>
                <Text style={styles.resultsStatValue}>{bestWaveRecord}</Text>
              </View>
              <View style={styles.resultsStat}>
                <Text style={styles.resultsStatLabel}>Towers placed</Text>
                <Text style={styles.resultsStatValue}>{towersPlaced}</Text>
              </View>
              <View style={styles.resultsStat}>
                <Text style={styles.resultsStatLabel}>Score</Text>
                <Text style={styles.resultsStatValue}>{score}</Text>
              </View>
            </View>

            <View style={styles.rewardSummaryBox}>
              <Text style={styles.rewardSummaryTitle}>Rewards</Text>
              <Text style={styles.rewardSummaryText}>+{rewardSummary.xpEarned} XP</Text>
              <Text style={styles.rewardSummaryText}>+{rewardSummary.gemsEarned} gems</Text>
            </View>

            <TouchableOpacity style={styles.homePrimaryButton} onPress={onHome}>
              <Ionicons name="home" size={22} color="#fff" />
              <Text style={styles.homePrimaryText}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.playAgainSecondary} onPress={onPlayAgain}>
              <Text style={styles.playAgainSecondaryText}>Play again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

// Exit Warning Modal with Shop option
const ExitWarningModal = ({ 
  visible, 
  onConfirm, 
  onCancel,
  onGoToShop,
  currentWave,
  coins,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onGoToShop: () => void;
  currentWave: number;
  coins: number;
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.exitWarningModal}>
          <Ionicons name="pause-circle" size={48} color={TacticalTheme.accent} />
          <Text style={styles.exitWarningTitle}>Game Paused</Text>
          <Text style={styles.exitWarningSubtitle}>Wave {currentWave} • {coins} coins</Text>
          <Text style={styles.exitWarningText}>
            Your progress will be saved.{'\n'}
            You can return and continue later!
          </Text>
          
          <TouchableOpacity style={styles.shopButton} onPress={onGoToShop}>
            <FontAwesome5 name="store" size={16} color="#fff" />
            <Text style={styles.shopButtonText}>Go to Shop</Text>
          </TouchableOpacity>
          
          <View style={styles.exitWarningButtons}>
            <TouchableOpacity style={styles.cancelExitButton} onPress={onCancel}>
              <Text style={styles.cancelExitText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmExitButton} onPress={onConfirm}>
              <Text style={styles.confirmExitText}>Exit & Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Resume Game Modal
const ResumeGameModal = ({
  visible,
  savedGame,
  onResume,
  onNewGame,
}: {
  visible: boolean;
  savedGame: SavedGameState | null;
  onResume: () => void;
  onNewGame: () => void;
}) => {
  if (!savedGame) return null;
  
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.resumeModal}>
          <MaterialCommunityIcons name="content-save" size={48} color="#2ECC71" />
          <Text style={styles.resumeTitle}>Saved Game Found!</Text>
          <Text style={styles.resumeDetails}>
            Wave {savedGame.currentWave} • {savedGame.towers.length} towers
          </Text>
          <Text style={styles.resumeDetails}>
            {savedGame.coins} coins • {savedGame.baseHealth} HP
          </Text>
          
          <TouchableOpacity style={styles.resumeButton} onPress={onResume}>
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.resumeButtonText}>Continue Game</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.newGameButton} onPress={onNewGame}>
            <Text style={styles.newGameText}>Start New Game</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default function GameScreen() {
  const router = useRouter();
  const dailyChallenge = useMemo(() => getDailyChallenge(), []);
  const runStartBestWaveRef = useRef<number>(0);
  const lastMissionCompletedCountRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  const frameAccumRef = useRef(0);
  const gameEndHandledRef = useRef(false);
  const spawningCompleteRef = useRef<boolean>(false);
  const waveScheduleRef = useRef<{ atMs: number; type: any }[]>([]);
  const waveSpawnCursorRef = useRef(0);
  const waveElapsedMsRef = useRef(0);
  const waveKeyRef = useRef<string>('');
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [eliteWaveNotice, setEliteWaveNotice] = useState<string | null>(null);
  const [gameOverStep, setGameOverStep] = useState<'over' | 'results'>('over');
  
  const playerStore = usePlayerStore();
  const registerRunStarted = usePlayerStore((s) => s.registerRunStarted);

  const selectedMap = useMemo(() => getMapById(playerStore.currentMapId), [playerStore.currentMapId]);
  const dailyMissions = usePlayerStore((s) => s.dailyMissions);
  const vfxQuality = usePlayerStore((s) => s.vfxQuality);
  useEffect(() => {
    if (runStartBestWaveRef.current === 0) {
      runStartBestWaveRef.current = playerStore.bestWave;
    }
  }, [playerStore.bestWave]);

  const {
    isPlaying,
    isPaused,
    isGameOver,
    currentWave,
    waveInProgress,
    coins,
    baseHealth,
    score,
    enemiesKilled,
    towersPlaced,
    towersCount,
    enemyCount,
    waveSpawnSlotsTotal,
    waveSpawnSlotsReleased,
    unlockedTowers,
    unlockedSpeeds,
    towerUpgradeLevels,
    selectedTowerType,
    selectedPlacedTower,
    gameStartTime,
    gameSpeed,
    autoWaveTimer,
    gridCols,
    gridRows,
    cellSize,
    zoomLevel,
    selectTower,
    selectPlacedTower,
    placeTower,
    upgradeTower,
    sellTower,
    setTowerTargeting,
    startGame,
    pauseGame,
    resumeGame,
    restartGame,
    startWave,
    canPlaceTower,
    getTowerAt,
    getTowerCost,
    getUpgradeCost,
    getSellValue,
    setGameSpeed,
    getCurrentCoins,
    lastWaveBonus,
    showBonusPopup,
    runGemsFromWavePart,
  } = useGameStore(
    useShallow((s) => ({
      isPlaying: s.isPlaying,
      isPaused: s.isPaused,
      isGameOver: s.isGameOver,
      currentWave: s.currentWave,
      waveInProgress: s.waveInProgress,
      coins: s.coins,
      baseHealth: s.baseHealth,
      score: s.score,
      enemiesKilled: s.enemiesKilled,
      towersPlaced: s.towersPlaced,
      towersCount: s.towers.length,
      enemyCount: s.enemies.length,
      waveSpawnSlotsTotal: s.waveSpawnSlotsTotal,
      waveSpawnSlotsReleased: s.waveSpawnSlotsReleased,
      unlockedTowers: s.unlockedTowers,
      unlockedSpeeds: s.unlockedSpeeds,
      towerUpgradeLevels: s.towerUpgradeLevels,
      selectedTowerType: s.selectedTowerType,
      selectedPlacedTower: s.selectedPlacedTower,
      gameStartTime: s.gameStartTime,
      gameSpeed: s.gameSpeed,
      autoWaveTimer: s.autoWaveTimer,
      gridCols: s.gridCols,
      gridRows: s.gridRows,
      cellSize: s.cellSize,
      zoomLevel: s.zoomLevel,
      selectTower: s.selectTower,
      selectPlacedTower: s.selectPlacedTower,
      placeTower: s.placeTower,
      upgradeTower: s.upgradeTower,
      sellTower: s.sellTower,
      setTowerTargeting: s.setTowerTargeting,
      startGame: s.startGame,
      pauseGame: s.pauseGame,
      resumeGame: s.resumeGame,
      restartGame: s.restartGame,
      startWave: s.startWave,
      canPlaceTower: s.canPlaceTower,
      getTowerAt: s.getTowerAt,
      getTowerCost: s.getTowerCost,
      getUpgradeCost: s.getUpgradeCost,
      getSellValue: s.getSellValue,
      setGameSpeed: s.setGameSpeed,
      getCurrentCoins: s.getCurrentCoins,
      lastWaveBonus: s.lastWaveBonus,
      showBonusPopup: s.showBonusPopup,
      runGemsFromWavePart: s.runGemsFromWavePart,
    }))
  );

  const applyGameSpeed = useCallback(
    (speed: GameSpeed) => {
      frameAccumRef.current = 0;
      lastUpdateRef.current = Date.now();
      setGameSpeed(speed);
    },
    [setGameSpeed]
  );

  const prevGameSpeedRef = useRef(gameSpeed);
  useEffect(() => {
    if (prevGameSpeedRef.current !== gameSpeed) {
      prevGameSpeedRef.current = gameSpeed;
      frameAccumRef.current = 0;
      lastUpdateRef.current = Date.now();
    }
  }, [gameSpeed]);

  useFocusEffect(
    useCallback(() => {
      const s = useGameStore.getState();
      if (s.isPlaying && !s.isGameOver) {
        setGameplaySfxArmed(true);
      }
      return () => {
        void cleanupGameplayAudioAfterSession();
      };
    }, [])
  );

  useEffect(() => {
    if (isPlaying && currentWave <= 1) {
      runStartBestWaveRef.current = playerStore.bestWave;
    }
  }, [isPlaying, currentWave, playerStore.bestWave]);

  const currentMapId = useGameStore((s) => s.currentMapId);
  const arenaLabel = useMemo(() => {
    if (currentMapId === CLASSIC_MAP_ID) return 'Classic grid';
    return getArenaMap(currentMapId)?.name ?? 'Arena';
  }, [currentMapId]);

  const sessionSlaughterTriumphs = usePlayerStore((s) => s.sessionSlaughterTriumphs);

  const waveEnemiesRemaining = useMemo(() => {
    if (!waveInProgress || currentWave <= 0) return null;
    const queued = Math.max(0, waveSpawnSlotsTotal - waveSpawnSlotsReleased);
    return enemyCount + queued;
  }, [
    waveInProgress,
    currentWave,
    enemyCount,
    waveSpawnSlotsTotal,
    waveSpawnSlotsReleased,
  ]);

  const sessionRunRecordedRef = useRef(false);
  useLayoutEffect(() => {
    if (!isGameOver) {
      sessionRunRecordedRef.current = false;
      return;
    }
    if (sessionRunRecordedRef.current) return;
    if (!usePlayerStore.getState().playerId) return;
    sessionRunRecordedRef.current = true;
    usePlayerStore.getState().recordSessionRunStats(enemiesKilled);
  }, [isGameOver, enemiesKilled]);

  const slaughterHapticSentRef = useRef(false);
  useEffect(() => {
    if (!isPlaying || isGameOver) return;
    if (enemiesKilled >= SESSION_SLAUGHTER_WIN_KILLS && !slaughterHapticSentRef.current) {
      slaughterHapticSentRef.current = true;
      if (playerStore.hapticEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [enemiesKilled, isPlaying, isGameOver, playerStore.hapticEnabled]);

  useEffect(() => {
    if (enemiesKilled < SESSION_SLAUGHTER_WIN_KILLS) slaughterHapticSentRef.current = false;
  }, [enemiesKilled]);

  const playerGems = usePlayerStore((s) => s.gems);
  const gemsHudDisplay = useMemo(() => {
    if (isGameOver) return playerGems;
    if (isServerBackedPlayerId(playerStore.playerId)) {
      return playerGems + runGemsFromWavePart;
    }
    return playerGems;
  }, [isGameOver, playerGems, runGemsFromWavePart, playerStore.playerId]);

  useEffect(() => {
    if (isGameOver) setGameOverStep('over');
  }, [isGameOver]);

  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const waveChallengeKey = useMemo(
    () =>
      `${dailyChallenge.enemyHealthMultiplier}:${dailyChallenge.enemySpeedMultiplier}`,
    [dailyChallenge.enemyHealthMultiplier, dailyChallenge.enemySpeedMultiplier]
  );

  const boardWidth = gridCols * cellSize;
  const boardHeight = gridRows * cellSize;
  const scale = Math.min(
    (SCREEN_WIDTH - 20) / boardWidth,
    (SCREEN_HEIGHT - 380) / boardHeight
  );

  // Initialize game on mount - check for saved game
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const savedGame = playerStore.getSavedGame();
    
    if (savedGame && savedGame.currentWave > 0) {
      // Show resume prompt
      setShowResumePrompt(true);
    } else {
      // Start new game
      startGame(
        playerStore.unlockedTowers,
        playerStore.unlockedSpeeds,
        playerStore.towerUpgradeLevels,
        playerStore.equippedSkins,
        playerStore.arenaExpansions,
        playerStore.currentMapId
      );
      registerRunStarted();
    }
    
    if (playerStore.playerId && isServerBackedPlayerId(playerStore.playerId)) {
      analyticsApi.log({
        player_id: playerStore.playerId,
        event_type: 'game_start',
      }).catch(() => {});
    }
    
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      waveScheduleRef.current = [];
      waveSpawnCursorRef.current = 0;
      waveElapsedMsRef.current = 0;
      spawningCompleteRef.current = false;
      frameAccumRef.current = 0;
      void cleanupGameplayAudioAfterSession();
    };
  }, [playerStore, startGame, registerRunStarted]);

  // Handle resume saved game
  const handleResumeGame = useCallback(() => {
    const savedGame = playerStore.getSavedGame();
    if (savedGame) {
      useGameStore.getState().resumeFromSavedGame(savedGame as SavedGameStateForExport, {
        unlockedTowers: playerStore.unlockedTowers,
        unlockedSpeeds: playerStore.unlockedSpeeds,
        towerUpgradeLevels: playerStore.towerUpgradeLevels,
        equippedSkins: playerStore.equippedSkins,
      });
    }
    setShowResumePrompt(false);
  }, [playerStore]);

  // Handle start new game (discard saved)
  const handleStartNewGame = useCallback(() => {
    playerStore.clearSavedGame();
    startGame(
      playerStore.unlockedTowers,
      playerStore.unlockedSpeeds,
      playerStore.towerUpgradeLevels,
      playerStore.equippedSkins,
      playerStore.arenaExpansions,
      playerStore.currentMapId
    );
    registerRunStarted();
    setShowResumePrompt(false);
  }, [playerStore, startGame, registerRunStarted]);

  // Handle back button (Android)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isPlaying && !isGameOver) {
        setShowExitWarning(true);
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, [isPlaying, isGameOver]);

  useEffect(() => {
    if (!isPlaying || isPaused) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      frameAccumRef.current = 0;
      lastUpdateRef.current = Date.now();
      return;
    }

    let cancelled = false;
    lastUpdateRef.current = Date.now();
    frameAccumRef.current = 0;

    const runTick = () => {
      if (cancelled) return;
      try {
        const live = useGameStore.getState();
        if (!live.isPlaying || live.isPaused) {
          return;
        }

        const now = Date.now();
        const rawDelta = now - lastUpdateRef.current;
        lastUpdateRef.current = now;
        frameAccumRef.current += Math.min(rawDelta, MAX_FRAME_DELTA_MS);

        const maxSubsteps = Math.min(
          MAX_SUBSTEPS_CAP,
          BASE_MAX_SUBSTEPS_PER_FRAME + Math.floor(live.gameSpeed / 2)
        );
        const maxAccumCatchupMs = LOOP_STEP_MS * Math.max(12, maxSubsteps * 3);
        frameAccumRef.current = Math.min(frameAccumRef.current, maxAccumCatchupMs);

        let substeps = 0;
        while (frameAccumRef.current >= LOOP_STEP_MS && substeps < maxSubsteps) {
          frameAccumRef.current -= LOOP_STEP_MS;
          substeps += 1;
          let state = useGameStore.getState();
          if (!state.isPlaying || state.isPaused) break;

          try {
            state.gameTick(LOOP_STEP_MS);
          } catch {
            continue;
          }

          try {
            state = useGameStore.getState();

            if (state.waveInProgress) {
              const scheduleKeyForWave = `${state.currentWave}:${waveChallengeKey}`;
              ensureWaveSpawnSchedule({
                waveKeyRef,
                scheduleRef: waveScheduleRef,
                spawnCursorRef: waveSpawnCursorRef,
                elapsedRef: waveElapsedMsRef,
                spawningCompleteRef,
                currentWave: state.currentWave,
                waveChallengeKey: scheduleKeyForWave,
                selectedMap,
              });

              waveElapsedMsRef.current += LOOP_STEP_MS * state.gameSpeed;
              while (
                waveSpawnCursorRef.current < waveScheduleRef.current.length &&
                waveScheduleRef.current[waveSpawnCursorRef.current].atMs <= waveElapsedMsRef.current
              ) {
                const next = waveScheduleRef.current[waveSpawnCursorRef.current];
                const waveConfig = getWaveConfig(state.currentWave);
                const mapHealthMult = selectedMap?.enemyHealthMultiplier ?? 1;
                const mapSpeedMult = selectedMap?.enemySpeedMultiplier ?? 1;
                try {
                  state.spawnEnemy(
                    next.type as EnemyType,
                    waveConfig.healthMultiplier * dailyChallenge.enemyHealthMultiplier * mapHealthMult,
                    waveConfig.speedMultiplier * dailyChallenge.enemySpeedMultiplier * mapSpeedMult
                  );
                } catch {
                  /* skip spawn slot on failure */
                }
                waveSpawnCursorRef.current += 1;
              }
              if (waveSpawnCursorRef.current >= waveScheduleRef.current.length) {
                spawningCompleteRef.current = true;
              }
            }

            state = useGameStore.getState();
            if (state.waveInProgress && state.enemies.length === 0 && spawningCompleteRef.current) {
              try {
                useGameStore.getState().endWave();
                spawningCompleteRef.current = false;
                handleSaveCoins(state.coins);
              } catch {
                /* keep run alive; wave end can retry next tick */
              }
            }
          } catch {
            /* isolate spawn/wave failures from the RAF driver */
          }
        }
      } catch {
        /* outer tick guard */
      }

      if (!cancelled) {
        const s = useGameStore.getState();
        if (s.isPlaying && !s.isPaused) {
          rafRef.current = requestAnimationFrame(runTick);
        }
      }
    };

    rafRef.current = requestAnimationFrame(runTick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, isPaused, waveChallengeKey, selectedMap, dailyChallenge]);

  /** Reset spawn refs between waves / when not running (schedule is filled synchronously in RAF). */
  useEffect(() => {
    if (!waveInProgress || !isPlaying) {
      waveScheduleRef.current = [];
      waveSpawnCursorRef.current = 0;
      waveElapsedMsRef.current = 0;
      spawningCompleteRef.current = false;
      waveKeyRef.current = '';
    }
  }, [waveInProgress, isPlaying]);

  const eliteNoticeMountedRef = useRef(true);
  useEffect(() => {
    eliteNoticeMountedRef.current = true;
    return () => {
      eliteNoticeMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isGameOver || !waveInProgress || currentWave <= 0) {
      setEliteWaveNotice(null);
      return;
    }
    const waveConfig = getWaveConfig(currentWave);
    const enemyTypes = waveConfig.enemies.map((e) => e.type);
    if (enemyTypes.includes('boss')) {
      setEliteWaveNotice('Boss wave incoming!');
    } else if (enemyTypes.includes('splitter') || enemyTypes.includes('healer') || enemyTypes.includes('shielded')) {
      setEliteWaveNotice('Elite enemies incoming!');
    } else {
      setEliteWaveNotice(null);
      return;
    }
    const t = setTimeout(() => {
      if (eliteNoticeMountedRef.current) setEliteWaveNotice(null);
    }, 2200);
    return () => clearTimeout(t);
  }, [waveInProgress, currentWave, isGameOver]);

  // Auto-save between waves (in-game coins NOT synced to gems - separate systems)
  const handleSaveCoins = async (_currentCoins: number) => {
    // In-game coins don't transfer to persistent gems.
    // Persistent gems accrue each wave (wave-linear slice) and at run end (remainder + challenge/combo).
    // This function is kept for save-game compatibility.
  };

  // Save full game state for resume
  const saveGameState = useCallback(() => {
    const gameState = useGameStore.getState().getGameStateForSave();
    playerStore.saveGame(gameState as any);
  }, [playerStore]);

  // Handle exit with warning
  const handleExitAttempt = useCallback(() => {
    if (isPlaying && !isGameOver && currentWave > 0) {
      pauseGame();
      setShowExitWarning(true);
    } else {
      void stopAllSounds();
      router.replace('/');
    }
  }, [isPlaying, isGameOver, currentWave, pauseGame, router]);

  // Save and go to shop
  const handleGoToShop = useCallback(() => {
    void stopAllSounds();
    // Save game state before navigating to shop
    saveGameState();
    setShowExitWarning(false);
    router.push('/shop');
  }, [saveGameState, router]);

  const handleConfirmExit = useCallback(async () => {
    setShowExitWarning(false);
    void stopAllSounds();
    // Save game state for resume
    saveGameState();
    await handleSaveCoins(getCurrentCoins());
    router.replace('/');
  }, [saveGameState, getCurrentCoins, router]);

  const handleCancelExit = useCallback(() => {
    setShowExitWarning(false);
    resumeGame();
  }, [resumeGame]);

  const handlePurchaseSpeed = useCallback(
    (speed: GameSpeed) => {
      const success = usePlayerStore.getState().purchaseSpeed(speed);
      if (success) {
        const unlocked = usePlayerStore.getState().unlockedSpeeds;
        useGameStore.setState({
          unlockedSpeeds: normalizeUnlockedSpeeds(unlocked),
        });
        applyGameSpeed(speed);
      }
    },
    [applyGameSpeed]
  );

  const handleStartWave = useCallback(() => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    spawningCompleteRef.current = false;
    startWave();
  }, [startWave, playerStore.hapticEnabled]);

  const [pendingPlacement, setPendingPlacement] = useState<{ x: number; y: number } | null>(null);

  const handleCellPress = useCallback((x: number, y: number) => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const existingTower = getTowerAt({ x, y });

    if (existingTower) {
      setPendingPlacement(null);
      selectPlacedTower(existingTower);
    } else if (selectedTowerType) {
      if (canPlaceTower({ x, y })) {
        setPendingPlacement({ x, y });
      } else if (playerStore.hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } else {
      setPendingPlacement(null);
      if (selectedPlacedTower) {
        selectPlacedTower(null);
      }
    }
  }, [selectedTowerType, selectedPlacedTower, getTowerAt, canPlaceTower, selectPlacedTower, playerStore.hapticEnabled]);

  const handleCancelPlacement = useCallback(() => {
    setPendingPlacement(null);
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [playerStore.hapticEnabled]);

  const handleConfirmPlacement = useCallback(() => {
    if (!pendingPlacement || !selectedTowerType) return;
    const success = placeTower(pendingPlacement);
    if (success) {
      setPendingPlacement(null);
      if (playerStore.hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else if (playerStore.hapticEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [pendingPlacement, selectedTowerType, placeTower, playerStore.hapticEnabled]);

  const handleTowerSelect = useCallback(
    (type: TowerType | null) => {
      setPendingPlacement(null);
      selectTower(type);
    },
    [selectTower]
  );

  const handleToggleAutoStart = useCallback(() => {
    const nextOn = !playerStore.autoStartWaves;
    playerStore.toggleAutoStartWaves();
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (!nextOn) {
      useGameStore.setState({ autoWaveTimer: 0 });
      return;
    }
    const st = useGameStore.getState();
    if (!st.waveInProgress && st.currentWave > 0 && st.autoWaveTimer <= 0) {
      useGameStore.setState({ autoWaveTimer: GAME_CONFIG.WAVE_DELAY });
    }
  }, [playerStore]);

  useEffect(() => {
    if (!selectedTowerType) {
      setPendingPlacement(null);
    }
  }, [selectedTowerType]);

  const placementPreviewCell = useMemo(
    () =>
      pendingPlacement ? { col: pendingPlacement.x, row: pendingPlacement.y } : null,
    [pendingPlacement]
  );

  const pendingPlacementCost = selectedTowerType ? getTowerCost(selectedTowerType) : 0;

  const handleUpgrade = useCallback(() => {
    if (selectedPlacedTower) {
      const success = upgradeTower(selectedPlacedTower.id);
      if (success && playerStore.hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [selectedPlacedTower, upgradeTower, playerStore.hapticEnabled]);

  const handleSell = useCallback(() => {
    if (selectedPlacedTower) {
      sellTower(selectedPlacedTower.id);
      if (playerStore.hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  }, [selectedPlacedTower, sellTower, playerStore.hapticEnabled]);

  const handleTargetingChange = useCallback((mode: TargetingMode) => {
    if (selectedPlacedTower) {
      setTowerTargeting(selectedPlacedTower.id, mode);
    }
  }, [selectedPlacedTower, setTowerTargeting]);

  const handleGameEnd = useCallback(async () => {
    if (gameEndHandledRef.current) return;
    gameEndHandledRef.current = true;

    const runMapId = useGameStore.getState().currentMapId ?? playerStore.currentMapId;
    playerStore.recordMapBestWave(runMapId, currentWave);

    const duration = Math.floor((Date.now() - gameStartTime) / 1000);
    // Slower progression: modest wave XP + small kill XP + light round completion XP.
    const waveXp = Math.max(1, Math.floor(currentWave * 0.65));
    const killXp = Math.floor(enemiesKilled * 0.06);
    const roundXp = currentWave >= 1 ? 1 : 0;
    const baseXpReward = waveXp + killXp + roundXp;
    const waveGemProgress = useGameStore.getState().runGemsFromWavePart;
    const remainderPerf = endGamePerformanceRemainder(currentWave, enemiesKilled, waveGemProgress);
    const P_scaled = scaledTotalPerformanceGems(currentWave, enemiesKilled);
    const challengeXpReward = Math.floor(baseXpReward * Math.max(0, dailyChallenge.xpMultiplier - 1));
    const challengeGemReward = Math.floor(P_scaled * Math.max(0, dailyChallenge.gemMultiplier - 1));
    const totalXpReward = baseXpReward + challengeXpReward;
    const totalGemReward = remainderPerf + challengeGemReward;

    const settleRunLocally = () => {
      playerStore.addXp(totalXpReward);
      const comboResult = playerStore.recordDailyChallengeRun();
      if (comboResult.bonusGems > 0 && canPlayUiSfx()) {
        playSfx('combo');
      }
      if (totalGemReward > 0) {
        playerStore.addGems(totalGemReward);
      }
      const runGemsTotal = totalGemReward + comboResult.bonusGems;
      playerStore.recordGame(currentWave, enemiesKilled, towersPlaced, runGemsTotal);
      playerStore.clearCurrentGameProgress();
    };

    if (!isServerBackedPlayerId(playerStore.playerId)) {
      settleRunLocally();
      return;
    }

    const endPayload = {
      player_id: playerStore.playerId,
      wave_reached: currentWave,
      enemies_killed: enemiesKilled,
      towers_placed: towersPlaced,
      duration_seconds: duration,
      coins_earned: coins,
      run_bonus_gems: challengeGemReward,
    };

    const maxAttempts = 3;
    let response: Awaited<ReturnType<typeof gameApi.endGame>> | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await gameApi.endGame(endPayload);
        break;
      } catch {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 450 * attempt));
        }
      }
    }

    if (!response) {
      settleRunLocally();
      return;
    }

    let comboResult = { bonusGems: 0 };
    if (response.data) {
      playerStore.addXp(response.data.xp_earned + challengeXpReward);
      if (response.data.new_gem_balance !== undefined) {
        playerStore.setGems(response.data.new_gem_balance);
      }
      comboResult = playerStore.recordDailyChallengeRun();
      if (comboResult.bonusGems > 0 && canPlayUiSfx()) {
        playSfx('combo');
      }
      if (challengeGemReward > 0) {
        playerStore.addGems(challengeGemReward);
      }
    }

    const runGemsTotal =
      (response.data?.gems_earned ?? 0) + challengeGemReward + comboResult.bonusGems;
    playerStore.recordGame(currentWave, enemiesKilled, towersPlaced, runGemsTotal);
    playerStore.clearCurrentGameProgress();
  }, [playerStore, gameStartTime, currentWave, enemiesKilled, towersPlaced, dailyChallenge, coins]);

  useEffect(() => {
    if (!isGameOver) {
      gameEndHandledRef.current = false;
      return;
    }
    void handleGameEnd();
  }, [isGameOver, handleGameEnd]);

  useEffect(() => {
    const completed = dailyMissions.filter((m) => m.completed).length;
    if (completed > lastMissionCompletedCountRef.current) {
      if (isPlaying && !isGameOver && canPlayUiSfx()) {
        playSfx('mission');
      }
    }
    lastMissionCompletedCountRef.current = completed;
  }, [dailyMissions, isPlaying, isGameOver]);

  useEffect(() => {
    if (!playerStore.autoStartWaves) {
      if (autoWaveTimer > 0) {
        useGameStore.setState({ autoWaveTimer: 0 });
      }
      return;
    }
    if (!isPlaying || isPaused || isGameOver || waveInProgress) return;
    if (currentWave === 0 && towersCount > 0) {
      startWave();
    }
  }, [
    playerStore.autoStartWaves,
    isPlaying,
    isPaused,
    isGameOver,
    waveInProgress,
    currentWave,
    towersCount,
    autoWaveTimer,
    startWave,
  ]);

  const handleRestart = useCallback(() => {
    playerStore.clearSavedGame(); // Clear saved game on restart
    restartGame();
  }, [restartGame, playerStore]);

  const handleSeeResults = useCallback(() => {
    setGameOverStep('results');
  }, []);

  const handleExit = useCallback(() => {
    playerStore.clearSavedGame(); // Clear saved game on exit after game over
    router.replace('/');
  }, [router, playerStore]);

  const formatTimer = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  const rewardSummary = useMemo(() => {
    const waveXp = Math.max(1, Math.floor(currentWave * 0.65));
    const killXp = Math.floor(enemiesKilled * 0.06);
    const roundXp = currentWave >= 1 ? 1 : 0;
    const baseXpReward = waveXp + killXp + roundXp;
    const P_scaled = scaledTotalPerformanceGems(currentWave, enemiesKilled);
    const challengeXpReward = Math.floor(baseXpReward * Math.max(0, dailyChallenge.xpMultiplier - 1));
    const challengeGemReward = Math.floor(P_scaled * Math.max(0, dailyChallenge.gemMultiplier - 1));
    const nowKey = getUtcDayKey(Date.now());
    const lastComboKey = playerStore.lastDailyChallengeRunAt
      ? getUtcDayKey(playerStore.lastDailyChallengeRunAt)
      : null;
    const nextCombo = lastComboKey === nowKey ? playerStore.dailyChallengeRunCombo + 1 : 1;
    const comboBonus = nextCombo % 3 === 0 ? COMBO_BONUS_GEMS : 0;
    return {
      challengeName: dailyChallenge.name,
      xpEarned: baseXpReward + challengeXpReward,
      gemsEarned: P_scaled + challengeGemReward + comboBonus,
      comboBonus,
      comboCount: nextCombo,
    };
  }, [currentWave, enemiesKilled, dailyChallenge, playerStore.lastDailyChallengeRunAt, playerStore.dailyChallengeRunCombo]);

  const coinIncomeUpgradeLevel = usePlayerStore((s) => s.coinIncomeUpgradeLevel);
  const battleCoinIncomeMult = useMemo(
    () => getRunCoinIncomeMultiplier(coinIncomeUpgradeLevel),
    [coinIncomeUpgradeLevel]
  );

  const missionNudge = useMemo(() => {
    const unfinished = dailyMissions
      .filter((m) => !m.completed)
      .map((m) => ({ ...m, remaining: Math.max(0, m.target - m.progress) }))
      .sort((a, b) => a.remaining - b.remaining);
    if (unfinished.length === 0) return null as null | { text: string; oneMoreRun: boolean };
    const m = unfinished[0];
    if (m.remaining > Math.max(5, Math.floor(m.target * 0.4))) return null;
    return {
      text: `${m.remaining} left: ${m.label} (+${m.rewardGems} gems)`,
      oneMoreRun: m.remaining <= 2,
    };
  }, [dailyMissions]);

  return (
    <GameRuntimeErrorBoundary
      onRecover={() => {
        void stopAllSounds();
        router.replace('/');
      }}
    >
      <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExitAttempt} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.statsRow}>
          <View style={styles.playerHudBadge}>
            <PlayerLogoBadge logoId={playerStore.selectedLogoId} size={20} />
            <Text style={styles.playerHudName} numberOfLines={1}>
              {playerStore.nickname}
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="heart" size={16} color="#E74C3C" />
            <Text style={styles.statValue}>{baseHealth}</Text>
          </View>
          <View style={styles.stat}>
            <FontAwesome5 name="coins" size={14} color="#FFD700" />
            <Text style={styles.statValue}>{coins}</Text>
          </View>
          {!isGameOver && (
            <View style={styles.stat}>
              <MaterialCommunityIcons name="diamond-stone" size={15} color={TacticalTheme.gem} />
              <Text style={[styles.statValue, styles.gemStatValue]}>{gemsHudDisplay}</Text>
            </View>
          )}
          <View style={styles.stat}>
            <MaterialCommunityIcons name="waves" size={16} color={TacticalTheme.accent} />
            <Text style={styles.statValue}>{currentWave}</Text>
          </View>
        </View>

        <TouchableOpacity 
          onPress={isPaused ? resumeGame : pauseGame} 
          style={styles.headerButton}
        >
          <Ionicons name={isPaused ? 'play' : 'pause'} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.coinMultHint}>
        <FontAwesome5 name="coins" size={11} color="#b8a045" />
        <Text style={styles.coinMultHintText}>
          Income ×{battleCoinIncomeMult.toFixed(2)}
        </Text>
      </View>

      {!isGameOver && isPlaying && (
        <View style={styles.carnageBar}>
          <View style={styles.carnageBarLeft}>
            <Text style={styles.enemiesRemainingLabel}>Enemies remaining</Text>
            <View style={styles.enemiesRemainingRow}>
              <MaterialCommunityIcons name="target" size={20} color="#FF6B4A" />
              <Text style={styles.enemiesRemainingValue}>
                {waveEnemiesRemaining === null ? '—' : waveEnemiesRemaining}
              </Text>
            </View>
            <Text style={styles.enemiesRemainingHint}>
              {waveInProgress && currentWave > 0
                ? `Wave ${currentWave} · on map + still arriving`
                : 'Start a wave to see the count'}
            </Text>
          </View>
          <View style={styles.carnageBarRight}>
            <MaterialCommunityIcons name="star-four-points" size={14} color="#f1c40f" />
            <Text style={styles.carnageBarStars}>
              {sessionSlaughterTriumphs}/{SESSION_BOUNTY_TRIUMPHS_NEEDED}
            </Text>
            <Text style={styles.carnageBarStarsHint}>bounty stars</Text>
          </View>
        </View>
      )}

      {/* Speed Controls */}
      <SpeedControls
        currentSpeed={gameSpeed}
        onSpeedChange={applyGameSpeed}
        unlockedSpeeds={unlockedSpeeds}
        onPurchaseSpeed={handlePurchaseSpeed}
        gems={playerStore.gems}
        autoStartWaves={playerStore.autoStartWaves}
        onToggleAutoStart={handleToggleAutoStart}
      />

      {/* Bonus popup notification */}
      {showBonusPopup && lastWaveBonus > 0 && waveInProgress === false && (
        <View style={styles.bonusPopup}>
          <FontAwesome5 name="coins" size={16} color="#FFD700" />
          <Text style={styles.bonusPopupText}>+{lastWaveBonus} Wave Bonus!</Text>
        </View>
      )}

      {eliteWaveNotice && (
        <View style={styles.eliteNotice}>
          <Text style={styles.eliteNoticeText}>{eliteWaveNotice}</Text>
        </View>
      )}

      {/* Game board — pinch with two fingers to zoom */}
      <View style={styles.boardContainer}>
        <GameBoard
          onCellPress={handleCellPress}
          scale={scale}
          zoomLevel={zoomLevel}
          performanceMode={playerStore.performanceMode}
          vfxQuality={vfxQuality}
          previewCell={placementPreviewCell}
        />
        {/* Overlay so inter-wave UI does not shrink the board viewport (avoids scroll re-center / map jump). */}
        {!waveInProgress && !isGameOver && isPlaying && (
          <View style={styles.waveInfoBarOverlay} pointerEvents="box-none">
            <View style={styles.waveInfoBar} pointerEvents="auto">
              <View>
                <Text style={styles.waveInfoText}>
                  {currentWave === 0 ? 'Place towers to start!' : `Wave ${currentWave} complete!`}
                </Text>
                <Text style={styles.mapInfoText}>Arena: {arenaLabel}</Text>
                <Text style={styles.challengeInfoText}>
                  Daily Challenge: {dailyChallenge.name}
                </Text>
                {showBonusPopup && lastWaveBonus > 0 && (
                  <Text style={styles.bonusText}>+{lastWaveBonus} bonus coins!</Text>
                )}
                {missionNudge && (
                  <Text style={styles.missionNudgeText}>{missionNudge.text}</Text>
                )}
              </View>
              <View style={styles.waveInfoActions}>
                <AutoStartToggle
                  enabled={playerStore.autoStartWaves}
                  onToggle={handleToggleAutoStart}
                />
                <TouchableOpacity style={styles.startWaveButton} onPress={handleStartWave}>
                  <Text style={styles.startWaveText}>
                    Start Wave {currentWave + 1}{' '}
                    {playerStore.autoStartWaves && autoWaveTimer > 0 && currentWave > 0
                      ? `(${formatTimer(autoWaveTimer)})`
                      : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>

      {pendingPlacement && selectedTowerType && !selectedPlacedTower && (
        <PlacementConfirmBar
          towerType={selectedTowerType}
          cost={pendingPlacementCost}
          canAfford={coins >= pendingPlacementCost}
          onConfirm={handleConfirmPlacement}
          onCancel={handleCancelPlacement}
        />
      )}

      {/* Tower options panel */}
      {selectedPlacedTower && (
        <TowerOptionsPanel
          tower={selectedPlacedTower}
          onUpgrade={handleUpgrade}
          onSell={handleSell}
          onTargetingChange={handleTargetingChange}
          onClose={() => selectPlacedTower(null)}
          coins={coins}
          getUpgradeCost={getUpgradeCost}
          getSellValue={getSellValue}
          shopUpgradeLevel={towerUpgradeLevels[selectedPlacedTower.type] || 0}
        />
      )}

      {/* Tower selection panel */}
      {!selectedPlacedTower && (
        <TowerPanel
          onSelect={handleTowerSelect}
          selectedType={selectedTowerType}
          coins={coins}
          unlockedTowers={unlockedTowers}
          getTowerCost={getTowerCost}
        />
      )}

      {/* Instructions */}
      {selectedTowerType && !selectedPlacedTower && !pendingPlacement && (
        <View style={styles.instructionBar}>
          <Text style={styles.instructionText}>
            Tap a cell on the map to preview · Confirm with the check button · Pinch to zoom ·{' '}
            {TOWERS[selectedTowerType].name}
          </Text>
        </View>
      )}

      <GameOverFlowModal
        visible={isGameOver}
        step={gameOverStep}
        wave={currentWave}
        score={score}
        enemiesKilled={enemiesKilled}
        towersPlaced={towersPlaced}
        bestWaveRecord={Math.max(playerStore.bestWave, currentWave)}
        slaughterQualified={enemiesKilled >= SESSION_SLAUGHTER_WIN_KILLS}
        slaughterThreshold={SESSION_SLAUGHTER_WIN_KILLS}
        triumphCount={sessionSlaughterTriumphs}
        triumphsNeeded={SESSION_BOUNTY_TRIUMPHS_NEEDED}
        rewardSummary={rewardSummary}
        onSeeResults={handleSeeResults}
        onHome={handleExit}
        onPlayAgain={handleRestart}
      />

      {/* Exit warning modal */}
      <ExitWarningModal
        visible={showExitWarning}
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
        onGoToShop={handleGoToShop}
        currentWave={currentWave}
        coins={coins}
      />

      {/* Resume game modal */}
      <ResumeGameModal
        visible={showResumePrompt}
        savedGame={playerStore.getSavedGame()}
        onResume={handleResumeGame}
        onNewGame={handleStartNewGame}
      />

      {/* Pause overlay */}
      {isPaused && !isGameOver && !showExitWarning && !showResumePrompt && (
        <View style={styles.pauseOverlay}>
          <Text style={styles.pauseText}>PAUSED</Text>
          <Text style={styles.pauseSubtext}>
            Wave {currentWave}
            {waveInProgress && waveEnemiesRemaining !== null
              ? ` · ${waveEnemiesRemaining} enemies left`
              : ''}
            {' · '}
            {enemiesKilled} destroyed this run · {coins} coins
          </Text>
          
          <TouchableOpacity style={styles.pauseResumeButton} onPress={resumeGame}>
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.pauseButtonText}>Resume Game</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.pauseShopButton} onPress={handleGoToShop}>
            <FontAwesome5 name="store" size={16} color="#fff" />
            <Text style={styles.pauseButtonText}>Go to Shop</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.pauseMainMenuButton} onPress={handleExitAttempt}>
            <Ionicons name="home" size={18} color="#fff" />
            <Text style={styles.pauseButtonText}>Main Menu</Text>
          </TouchableOpacity>
        </View>
      )}
      </SafeAreaView>
    </GameRuntimeErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TacticalTheme.bg,
  },
  runtimeErrorWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  runtimeErrorTitle: {
    color: TacticalTheme.accent,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  runtimeErrorBody: {
    color: TacticalTheme.text,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  runtimeErrorButton: {
    backgroundColor: TacticalTheme.accent,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  runtimeErrorButtonText: {
    color: TacticalTheme.white,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: TacticalTheme.panel,
  },
  headerButton: {
    padding: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  playerHudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 140,
  },
  playerHudName: {
    color: TacticalTheme.text,
    fontSize: 12,
    fontWeight: '700',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: TacticalTheme.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  gemStatValue: {
    color: TacticalTheme.textMuted,
  },
  coinMultHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    backgroundColor: TacticalTheme.panelAlt,
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  coinMultHintText: {
    color: TacticalTheme.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  carnageBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: TacticalTheme.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  carnageBarLeft: {
    flex: 1,
    marginRight: 12,
  },
  enemiesRemainingLabel: {
    color: TacticalTheme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  enemiesRemainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  enemiesRemainingValue: {
    color: TacticalTheme.accent,
    fontSize: 28,
    fontWeight: '800',
  },
  enemiesRemainingHint: {
    color: TacticalTheme.textSubtle,
    fontSize: 11,
    marginTop: 4,
  },
  carnageBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  carnageBarStars: {
    color: TacticalTheme.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  carnageBarStarsHint: {
    color: TacticalTheme.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  speedControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    backgroundColor: TacticalTheme.panel,
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  speedButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: TacticalTheme.panelAlt,
    minWidth: 48,
    alignItems: 'center',
  },
  speedButtonActive: {
    backgroundColor: TacticalTheme.accent,
  },
  speedButtonLocked: {
    backgroundColor: TacticalTheme.bg,
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
  },
  speedButtonText: {
    color: TacticalTheme.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  speedButtonTextActive: {
    color: TacticalTheme.text,
  },
  speedButtonTextLocked: {
    color: TacticalTheme.textSubtle,
  },
  lockIcon: {
    fontSize: 10,
  },
  waveInfoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 8,
    marginBottom: 6,
    backgroundColor: TacticalTheme.panel,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    borderRadius: 8,
  },
  waveInfoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mapInfoText: {
    color: TacticalTheme.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  challengeInfoText: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  missionNudgeText: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  startWaveButton: {
    backgroundColor: '#2ECC71',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  startWaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  waveInfoActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  autoStartToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
    backgroundColor: TacticalTheme.surfaceDeep,
  },
  autoStartToggleActive: {
    borderColor: TacticalTheme.accent,
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
  },
  autoStartToggleText: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  autoStartToggleTextActive: {
    color: '#fff',
  },
  bonusText: {
    color: '#2ECC71',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  bonusPopup: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2ECC71',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    zIndex: 100,
    shadowColor: '#2ECC71',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  bonusPopupText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  eliteNotice: {
    position: 'absolute',
    top: 155,
    alignSelf: 'center',
    backgroundColor: 'rgba(155, 89, 182, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    zIndex: 120,
  },
  eliteNoticeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  zoomControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
    backgroundColor: TacticalTheme.surfaceDeep,
  },
  zoomButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TacticalTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomText: {
    color: '#fff',
    fontSize: 12,
    width: 40,
    textAlign: 'center',
  },
  boardContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  boardScrollContainer: {
    flex: 1,
  },
  boardScrollContent: {
    flexGrow: 1,
  },
  /** No flex centering — centering recenters when ScrollView viewport height changes (wave UI, etc.). */
  boardInnerScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  waveInfoBarOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
  },
  gameBoard: {
    backgroundColor: '#0f0f23',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  towerHit: {
    position: 'absolute',
    zIndex: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cell: {
    position: 'absolute',
    backgroundColor: '#1a1a2e',
    borderWidth: 0.5,
    borderColor: '#2a2a4e',
  },
  pathCell: {
    backgroundColor: TacticalTheme.surfaceElevated,
  },
  canPlaceOnPath: {
    backgroundColor: TacticalTheme.accentRgba22,
    borderWidth: 2,
    borderColor: TacticalTheme.selectionGlow,
  },
  canPlaceCell: {
    backgroundColor: TacticalTheme.accentRgba28,
    borderColor: TacticalTheme.selectionGlowStrong,
    borderWidth: 2,
  },
  canPlaceCellPreview: {
    borderWidth: 3,
    borderColor: '#7CFFB2',
    shadowColor: '#7CFFB2',
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  spawnCell: {
    backgroundColor: 'rgba(231, 76, 60, 0.3)',
  },
  baseCell: {
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
  },
  rangeIndicator: {
    position: 'absolute',
    zIndex: 8,
    backgroundColor: TacticalTheme.accentRgba15,
    borderWidth: 2,
    borderColor: TacticalTheme.accentRgba40,
  },
  laserBeam: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#FF00FF',
    zIndex: 12,
    shadowColor: '#FF00FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  tower: {
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFD700',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  enemy: {
    position: 'absolute',
    borderRadius: 50,
    zIndex: 14,
  },
  healthBarContainer: {
    position: 'absolute',
    top: -8,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
  },
  healthBar: {
    height: '100%',
    backgroundColor: '#2ECC71',
    borderRadius: 2,
  },
  projectile: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 16,
  },
  base: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 4,
    zIndex: 1,
  },
  spawnPoint: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    borderRadius: 4,
    zIndex: 1,
  },
  towerPanel: {
    maxHeight: 90,
    backgroundColor: TacticalTheme.surfaceDeep,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  towerPanelContent: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  towerButton: {
    width: 65,
    alignItems: 'center',
    padding: 6,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    marginRight: 6,
  },
  towerButtonSelected: {
    borderWidth: 2,
    borderColor: TacticalTheme.accent,
  },
  towerButtonLocked: {
    opacity: 0.5,
  },
  towerButtonCantAfford: {
    opacity: 0.7,
  },
  towerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  towerName: {
    color: '#fff',
    fontSize: 9,
    textAlign: 'center',
  },
  towerCost: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: 'bold',
  },
  towerCostRed: {
    color: '#E74C3C',
  },
  placementConfirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TacticalTheme.surfaceDeep,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
    gap: 12,
  },
  placementCancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placementConfirmInfo: {
    flex: 1,
  },
  placementConfirmTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  placementConfirmCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  placementConfirmCost: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '700',
  },
  placementConfirmCostRed: {
    color: '#E74C3C',
  },
  placementConfirmButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2ECC71',
    justifyContent: 'center',
    alignItems: 'center',
  },
  towerOptionsPanel: {
    backgroundColor: TacticalTheme.surfaceDeep,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  towerOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  towerOptionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  towerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  towerOptionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  shopUpgradeBadge: {
    color: '#00FF88',
    fontSize: 12,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  towerStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  towerStatText: {
    color: '#888',
    fontSize: 12,
  },
  targetingLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  targetingRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  targetingButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a4e',
    alignItems: 'center',
  },
  targetingButtonActive: {
    backgroundColor: TacticalTheme.accent,
  },
  targetingButtonText: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  targetingButtonTextActive: {
    color: '#fff',
  },
  towerActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  upgradeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TacticalTheme.accent,
    paddingVertical: 10,
    borderRadius: 6,
    gap: 6,
  },
  sellButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E74C3C',
    paddingVertical: 10,
    borderRadius: 6,
    gap: 6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  instructionBar: {
    backgroundColor: TacticalTheme.accent,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  instructionText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameOverModal: {
    backgroundColor: TacticalTheme.panel,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 350,
    borderWidth: 1,
    borderColor: TacticalTheme.border,
  },
  gameOverTitle: {
    color: TacticalTheme.accent,
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  gameOverWave: {
    color: TacticalTheme.text,
    fontSize: 24,
    marginBottom: 8,
  },
  gameOverScore: {
    color: '#FFD700',
    fontSize: 20,
    marginBottom: 24,
  },
  gameOverKillsBlock: {
    alignItems: 'center',
    marginBottom: 12,
  },
  gameOverKillsNumber: {
    color: TacticalTheme.accent,
    fontSize: 56,
    fontWeight: '800',
    lineHeight: 60,
    textShadowColor: 'rgba(255, 80, 50, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  gameOverKillsCaption: {
    color: TacticalTheme.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  gameOverSlaughterHint: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  slaughterEarnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TacticalTheme.accentSoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  slaughterEarnedText: {
    color: TacticalTheme.text,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  gameOverTriumphLine: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    marginBottom: 10,
  },
  resultsHeroCard: {
    width: '100%',
    backgroundColor: TacticalTheme.surfaceDeepAlt,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
    alignItems: 'center',
  },
  resultsHeroLabel: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  resultsHeroValue: {
    color: '#FF6B4A',
    fontSize: 44,
    fontWeight: '800',
  },
  resultsHeroSub: {
    color: '#b8c5dd',
    fontSize: 13,
    marginTop: 2,
  },
  resultsHeroRibbon: {
    marginTop: 10,
    backgroundColor: 'rgba(241, 196, 15, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(241, 196, 15, 0.5)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  resultsHeroRibbonText: {
    color: '#f1c40f',
    fontSize: 12,
    fontWeight: '700',
  },
  resultsStatWide: {
    width: '100%',
  },
  resultsPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TacticalTheme.accent,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
  },
  resultsPrimaryText: {
    color: TacticalTheme.white,
    fontSize: 17,
    fontWeight: 'bold',
  },
  resultsScreenTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
    alignSelf: 'flex-start',
    width: '100%',
  },
  resultsChallenge: {
    color: TacticalTheme.textMuted,
    fontSize: 13,
    marginBottom: 14,
    alignSelf: 'flex-start',
    width: '100%',
  },
  resultsStatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginBottom: 14,
  },
  resultsStat: {
    width: '47%',
    backgroundColor: TacticalTheme.surfaceElevated,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
  },
  resultsStatLabel: {
    color: TacticalTheme.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  resultsStatValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  homePrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#2ECC71',
    paddingVertical: 15,
    borderRadius: 12,
    width: '100%',
    marginBottom: 10,
  },
  homePrimaryText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playAgainSecondary: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  playAgainSecondaryText: {
    color: TacticalTheme.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  rewardSummaryBox: {
    width: '100%',
    backgroundColor: TacticalTheme.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
    padding: 10,
    marginBottom: 14,
  },
  rewardSummaryTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  rewardSummaryText: {
    color: TacticalTheme.text,
    fontSize: 12,
  },
  restartButton: {
    backgroundColor: TacticalTheme.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 8,
    width: '100%',
    alignItems: 'center',
  },
  restartText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsButton: {
    backgroundColor: TacticalTheme.panelAlt,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  resultsText: {
    color: TacticalTheme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  exitButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  exitText: {
    color: '#aaa',
    fontSize: 14,
  },
  exitWarningModal: {
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '85%',
    maxWidth: 320,
  },
  exitWarningTitle: {
    color: TacticalTheme.accent,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 4,
  },
  exitWarningSubtitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  exitWarningText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  shopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9B59B6',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  shopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  exitWarningButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelExitButton: {
    flex: 1,
    backgroundColor: TacticalTheme.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelExitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmExitButton: {
    flex: 1,
    backgroundColor: '#2a2a4e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmExitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Resume modal styles
  resumeModal: {
    backgroundColor: TacticalTheme.surfaceDeep,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '85%',
    maxWidth: 320,
  },
  resumeTitle: {
    color: '#2ECC71',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  resumeDetails: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 4,
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2ECC71',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
    width: '100%',
    marginTop: 16,
    marginBottom: 8,
  },
  resumeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  newGameButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  newGameText: {
    color: '#888',
    fontSize: 14,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  pauseText: {
    color: '#fff',
    fontSize: 42,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  pauseSubtext: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  pauseResumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2ECC71',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    gap: 10,
    width: '100%',
    marginBottom: 12,
  },
  pauseShopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9B59B6',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    gap: 10,
    width: '100%',
    marginBottom: 12,
  },
  pauseMainMenuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E74C3C',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    gap: 10,
    width: '100%',
  },
  pauseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
