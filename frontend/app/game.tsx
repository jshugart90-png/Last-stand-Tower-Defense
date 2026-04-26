import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  ScrollView,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useGameStore, PlacedTower, SavedGameStateForExport } from '../src/stores/gameStore';
import { usePlayerStore, SavedGameState } from '../src/stores/playerStore';
import { 
  TOWERS, ENEMIES, GAME_CONFIG, getWaveConfig, TowerType, 
  TARGETING_MODES, TargetingMode, getInfiniteUpgradeStats, 
  GameSpeed, SPEED_UNLOCK_PRICES
} from '../src/constants/game';
import { gameApi, analyticsApi, rewardApi, isServerBackedPlayerId } from '../src/hooks/useApi';
import { findPath } from '../src/utils/pathfinding';
import { 
  isRewardedAdReady, showRewardedAd, loadRewardedAd, 
  isNativeAdsAvailable, isAdsInitialized,
  showInterstitialAd, loadInterstitialAd, isInterstitialAdReady
} from '../src/services/adService';
import { getDailyChallenge } from '../src/constants/challenges';
import { playSfx } from '../src/services/audioService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const getUtcDayKey = (ts: number) => {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

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

// Speed control buttons with purchase functionality
const SpeedControls = ({ 
  currentSpeed, 
  onSpeedChange,
  unlockedSpeeds,
  onPurchaseSpeed,
  coins,
}: { 
  currentSpeed: GameSpeed; 
  onSpeedChange: (speed: GameSpeed) => void;
  unlockedSpeeds: GameSpeed[];
  onPurchaseSpeed: (speed: GameSpeed) => void;
  coins: number;
}) => {
  const speeds: GameSpeed[] = [1, 2, 3, 5, 10];
  
  return (
    <View style={styles.speedControls}>
      {speeds.map(speed => {
        const isUnlocked = unlockedSpeeds.includes(speed);
        const price = SPEED_UNLOCK_PRICES[speed];
        const canAfford = coins >= price;
        
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
              } else if (canAfford) {
                Alert.alert(
                  `Unlock ${speed}x Speed`,
                  `Purchase ${speed}x speed for ${price} coins?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Buy', onPress: () => onPurchaseSpeed(speed) },
                  ]
                );
              } else {
                Alert.alert('Not enough coins', `Need ${price} coins to unlock ${speed}x speed`);
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

// Game board component with laser beam rendering
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
    towers, enemies, projectiles, laserBeams, gridCols, gridRows, cellSize, 
    getTowerColor, selectedTowerType, canPlaceTower, spawnPoint, basePosition,
    selectedPlacedTower, towerUpgradeLevels,
  } = useGameStore();
  
  const finalScale = scale * zoomLevel;
  const scaledCellSize = cellSize * finalScale;
  const boardWidth = gridCols * scaledCellSize;
  const boardHeight = gridRows * scaledCellSize;

  const blockedCells = useMemo(
    () => new Set(towers.map(t => `${t.position.x},${t.position.y}`)),
    [towers]
  );
  const pathSet = useMemo(() => {
    const currentPath = findPath(spawnPoint, basePosition, gridCols, gridRows, blockedCells);
    return new Set((currentPath || []).map(p => `${p.x},${p.y}`));
  }, [spawnPoint, basePosition, gridCols, gridRows, blockedCells]);
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
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={[styles.gameBoard, { width: boardWidth, height: boardHeight }]}>
          {gridCells.map(({ row, col }) => {
            const isPath = pathSet.has(`${col},${row}`);
            const isSpawn = col === spawnPoint.x && row === spawnPoint.y;
            const isBase = col === basePosition.x && row === basePosition.y;
            const canPlace = selectedTowerType ? canPlaceTower({ x: col, y: row }) : false;
            const hasTowerHere = blockedCells.has(`${col},${row}`);
            const cellStyle = [
              styles.cell,
              {
                width: scaledCellSize,
                height: scaledCellSize,
                left: col * scaledCellSize,
                top: row * scaledCellSize,
              },
              isPath && !isSpawn && !isBase && styles.pathCell,
              canPlace && styles.canPlaceCell,
              isSpawn && styles.spawnCell,
              isBase && styles.baseCell,
            ];

            if (hasTowerHere) {
              return <View key={`${col}-${row}`} style={cellStyle} />;
            }

            return (
              <TouchableOpacity
                key={`${col}-${row}`}
                style={cellStyle}
                onPress={() => onCellPress(col, row)}
                activeOpacity={0.7}
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
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            return (
              <View
                key={`laser-${idx}`}
                pointerEvents="none"
                style={[
                  styles.laserBeam,
                  {
                    left: startX,
                    top: startY - 2,
                    width: length,
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: 'left center',
                  },
                ]}
              />
            );
          })}

          {enemies.map((enemy) => {
            const enemyDef = ENEMIES[enemy.type];
            const healthPercent = enemy.health / enemy.maxHealth;
            const isSlowed = nowTs < enemy.slowedUntil;
            const enemySize = enemyDef.size * finalScale;

            return (
              <View
                key={enemy.id}
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
          })}

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
            return (
              <View
                key={proj.id}
                pointerEvents="none"
                style={[
                  styles.projectile,
                  {
                    left: px * scaledCellSize + scaledCellSize / 2 - 4,
                    top: py * scaledCellSize + scaledCellSize / 2 - 4,
                    backgroundColor: proj.isFreeze ? '#00D4FF' : proj.isSplash ? '#FF6B35' : '#FFD700',
                  },
                ]}
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
            const cx = tower.position.x * scaledCellSize;
            const cy = tower.position.y * scaledCellSize;

            return (
              <React.Fragment key={tower.id}>
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
          })}

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
        </View>
      </ScrollView>
    </ScrollView>
  );
});

GameBoard.displayName = 'GameBoard';

// Game Over Modal
const GameOverModal = ({
  visible, wave, score, onRestart, onWatchAd, onExit, onViewResults, canWatchAd, rewardSummary
}: {
  visible: boolean;
  wave: number;
  score: number;
  onRestart: () => void;
  onWatchAd: () => void;
  onExit: () => void;
  onViewResults: () => void;
  canWatchAd: boolean;
  rewardSummary: {
    challengeName: string;
    xpEarned: number;
    gemsEarned: number;
  };
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.gameOverModal}>
          <Text style={styles.gameOverTitle}>GAME OVER</Text>
          <Text style={styles.gameOverWave}>Wave {wave}</Text>
          <Text style={styles.gameOverScore}>Score: {score}</Text>
          <View style={styles.rewardSummaryBox}>
            <Text style={styles.rewardSummaryTitle}>{rewardSummary.challengeName}</Text>
            <Text style={styles.rewardSummaryText}>XP Earned: +{rewardSummary.xpEarned}</Text>
            <Text style={styles.rewardSummaryText}>Gems Earned: +{rewardSummary.gemsEarned}</Text>
          </View>
          
          {canWatchAd && (
            <TouchableOpacity style={styles.watchAdButton} onPress={onWatchAd}>
              <Ionicons name="videocam" size={20} color="#fff" />
              <Text style={styles.watchAdText}>Watch Ad to Revive (1x only)</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.resultsButton} onPress={onViewResults}>
            <Text style={styles.resultsText}>View Full Results</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.restartButton} onPress={onRestart}>
            <Text style={styles.restartText}>Play Again</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.exitButton} onPress={onExit}>
            <Text style={styles.exitText}>Exit</Text>
          </TouchableOpacity>
        </View>
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
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  const spawnTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const spawningCompleteRef = useRef<boolean>(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [eliteWaveNotice, setEliteWaveNotice] = useState<string | null>(null);
  
  const playerStore = usePlayerStore();
  const dailyMissions = usePlayerStore((s) => s.dailyMissions);
  const vfxQuality = usePlayerStore((s) => s.vfxQuality);
  useEffect(() => {
    if (runStartBestWaveRef.current === 0) {
      runStartBestWaveRef.current = playerStore.bestWave;
    }
  }, [playerStore.bestWave]);

  useEffect(() => {
    if (isPlaying && currentWave <= 1) {
      runStartBestWaveRef.current = playerStore.bestWave;
    }
  }, [isPlaying, currentWave, playerStore.bestWave]);

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
    arenaExpansions,
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
    setZoomLevel,
    consumeRevive,
    grantRevive,
    canUseAdRevive,
    getCurrentCoins,
    lastWaveBonus,
    showBonusPopup,
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
      arenaExpansions: s.arenaExpansions,
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
      setZoomLevel: s.setZoomLevel,
      consumeRevive: s.useRevive,
      grantRevive: s.grantRevive,
      canUseAdRevive: s.canUseAdRevive,
      getCurrentCoins: s.getCurrentCoins,
      lastWaveBonus: s.lastWaveBonus,
      showBonusPopup: s.showBonusPopup,
    }))
  );

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
      // Start new game
      startGame(
        playerStore.unlockedTowers,
        playerStore.unlockedSpeeds,
        playerStore.towerUpgradeLevels,
        playerStore.equippedSkins, 
        playerStore.arenaExpansions
      );
    }
    
    if (playerStore.playerId && isServerBackedPlayerId(playerStore.playerId)) {
      analyticsApi.log({
        player_id: playerStore.playerId,
        event_type: 'game_start',
      }).catch(() => {});
    }
    
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      spawnTimeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, [playerStore, startGame]);

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
      playerStore.arenaExpansions
    );
    setShowResumePrompt(false);
  }, [playerStore, startGame]);

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

  // Game loop
  useEffect(() => {
    if (!isPlaying || isPaused) {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
        gameLoopRef.current = null;
      }
      return;
    }

    lastUpdateRef.current = Date.now();
    
    gameLoopRef.current = setInterval(() => {
      const now = Date.now();
      const deltaTime = Math.min(now - lastUpdateRef.current, 100);
      lastUpdateRef.current = now;

      useGameStore.getState().gameTick(deltaTime);
      
      const state = useGameStore.getState();
      if (state.waveInProgress && state.enemies.length === 0 && spawningCompleteRef.current) {
        endWave();
        spawningCompleteRef.current = false;
        handleSaveCoins(state.coins);
        
        // Show interstitial ad every 10 waves (skip for premium users)
        const completedWave = useGameStore.getState().currentWave;
        if (completedWave > 0 && completedWave % 10 === 0 && !playerStore.premium) {
          const nativeAdsReady = isNativeAdsAvailable() && isAdsInitialized();
          if (nativeAdsReady && isInterstitialAdReady()) {
            showInterstitialAd().catch(console.error);
          }
        }
      }
    }, 33);

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [isPlaying, isPaused, endWave, playerStore.premium]);

  // Wave spawning
  useEffect(() => {
    if (!waveInProgress || !isPlaying) return;

    spawnTimeoutsRef.current.forEach(t => clearTimeout(t));
    spawnTimeoutsRef.current = [];
    spawningCompleteRef.current = false;

    const waveConfig = getWaveConfig(currentWave);
    const challengeHealthMultiplier = dailyChallenge.enemyHealthMultiplier;
    const challengeSpeedMultiplier = dailyChallenge.enemySpeedMultiplier;
    let delay = 500;

    waveConfig.enemies.forEach(({ type, count }) => {
      for (let i = 0; i < count; i++) {
        const timeoutId = setTimeout(() => {
          const state = useGameStore.getState();
          if (state.isPlaying && !state.isPaused && state.waveInProgress) {
            state.spawnEnemy(
              type as any,
              waveConfig.healthMultiplier * challengeHealthMultiplier,
              waveConfig.speedMultiplier * challengeSpeedMultiplier
            );
          }
        }, delay / gameSpeed);
        spawnTimeoutsRef.current.push(timeoutId);
        delay += GAME_CONFIG.ENEMY_SPAWN_DELAY;
      }
    });

    const completionTimeout = setTimeout(() => {
      spawningCompleteRef.current = true;
    }, (delay + 100) / gameSpeed);

    return () => {
      spawnTimeoutsRef.current.forEach(t => clearTimeout(t));
      clearTimeout(completionTimeout);
    };
  }, [waveInProgress, currentWave, isPlaying, gameSpeed, dailyChallenge]);

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
    // Gems are only awarded at game end based on performance.
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
    playerStore.recordGame(currentWave, enemiesKilled, towersPlaced);
    router.replace('/');
  }, [saveGameState, getCurrentCoins, currentWave, enemiesKilled, towersPlaced, router, playerStore]);

  const handleCancelExit = useCallback(() => {
    setShowExitWarning(false);
    resumeGame();
  }, [resumeGame]);

  // Handle speed purchase
  const handlePurchaseSpeed = useCallback((speed: GameSpeed) => {
    const success = playerStore.purchaseSpeed(speed);
    if (success) {
      // Update game store with new unlocked speeds
      useGameStore.setState({ 
        unlockedSpeeds: [...playerStore.unlockedSpeeds, speed].sort((a, b) => a - b) as GameSpeed[]
      });
      setGameSpeed(speed);
    }
  }, [playerStore, setGameSpeed]);

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
    if (!playerStore.playerId) return;

    const duration = Math.floor((Date.now() - gameStartTime) / 1000);
    const baseXpReward = Math.max(1, currentWave * 2);
    const performanceGems = Math.max(0, Math.floor(currentWave * 0.75) + Math.floor(enemiesKilled / 20));
    const challengeXpReward = Math.floor(baseXpReward * Math.max(0, dailyChallenge.xpMultiplier - 1));
    const challengeGemReward = Math.floor(performanceGems * Math.max(0, dailyChallenge.gemMultiplier - 1));
    const totalXpReward = baseXpReward + challengeXpReward;
    const totalGemReward = performanceGems + challengeGemReward;

    const comboResult = playerStore.recordDailyChallengeRun();
    const totalGemRewardWithCombo = totalGemReward + comboResult.bonusGems;
    if (comboResult.bonusGems > 0) {
      playSfx('combo', playerStore.soundEnabled);
    }

    if (!isServerBackedPlayerId(playerStore.playerId)) {
      playerStore.addXp(totalXpReward);
      if (totalGemRewardWithCombo > 0) playerStore.addGems(totalGemRewardWithCombo);
      playerStore.recordGame(currentWave, enemiesKilled, towersPlaced);
      if (currentWave >= 10) playerStore.recordSessionWin();
      playerStore.incrementGamesPlayedSinceAd();
      playerStore.clearCurrentGameProgress();
    } else {
      try {
        const response = await gameApi.endGame({
          player_id: playerStore.playerId,
          wave_reached: currentWave,
          enemies_killed: enemiesKilled,
          towers_placed: towersPlaced,
          duration_seconds: duration,
        });

        if (response.data) {
          playerStore.addXp(response.data.xp_earned + challengeXpReward);
          if (response.data.new_gem_balance !== undefined) {
            playerStore.setGems(response.data.new_gem_balance);
          }
          if (totalGemRewardWithCombo > 0) {
            playerStore.addGems(totalGemRewardWithCombo);
          }
        }

        playerStore.recordGame(currentWave, enemiesKilled, towersPlaced);
        if (currentWave >= 10) playerStore.recordSessionWin();
        playerStore.incrementGamesPlayedSinceAd();
        playerStore.clearCurrentGameProgress();
      } catch (error) {
        console.error('Error saving game:', error);
      }
    }

    // Show interstitial ad after game over (skip for premium users)
    if (!playerStore.premium) {
      const nativeAdsReady = isNativeAdsAvailable() && isAdsInitialized();
      if (nativeAdsReady && isInterstitialAdReady()) {
        showInterstitialAd().catch(console.error);
      } else if (nativeAdsReady) {
        // Try to load and show
        loadInterstitialAd().then(loaded => {
          if (loaded) showInterstitialAd().catch(console.error);
        });
      }
    }
  }, [playerStore, gameStartTime, currentWave, enemiesKilled, towersPlaced, dailyChallenge]);

  useEffect(() => {
    if (isGameOver) {
      handleGameEnd();
    }
  }, [isGameOver, handleGameEnd]);

  useEffect(() => {
    const completed = dailyMissions.filter((m) => m.completed).length;
    if (completed > lastMissionCompletedCountRef.current) {
      playSfx('mission', playerStore.soundEnabled);
    }
    lastMissionCompletedCountRef.current = completed;
  }, [dailyMissions, playerStore.soundEnabled]);

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
    const nativeAdsReady = isNativeAdsAvailable() && isAdsInitialized();
    
    if (nativeAdsReady && isRewardedAdReady()) {
      // Show real rewarded ad for revive
      try {
        const reward = await showRewardedAd();
        if (reward) {
          grantRevive();
          consumeRevive();
          
          if (playerStore.playerId && isServerBackedPlayerId(playerStore.playerId)) {
            try {
              await rewardApi.claim({
                player_id: playerStore.playerId,
                reward_type: 'revive',
                ad_type: 'rewarded',
              });
            } catch (e) {
              console.error('Error claiming reward:', e);
            }
          }
          // Pre-load next ad
          loadRewardedAd();
        } else {
          Alert.alert('No Reward', 'You need to watch the full ad to revive.');
        }
      } catch (e) {
        console.error('Error showing revive ad:', e);
        Alert.alert('Error', 'Failed to show ad. Please try again.');
      }
    } else if (nativeAdsReady && !isRewardedAdReady()) {
      // Try to load ad
      Alert.alert('Loading Ad', 'Please wait...');
      const loaded = await loadRewardedAd();
      if (loaded) {
        handleWatchAdForRevive();
      } else {
        Alert.alert('Ad Unavailable', 'No ads available right now.');
      }
    } else {
      // Non-native fallback (development/web)
      Alert.alert(
        'Watch Ad',
        'Rewarded ads require a native build.\n\nSimulate watching ad to revive?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Simulate',
            onPress: async () => {
              grantRevive();
              consumeRevive();
              
              if (playerStore.playerId && isServerBackedPlayerId(playerStore.playerId)) {
                try {
                  await rewardApi.claim({
                    player_id: playerStore.playerId,
                    reward_type: 'revive',
                    ad_type: 'rewarded',
                  });
                } catch (e) {
                  console.error('Error claiming reward:', e);
                }
              }
            },
          },
        ]
      );
    }
  }, [playerStore, grantRevive, consumeRevive]);

  const handleRestart = useCallback(() => {
    playerStore.clearSavedGame(); // Clear saved game on restart
    restartGame();
  }, [restartGame, playerStore]);

  const handleExit = useCallback(() => {
    playerStore.clearSavedGame(); // Clear saved game on exit after game over
    router.replace('/');
  }, [router, playerStore]);

  const formatTimer = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  const rewardSummary = useMemo(() => {
    const baseXpReward = Math.max(1, currentWave * 2);
    const performanceGems = Math.max(0, Math.floor(currentWave * 0.75) + Math.floor(enemiesKilled / 20));
    const challengeXpReward = Math.floor(baseXpReward * Math.max(0, dailyChallenge.xpMultiplier - 1));
    const challengeGemReward = Math.floor(performanceGems * Math.max(0, dailyChallenge.gemMultiplier - 1));
    const nowKey = getUtcDayKey(Date.now());
    const lastComboKey = playerStore.lastDailyChallengeRunAt
      ? getUtcDayKey(playerStore.lastDailyChallengeRunAt)
      : null;
    const nextCombo = lastComboKey === nowKey ? playerStore.dailyChallengeRunCombo + 1 : 1;
    const comboBonus = nextCombo % 3 === 0 ? 20 : 0;
    return {
      challengeName: dailyChallenge.name,
      xpEarned: baseXpReward + challengeXpReward,
      gemsEarned: performanceGems + challengeGemReward + comboBonus,
      comboBonus,
      comboCount: nextCombo,
    };
  }, [currentWave, enemiesKilled, dailyChallenge, playerStore.lastDailyChallengeRunAt, playerStore.dailyChallengeRunCombo]);

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

  const handleViewResults = useCallback(() => {
    router.push({
      pathname: '/run-results',
      params: {
        wave: String(currentWave),
        score: String(score),
        kills: String(enemiesKilled),
        towers: String(towersPlaced),
        xp: String(rewardSummary.xpEarned),
        gems: String(rewardSummary.gemsEarned),
        challenge: rewardSummary.challengeName,
        bestDelta: String(Math.max(0, currentWave - runStartBestWaveRef.current)),
        comboBonus: String(rewardSummary.comboBonus),
        comboCount: String(rewardSummary.comboCount),
        oneMoreRun: missionNudge?.oneMoreRun ? '1' : '0',
      },
    });
  }, [router, currentWave, score, enemiesKilled, towersPlaced, rewardSummary, missionNudge]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExitAttempt} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="heart" size={16} color="#E74C3C" />
            <Text style={styles.statValue}>{baseHealth}</Text>
          </View>
          <View style={styles.stat}>
            <FontAwesome5 name="coins" size={14} color="#FFD700" />
            <Text style={styles.statValue}>{coins}</Text>
          </View>
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

      {/* Speed Controls */}
      <SpeedControls 
        currentSpeed={gameSpeed} 
        onSpeedChange={setGameSpeed}
        unlockedSpeeds={unlockedSpeeds}
        onPurchaseSpeed={handlePurchaseSpeed}
        coins={coins}
      />

      {/* Wave info bar */}
      {!waveInProgress && !isGameOver && isPlaying && (
        <View style={styles.waveInfoBar}>
          <View>
            <Text style={styles.waveInfoText}>
              {currentWave === 0 ? 'Place towers to start!' : `Wave ${currentWave} complete!`}
            </Text>
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

      {/* Zoom controls */}
      {arenaExpansions > 0 && (
        <View style={styles.zoomControls}>
          <TouchableOpacity 
            style={styles.zoomButton} 
            onPress={() => setZoomLevel(zoomLevel - 0.2)}
          >
            <Ionicons name="remove" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.zoomText}>{Math.round(zoomLevel * 100)}%</Text>
          <TouchableOpacity 
            style={styles.zoomButton} 
            onPress={() => setZoomLevel(zoomLevel + 0.2)}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Game board */}
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
            Tap any empty cell to place {TOWERS[selectedTowerType].name}
          </Text>
        </View>
      )}

      {/* Game over modal */}
      <GameOverModal
        visible={isGameOver}
        wave={currentWave}
        score={score}
        rewardSummary={rewardSummary}
        onRestart={handleRestart}
        onWatchAd={handleWatchAdForRevive}
        onExit={handleExit}
        onViewResults={handleViewResults}
        canWatchAd={canUseAdRevive()}
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
          <Text style={styles.pauseSubtext}>Wave {currentWave} • {coins} coins</Text>
          
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#16213e',
  },
  headerButton: {
    padding: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  speedControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  speedButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#2a2a4e',
    minWidth: 48,
    alignItems: 'center',
  },
  speedButtonActive: {
    backgroundColor: '#4A90D9',
  },
  speedButtonLocked: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#444',
  },
  speedButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  speedButtonTextActive: {
    color: '#fff',
  },
  speedButtonTextLocked: {
    color: '#888',
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
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  waveInfoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
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
    backgroundColor: '#2a2a4e',
  },
  canPlaceCell: {
    backgroundColor: 'rgba(74, 144, 217, 0.4)',
    borderColor: '#4A90D9',
    borderWidth: 1,
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
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    maxWidth: 350,
  },
  gameOverTitle: {
    color: '#E74C3C',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  gameOverWave: {
    color: '#fff',
    fontSize: 24,
    marginBottom: 8,
  },
  gameOverScore: {
    color: '#FFD700',
    fontSize: 20,
    marginBottom: 24,
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
    backgroundColor: '#9B59B6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  watchAdText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
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
