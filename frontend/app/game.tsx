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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useGameStore, PlacedTower, Enemy, Projectile } from '../src/stores/gameStore';
import { usePlayerStore } from '../src/stores/playerStore';
import { TOWERS, ENEMIES, GAME_CONFIG, getWaveConfig, TowerType, SKIN_COLORS } from '../src/constants/game';
import { gameApi, analyticsApi, rewardApi } from '../src/hooks/useApi';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Tower selection panel component
const TowerPanel = ({ onSelect, selectedType, coins, unlockedTowers }: {
  onSelect: (type: TowerType | null) => void;
  selectedType: TowerType | null;
  coins: number;
  unlockedTowers: TowerType[];
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
        const canAfford = coins >= tower.baseCost;
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
              {isUnlocked ? `${tower.baseCost}` : `Lvl ${tower.unlockLevel}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

// Helper function for tower icons
const getTowerIcon = (type: TowerType) => {
  const iconProps = { size: 20, color: '#fff' };
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

// Game board component
const GameBoard = ({ onCellPress }: { onCellPress: (x: number, y: number) => void }) => {
  const { towers, enemies, projectiles, path, gridCols, gridRows, cellSize, getTowerColor, selectedTowerType, canPlaceTower } = useGameStore();
  
  const boardWidth = gridCols * cellSize;
  const boardHeight = gridRows * cellSize;
  const scale = Math.min(
    (SCREEN_WIDTH - 20) / boardWidth,
    (SCREEN_HEIGHT - 280) / boardHeight
  );
  
  const scaledCellSize = cellSize * scale;

  // Create path set for easy lookup
  const pathSet = new Set(path.map(p => `${Math.floor(p.x)},${Math.floor(p.y)}`));

  return (
    <View style={[
      styles.gameBoard,
      { width: boardWidth * scale, height: boardHeight * scale }
    ]}>
      {/* Grid cells */}
      {Array.from({ length: gridRows }).map((_, row) =>
        Array.from({ length: gridCols }).map((_, col) => {
          const isPath = pathSet.has(`${col},${row}`);
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
                isPath && styles.pathCell,
                canPlace && styles.canPlaceCell,
              ]}
              onPress={() => onCellPress(col, row)}
              activeOpacity={0.7}
            />
          );
        })
      )}

      {/* Towers */}
      {towers.map((tower) => (
        <View
          key={tower.id}
          style={[
            styles.tower,
            {
              left: tower.position.x * scaledCellSize + scaledCellSize * 0.1,
              top: tower.position.y * scaledCellSize + scaledCellSize * 0.1,
              width: scaledCellSize * 0.8,
              height: scaledCellSize * 0.8,
              backgroundColor: getTowerColor(tower),
              borderWidth: tower.level > 0 ? 2 : 0,
              borderColor: tower.level === 1 ? '#C0C0C0' : tower.level === 2 ? '#FFD700' : tower.level >= 3 ? '#00FF88' : 'transparent',
            },
          ]}
        >
          {getTowerIcon(tower.type)}
        </View>
      ))}

      {/* Enemies */}
      {enemies.map((enemy) => {
        const enemyDef = ENEMIES[enemy.type];
        const healthPercent = enemy.health / enemy.maxHealth;
        const isSlowed = Date.now() < enemy.slowedUntil;
        
        return (
          <View
            key={enemy.id}
            style={[
              styles.enemy,
              {
                left: enemy.position.x * scaledCellSize + (scaledCellSize - enemyDef.size * scale) / 2,
                top: enemy.position.y * scaledCellSize + (scaledCellSize - enemyDef.size * scale) / 2,
                width: enemyDef.size * scale,
                height: enemyDef.size * scale,
                backgroundColor: isSlowed ? '#00D4FF' : enemyDef.color,
              },
            ]}
          >
            {/* Health bar */}
            <View style={styles.healthBarContainer}>
              <View style={[
                styles.healthBar,
                { width: `${healthPercent * 100}%` }
              ]} />
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
              left: proj.position.x * scaledCellSize + scaledCellSize / 2 - 3,
              top: proj.position.y * scaledCellSize + scaledCellSize / 2 - 3,
              backgroundColor: proj.isFreeze ? '#00D4FF' : proj.isSplash ? '#FF6B35' : '#FFD700',
            },
          ]}
        />
      ))}

      {/* Base indicator */}
      <View style={[
        styles.base,
        {
          left: path[path.length - 1].x * scaledCellSize,
          top: path[path.length - 1].y * scaledCellSize,
          width: scaledCellSize,
          height: scaledCellSize,
        }
      ]}>
        <Ionicons name="home" size={scaledCellSize * 0.6} color="#FFD700" />
      </View>
    </View>
  );
};

// Tower info modal
const TowerInfoModal = ({ tower, visible, onClose, onUpgrade, onSell }: {
  tower: PlacedTower | null;
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  onSell: () => void;
}) => {
  const { coins, getUpgradeCost, getSellValue } = useGameStore();
  
  if (!tower) return null;
  
  const towerDef = TOWERS[tower.type];
  const upgradeCost = getUpgradeCost(tower);
  const sellValue = getSellValue(tower);
  const canUpgrade = tower.level < towerDef.upgrades.length && coins >= upgradeCost;

  const currentStats = tower.level === 0 
    ? towerDef.baseStats 
    : { ...towerDef.baseStats, ...towerDef.upgrades[tower.level - 1] };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.towerInfoModal}>
          <Text style={styles.modalTitle}>{towerDef.name} (Lvl {tower.level + 1})</Text>
          <Text style={styles.modalDescription}>{towerDef.description}</Text>
          
          <View style={styles.statsContainer}>
            <Text style={styles.statText}>Damage: {currentStats.damage}</Text>
            <Text style={styles.statText}>Range: {currentStats.range}</Text>
            <Text style={styles.statText}>Fire Rate: {(1000 / currentStats.fireRate).toFixed(1)}/s</Text>
          </View>

          <View style={styles.modalButtons}>
            {tower.level < towerDef.upgrades.length && (
              <TouchableOpacity
                style={[styles.modalButton, styles.upgradeButton, !canUpgrade && styles.disabledButton]}
                onPress={onUpgrade}
                disabled={!canUpgrade}
              >
                <Text style={styles.modalButtonText}>Upgrade ({upgradeCost})</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.modalButton, styles.sellButton]}
              onPress={onSell}
            >
              <Text style={styles.modalButtonText}>Sell (+{sellValue})</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// Game Over Modal
const GameOverModal = ({ visible, wave, score, onRestart, onWatchAd, onExit }: {
  visible: boolean;
  wave: number;
  score: number;
  onRestart: () => void;
  onWatchAd: () => void;
  onExit: () => void;
}) => {
  const { hasRevive } = useGameStore();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.gameOverModal}>
          <Text style={styles.gameOverTitle}>GAME OVER</Text>
          <Text style={styles.gameOverWave}>Wave {wave}</Text>
          <Text style={styles.gameOverScore}>Score: {score}</Text>
          
          <TouchableOpacity style={styles.watchAdButton} onPress={onWatchAd}>
            <Ionicons name="videocam" size={20} color="#fff" />
            <Text style={styles.watchAdText}>Watch Ad to Revive</Text>
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

export default function GameScreen() {
  const router = useRouter();
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const waveSpawnRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  
  const [selectedTower, setSelectedTower] = useState<PlacedTower | null>(null);
  const [showTowerInfo, setShowTowerInfo] = useState(false);
  
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
    equippedSkins,
    arenaExpanded,
    selectedTowerType,
    gameStartTime,
    path,
    selectTower,
    placeTower,
    upgradeTower,
    sellTower,
    startGame,
    pauseGame,
    resumeGame,
    restartGame,
    startWave,
    endWave,
    spawnEnemy,
    moveEnemies,
    moveProjectiles,
    fireProjectile,
    canPlaceTower,
    getTowerAt,
    getEnemiesInRange,
    useRevive,
    grantRevive,
  } = gameStore;

  // Initialize game on mount
  useEffect(() => {
    startGame(
      playerStore.unlockedTowers as TowerType[],
      playerStore.equippedSkins,
      playerStore.arenaExpanded
    );
    
    // Log analytics
    if (playerStore.playerId) {
      analyticsApi.log({
        player_id: playerStore.playerId,
        event_type: 'game_start',
      }).catch(() => {});
    }
    
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      if (waveSpawnRef.current) clearTimeout(waveSpawnRef.current);
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

    gameLoopRef.current = setInterval(() => {
      const now = Date.now();
      const deltaTime = Math.min(now - lastUpdateRef.current, 100);
      lastUpdateRef.current = now;

      // Move enemies
      moveEnemies(deltaTime);

      // Move projectiles
      moveProjectiles(deltaTime);

      // Tower firing logic
      const currentTowers = gameStore.towers;
      const currentEnemies = gameStore.enemies;
      
      currentTowers.forEach(tower => {
        const towerDef = TOWERS[tower.type];
        const stats = tower.level === 0 
          ? towerDef.baseStats 
          : { ...towerDef.baseStats, ...towerDef.upgrades[tower.level - 1] };
        
        // Check if can fire
        if (now - tower.lastFireTime < stats.fireRate) return;
        
        // Find enemies in range
        const enemiesInRange = currentEnemies.filter(enemy => {
          const dx = enemy.position.x - tower.position.x;
          const dy = enemy.position.y - tower.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist * gameStore.cellSize <= stats.range;
        });
        
        if (enemiesInRange.length > 0) {
          // Target enemy closest to base (furthest along path)
          const target = enemiesInRange.reduce((a, b) => 
            a.pathIndex > b.pathIndex ? a : b
          );
          fireProjectile(tower, target.id);
        }
      });

      // Check wave completion
      if (waveInProgress && currentEnemies.length === 0) {
        endWave();
      }
    }, 33); // ~30 FPS

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [isPlaying, isPaused]);

  // Auto-start first wave
  useEffect(() => {
    if (isPlaying && !waveInProgress && currentWave === 0 && enemies.length === 0) {
      setTimeout(() => startWave(), 2000);
    }
  }, [isPlaying, waveInProgress, currentWave, enemies.length]);

  // Wave spawning
  useEffect(() => {
    if (!waveInProgress || !isPlaying) return;

    const waveConfig = getWaveConfig(currentWave);
    let spawnQueue: { type: string; delay: number }[] = [];
    let delay = 0;

    waveConfig.enemies.forEach(({ type, count }) => {
      for (let i = 0; i < count; i++) {
        spawnQueue.push({ type, delay });
        delay += GAME_CONFIG.ENEMY_SPAWN_DELAY;
      }
    });

    spawnQueue.forEach(({ type, delay }) => {
      const timeoutId = setTimeout(() => {
        if (gameStore.isPlaying && !gameStore.isPaused) {
          spawnEnemy(
            type as any,
            waveConfig.healthMultiplier,
            waveConfig.speedMultiplier
          );
        }
      }, delay);
    });

    return () => {
      // Cleanup timeouts on unmount
    };
  }, [waveInProgress, currentWave]);

  // Auto-start next wave
  useEffect(() => {
    if (isPlaying && !waveInProgress && currentWave > 0 && enemies.length === 0) {
      const timeout = setTimeout(() => {
        if (gameStore.isPlaying) {
          startWave();
        }
      }, GAME_CONFIG.WAVE_DELAY);
      
      return () => clearTimeout(timeout);
    }
  }, [isPlaying, waveInProgress, enemies.length, currentWave]);

  // Handle cell press
  const handleCellPress = useCallback((x: number, y: number) => {
    if (playerStore.hapticEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const existingTower = getTowerAt({ x, y });
    
    if (existingTower) {
      setSelectedTower(existingTower);
      setShowTowerInfo(true);
      selectTower(null);
    } else if (selectedTowerType && canPlaceTower({ x, y })) {
      const success = placeTower({ x, y });
      if (success && playerStore.hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [selectedTowerType, getTowerAt, canPlaceTower, placeTower, playerStore.hapticEnabled]);

  // Handle upgrade
  const handleUpgrade = useCallback(() => {
    if (selectedTower) {
      const success = upgradeTower(selectedTower.id);
      if (success) {
        setSelectedTower({ ...selectedTower, level: selectedTower.level + 1 });
        if (playerStore.hapticEnabled) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    }
  }, [selectedTower, upgradeTower, playerStore.hapticEnabled]);

  // Handle sell
  const handleSell = useCallback(() => {
    if (selectedTower) {
      sellTower(selectedTower.id);
      setShowTowerInfo(false);
      setSelectedTower(null);
      if (playerStore.hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  }, [selectedTower, sellTower, playerStore.hapticEnabled]);

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

      // Update player store with new data
      if (response.data) {
        playerStore.addXp(response.data.xp_earned);
        playerStore.setCoins(response.data.new_balance || playerStore.coins);
        if (response.data.newly_unlocked_towers?.length > 0) {
          response.data.newly_unlocked_towers.forEach((t: TowerType) => {
            playerStore.unlockTower(t);
          });
        }
      }

      playerStore.recordGame(currentWave);
      playerStore.incrementGamesPlayedSinceAd();
    } catch (error) {
      console.error('Error saving game:', error);
    }
  }, [playerStore.playerId, gameStartTime, currentWave, score, enemiesKilled, towersPlaced]);

  // Effect for game over
  useEffect(() => {
    if (isGameOver) {
      handleGameEnd();
    }
  }, [isGameOver]);

  // Handle watch ad for revive
  const handleWatchAdForRevive = useCallback(async () => {
    // Simulate ad watching (in production, integrate with AdMob)
    Alert.alert(
      'Watch Ad',
      'Watch a short ad to revive with 50% health?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Watch',
          onPress: async () => {
            // Simulate ad completion
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

  // Handle restart
  const handleRestart = useCallback(() => {
    restartGame();
  }, [restartGame]);

  // Handle exit
  const handleExit = useCallback(() => {
    router.back();
  }, [router]);

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

        <TouchableOpacity 
          onPress={isPaused ? resumeGame : pauseGame} 
          style={styles.headerButton}
        >
          <Ionicons name={isPaused ? 'play' : 'pause'} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Combo indicator */}
      {comboCount > 1 && (
        <View style={styles.comboIndicator}>
          <Text style={styles.comboText}>COMBO x{comboCount}!</Text>
        </View>
      )}

      {/* Game board */}
      <View style={styles.boardContainer}>
        <GameBoard onCellPress={handleCellPress} />
      </View>

      {/* Wave countdown */}
      {!waveInProgress && currentWave > 0 && enemies.length === 0 && (
        <View style={styles.waveCountdown}>
          <Text style={styles.waveCountdownText}>Next wave incoming...</Text>
        </View>
      )}

      {/* Tower selection panel */}
      <TowerPanel
        onSelect={selectTower}
        selectedType={selectedTowerType}
        coins={coins}
        unlockedTowers={unlockedTowers}
      />

      {/* Tower info modal */}
      <TowerInfoModal
        tower={selectedTower}
        visible={showTowerInfo}
        onClose={() => setShowTowerInfo(false)}
        onUpgrade={handleUpgrade}
        onSell={handleSell}
      />

      {/* Game over modal */}
      <GameOverModal
        visible={isGameOver}
        wave={currentWave}
        score={score}
        onRestart={handleRestart}
        onWatchAd={handleWatchAdForRevive}
        onExit={handleExit}
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#16213e',
  },
  headerButton: {
    padding: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  comboIndicator: {
    position: 'absolute',
    top: 100,
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
    fontSize: 18,
  },
  boardContainer: {
    flex: 1,
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
    backgroundColor: 'rgba(74, 144, 217, 0.3)',
    borderColor: '#4A90D9',
  },
  tower: {
    position: 'absolute',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enemy: {
    position: 'absolute',
    borderRadius: 50,
  },
  healthBarContainer: {
    position: 'absolute',
    top: -6,
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
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  base: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 4,
  },
  waveCountdown: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  waveCountdownText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  towerPanel: {
    maxHeight: 100,
    backgroundColor: '#16213e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  towerPanelContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  towerButton: {
    width: 70,
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    marginRight: 8,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  towerName: {
    color: '#fff',
    fontSize: 10,
    textAlign: 'center',
  },
  towerCost: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  towerCostRed: {
    color: '#E74C3C',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  towerInfoModal: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalDescription: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  statsContainer: {
    marginBottom: 16,
  },
  statText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  modalButtons: {
    gap: 8,
  },
  modalButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeButton: {
    backgroundColor: '#4A90D9',
  },
  sellButton: {
    backgroundColor: '#E74C3C',
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
    fontSize: 16,
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
