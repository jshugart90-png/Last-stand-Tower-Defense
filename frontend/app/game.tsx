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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useGameStore, PlacedTower, GameSpeed } from '../src/stores/gameStore';
import { usePlayerStore } from '../src/stores/playerStore';
import { 
  TOWERS, ENEMIES, GAME_CONFIG, getWaveConfig, TowerType, 
  TARGETING_MODES, TargetingMode, getInfiniteUpgradeStats 
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
  currentWave,
  getTowerCost,
}: {
  onSelect: (type: TowerType | null) => void;
  selectedType: TowerType | null;
  coins: number;
  unlockedTowers: TowerType[];
  currentWave: number;
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
        const willUnlock = tower.unlockWave <= currentWave + 1;
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
            <Text style={[
              styles.towerCost,
              !canAfford && styles.towerCostRed
            ]}>
              {isUnlocked ? `${cost}` : `Wave ${tower.unlockWave}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

// Speed control buttons
const SpeedControls = ({ 
  currentSpeed, 
  onSpeedChange 
}: { 
  currentSpeed: GameSpeed; 
  onSpeedChange: (speed: GameSpeed) => void;
}) => {
  return (
    <View style={styles.speedControls}>
      {([1, 2, 3] as GameSpeed[]).map(speed => (
        <TouchableOpacity
          key={speed}
          style={[
            styles.speedButton,
            currentSpeed === speed && styles.speedButtonActive,
          ]}
          onPress={() => onSpeedChange(speed)}
        >
          <Text style={[
            styles.speedButtonText,
            currentSpeed === speed && styles.speedButtonTextActive,
          ]}>
            {speed}x
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// Tower options panel (shown when a placed tower is selected)
const TowerOptionsPanel = ({
  tower,
  onUpgrade,
  onSell,
  onTargetingChange,
  onClose,
  coins,
  getUpgradeCost,
  getSellValue,
}: {
  tower: PlacedTower;
  onUpgrade: () => void;
  onSell: () => void;
  onTargetingChange: (mode: TargetingMode) => void;
  onClose: () => void;
  coins: number;
  getUpgradeCost: (tower: PlacedTower) => number;
  getSellValue: (tower: PlacedTower) => number;
}) => {
  const towerDef = TOWERS[tower.type];
  const upgradeCost = getUpgradeCost(tower);
  const sellValue = getSellValue(tower);
  const canUpgrade = coins >= upgradeCost;
  const stats = getInfiniteUpgradeStats(towerDef.baseStats, tower.level);

  return (
    <View style={styles.towerOptionsPanel}>
      {/* Header */}
      <View style={styles.towerOptionHeader}>
        <View style={[styles.towerOptionIcon, { backgroundColor: towerDef.color }]}>
          {getTowerIcon(tower.type, 16)}
        </View>
        <Text style={styles.towerOptionTitle}>{towerDef.name} Lv.{tower.level + 1}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.towerStatsRow}>
        <Text style={styles.towerStatText}>DMG: {stats.damage}</Text>
        <Text style={styles.towerStatText}>RNG: {stats.range.toFixed(1)}</Text>
        <Text style={styles.towerStatText}>SPD: {(1000 / stats.fireRate).toFixed(1)}/s</Text>
      </View>

      {/* Targeting Mode */}
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

      {/* Actions */}
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

// Game board component
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
    towers, enemies, projectiles, gridCols, gridRows, cellSize, 
    getTowerColor, selectedTowerType, canPlaceTower, spawnPoint, basePosition,
    selectedPlacedTower,
  } = useGameStore();
  
  const finalScale = scale * zoomLevel;
  const scaledCellSize = cellSize * finalScale;
  const boardWidth = gridCols * scaledCellSize;
  const boardHeight = gridRows * scaledCellSize;

  // Calculate current path for display
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
      maximumZoomScale={2}
      minimumZoomScale={0.5}
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
              const hasTower = towers.some(t => t.position.x === col && t.position.y === row);
              
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

          {/* Towers */}
          {towers.map((tower) => {
            const towerDef = TOWERS[tower.type];
            const stats = getInfiniteUpgradeStats(towerDef.baseStats, tower.level);
            const rangeRadius = stats.range * scaledCellSize;
            const isSelected = selectedPlacedTower?.id === tower.id;
            
            return (
              <React.Fragment key={tower.id}>
                {/* Range indicator (only for selected) */}
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
                {/* Tower */}
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

export default function GameScreen() {
  const router = useRouter();
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  const spawnTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const spawningCompleteRef = useRef<boolean>(false);
  
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
    comboCount,
    enemies,
    towers,
    unlockedTowers,
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
  } = gameStore;

  // Calculate scale for the board
  const boardWidth = gridCols * cellSize;
  const boardHeight = gridRows * cellSize;
  const scale = Math.min(
    (SCREEN_WIDTH - 20) / boardWidth,
    (SCREEN_HEIGHT - 380) / boardHeight
  );

  // Initialize game on mount
  useEffect(() => {
    startGame(playerStore.equippedSkins, playerStore.arenaExpansions);
    
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
      
      // Check wave completion
      const state = useGameStore.getState();
      if (state.waveInProgress && state.enemies.length === 0 && spawningCompleteRef.current) {
        endWave();
        spawningCompleteRef.current = false;
        // Save coins after each wave
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

  // Save coins to backend
  const handleSaveCoins = async (currentCoins: number) => {
    if (!playerStore.playerId) return;
    try {
      // Update local store
      playerStore.setCoins(currentCoins);
      // Sync to backend (simplified - you may want a dedicated endpoint)
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

  // Handle manual wave start
  const handleStartWave = useCallback(() => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    spawningCompleteRef.current = false;
    startWave();
  }, [startWave, playerStore.hapticEnabled]);

  // Handle cell press
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
      // Deselect if clicking empty space
      if (selectedPlacedTower) {
        selectPlacedTower(null);
      }
    }
  }, [selectedTowerType, selectedPlacedTower, getTowerAt, canPlaceTower, placeTower, selectPlacedTower, playerStore.hapticEnabled]);

  // Handle upgrade
  const handleUpgrade = useCallback(() => {
    if (selectedPlacedTower) {
      const success = upgradeTower(selectedPlacedTower.id);
      if (success && playerStore.hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [selectedPlacedTower, upgradeTower, playerStore.hapticEnabled]);

  // Handle sell
  const handleSell = useCallback(() => {
    if (selectedPlacedTower) {
      sellTower(selectedPlacedTower.id);
      if (playerStore.hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  }, [selectedPlacedTower, sellTower, playerStore.hapticEnabled]);

  // Handle targeting change
  const handleTargetingChange = useCallback((mode: TargetingMode) => {
    if (selectedPlacedTower) {
      setTowerTargeting(selectedPlacedTower.id, mode);
    }
  }, [selectedPlacedTower, setTowerTargeting]);

  // Handle game over
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
    } catch (error) {
      console.error('Error saving game:', error);
    }
  }, [playerStore.playerId, gameStartTime, currentWave, score, enemiesKilled, towersPlaced]);

  useEffect(() => {
    if (isGameOver) {
      handleGameEnd();
    }
  }, [isGameOver]);

  // Handle watch ad for revive (limited to 1 per game)
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
    restartGame();
  }, [restartGame]);

  const handleExit = useCallback(() => {
    router.back();
  }, [router]);

  // Format timer display
  const formatTimer = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.headerButton}>
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

        <SpeedControls currentSpeed={gameSpeed} onSpeedChange={setGameSpeed} />

        <TouchableOpacity 
          onPress={isPaused ? resumeGame : pauseGame} 
          style={styles.headerButton}
        >
          <Ionicons name={isPaused ? 'play' : 'pause'} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Wave info bar */}
      {!waveInProgress && !isGameOver && isPlaying && (
        <View style={styles.waveInfoBar}>
          <Text style={styles.waveInfoText}>
            {currentWave === 0 ? 'Place towers to start!' : `Wave ${currentWave} complete!`}
          </Text>
          <TouchableOpacity style={styles.startWaveButton} onPress={handleStartWave}>
            <Text style={styles.startWaveText}>
              Start Wave {currentWave + 1} {autoWaveTimer > 0 ? `(${formatTimer(autoWaveTimer)})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Combo indicator */}
      {comboCount > 1 && (
        <View style={styles.comboIndicator}>
          <Text style={styles.comboText}>COMBO x{comboCount}!</Text>
        </View>
      )}

      {/* Zoom controls (only if arena expanded) */}
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

      {/* Tower options panel (when a placed tower is selected) */}
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
        />
      )}

      {/* Tower selection panel (when no tower is selected) */}
      {!selectedPlacedTower && (
        <TowerPanel
          onSelect={selectTower}
          selectedType={selectedTowerType}
          coins={coins}
          unlockedTowers={unlockedTowers}
          currentWave={currentWave}
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

      {/* Pause overlay */}
      {isPaused && !isGameOver && (
        <View style={styles.pauseOverlay}>
          <Text style={styles.pauseText}>PAUSED</Text>
          <TouchableOpacity style={styles.resumeButton} onPress={resumeGame}>
            <Text style={styles.resumeText}>Tap to Resume</Text>
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
    gap: 4,
  },
  speedButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#2a2a4e',
  },
  speedButtonActive: {
    backgroundColor: '#4A90D9',
  },
  speedButtonText: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
  },
  speedButtonTextActive: {
    color: '#fff',
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
  comboIndicator: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 100,
  },
  comboText: {
    color: '#1a1a2e',
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
  // Tower options panel styles
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
  towerOptionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
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
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 24,
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
