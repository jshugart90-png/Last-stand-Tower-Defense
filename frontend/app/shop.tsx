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
import { usePlayerStore } from '../src/stores/playerStore';
import { skinsApi, purchaseApi, rewardApi } from '../src/hooks/useApi';
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

  const handlePurchaseSkin = async (skin: Skin) => {
    if (!playerStore.playerId) return;

    if (playerStore.unlockedSkins.includes(skin.id)) {
      // Already owned, equip it
      handleEquipSkin(skin.id);
      return;
    }

    if (skin.price_type === 'premium') {
      Alert.alert(
        'Premium Skin',
        'This skin requires a premium purchase. Would you like to buy it?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Purchase ($2.99)',
            onPress: async () => {
              // Simulate IAP
              try {
                await purchaseApi.process({
                  player_id: playerStore.playerId!,
                  item_type: 'skin',
                  item_id: skin.id,
                });
                playerStore.unlockSkin(skin.id);
                Alert.alert('Success', `${skin.name} skin unlocked!`);
              } catch (e) {
                Alert.alert('Error', 'Purchase failed. Please try again.');
              }
            },
          },
        ]
      );
      return;
    }

    if (playerStore.coins < skin.price) {
      Alert.alert(
        'Not Enough Coins',
        `You need ${skin.price - playerStore.coins} more coins. Watch an ad to earn coins?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Watch Ad',
            onPress: handleWatchAdForCoins,
          },
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
              Alert.alert('Error', 'Purchase failed. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleEquipSkin = async (skinId: string) => {
    if (!playerStore.playerId) return;

    try {
      await skinsApi.equip(playerStore.playerId, selectedTower, skinId);
      playerStore.equipSkin(selectedTower, skinId);
      Alert.alert('Success', 'Skin equipped!');
    } catch (e) {
      // Still update locally
      playerStore.equipSkin(selectedTower, skinId);
    }
  };

  const handleWatchAdForCoins = async () => {
    // Simulate watching ad
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
                Alert.alert('Error', 'Failed to claim reward');
              }
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
          onPress: async () => {
            if (playerStore.playerId) {
              try {
                await purchaseApi.process({
                  player_id: playerStore.playerId,
                  item_type: 'premium',
                });
                playerStore.setPremium(true);
                Alert.alert('Success', 'Premium unlocked! Ad-free experience enabled.');
              } catch (e) {
                Alert.alert('Error', 'Purchase failed');
              }
            }
          },
        },
      ]
    );
  };

  const handlePurchaseArena = () => {
    Alert.alert(
      'Expanded Arena',
      'Get a larger battlefield for $2.99?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: async () => {
            if (playerStore.playerId) {
              try {
                await purchaseApi.process({
                  player_id: playerStore.playerId,
                  item_type: 'arena_expansion',
                });
                playerStore.setArenaExpanded(true);
                Alert.alert('Success', 'Arena expanded! Enjoy the larger battlefield.');
              } catch (e) {
                Alert.alert('Error', 'Purchase failed');
              }
            }
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
                <Text style={styles.priceText}>$4.99</Text>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.premiumCard, playerStore.arenaExpanded && styles.purchasedCard]}
            onPress={handlePurchaseArena}
            disabled={playerStore.arenaExpanded}
          >
            <MaterialCommunityIcons name="arrow-expand-all" size={32} color="#9B59B6" />
            <View style={styles.premiumInfo}>
              <Text style={styles.premiumTitle}>Expanded Arena</Text>
              <Text style={styles.premiumDescription}>
                Larger battlefield for more towers
              </Text>
            </View>
            <View style={styles.priceTag}>
              {playerStore.arenaExpanded ? (
                <Ionicons name="checkmark-circle" size={24} color="#2ECC71" />
              ) : (
                <Text style={styles.priceText}>$2.99</Text>
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
                    <Text style={styles.premiumPriceText}>$2.99</Text>
                  ) : (
                    <View style={styles.coinPrice}>
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
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  priceTag: {
    backgroundColor: '#0f0f23',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priceText: {
    color: '#2ECC71',
    fontSize: 16,
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
  freeText: {
    color: '#2ECC71',
    fontSize: 12,
    fontWeight: 'bold',
  },
  premiumPriceText: {
    color: '#9B59B6',
    fontSize: 12,
    fontWeight: 'bold',
  },
  coinPrice: {
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
