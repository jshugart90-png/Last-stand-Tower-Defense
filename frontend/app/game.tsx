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
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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
  GameSpeed, SPEED_UNLOCK_PRICES, getRunCoinIncomeMultiplier,
  scaledTotalPerformanceGems,
  endGamePerformanceRemainder,
  COMBO_BONUS_GEMS,
  type EnemyType,
} from '../src/constants/game';
import { gameApi, analyticsApi, rewardApi, isServerBackedPlayerId } from '../src/hooks/useApi';
import { findPath } from '../src/utils/pathfinding';
import { 
  isNativeAdsAvailable, isAdsInitialized,
  showInterstitialAd, isInterstitialAdReady
} from '../src/services/adService';
import { getDailyChallenge } from '../src/constants/challenges';
import { playSfx } from '../src/services/audioService';
import { getArenaMap, CLASSIC_MAP_ID } from '../src/constants/arenaMaps';
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
  { children: ReactNode; style?: object },
  { err: Error | null }
> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn('[GameBoard gestures]', err?.message, info?.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }, this.props.style]}>
          <Text style={{ color: TacticalTheme.accent, textAlign: 'center' }}>
            Map gestures paused. Leave and re-enter the game to continue.
          </Text>
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

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[Game runtime error]', err?.message, info?.componentStack);
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
const MAX_SUBSTEPS_PER_FRAME = 6;

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

// Tower selection panel
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
  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      style={styles.towerPanel}
      contentContainerStyle={styles.towerPanelContent}
    >
      {(Object.keys(TOWERS) as TowerType[]).map((type) => {
        const tower = TOWERS[type];
        const isUnlocked = unlockedTowers.includes(type);
        const cost = getTowerCost(type);
        const canAfford = coins >= cost;
        const isSelected = selectedType === type;

        return (
          <TouchableOpacity
            key={type}
            style={[
              styles.towerButton,
              isSelected && styles.towerButtonSelected,
              !isUnlocked && styles.towerButtonLocked,
              !canAfford && isUnlocked && styles.towerButtonCantAfford,
            ]}
            onPress={() => {
              if (isUnlocked) {
                onSelect(isSelected ? null : type);
              }
            }}
            disabled={!isUnlocked}
          >
            <View style={[styles.towerIcon, { backgroundColor: tower.color }]}>
              {getTowerIcon(type)}
            </View>
            <Text style={styles.towerName} numberOfLines={1}>{tower.name}</Text>
            <Text style={[styles.towerCost, !canAfford && styles.towerCostRed]}>
              {isUnlocked ? `${cost}` : 'Locked'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

// Speed control buttons — unlocks cost gems only (see shop / player store)
const SpeedControls = ({
  currentSpeed,
  onSpeedChange,
  unlockedSpeeds,
  onPurchaseSpeed,
  gems,
}: {
  currentSpeed: GameSpeed;
  onSpeedChange: (speed: GameSpeed) => void;
  unlockedSpeeds: GameSpeed[];
  onPurchaseSpeed: (speed: GameSpeed) => void;
  gems: number;
}) => {
  const speeds: GameSpeed[] = [1, 2, 3, 5, 10];

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
        isSpawn && styles.spawnCell,
        isBase && styles.baseCell,
      ],
      [scaledCellSize, col, row, onPath, canPlace, isSpawn, isBase, mapTheme]
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
          backgroundColor: isSlowed ? '#00D4FF' : enemyDef.color,
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

// Game board: pinch zoom runs on UI thread; store zoom commits once per pinch (no React churn while zooming)
const GameBoard = React.memo(({ 
  onCellPress, 
  scale,
  zoomLevel,
  performanceMode,
  vfxQuality,
}: { 
  onCellPress: (x: number, y: number) => void; 
  scale: number;
  zoomLevel: number;
  performanceMode: boolean;
  vfxQuality: 0 | 1 | 2;
}) => {
  const {
    towers,
    enemies,
    projectiles,
    laserBeams,
    gridCols,
    gridRows,
    cellSize,
    getTowerColor,
    selectedTowerType,
    canPlaceTower,
    spawnPoint,
    basePosition,
    selectedPlacedTower,
    towerUpgradeLevels,
    arenaRoute,
    mapTheme,
  } = useGameStore(
    useShallow((s) => ({
      towers: s.towers,
      enemies: s.enemies,
      projectiles: s.projectiles,
      laserBeams: s.laserBeams,
      gridCols: s.gridCols,
      gridRows: s.gridRows,
      cellSize: s.cellSize,
      getTowerColor: s.getTowerColor,
      selectedTowerType: s.selectedTowerType,
      canPlaceTower: s.canPlaceTower,
      spawnPoint: s.spawnPoint,
      basePosition: s.basePosition,
      selectedPlacedTower: s.selectedPlacedTower,
      towerUpgradeLevels: s.towerUpgradeLevels,
      arenaRoute: s.arenaRoute,
      mapTheme: s.mapTheme,
    }))
  );

  const pinchMultSV = useSharedValue(1);
  const startZoomSV = useSharedValue(zoomLevel);
  const committedZoomSV = useSharedValue(zoomLevel);
  const [isPinching, setIsPinching] = useState(false);

  useEffect(() => {
    committedZoomSV.value = zoomLevel;
  }, [zoomLevel, committedZoomSV]);

  const commitZoom = useCallback((z: number) => {
    useGameStore.getState().setZoomLevel(clampZoom(z));
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          'worklet';
          startZoomSV.value = committedZoomSV.value;
          pinchMultSV.value = 1;
          runOnJS(setIsPinching)(true);
        })
        .onUpdate((e) => {
          'worklet';
          const raw = e.scale;
          const factor =
            typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1;
          const abs = Math.max(0.8, Math.min(2.5, startZoomSV.value * factor));
          pinchMultSV.value = abs / startZoomSV.value;
        })
        .onEnd((e) => {
          'worklet';
          const raw = e.scale;
          const factor =
            typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1;
          const abs = Math.max(0.8, Math.min(2.5, startZoomSV.value * factor));
          pinchMultSV.value = 1;
          runOnJS(commitZoom)(abs);
          runOnJS(setIsPinching)(false);
        })
        .onFinalize(() => {
          'worklet';
          pinchMultSV.value = 1;
          runOnJS(setIsPinching)(false);
        }),
    [commitZoom, committedZoomSV, pinchMultSV, startZoomSV]
  );

  const pinchAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pinchMultSV.value }],
  }));

  const finalScale = scale * zoomLevel;
  const scaledCellSize = cellSize * finalScale;
  const boardWidth = gridCols * scaledCellSize;
  const boardHeight = gridRows * scaledCellSize;

  const placePanGesture = useMemo(() => {
    const canPlaceDrag = !!selectedTowerType && !selectedPlacedTower && !isPinching;
    return Gesture.Pan()
      .enabled(canPlaceDrag)
      .minDistance(6)
      .onEnd((e) => {
        const col = Math.floor(e.x / scaledCellSize);
        const row = Math.floor(e.y / scaledCellSize);
        if (col < 0 || col >= gridCols || row < 0 || row >= gridRows) return;
        const { placeTower, canPlaceTower: canPlace, selectedTowerType: type } =
          useGameStore.getState();
        if (!type || !canPlace({ x: col, y: row })) return;
        placeTower({ x: col, y: row });
      });
  }, [
    selectedTowerType,
    selectedPlacedTower,
    scaledCellSize,
    gridCols,
    gridRows,
    isPinching,
  ]);

  const boardGestures = useMemo(
    () => Gesture.Simultaneous(pinchGesture, placePanGesture),
    [pinchGesture, placePanGesture]
  );

  const blockedCells = useMemo(
    () => new Set(towers.map(t => `${t.position.x},${t.position.y}`)),
    [towers]
  );
  const pathSet = useMemo(() => {
    if (arenaRoute.length >= 2) {
      return new Set(arenaRoute.map((p) => `${p.x},${p.y}`));
    }
    const currentPath = findPath(spawnPoint, basePosition, gridCols, gridRows, blockedCells);
    return new Set((currentPath || []).map((p) => `${p.x},${p.y}`));
  }, [arenaRoute, spawnPoint, basePosition, gridCols, gridRows, blockedCells]);
  const gridCells = useMemo(
    () => Array.from({ length: gridRows * gridCols }, (_, index) => ({
      row: Math.floor(index / gridCols),
      col: index % gridCols,
    })),
    [gridRows, gridCols]
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
    <ScrollView
      style={styles.boardScrollContainer}
      contentContainerStyle={styles.boardScrollContent}
      horizontal
      removeClippedSubviews
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <ScrollView
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <GestureAreaErrorBoundary>
          <GestureDetector gesture={boardGestures}>
            <Animated.View
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
              {gridCells.map(({ row, col }) => {
                const isPath = pathSet.has(`${col},${row}`);
                const isSpawn = col === spawnPoint.x && row === spawnPoint.y;
                const isBase = col === basePosition.x && row === basePosition.y;
                const canPlace = selectedTowerType ? canPlaceTower({ x: col, y: row }) : false;
                const hasTowerHere = blockedCells.has(`${col},${row}`);
                const onPathCorridor = isPath && !isSpawn && !isBase;

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
                    onCellPress={onCellPress}
                  />
                );
              })}

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
                const bg = proj.isFreeze ? '#00D4FF' : proj.isSplash ? '#FF6B35' : '#FFD700';
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
  sessionCarnageTotal,
  slaughterQualified,
  slaughterThreshold,
  triumphCount,
  triumphsNeeded,
  rewardSummary,
  canRevive,
  reviveUsed,
  onRevive,
  isReviving,
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
  sessionCarnageTotal: number;
  slaughterQualified: boolean;
  slaughterThreshold: number;
  triumphCount: number;
  triumphsNeeded: number;
  rewardSummary: {
    challengeName: string;
    xpEarned: number;
    gemsEarned: number;
  };
  canRevive: boolean;
  reviveUsed: boolean;
  onRevive: () => void;
  isReviving: boolean;
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
                  Slaughter earned — {slaughterThreshold}+ kills
                </Text>
              </View>
            ) : (
              <Text style={styles.gameOverSlaughterHint}>
                Reach {slaughterThreshold}+ kills in one run to earn a slaughter star toward your bounty.
              </Text>
            )}
            <Text style={styles.gameOverSessionLine}>
              Session carnage:{' '}
              <Text style={styles.gameOverSessionEm}>{sessionCarnageTotal}</Text> total kills
            </Text>
            <Text style={styles.gameOverTriumphLine}>
              Slaughter stars this session: {triumphCount}/{triumphsNeeded}
            </Text>
            <Text style={styles.gameOverWave}>Wave {wave} • Score {score}</Text>
            {canRevive && (
              <View style={styles.revivePromptWrap}>
                <Text style={styles.revivePromptTitle}>Base destroyed - emergency revive available</Text>
                <Text style={styles.revivePromptBody}>
                  Watch one rewarded ad to restore partial base health and continue this wave.
                </Text>
                <TouchableOpacity
                  style={[styles.watchAdButton, isReviving && styles.watchAdButtonDisabled]}
                  onPress={onRevive}
                  disabled={isReviving}
                >
                  <Ionicons name="play-circle" size={20} color={TacticalTheme.white} />
                  <Text style={styles.watchAdText}>
                    {isReviving ? 'Reviving...' : 'Watch Ad to Revive'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.revivePromptLimit}>One revive per run</Text>
              </View>
            )}
            {!canRevive && reviveUsed && (
              <Text style={styles.reviveUsedText}>Revive already used this run</Text>
            )}
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
                    Slaughter milestone ({slaughterThreshold}+ kills)
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.resultsStatGrid}>
              <View style={[styles.resultsStat, styles.resultsStatWide]}>
                <Text style={styles.resultsStatLabel}>Session carnage (total kills)</Text>
                <Text style={styles.resultsStatValue}>{sessionCarnageTotal}</Text>
              </View>
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
          <Ionicons name="pause-circle" size={48} color="#4A90D9" />
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
  const [isReviving, setIsReviving] = useState(false);
  
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
    endWave,
    canPlaceTower,
    getTowerAt,
    getTowerCost,
    getUpgradeCost,
    getSellValue,
    setGameSpeed,
    consumeRevive,
    grantRevive,
    canUseAdRevive,
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
      endWave: s.endWave,
      canPlaceTower: s.canPlaceTower,
      getTowerAt: s.getTowerAt,
      getTowerCost: s.getTowerCost,
      getUpgradeCost: s.getUpgradeCost,
      getSellValue: s.getSellValue,
      setGameSpeed: s.setGameSpeed,
      consumeRevive: s.useRevive,
      grantRevive: s.grantRevive,
      canUseAdRevive: s.canUseAdRevive,
      getCurrentCoins: s.getCurrentCoins,
      lastWaveBonus: s.lastWaveBonus,
      showBonusPopup: s.showBonusPopup,
      runGemsFromWavePart: s.runGemsFromWavePart,
    }))
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

  const sessionEnemiesKilledTotal = usePlayerStore((s) => s.sessionEnemiesKilledTotal);
  const sessionSlaughterTriumphs = usePlayerStore((s) => s.sessionSlaughterTriumphs);

  const sessionCarnageDisplay =
    sessionEnemiesKilledTotal + (isGameOver ? 0 : enemiesKilled);

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

  const reviveAvailable = isGameOver && canUseAdRevive();

  const [showResumePrompt, setShowResumePrompt] = useState(false);

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
      const applyAdminWaveOverride = () => {
        if (!playerStore.adminModeEnabled) return;
        const startWave = Math.max(1, Math.min(200, Math.floor(playerStore.adminStartWave || 1)));
        if (startWave <= 1) return;
        useGameStore.setState({ currentWave: startWave - 1 });
      };
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
      applyAdminWaveOverride();
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
    const applyAdminWaveOverride = () => {
      if (!playerStore.adminModeEnabled) return;
      const startWave = Math.max(1, Math.min(200, Math.floor(playerStore.adminStartWave || 1)));
      if (startWave <= 1) return;
      useGameStore.setState({ currentWave: startWave - 1 });
    };
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
    applyAdminWaveOverride();
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
      const now = Date.now();
      const rawDelta = now - lastUpdateRef.current;
      lastUpdateRef.current = now;
      frameAccumRef.current += Math.min(rawDelta, MAX_FRAME_DELTA_MS);

      let substeps = 0;
      while (frameAccumRef.current >= LOOP_STEP_MS && substeps < MAX_SUBSTEPS_PER_FRAME) {
        frameAccumRef.current -= LOOP_STEP_MS;
        substeps += 1;
        const state = useGameStore.getState();
        if (!state.isPlaying || state.isPaused) break;
        state.gameTick(LOOP_STEP_MS);

        if (state.waveInProgress) {
          waveElapsedMsRef.current += LOOP_STEP_MS * state.gameSpeed;
          while (
            waveSpawnCursorRef.current < waveScheduleRef.current.length &&
            waveScheduleRef.current[waveSpawnCursorRef.current].atMs <= waveElapsedMsRef.current
          ) {
            const next = waveScheduleRef.current[waveSpawnCursorRef.current];
            const waveConfig = getWaveConfig(state.currentWave);
            const mapHealthMult = selectedMap?.enemyHealthMultiplier ?? 1;
            const mapSpeedMult = selectedMap?.enemySpeedMultiplier ?? 1;
            state.spawnEnemy(
              next.type as EnemyType,
              waveConfig.healthMultiplier * dailyChallenge.enemyHealthMultiplier * mapHealthMult,
              waveConfig.speedMultiplier * dailyChallenge.enemySpeedMultiplier * mapSpeedMult
            );
            waveSpawnCursorRef.current += 1;
          }
          if (waveSpawnCursorRef.current >= waveScheduleRef.current.length) {
            spawningCompleteRef.current = true;
          }
        }

        if (state.waveInProgress && state.enemies.length === 0 && spawningCompleteRef.current) {
          endWave();
          spawningCompleteRef.current = false;
          handleSaveCoins(state.coins);
          const completedWave = useGameStore.getState().currentWave;
          if (completedWave > 0 && completedWave % 10 === 0 && !playerStore.premium) {
            const nativeAdsReady = isNativeAdsAvailable() && isAdsInitialized();
            if (nativeAdsReady && isInterstitialAdReady()) {
              void showInterstitialAd().catch(console.error);
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(runTick);
    };

    rafRef.current = requestAnimationFrame(runTick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, isPaused, endWave, playerStore.premium, dailyChallenge, selectedMap]);

  useEffect(() => {
    if (!waveInProgress || !isPlaying) {
      waveScheduleRef.current = [];
      waveSpawnCursorRef.current = 0;
      waveElapsedMsRef.current = 0;
      spawningCompleteRef.current = false;
      waveKeyRef.current = '';
      return;
    }

    const waveId = `${currentWave}:${dailyChallenge.enemyHealthMultiplier}:${dailyChallenge.enemySpeedMultiplier}`;
    if (waveKeyRef.current === waveId && waveScheduleRef.current.length > 0) return;

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

    waveScheduleRef.current = schedule;
    waveSpawnCursorRef.current = 0;
    waveElapsedMsRef.current = 0;
    spawningCompleteRef.current = false;
    waveKeyRef.current = waveId;
  }, [waveInProgress, currentWave, isPlaying, dailyChallenge, selectedMap]);

  useEffect(() => {
    if (!waveInProgress || currentWave <= 0) return;
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
    const t = setTimeout(() => setEliteWaveNotice(null), 2200);
    return () => clearTimeout(t);
  }, [waveInProgress, currentWave]);

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
      router.replace('/');
    }
  }, [isPlaying, isGameOver, currentWave, pauseGame, router]);

  // Save and go to shop
  const handleGoToShop = useCallback(() => {
    // Save game state before navigating to shop
    saveGameState();
    setShowExitWarning(false);
    router.push('/shop');
  }, [saveGameState, router]);

  const handleConfirmExit = useCallback(async () => {
    setShowExitWarning(false);
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
          unlockedSpeeds: [...unlocked].sort((a, b) => a - b) as GameSpeed[],
        });
        setGameSpeed(speed);
      }
    },
    [setGameSpeed]
  );

  const handleStartWave = useCallback(() => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    spawningCompleteRef.current = false;
    startWave();
  }, [startWave, playerStore.hapticEnabled]);

  const handleCellPress = useCallback((x: number, y: number) => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const existingTower = getTowerAt({ x, y });
    
    if (existingTower) {
      selectPlacedTower(existingTower);
    } else if (selectedTowerType && canPlaceTower({ x, y })) {
      const success = placeTower({ x, y });
      if (success && playerStore.hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      if (selectedPlacedTower) {
        selectPlacedTower(null);
      }
    }
  }, [selectedTowerType, selectedPlacedTower, getTowerAt, canPlaceTower, placeTower, selectPlacedTower, playerStore.hapticEnabled]);

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
    if (!playerStore.playerId) return;

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

    if (!isServerBackedPlayerId(playerStore.playerId)) {
      playerStore.addXp(totalXpReward);
      const comboResult = playerStore.recordDailyChallengeRun();
      if (comboResult.bonusGems > 0) {
        playSfx('combo');
      }
      if (totalGemReward > 0) {
        playerStore.addGems(totalGemReward);
      }
      const runGemsTotal = totalGemReward + comboResult.bonusGems;
      playerStore.recordGame(currentWave, enemiesKilled, towersPlaced, runGemsTotal);
      playerStore.recordMapBestWave(playerStore.currentMapId, currentWave);
      playerStore.incrementGamesPlayedSinceAd();
      playerStore.clearCurrentGameProgress();
      return;
    }

    try {
      const response = await gameApi.endGame({
        player_id: playerStore.playerId,
        wave_reached: currentWave,
        enemies_killed: enemiesKilled,
        towers_placed: towersPlaced,
        duration_seconds: duration,
        run_bonus_gems: challengeGemReward,
      });

      let comboResult = { bonusGems: 0 };
      if (response.data) {
        playerStore.addXp(response.data.xp_earned + challengeXpReward);
        if (response.data.new_gem_balance !== undefined) {
          playerStore.setGems(response.data.new_gem_balance);
        }
        comboResult = playerStore.recordDailyChallengeRun();
        if (comboResult.bonusGems > 0) {
          playSfx('combo');
        }
        if (challengeGemReward > 0) {
          playerStore.addGems(challengeGemReward);
        }
      }

      const runGemsTotal =
        (response.data?.gems_earned ?? 0) + challengeGemReward + comboResult.bonusGems;
      playerStore.recordGame(currentWave, enemiesKilled, towersPlaced, runGemsTotal);
      playerStore.recordMapBestWave(playerStore.currentMapId, currentWave);
      playerStore.incrementGamesPlayedSinceAd();
      playerStore.clearCurrentGameProgress();
    } catch (error) {
      console.error('Error saving game:', error);
    }
  }, [playerStore, gameStartTime, currentWave, enemiesKilled, towersPlaced, dailyChallenge]);

  useEffect(() => {
    if (!isGameOver) {
      gameEndHandledRef.current = false;
      return;
    }
    if (canUseAdRevive()) {
      return;
    }
    void handleGameEnd();
  }, [isGameOver, handleGameEnd, canUseAdRevive]);

  useEffect(() => {
    const completed = dailyMissions.filter((m) => m.completed).length;
    if (completed > lastMissionCompletedCountRef.current) {
      playSfx('mission');
    }
    lastMissionCompletedCountRef.current = completed;
  }, [dailyMissions]);

  useEffect(() => {
    if (!playerStore.autoStartWaves) return;
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
    startWave,
  ]);

  const handleWatchAdForRevive = useCallback(async () => {
    if (!isGameOver || !canUseAdRevive() || isReviving) return;
    setIsReviving(true);
    try {
      // TODO: integrate real ad SDK here - expo-ads or chosen provider.
      await new Promise((resolve) => setTimeout(resolve, 900));
      grantRevive();
      const didRevive = consumeRevive();
      if (!didRevive) return;
      setGameOverStep('over');
      setIsReviving(false);
      if (playerStore.playerId && isServerBackedPlayerId(playerStore.playerId)) {
        try {
          await rewardApi.claim({
            player_id: playerStore.playerId,
            reward_type: 'revive',
            ad_type: 'rewarded_simulated',
          });
        } catch (e) {
          console.error('Error claiming revive reward:', e);
        }
      }
      return;
    } finally {
      setIsReviving(false);
    }
  }, [isGameOver, canUseAdRevive, isReviving, grantRevive, consumeRevive, playerStore.playerId]);

  const handleRestart = useCallback(() => {
    playerStore.clearSavedGame(); // Clear saved game on restart
    restartGame();
  }, [restartGame, playerStore]);

  const handleSeeResults = useCallback(() => {
    if (!gameEndHandledRef.current) {
      void handleGameEnd();
    }
    setGameOverStep('results');
  }, [handleGameEnd]);

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
    <GameRuntimeErrorBoundary onRecover={() => router.replace('/')}>
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
              <MaterialCommunityIcons name="diamond-stone" size={15} color="#5dade2" />
              <Text style={[styles.statValue, styles.gemStatValue]}>{gemsHudDisplay}</Text>
            </View>
          )}
          <View style={styles.stat}>
            <MaterialCommunityIcons name="waves" size={16} color="#4A90D9" />
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
            <MaterialCommunityIcons name="skull-outline" size={16} color="#FF6B4A" />
            <Text style={styles.carnageBarStrong}>{enemiesKilled}</Text>
            <Text style={styles.carnageBarLabel}>this run</Text>
          </View>
          <View style={styles.carnageBarMid}>
            <Text style={styles.carnageBarMuted}>Session</Text>
            <Text style={styles.carnageBarSession}>{sessionCarnageDisplay}</Text>
          </View>
          <View style={styles.carnageBarRight}>
            <MaterialCommunityIcons name="star-four-points" size={14} color="#f1c40f" />
            <Text style={styles.carnageBarStars}>
              {sessionSlaughterTriumphs}/{SESSION_BOUNTY_TRIUMPHS_NEEDED}
            </Text>
            <Text style={styles.carnageBarStarsHint}>slaughters</Text>
          </View>
        </View>
      )}

      {/* Speed Controls */}
      <SpeedControls
        currentSpeed={gameSpeed}
        onSpeedChange={setGameSpeed}
        unlockedSpeeds={unlockedSpeeds}
        onPurchaseSpeed={handlePurchaseSpeed}
        gems={playerStore.gems}
      />

      {/* Wave info bar */}
      {!waveInProgress && !isGameOver && isPlaying && (
        <View style={styles.waveInfoBar}>
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
          <TouchableOpacity style={styles.startWaveButton} onPress={handleStartWave}>
            <Text style={styles.startWaveText}>
              Start Wave {currentWave + 1} {autoWaveTimer > 0 && currentWave > 0 ? `(${formatTimer(autoWaveTimer)})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
        />
      </View>

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
          onSelect={selectTower}
          selectedType={selectedTowerType}
          coins={coins}
          unlockedTowers={unlockedTowers}
          getTowerCost={getTowerCost}
        />
      )}

      {/* Instructions */}
      {selectedTowerType && !selectedPlacedTower && (
        <View style={styles.instructionBar}>
          <Text style={styles.instructionText}>
            Pinch to zoom · Tap or drag on the map to place {TOWERS[selectedTowerType].name}
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
        sessionCarnageTotal={sessionEnemiesKilledTotal}
        slaughterQualified={enemiesKilled >= SESSION_SLAUGHTER_WIN_KILLS}
        slaughterThreshold={SESSION_SLAUGHTER_WIN_KILLS}
        triumphCount={sessionSlaughterTriumphs}
        triumphsNeeded={SESSION_BOUNTY_TRIUMPHS_NEEDED}
        rewardSummary={rewardSummary}
        canRevive={reviveAvailable}
        reviveUsed={!canUseAdRevive()}
        onRevive={() => {
          void handleWatchAdForRevive();
        }}
        isReviving={isReviving}
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
            Wave {currentWave} • {enemiesKilled} kills • {coins} coins
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: TacticalTheme.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  carnageBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carnageBarStrong: {
    color: TacticalTheme.accent,
    fontSize: 18,
    fontWeight: '800',
  },
  carnageBarLabel: {
    color: TacticalTheme.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  carnageBarMid: {
    alignItems: 'center',
  },
  carnageBarMuted: {
    color: TacticalTheme.textSubtle,
    fontSize: 10,
    fontWeight: '600',
  },
  carnageBarSession: {
    color: TacticalTheme.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  carnageBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    justifyContent: 'center',
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
    backgroundColor: TacticalTheme.panel,
    borderBottomWidth: 1,
    borderBottomColor: TacticalTheme.border,
  },
  waveInfoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mapInfoText: {
    color: '#b8c9de',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  challengeInfoText: {
    color: '#8fb4e5',
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
    backgroundColor: '#16213e',
  },
  zoomButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4A90D9',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  boardScrollContainer: {
    flex: 1,
  },
  boardScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#2a3a55',
  },
  canPlaceOnPath: {
    backgroundColor: 'rgba(74, 144, 217, 0.22)',
    borderWidth: 2,
    borderColor: '#6CB8FF',
  },
  canPlaceCell: {
    backgroundColor: 'rgba(74, 144, 217, 0.28)',
    borderColor: '#5CADFF',
    borderWidth: 2,
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
    backgroundColor: 'rgba(74, 144, 217, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(74, 144, 217, 0.4)',
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
    backgroundColor: '#16213e',
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
    borderColor: '#4A90D9',
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
  towerOptionsPanel: {
    backgroundColor: '#16213e',
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
    backgroundColor: '#4A90D9',
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
    backgroundColor: '#4A90D9',
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
    backgroundColor: '#4A90D9',
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
  gameOverSessionLine: {
    color: TacticalTheme.text,
    fontSize: 14,
    marginBottom: 4,
  },
  gameOverSessionEm: {
    color: TacticalTheme.accent,
    fontWeight: '800',
  },
  gameOverTriumphLine: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    marginBottom: 10,
  },
  resultsHeroCard: {
    width: '100%',
    backgroundColor: '#1a2540',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2d4a78',
    alignItems: 'center',
  },
  resultsHeroLabel: {
    color: '#8fa4c4',
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
    color: '#9bb0cc',
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
    backgroundColor: '#1f2c4a',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#2a3f63',
  },
  resultsStatLabel: {
    color: '#9bb0cc',
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
    color: '#4A90D9',
    fontSize: 16,
    fontWeight: '600',
  },
  rewardSummaryBox: {
    width: '100%',
    backgroundColor: '#1f2c4a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#385a8f',
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
    color: '#d6e3f7',
    fontSize: 12,
  },
  watchAdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TacticalTheme.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
    width: '100%',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TacticalTheme.borderStrong,
  },
  watchAdButtonDisabled: {
    opacity: 0.6,
  },
  watchAdText: {
    color: TacticalTheme.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  revivePromptWrap: {
    width: '100%',
    backgroundColor: TacticalTheme.bgElevated,
    borderColor: TacticalTheme.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  revivePromptTitle: {
    color: TacticalTheme.accent,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  revivePromptBody: {
    color: TacticalTheme.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  revivePromptLimit: {
    color: TacticalTheme.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  reviveUsedText: {
    color: TacticalTheme.textSubtle,
    fontSize: 12,
    marginBottom: 8,
  },
  restartButton: {
    backgroundColor: '#4A90D9',
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
    backgroundColor: '#2a3f67',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  resultsText: {
    color: '#d8e6fb',
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
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '85%',
    maxWidth: 320,
  },
  exitWarningTitle: {
    color: '#4A90D9',
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
    backgroundColor: '#4A90D9',
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
    backgroundColor: '#16213e',
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
