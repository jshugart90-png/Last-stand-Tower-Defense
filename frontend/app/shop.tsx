import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore, TOWER_PRICES, ARENA_EXPANSION_PRICE_USD, IAP_PRODUCT_IDS } from '../src/stores/playerStore';
import { skinsApi, rewardApi } from '../src/hooks/useApi';
import { TOWERS, TowerType, SKIN_COLORS } from '../src/constants/game';

interface Skin {
  id: string;
  name: string;
  price: number;
  price_type: string;
  color: string;
}

export default function ShopScreen() {
  const router = useRouter();
  const playerStore = usePlayerStore();
  const [skins, setSkins] = useState<Skin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTower, setSelectedTower] = useState<TowerType>('machine_gun');

  useEffect(() => {
    loadSkins();
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

  const handlePurchaseTower = (towerType: TowerType) => {
    const price = TOWER_PRICES[towerType];
    const towerDef = TOWERS[towerType];
    
    if (playerStore.unlockedTowers.includes(towerType)) {
      Alert.alert('Already Owned', `You already own the ${towerDef.name}!`);
      return;
    }
    
    if (playerStore.coins < price) {
      Alert.alert(
        'Not Enough Coins',
        `You need ${price - playerStore.coins} more coins. Watch an ad to earn coins?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Watch Ad', onPress: handleWatchAdForCoins },
        ]
      );
      return;
    }
    
    Alert.alert(
      'Purchase Tower',
      `Buy ${towerDef.name} for ${price} coins?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          onPress: () => {
            const success = playerStore.purchaseTower(towerType);
            if (success) {
              Alert.alert('Success!', `${towerDef.name} unlocked! You can now use it in battle.`);
            }
          },
        },
      ]
    );
  };

  const handlePurchaseArenaExpansion = () => {
    // Arena expansion is a REAL MONEY purchase - $2.99
    Alert.alert(
      'Arena Expansion - $2.99',
      `Purchase arena expansion for $${ARENA_EXPANSION_PRICE_USD}?\n\nThis will add 1 row of cells to each side of your battlefield.\n\nCurrent expansions: ${playerStore.arenaExpansions}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Buy for $${ARENA_EXPANSION_PRICE_USD}`,
          onPress: async () => {
            // In production, this will trigger the IAP flow via expo-iap
            // For now, we simulate the purchase success
            // TODO: Integrate with expo-iap for real purchases
            try {
              // Simulated IAP success - in production this would validate receipt with backend
              Alert.alert(
                'Purchase Processing',
                'In production, this would open the App Store/Google Play payment sheet.\n\nFor testing, the expansion will be granted.',
                [
                  {
                    text: 'Simulate Purchase',
                    onPress: () => {
                      // Grant the expansion (in production, only after receipt validation)
                      playerStore.syncFromServer({
                        arenaExpansions: playerStore.arenaExpansions + 1
                      });
                      Alert.alert('Success!', `Arena expanded! Total expansions: ${playerStore.arenaExpansions + 1}\n\nNew grid size: ${10 + (playerStore.arenaExpansions + 1) * 2} x ${14 + (playerStore.arenaExpansions + 1) * 2}`);
                    }
                  },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
            } catch (error) {
              Alert.alert('Purchase Failed', 'Unable to complete purchase. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handlePurchaseSkin = async (skin: Skin) => {
    if (playerStore.unlockedSkins.includes(skin.id)) {
      handleEquipSkin(skin.id);
      return;
    }

    if (skin.price_type === 'premium') {
      Alert.alert('Premium Skin', 'This skin requires a premium purchase.');
      return;
    }

    if (playerStore.coins < skin.price) {
      Alert.alert(
        'Not Enough Coins',
        `You need ${skin.price - playerStore.coins} more coins.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Watch Ad', onPress: handleWatchAdForCoins },
        ]
      );
      return;
    }

    Alert.alert(
      'Purchase Skin',
      `Buy ${skin.name} for ${skin.price} coins?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          onPress: async () => {
            try {
              const response = await skinsApi.purchase(playerStore.playerId!, skin.id);
              if (response.data.success) {
                playerStore.setCoins(response.data.new_balance);
                playerStore.unlockSkin(skin.id);
                Alert.alert('Success', `${skin.name} skin unlocked!`);
              }
            } catch (e) {
              // Local purchase
              playerStore.setCoins(playerStore.coins - skin.price);
              playerStore.unlockSkin(skin.id);
              Alert.alert('Success', `${skin.name} skin unlocked!`);
            }
          },
        },
      ]
    );
  };

  const handleEquipSkin = async (skinId: string) => {
    playerStore.equipSkin(selectedTower, skinId);
    Alert.alert('Equipped!', 'Skin equipped successfully.');
  };

  const handleWatchAdForCoins = async () => {
    Alert.alert(
      'Watch Ad',
      'Watch a short video to earn 50 coins?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Watch',
          onPress: async () => {
            if (playerStore.playerId) {
              try {
                const response = await rewardApi.claim({
                  player_id: playerStore.playerId,
                  reward_type: 'coins',
                  ad_type: 'rewarded',
                });
                if (response.data.success) {
                  playerStore.setCoins(response.data.new_balance);
                  Alert.alert('Reward!', `You earned ${response.data.coins_granted} coins!`);
                }
              } catch (e) {
                // Local reward
                playerStore.addCoins(50);
                Alert.alert('Reward!', 'You earned 50 coins!');
              }
            } else {
              playerStore.addCoins(50);
              Alert.alert('Reward!', 'You earned 50 coins!');
            }
          },
        },
      ]
    );
  };

  const handlePurchasePremium = () => {
    Alert.alert(
      'Premium Upgrade',
      'Remove all ads and get exclusive skins for $4.99?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: () => {
            playerStore.setPremium(true);
            Alert.alert('Success', 'Premium unlocked! Ad-free experience enabled.');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90D9" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Shop</Text>
        <View style={styles.coinsContainer}>
          <FontAwesome5 name="coins" size={16} color="#FFD700" />
          <Text style={styles.coinsText}>{playerStore.coins}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Tower Unlocks Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Unlock Towers</Text>
          <Text style={styles.sectionSubtitle}>Purchase new tower types with coins</Text>
          
          {(Object.keys(TOWERS) as TowerType[]).map((type) => {
            const tower = TOWERS[type];
            const price = TOWER_PRICES[type];
            const isOwned = playerStore.unlockedTowers.includes(type);
            const canAfford = playerStore.coins >= price;

            return (
              <TouchableOpacity
                key={type}
                style={[styles.towerCard, isOwned && styles.ownedCard]}
                onPress={() => handlePurchaseTower(type)}
                disabled={isOwned}
              >
                <View style={[styles.towerIconLarge, { backgroundColor: tower.color }]}>
                  <MaterialCommunityIcons 
                    name={type === 'machine_gun' ? 'pistol' : 
                          type === 'sniper' ? 'crosshairs-gps' : 
                          type === 'splash' ? 'bomb' : 
                          type === 'freeze' ? 'snowflake' : 'rocket-launch'} 
                    size={24} 
                    color="#fff" 
                  />
                </View>
                <View style={styles.towerInfo}>
                  <Text style={styles.towerName}>{tower.name}</Text>
                  <Text style={styles.towerDescription}>{tower.description}</Text>
                </View>
                <View style={styles.priceTag}>
                  {isOwned ? (
                    <Ionicons name="checkmark-circle" size={24} color="#2ECC71" />
                  ) : price === 0 ? (
                    <Text style={styles.freeText}>FREE</Text>
                  ) : (
                    <View style={styles.coinPrice}>
                      <FontAwesome5 name="coins" size={14} color={canAfford ? '#FFD700' : '#E74C3C'} />
                      <Text style={[styles.priceText, !canAfford && styles.cantAffordText]}>{price}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Arena Expansion Section - REAL MONEY PURCHASE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Arena Expansion</Text>
          <Text style={styles.sectionSubtitle}>Expand your battlefield for more tower space</Text>
          
          <View style={styles.expansionCard}>
            <View style={styles.expansionInfo}>
              <MaterialCommunityIcons name="arrow-expand-all" size={40} color="#9B59B6" />
              <View style={styles.expansionText}>
                <Text style={styles.expansionTitle}>Add Row to Each Side</Text>
                <Text style={styles.expansionDesc}>
                  Current expansions: {playerStore.arenaExpansions}
                </Text>
                <Text style={styles.expansionDesc}>
                  Grid size: {10 + playerStore.arenaExpansions * 2} x {14 + playerStore.arenaExpansions * 2}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.expandButtonReal}
              onPress={handlePurchaseArenaExpansion}
            >
              <Text style={styles.dollarPriceSmall}>${ARENA_EXPANSION_PRICE_USD}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Premium Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Premium</Text>
          
          <TouchableOpacity
            style={[styles.premiumCard, playerStore.premium && styles.purchasedCard]}
            onPress={handlePurchasePremium}
            disabled={playerStore.premium}
          >
            <Ionicons name="star" size={32} color="#FFD700" />
            <View style={styles.premiumInfo}>
              <Text style={styles.premiumTitle}>Premium Upgrade</Text>
              <Text style={styles.premiumDescription}>
                Remove all ads + exclusive skins
              </Text>
            </View>
            <View style={styles.priceTag}>
              {playerStore.premium ? (
                <Ionicons name="checkmark-circle" size={24} color="#2ECC71" />
              ) : (
                <Text style={styles.dollarPrice}>$4.99</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Tower Skins Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tower Skins</Text>
          
          {/* Tower selector */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.towerSelector}
            contentContainerStyle={styles.towerSelectorContent}
          >
            {(Object.keys(TOWERS) as TowerType[]).map((type) => {
              const tower = TOWERS[type];
              const isUnlocked = playerStore.unlockedTowers.includes(type);
              const isSelected = selectedTower === type;

              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.towerTab,
                    isSelected && styles.towerTabSelected,
                    !isUnlocked && styles.towerTabLocked,
                  ]}
                  onPress={() => setSelectedTower(type)}
                  disabled={!isUnlocked}
                >
                  <View style={[styles.towerIconSmall, { backgroundColor: tower.color }]} />
                  <Text style={styles.towerTabText}>{tower.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Skins grid */}
          <View style={styles.skinsGrid}>
            {skins.map((skin) => {
              const isOwned = playerStore.unlockedSkins.includes(skin.id);
              const isEquipped = playerStore.equippedSkins[selectedTower] === skin.id;

              return (
                <TouchableOpacity
                  key={skin.id}
                  style={[
                    styles.skinCard,
                    isEquipped && styles.skinCardEquipped,
                  ]}
                  onPress={() => handlePurchaseSkin(skin)}
                >
                  <View style={[styles.skinPreview, { backgroundColor: skin.color }]} />
                  <Text style={styles.skinName}>{skin.name}</Text>
                  
                  {isEquipped ? (
                    <View style={styles.equippedBadge}>
                      <Text style={styles.equippedText}>Equipped</Text>
                    </View>
                  ) : isOwned ? (
                    <Text style={styles.ownedText}>Tap to equip</Text>
                  ) : skin.price_type === 'free' ? (
                    <Text style={styles.freeText}>Free</Text>
                  ) : skin.price_type === 'premium' ? (
                    <Text style={styles.premiumPriceText}>Premium</Text>
                  ) : (
                    <View style={styles.coinPriceSmall}>
                      <FontAwesome5 name="coins" size={12} color="#FFD700" />
                      <Text style={styles.coinPriceText}>{skin.price}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Earn Coins Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Earn Coins</Text>
          
          <TouchableOpacity style={styles.earnCard} onPress={handleWatchAdForCoins}>
            <Ionicons name="videocam" size={32} color="#9B59B6" />
            <View style={styles.earnInfo}>
              <Text style={styles.earnTitle}>Watch Ad</Text>
              <Text style={styles.earnDescription}>Earn 50 coins</Text>
            </View>
            <Ionicons name="play-circle" size={32} color="#2ECC71" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  coinsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16213e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  coinsText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 14,
    marginBottom: 16,
  },
  towerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  ownedCard: {
    opacity: 0.7,
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
  towerDescription: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  priceTag: {
    marginLeft: 8,
  },
  freeText: {
    color: '#2ECC71',
    fontSize: 14,
    fontWeight: 'bold',
  },
  coinPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cantAffordText: {
    color: '#E74C3C',
  },
  expansionCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  expansionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  expansionText: {
    marginLeft: 16,
    flex: 1,
  },
  expansionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  expansionDesc: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9B59B6',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  expandButtonReal: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2ECC71',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  dollarPriceSmall: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  expandButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  purchasedCard: {
    opacity: 0.7,
  },
  premiumInfo: {
    flex: 1,
    marginLeft: 16,
  },
  premiumTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  premiumDescription: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  dollarPrice: {
    color: '#2ECC71',
    fontSize: 18,
    fontWeight: 'bold',
  },
  towerSelector: {
    marginBottom: 16,
  },
  towerSelectorContent: {
    gap: 8,
  },
  towerTab: {
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  towerTabSelected: {
    borderWidth: 2,
    borderColor: '#4A90D9',
  },
  towerTabLocked: {
    opacity: 0.5,
  },
  towerIconSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginBottom: 4,
  },
  towerTabText: {
    color: '#fff',
    fontSize: 12,
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
  skinCardEquipped: {
    borderWidth: 2,
    borderColor: '#4A90D9',
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
  equippedBadge: {
    backgroundColor: '#4A90D9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  equippedText: {
    color: '#fff',
    fontSize: 10,
  },
  ownedText: {
    color: '#2ECC71',
    fontSize: 10,
  },
  premiumPriceText: {
    color: '#9B59B6',
    fontSize: 12,
    fontWeight: 'bold',
  },
  coinPriceSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coinPriceText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  earnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  earnInfo: {
    flex: 1,
    marginLeft: 16,
  },
  earnTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  earnDescription: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
});
