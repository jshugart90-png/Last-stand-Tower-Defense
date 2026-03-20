import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore, ARENA_EXPANSION_PRICE_USD } from '../src/stores/playerStore';
import { skinsApi, rewardApi, purchaseApi } from '../src/hooks/useApi';
import { 
  TOWERS, TowerType, SKIN_COLORS, TOWER_UNLOCK_PRICES, 
  SPEED_UNLOCK_PRICES, GameSpeed, getShopUpgradeCost 
} from '../src/constants/game';
import { 
  isRewardedAdReady, showRewardedAd, loadRewardedAd, 
  isNativeAdsAvailable, isAdsInitialized 
} from '../src/services/adService';
import { 
  IAP_PRODUCTS, IAP_PRICES, COIN_PACK_AMOUNTS, requestPurchase, 
  isIAPAvailable, isIAPInitialized, restorePurchases 
} from '../src/services/iapService';
import BannerAdComponent from '../src/components/BannerAdComponent';

interface Skin {
  id: string;
  name: string;
  price: number;
  price_type: string;
  color: string;
}

// Tower icon helper
const getTowerIcon = (type: TowerType, size = 20, color = '#fff') => {
  switch (type) {
    case 'machine_gun':
      return <MaterialCommunityIcons name="pistol" size={size} color={color} />;
    case 'sniper':
      return <MaterialCommunityIcons name="crosshairs-gps" size={size} color={color} />;
    case 'splash':
      return <MaterialCommunityIcons name="bomb" size={size} color={color} />;
    case 'freeze':
      return <MaterialCommunityIcons name="snowflake" size={size} color={color} />;
    case 'missile':
      return <MaterialCommunityIcons name="rocket-launch" size={size} color={color} />;
    case 'laser':
      return <MaterialCommunityIcons name="flashlight" size={size} color={color} />;
    default:
      return <Ionicons name="help" size={size} color={color} />;
  }
};

export default function ShopScreen() {
  const router = useRouter();
  const playerStore = usePlayerStore();
  const [skins, setSkins] = useState<Skin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'towers' | 'speeds' | 'coins' | 'arena' | 'skins'>('towers');
  const [adLoading, setAdLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  useEffect(() => {
    loadSkins();
    // Pre-load rewarded ad when shop opens
    if (isNativeAdsAvailable() && isAdsInitialized()) {
      loadRewardedAd();
    }
  }, []);

  const loadSkins = async () => {
    try {
      const response = await skinsApi.getAll();
      setSkins(response.data);
    } catch (error) {
      console.error('Error loading skins:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle tower unlock purchase
  const handlePurchaseTower = (towerType: TowerType) => {
    const price = TOWER_UNLOCK_PRICES[towerType];
    const towerDef = TOWERS[towerType];
    
    if (playerStore.isTowerUnlocked(towerType)) {
      Alert.alert('Already Owned', `You already own the ${towerDef.name}!`);
      return;
    }
    
    if (playerStore.coins < price) {
      Alert.alert(
        'Not Enough Coins',
        `You need ${price} coins but only have ${playerStore.coins}.\n\nEarn coins by playing games, watching ads, or buying coin packs!`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Coins', onPress: () => setSelectedTab('coins') },
          { text: 'Watch Ad', onPress: handleWatchAdForCoins },
        ]
      );
      return;
    }
    
    // Execute purchase directly (price is shown on button)
    const success = playerStore.purchaseTower(towerType);
    if (success) {
      Alert.alert('Unlocked!', `${towerDef.name} unlocked! You can now use it in battle.`);
    } else {
      Alert.alert('Error', 'Unlock failed. Please try again.');
    }
  };

  // Handle tower upgrade purchase (permanent stat boost)
  const handleUpgradeTower = (towerType: TowerType) => {
    const towerDef = TOWERS[towerType];
    const currentLevel = playerStore.getTowerUpgradeLevel(towerType);
    const price = playerStore.getTowerUpgradePrice(towerType);
    
    if (!playerStore.isTowerUnlocked(towerType)) {
      Alert.alert('Tower Locked', `You need to unlock ${towerDef.name} first!`);
      return;
    }
    
    if (playerStore.coins < price) {
      Alert.alert(
        'Not Enough Coins',
        `You need ${price} coins but only have ${playerStore.coins}.\n\nEarn coins by playing games, watching ads, or buying coin packs!`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Coins', onPress: () => setSelectedTab('coins') },
          { text: 'Watch Ad', onPress: handleWatchAdForCoins },
        ]
      );
      return;
    }
    
    // Execute purchase directly (price is already shown on button)
    const success = playerStore.purchaseTowerUpgrade(towerType);
    if (success) {
      Alert.alert('Upgraded!', `${towerDef.name} upgraded to Level ${currentLevel + 2}!\n\n+5% damage, +2% range permanently.`);
    } else {
      Alert.alert('Error', 'Upgrade failed. Please try again.');
    }
  };

  // Handle speed unlock purchase
  const handlePurchaseSpeed = (speed: GameSpeed) => {
    const price = SPEED_UNLOCK_PRICES[speed];
    
    if (playerStore.isSpeedUnlocked(speed)) {
      Alert.alert('Already Owned', `You already have ${speed}x speed unlocked!`);
      return;
    }
    
    if (playerStore.coins < price) {
      Alert.alert(
        'Not Enough Coins',
        `You need ${price} coins but only have ${playerStore.coins}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Coins', onPress: () => setSelectedTab('coins') },
        ]
      );
      return;
    }
    
    // Execute purchase directly
    const success = playerStore.purchaseSpeed(speed);
    if (success) {
      Alert.alert('Unlocked!', `${speed}x speed unlocked!`);
    } else {
      Alert.alert('Error', 'Unlock failed. Please try again.');
    }
  };

  // Handle arena expansion (real money via IAP)
  const handlePurchaseArenaExpansion = async () => {
    Alert.alert(
      'Arena Expansion - $2.99',
      `Purchase arena expansion for $${ARENA_EXPANSION_PRICE_USD}?\n\nThis will add 1 row of cells to each side of your battlefield.\n\nCurrent expansions: ${playerStore.arenaExpansions}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Buy for $${ARENA_EXPANSION_PRICE_USD}`,
          onPress: async () => {
            if (isIAPAvailable() && isIAPInitialized()) {
              // Real IAP flow
              setPurchaseLoading(true);
              try {
                const result = await requestPurchase(IAP_PRODUCTS.ARENA_EXPANSION);
                if (result.success) {
                  playerStore.addArenaExpansion();
                  // Report to backend
                  if (playerStore.playerId) {
                    try {
                      await purchaseApi.process({
                        player_id: playerStore.playerId,
                        item_type: 'arena_expansion',
                        item_id: IAP_PRODUCTS.ARENA_EXPANSION,
                      });
                    } catch (e) {
                      console.error('Backend purchase report failed:', e);
                    }
                  }
                  Alert.alert('Success!', `Arena expanded! Total expansions: ${playerStore.arenaExpansions + 1}`);
                } else if (result.error && result.error !== 'Purchase cancelled') {
                  Alert.alert('Purchase Failed', result.error);
                }
              } catch (e) {
                Alert.alert('Error', 'Purchase failed. Please try again.');
              } finally {
                setPurchaseLoading(false);
              }
            } else {
              // Simulated purchase for development/testing
              Alert.alert(
                'Development Mode',
                'IAP requires a native build. For testing, the expansion will be granted.',
                [
                  {
                    text: 'Simulate Purchase',
                    onPress: () => {
                      playerStore.addArenaExpansion();
                      Alert.alert('Success!', `Arena expanded! Total expansions: ${playerStore.arenaExpansions + 1}`);
                    }
                  },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
            }
          },
        },
      ]
    );
  };


  // Handle Remove Ads purchase (IAP)
  const handlePurchaseRemoveAds = async () => {
    if (playerStore.premium) {
      Alert.alert('Already Purchased', 'You already have ad-free access!');
      return;
    }

    Alert.alert(
      'Remove Ads - $2.99',
      'Remove all banner ads permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy $2.99',
          onPress: async () => {
            if (isIAPAvailable() && isIAPInitialized()) {
              setPurchaseLoading(true);
              try {
                const result = await requestPurchase(IAP_PRODUCTS.REMOVE_ADS);
                if (result.success) {
                  playerStore.syncFromServer({ premium: true });
                  if (playerStore.playerId) {
                    try {
                      await purchaseApi.process({
                        player_id: playerStore.playerId,
                        item_type: 'premium',
                        item_id: IAP_PRODUCTS.REMOVE_ADS,
                      });
                    } catch (e) {
                      console.error('Backend purchase report failed:', e);
                    }
                  }
                  Alert.alert('Success!', 'All ads have been removed. Thank you!');
                } else if (result.error && result.error !== 'Purchase cancelled') {
                  Alert.alert('Purchase Failed', result.error);
                }
              } catch (e) {
                Alert.alert('Error', 'Purchase failed. Please try again.');
              } finally {
                setPurchaseLoading(false);
              }
            } else {
              Alert.alert(
                'Development Mode',
                'IAP requires a native build. Simulate ad removal?',
                [
                  {
                    text: 'Simulate',
                    onPress: () => {
                      playerStore.syncFromServer({ premium: true });
                      Alert.alert('Success!', 'Ads removed! (Simulated)');
                    }
                  },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
            }
          },
        },
      ]
    );
  };

  // Handle restore purchases
  const handleRestorePurchases = async () => {
    if (isIAPAvailable() && isIAPInitialized()) {
      setPurchaseLoading(true);
      try {
        const purchases = await restorePurchases();
        let restoredSomething = false;

        for (const purchase of purchases) {
          if (purchase.productId === IAP_PRODUCTS.REMOVE_ADS) {
            playerStore.syncFromServer({ premium: true });
            restoredSomething = true;
          }
          if (purchase.productId === IAP_PRODUCTS.ARENA_EXPANSION) {
            playerStore.addArenaExpansion();
            restoredSomething = true;
          }
        }

        if (restoredSomething) {
          Alert.alert('Restored!', 'Your purchases have been restored.');
        } else {
          Alert.alert('No Purchases', 'No previous purchases found to restore.');
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to restore purchases. Please try again.');
      } finally {
        setPurchaseLoading(false);
      }
    } else {
      Alert.alert('Not Available', 'Purchase restoration requires a native build.');
    }
  };


  // Handle coin pack purchase (IAP)
  const handlePurchaseCoinPack = async (productId: string) => {
    const coinAmount = COIN_PACK_AMOUNTS[productId];
    const price = IAP_PRICES[productId];
    
    if (!coinAmount) return;

    if (isIAPAvailable() && isIAPInitialized()) {
      // Real IAP flow
      setPurchaseLoading(true);
      try {
        const result = await requestPurchase(productId);
        if (result.success) {
          playerStore.addCoins(coinAmount);
          if (playerStore.playerId) {
            try {
              await purchaseApi.process({
                player_id: playerStore.playerId,
                item_type: 'coins',
                item_id: productId,
              });
            } catch (e) {
              console.error('Backend purchase report failed:', e);
            }
          }
          Alert.alert('Coins Added!', `${coinAmount.toLocaleString()} coins have been added to your balance!`);
        } else if (result.error && result.error !== 'Purchase cancelled') {
          Alert.alert('Purchase Failed', result.error);
        }
      } catch (e) {
        Alert.alert('Error', 'Purchase failed. Please try again.');
      } finally {
        setPurchaseLoading(false);
      }
    } else {
      // Simulated purchase for development/testing
      Alert.alert(
        `Buy ${coinAmount.toLocaleString()} Coins`,
        `Purchase ${coinAmount.toLocaleString()} coins for ${price}?\n\n(IAP requires a native build - simulating for testing)`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Simulate Purchase',
            onPress: () => {
              playerStore.addCoins(coinAmount);
              Alert.alert('Coins Added!', `${coinAmount.toLocaleString()} coins added! (Simulated)`);
            }
          },
        ]
      );
    }
  };

  // Handle watch ad for coins (AdMob Rewarded Ad)
  const handleWatchAdForCoins = async () => {
    const nativeAdsReady = isNativeAdsAvailable() && isAdsInitialized();
    
    if (nativeAdsReady && isRewardedAdReady()) {
      // Show real rewarded ad
      setAdLoading(true);
      try {
        const reward = await showRewardedAd();
        if (reward) {
          // Ad watched successfully - grant coins
          playerStore.addCoins(25);
          Alert.alert('Reward!', 'You earned 25 coins!');
          
          if (playerStore.playerId) {
            try {
              await rewardApi.claim({
                player_id: playerStore.playerId,
                reward_type: 'coins',
                ad_type: 'rewarded',
              });
            } catch (e) {
              console.error('Error claiming reward:', e);
            }
          }
          // Pre-load next ad
          loadRewardedAd();
        } else {
          Alert.alert('No Reward', 'You need to watch the full ad to earn coins.');
        }
      } catch (e) {
        console.error('Error showing ad:', e);
        Alert.alert('Error', 'Failed to show ad. Please try again.');
      } finally {
        setAdLoading(false);
      }
    } else if (nativeAdsReady && !isRewardedAdReady()) {
      // Ad not loaded yet - try to load
      setAdLoading(true);
      Alert.alert('Loading Ad', 'Please wait while we load an ad...');
      const loaded = await loadRewardedAd();
      setAdLoading(false);
      if (loaded) {
        // Retry showing
        handleWatchAdForCoins();
      } else {
        Alert.alert('Ad Unavailable', 'No ads available right now. Please try again later.');
      }
    } else {
      // Non-native environment (web/Expo Go) - simulate for testing
      Alert.alert(
        'Watch Ad',
        'Rewarded ads require a native build.\n\nSimulate watching ad for 25 coins?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Simulate',
            onPress: async () => {
              playerStore.addCoins(25);
              Alert.alert('Reward!', 'You earned 25 coins! (Simulated)');
              
              if (playerStore.playerId) {
                try {
                  await rewardApi.claim({
                    player_id: playerStore.playerId,
                    reward_type: 'coins',
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
  };

  // Render tower unlock/upgrade card
  const renderTowerCard = (towerType: TowerType) => {
    const tower = TOWERS[towerType];
    const isUnlocked = playerStore.isTowerUnlocked(towerType);
    const unlockPrice = TOWER_UNLOCK_PRICES[towerType];
    const upgradeLevel = playerStore.getTowerUpgradeLevel(towerType);
    const upgradePrice = playerStore.getTowerUpgradePrice(towerType);
    const canAffordUnlock = playerStore.coins >= unlockPrice;
    const canAffordUpgrade = playerStore.coins >= upgradePrice;

    return (
      <View key={towerType} style={styles.towerCard}>
        <View style={[styles.towerIconLarge, { backgroundColor: tower.color }]}>
          {getTowerIcon(towerType, 28)}
        </View>
        
        <View style={styles.towerInfo}>
          <Text style={styles.towerName}>{tower.name}</Text>
          <Text style={styles.towerDesc} numberOfLines={1}>{tower.description}</Text>
          {isUnlocked && (
            <Text style={styles.upgradeLevel}>Shop Level: {upgradeLevel + 1}</Text>
          )}
        </View>
        
        <View style={styles.towerActions}>
          {!isUnlocked ? (
            <TouchableOpacity
              style={[styles.unlockButton, !canAffordUnlock && styles.disabledButton]}
              onPress={() => handlePurchaseTower(towerType)}
            >
              <FontAwesome5 name="coins" size={12} color="#FFD700" />
              <Text style={styles.buttonText}>{unlockPrice}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.upgradeButton, !canAffordUpgrade && styles.disabledButton]}
              onPress={() => handleUpgradeTower(towerType)}
            >
              <Ionicons name="arrow-up" size={14} color="#fff" />
              <Text style={styles.buttonText}>{upgradePrice}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Render speed unlock card
  const renderSpeedCard = (speed: GameSpeed) => {
    const price = SPEED_UNLOCK_PRICES[speed];
    const isUnlocked = playerStore.isSpeedUnlocked(speed);
    const canAfford = playerStore.coins >= price;

    return (
      <View key={speed} style={styles.speedCard}>
        <View style={[styles.speedIcon, isUnlocked && styles.speedIconUnlocked]}>
          <Text style={styles.speedText}>{speed}x</Text>
        </View>
        
        <View style={styles.speedInfo}>
          <Text style={styles.speedTitle}>{speed}x Speed</Text>
          <Text style={styles.speedDesc}>
            {speed === 1 ? 'Normal speed' : `${speed} times faster gameplay`}
          </Text>
        </View>
        
        {price === 0 ? (
          <View style={styles.freeTag}>
            <Text style={styles.freeText}>FREE</Text>
          </View>
        ) : isUnlocked ? (
          <View style={styles.ownedTag}>
            <Ionicons name="checkmark-circle" size={24} color="#2ECC71" />
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.buySpeedButton, !canAfford && styles.disabledButton]}
            onPress={() => handlePurchaseSpeed(speed)}
          >
            <FontAwesome5 name="coins" size={12} color="#FFD700" />
            <Text style={styles.buttonText}>{price}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shop</Text>
        <View style={styles.coinsDisplay}>
          <FontAwesome5 name="coins" size={16} color="#FFD700" />
          <Text style={styles.coinsText}>{playerStore.coins}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'towers' && styles.tabActive]}
          onPress={() => setSelectedTab('towers')}
        >
          <Text style={[styles.tabText, selectedTab === 'towers' && styles.tabTextActive]}>
            Towers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'coins' && styles.tabActive]}
          onPress={() => setSelectedTab('coins')}
        >
          <Text style={[styles.tabText, selectedTab === 'coins' && styles.tabTextActive]}>
            Coins
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'speeds' && styles.tabActive]}
          onPress={() => setSelectedTab('speeds')}
        >
          <Text style={[styles.tabText, selectedTab === 'speeds' && styles.tabTextActive]}>
            Speed
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'arena' && styles.tabActive]}
          onPress={() => setSelectedTab('arena')}
        >
          <Text style={[styles.tabText, selectedTab === 'arena' && styles.tabTextActive]}>
            Arena
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'skins' && styles.tabActive]}
          onPress={() => setSelectedTab('skins')}
        >
          <Text style={[styles.tabText, selectedTab === 'skins' && styles.tabTextActive]}>
            Skins
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Towers Tab */}
        {selectedTab === 'towers' && (
          <View>
            <Text style={styles.sectionTitle}>Unlock & Upgrade Towers</Text>
            <Text style={styles.sectionSubtitle}>
              Unlock new towers and permanently upgrade their stats
            </Text>
            
            {(Object.keys(TOWERS) as TowerType[]).map(renderTowerCard)}
          </View>
        )}

        {/* Coins Tab */}
        {selectedTab === 'coins' && (
          <View>
            <Text style={styles.sectionTitle}>Buy Coins</Text>
            <Text style={styles.sectionSubtitle}>
              Purchase coins to unlock towers, upgrades, and more
            </Text>

            <View style={styles.coinPacksContainer}>
              {/* Small Pack */}
              <TouchableOpacity 
                style={styles.coinPackCard}
                onPress={() => handlePurchaseCoinPack(IAP_PRODUCTS.COINS_500)}
                disabled={purchaseLoading}
              >
                <View style={styles.coinPackIconWrap}>
                  <FontAwesome5 name="coins" size={24} color="#FFD700" />
                </View>
                <Text style={styles.coinPackAmount}>500</Text>
                <Text style={styles.coinPackLabel}>Coins</Text>
                <View style={styles.coinPackPriceTag}>
                  {purchaseLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.coinPackPrice}>$0.99</Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Medium Pack */}
              <TouchableOpacity 
                style={[styles.coinPackCard, styles.coinPackPopular]}
                onPress={() => handlePurchaseCoinPack(IAP_PRODUCTS.COINS_2000)}
                disabled={purchaseLoading}
              >
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>POPULAR</Text>
                </View>
                <View style={styles.coinPackIconWrap}>
                  <FontAwesome5 name="coins" size={28} color="#FFD700" />
                </View>
                <Text style={styles.coinPackAmount}>2,000</Text>
                <Text style={styles.coinPackLabel}>Coins</Text>
                <View style={[styles.coinPackPriceTag, styles.coinPackPricePopular]}>
                  {purchaseLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.coinPackPrice}>$1.99</Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Large Pack */}
              <TouchableOpacity 
                style={styles.coinPackCard}
                onPress={() => handlePurchaseCoinPack(IAP_PRODUCTS.COINS_5000)}
                disabled={purchaseLoading}
              >
                <View style={styles.coinPackIconWrap}>
                  <FontAwesome5 name="coins" size={32} color="#FFD700" />
                  <FontAwesome5 name="coins" size={18} color="#FFD700" style={{ position: 'absolute', top: -4, right: -8 }} />
                </View>
                <Text style={styles.coinPackAmount}>5,000</Text>
                <Text style={styles.coinPackLabel}>Coins</Text>
                <View style={styles.coinPackPriceTag}>
                  {purchaseLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.coinPackPrice}>$4.99</Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Mega Pack */}
              <TouchableOpacity 
                style={[styles.coinPackCard, styles.coinPackMega]}
                onPress={() => handlePurchaseCoinPack(IAP_PRODUCTS.COINS_12000)}
                disabled={purchaseLoading}
              >
                <View style={styles.bestValueBadge}>
                  <Text style={styles.bestValueBadgeText}>BEST VALUE</Text>
                </View>
                <View style={styles.coinPackIconWrap}>
                  <FontAwesome5 name="gem" size={32} color="#E74C3C" />
                </View>
                <Text style={styles.coinPackAmount}>12,000</Text>
                <Text style={styles.coinPackLabel}>Coins</Text>
                <View style={[styles.coinPackPriceTag, styles.coinPackPriceMega]}>
                  {purchaseLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.coinPackPrice}>$9.99</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            <Text style={styles.realMoneyNote}>
              * Real money purchases (In-App Purchase)
            </Text>
          </View>
        )}

        {/* Speed Tab */}
        {selectedTab === 'speeds' && (
          <View>
            <Text style={styles.sectionTitle}>Game Speed</Text>
            <Text style={styles.sectionSubtitle}>
              Unlock faster game speeds for quicker gameplay
            </Text>
            
            {([1, 2, 3, 5, 10] as GameSpeed[]).map(renderSpeedCard)}
          </View>
        )}

        {/* Arena Tab */}
        {selectedTab === 'arena' && (
          <View>
            <Text style={styles.sectionTitle}>Arena Expansion</Text>
            <Text style={styles.sectionSubtitle}>
              Expand your battlefield for more tower placement options
            </Text>
            
            <View style={styles.arenaCard}>
              <View style={styles.arenaInfo}>
                <MaterialCommunityIcons name="arrow-expand-all" size={48} color="#9B59B6" />
                <View style={styles.arenaDetails}>
                  <Text style={styles.arenaTitle}>Expand Arena</Text>
                  <Text style={styles.arenaDesc}>
                    Current expansions: {playerStore.arenaExpansions}
                  </Text>
                  <Text style={styles.arenaDesc}>
                    Grid size: {10 + playerStore.arenaExpansions * 2} x {14 + playerStore.arenaExpansions * 2}
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.arenaButton}
                onPress={handlePurchaseArenaExpansion}
              >
                <Text style={styles.arenaPriceText}>${ARENA_EXPANSION_PRICE_USD}</Text>
              </TouchableOpacity>
              
              <Text style={styles.realMoneyNote}>
                * Real money purchase (In-App Purchase)
              </Text>
            </View>
            
            {/* Premium upgrade - Remove Ads */}
            <View style={styles.premiumCard}>
              <Ionicons name="star" size={32} color="#FFD700" />
              <View style={styles.premiumInfo}>
                <Text style={styles.premiumTitle}>Remove Ads</Text>
                <Text style={styles.premiumDesc}>Remove all banner ads permanently</Text>
              </View>
              <TouchableOpacity 
                style={styles.premiumButton}
                onPress={handlePurchaseRemoveAds}
                disabled={purchaseLoading || playerStore.premium}
              >
                {playerStore.premium ? (
                  <Text style={styles.premiumPriceText}>Owned ✓</Text>
                ) : purchaseLoading ? (
                  <ActivityIndicator size="small" color="#1a1a2e" />
                ) : (
                  <Text style={styles.premiumPriceText}>{IAP_PRICES[IAP_PRODUCTS.REMOVE_ADS]}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Restore Purchases */}
            <TouchableOpacity 
              style={styles.restoreButton}
              onPress={handleRestorePurchases}
            >
              <Ionicons name="refresh" size={16} color="#4A90D9" />
              <Text style={styles.restoreText}>Restore Purchases</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Skins Tab */}
        {selectedTab === 'skins' && (
          <View>
            <Text style={styles.sectionTitle}>Tower Skins</Text>
            <Text style={styles.sectionSubtitle}>
              Customize your towers with unique colors
            </Text>
            
            {loading ? (
              <ActivityIndicator size="large" color="#4A90D9" style={styles.loader} />
            ) : (
              <View style={styles.skinsGrid}>
                {skins.map((skin) => {
                  const isOwned = playerStore.unlockedSkins.includes(skin.id);
                  return (
                    <View key={skin.id} style={styles.skinCard}>
                      <View style={[styles.skinPreview, { backgroundColor: skin.color }]} />
                      <Text style={styles.skinName}>{skin.name}</Text>
                      {isOwned ? (
                        <View style={styles.ownedBadge}>
                          <Text style={styles.ownedText}>Owned</Text>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.skinBuyButton}>
                          <FontAwesome5 name="coins" size={10} color="#FFD700" />
                          <Text style={styles.skinPrice}>{skin.price}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Watch Ad for Coins */}
        <View style={styles.adSection}>
          <TouchableOpacity 
            style={[styles.watchAdButton, adLoading && styles.disabledButton]} 
            onPress={handleWatchAdForCoins}
            disabled={adLoading}
          >
            {adLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="videocam" size={24} color="#fff" />
            )}
            <Text style={styles.watchAdText}>
              {adLoading ? 'Loading Ad...' : 'Watch Ad for 25 Coins'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Banner Ad at bottom */}
      <BannerAdComponent isPremium={playerStore.premium} />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  coinsDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2a2a4e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  coinsText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#4A90D9',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 16,
  },
  // Tower cards
  towerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  towerIconLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  towerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  towerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  towerDesc: {
    color: '#888',
    fontSize: 12,
  },
  upgradeLevel: {
    color: '#00FF88',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },
  towerActions: {
    marginLeft: 8,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9B59B6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A90D9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Speed cards
  speedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  speedIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a2a4e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedIconUnlocked: {
    backgroundColor: '#4A90D9',
  },
  speedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  speedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  speedTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  speedDesc: {
    color: '#888',
    fontSize: 12,
  },
  freeTag: {
    backgroundColor: '#2ECC71',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  freeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  ownedTag: {
    paddingHorizontal: 8,
  },
  buySpeedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9B59B6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  // Arena
  arenaCard: {
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  arenaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  arenaDetails: {
    marginLeft: 16,
    flex: 1,
  },
  arenaTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  arenaDesc: {
    color: '#888',
    fontSize: 14,
  },
  arenaButton: {
    backgroundColor: '#2ECC71',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  arenaPriceText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  realMoneyNote: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  premiumInfo: {
    flex: 1,
    marginLeft: 12,
  },
  premiumTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  premiumDesc: {
    color: '#888',
    fontSize: 12,
  },
  premiumButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  premiumPriceText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Skins
  loader: {
    marginTop: 32,
  },
  skinsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  skinCard: {
    width: '30%',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  skinPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
  },
  skinName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  ownedBadge: {
    backgroundColor: '#2ECC71',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ownedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  skinBuyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9B59B6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  skinPrice: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Ad section
  adSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
  },
  watchAdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E67E22',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  watchAdText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
    gap: 6,
  },
  restoreText: {
    color: '#4A90D9',
    fontSize: 14,
  },
  // Coin Pack styles
  coinPacksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  coinPackCard: {
    width: '47%' as any,
    backgroundColor: '#1e2a4a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3a5e',
    marginBottom: 4,
  },
  coinPackPopular: {
    borderColor: '#4A90D9',
    borderWidth: 2,
  },
  coinPackMega: {
    borderColor: '#E74C3C',
    borderWidth: 2,
  },
  coinPackIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2a3a5e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  coinPackAmount: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: 'bold',
  },
  coinPackLabel: {
    color: '#8899aa',
    fontSize: 13,
    marginBottom: 10,
  },
  coinPackPriceTag: {
    backgroundColor: '#27ae60',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  coinPackPricePopular: {
    backgroundColor: '#4A90D9',
  },
  coinPackPriceMega: {
    backgroundColor: '#E74C3C',
  },
  coinPackPrice: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  popularBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    backgroundColor: '#4A90D9',
    borderTopRightRadius: 11,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    backgroundColor: '#E74C3C',
    borderTopRightRadius: 11,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bestValueBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
