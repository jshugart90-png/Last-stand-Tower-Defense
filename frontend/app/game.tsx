import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
import { gameApi, analyticsApi, rewardApi } from '../src/hooks/useApi';
import { findPath } from '../src/utils/pathfinding';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
const GameBoard = ({ 
  onCellPress, 
  scale,
  zoomLevel,
}: { 
  onCellPress: (x: number, y: number) => void; 
  scale: number;
  zoomLevel: number;
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

  const blockedCells = new Set(towers.map(t => `${t.position.x},${t.position.y}`));
  const currentPath = findPath(spawnPoint, basePosition, gridCols, gridRows, blockedCells);
  const pathSet = new Set((currentPath || []).map(p => `${p.x},${p.y}`));

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
          {/* Grid cells */}
          {Array.from({ length: gridRows }).map((_, row) =>
            Array.from({ length: gridCols }).map((_, col) => {
              const isPath = pathSet.has(`${col},${row}`);
              const isSpawn = col === spawnPoint.x && row === spawnPoint.y;
              const isBase = col === basePosition.x && row === basePosition.y;
              const canPlace = selectedTowerType ? canPlaceTower({ x: col, y: row }) : false;
              
              return (
                <TouchableOpacity
                  key={`${col}-${row}`}
                  style={[
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
                  ]}
                  onPress={() => onCellPress(col, row)}
                  activeOpacity={0.7}
                />
              );
            })
          )}

          {/* Laser beams */}
          {laserBeams.map((beam, idx) => {
            const tower = towers.find(t => t.id === beam.towerId);
            const enemy = enemies.find(e => e.id === beam.targetId);
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

          {/* Towers */}
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
              <React.Fragment key={tower.id}>
                {isSelected && (
                  <View
                    style={[
                      styles.rangeIndicator,
                      {
                        left: tower.position.x * scaledCellSize + scaledCellSize / 2 - rangeRadius,
                        top: tower.position.y * scaledCellSize + scaledCellSize / 2 - rangeRadius,
                        width: rangeRadius * 2,
                        height: rangeRadius * 2,
                        borderRadius: rangeRadius,
                      },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.tower,
                    {
                      left: tower.position.x * scaledCellSize + scaledCellSize * 0.1,
                      top: tower.position.y * scaledCellSize + scaledCellSize * 0.1,
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
              </React.Fragment>
            );
          })}

          {/* Enemies */}
          {enemies.map((enemy) => {
            const enemyDef = ENEMIES[enemy.type];
            const healthPercent = enemy.health / enemy.maxHealth;
            const isSlowed = Date.now() < enemy.slowedUntil;
            const enemySize = enemyDef.size * finalScale;
            
            return (
              <View
                key={enemy.id}
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

          {/* Projectiles */}
          {projectiles.map((proj) => (
            <View
              key={proj.id}
              style={[
                styles.projectile,
                {
                  left: proj.position.x * scaledCellSize + scaledCellSize / 2 - 4,
                  top: proj.position.y * scaledCellSize + scaledCellSize / 2 - 4,
                  backgroundColor: proj.isFreeze ? '#00D4FF' : proj.isSplash ? '#FF6B35' : '#FFD700',
                },
              ]}
            />
          ))}

          {/* Spawn point */}
          <View style={[
            styles.spawnPoint,
            {
              left: spawnPoint.x * scaledCellSize,
              top: spawnPoint.y * scaledCellSize,
              width: scaledCellSize,
              height: scaledCellSize,
            }
          ]}>
            <MaterialCommunityIcons name="location-enter" size={scaledCellSize * 0.5} color="#E74C3C" />
          </View>

          {/* Base */}
          <View style={[
            styles.base,
            {
              left: basePosition.x * scaledCellSize,
              top: basePosition.y * scaledCellSize,
              width: scaledCellSize,
              height: scaledCellSize,
            }
          ]}>
            <Ionicons name="home" size={scaledCellSize * 0.6} color="#FFD700" />
          </View>
        </View>
      </ScrollView>
    </ScrollView>
  );
};

// Game Over Modal
const GameOverModal = ({ 
  visible, wave, score, onRestart, onWatchAd, onExit, canWatchAd 
}: {
  visible: boolean;
  wave: number;
  score: number;
  onRestart: () => void;
  onWatchAd: () => void;
  onExit: () => void;
  canWatchAd: boolean;
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.gameOverModal}>
          <Text style={styles.gameOverTitle}>GAME OVER</Text>
          <Text style={styles.gameOverWave}>Wave {wave}</Text>
          <Text style={styles.gameOverScore}>Score: {score}</Text>
          
          {canWatchAd && (
            <TouchableOpacity style={styles.watchAdButton} onPress={onWatchAd}>
              <Ionicons name="videocam" size={20} color="#fff" />
              <Text style={styles.watchAdText}>Watch Ad to Revive (1x only)</Text>
            </TouchableOpacity>
          )}
          
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
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  const spawnTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const spawningCompleteRef = useRef<boolean>(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  
  const playerStore = usePlayerStore();
  const gameStore = useGameStore();

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
    enemies,
    towers,
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
    spawnEnemy,
    canPlaceTower,
    getTowerAt,
    getTowerCost,
    getUpgradeCost,
    getSellValue,
    setGameSpeed,
    setZoomLevel,
    useRevive,
    grantRevive,
    canUseAdRevive,
    getCurrentCoins,
    lastWaveBonus,
    showBonusPopup,
    dismissBonusPopup,
  } = gameStore;

  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const boardWidth = gridCols * cellSize;
  const boardHeight = gridRows * cellSize;
  const scale = Math.min(
    (SCREEN_WIDTH - 20) / boardWidth,
    (SCREEN_HEIGHT - 380) / boardHeight
  );

  // Initialize game on mount - check for saved game
  useEffect(() => {
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
    
    if (playerStore.playerId) {
      analyticsApi.log({
        player_id: playerStore.playerId,
        event_type: 'game_start',
      }).catch(() => {});
    }
    
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      spawnTimeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  // Handle resume saved game
  const handleResumeGame = useCallback(() => {
    const savedGame = playerStore.getSavedGame();
    if (savedGame) {
      gameStore.resumeFromSavedGame(savedGame as SavedGameStateForExport, {
        unlockedTowers: playerStore.unlockedTowers,
        unlockedSpeeds: playerStore.unlockedSpeeds,
        towerUpgradeLevels: playerStore.towerUpgradeLevels,
        equippedSkins: playerStore.equippedSkins,
      });
    }
    setShowResumePrompt(false);
  }, [playerStore, gameStore]);

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

      gameStore.gameTick(deltaTime);
      
      const state = useGameStore.getState();
      if (state.waveInProgress && state.enemies.length === 0 && spawningCompleteRef.current) {
        endWave();
        spawningCompleteRef.current = false;
        handleSaveCoins(state.coins);
      }
    }, 33);

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [isPlaying, isPaused]);

  // Wave spawning
  useEffect(() => {
    if (!waveInProgress || !isPlaying) return;

    spawnTimeoutsRef.current.forEach(t => clearTimeout(t));
    spawnTimeoutsRef.current = [];
    spawningCompleteRef.current = false;

    const waveConfig = getWaveConfig(currentWave);
    let delay = 500;

    waveConfig.enemies.forEach(({ type, count }) => {
      for (let i = 0; i < count; i++) {
        const timeoutId = setTimeout(() => {
          const state = useGameStore.getState();
          if (state.isPlaying && !state.isPaused && state.waveInProgress) {
            state.spawnEnemy(type as any, waveConfig.healthMultiplier, waveConfig.speedMultiplier);
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
  }, [waveInProgress, currentWave, isPlaying, gameSpeed]);

  // Save coins to backend and player store
  const handleSaveCoins = async (currentCoins: number) => {
    playerStore.setCoins(currentCoins);
    
    if (!playerStore.playerId) return;
    try {
      await gameApi.endGame({
        player_id: playerStore.playerId,
        wave_reached: currentWave,
        coins_earned: currentCoins - GAME_CONFIG.STARTING_COINS,
        enemies_killed: enemiesKilled,
        towers_placed: towersPlaced,
        duration_seconds: Math.floor((Date.now() - gameStartTime) / 1000),
      });
    } catch (error) {
      console.error('Error saving coins:', error);
    }
  };

  // Save full game state for resume
  const saveGameState = useCallback(() => {
    const gameState = gameStore.getGameStateForSave();
    playerStore.saveGame(gameState as any);
  }, [gameStore, playerStore]);

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
    playerStore.recordGame(currentWave);
    router.replace('/');
  }, [saveGameState, getCurrentCoins, currentWave, router]);

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
    
    try {
      const response = await gameApi.endGame({
        player_id: playerStore.playerId,
        wave_reached: currentWave,
        coins_earned: score,
        enemies_killed: enemiesKilled,
        towers_placed: towersPlaced,
        duration_seconds: duration,
      });

      if (response.data) {
        playerStore.addXp(response.data.xp_earned);
        playerStore.setCoins(response.data.new_balance || playerStore.coins);
      }

      playerStore.recordGame(currentWave);
      playerStore.incrementGamesPlayedSinceAd();
      playerStore.clearCurrentGameProgress();
    } catch (error) {
      console.error('Error saving game:', error);
    }
  }, [playerStore.playerId, gameStartTime, currentWave, score, enemiesKilled, towersPlaced]);

  useEffect(() => {
    if (isGameOver) {
      handleGameEnd();
    }
  }, [isGameOver]);

  const handleWatchAdForRevive = useCallback(async () => {
    Alert.alert(
      'Watch Ad',
      'Watch a short ad to revive with 50% health?\n\n(Can only use once per game)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Watch',
          onPress: async () => {
            grantRevive();
            useRevive();
            
            if (playerStore.playerId) {
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
  }, [playerStore.playerId, grantRevive, useRevive]);

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
            {showBonusPopup && lastWaveBonus > 0 && (
              <Text style={styles.bonusText}>+{lastWaveBonus} bonus coins!</Text>
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
        <GameBoard onCellPress={handleCellPress} scale={scale} zoomLevel={zoomLevel} />
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
        onRestart={handleRestart}
        onWatchAd={handleWatchAdForRevive}
        onExit={handleExit}
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
    backgroundColor: 'rgba(74, 144, 217, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(74, 144, 217, 0.4)',
  },
  laserBeam: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#FF00FF',
    zIndex: 20,
    shadowColor: '#FF00FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  tower: {
    position: 'absolute',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
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
    zIndex: 5,
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
    zIndex: 15,
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
  resumeButton: {
    backgroundColor: '#4A90D9',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  resumeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
