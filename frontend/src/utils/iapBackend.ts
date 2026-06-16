import { Platform } from 'react-native';
import { isBackendConfigured, isServerBackedPlayerId, purchaseApi } from '../hooks/useApi';

export type PurchaseSyncParams = {
  playerId: string;
  itemType: string;
  itemId: string;
  gemsAmount?: number;
  receipt?: string;
  purchaseToken?: string;
  transactionId?: string;
};

export async function syncPurchaseWithBackend(params: PurchaseSyncParams) {
  if (!isBackendConfigured() || !isServerBackedPlayerId(params.playerId)) {
    return null;
  }

  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : '';
  if (platform !== 'ios' && platform !== 'android') {
    return null;
  }

  const receiptData = params.receipt || params.purchaseToken;
  const payload: {
    player_id: string;
    item_type: string;
    item_id: string;
    platform: string;
    gems_amount?: number;
    receipt_data?: string;
    purchase_token?: string;
    transaction_id?: string;
  } = {
    player_id: params.playerId,
    item_type: params.itemType,
    item_id: params.itemId,
    platform,
  };

  if (params.gemsAmount != null) {
    payload.gems_amount = params.gemsAmount;
  }
  if (params.transactionId) {
    payload.transaction_id = params.transactionId;
  }

  if (platform === 'ios') {
    if (!receiptData) {
      throw new Error('Missing App Store receipt.');
    }
    payload.receipt_data = receiptData;
  } else {
    if (!params.purchaseToken) {
      throw new Error('Missing Google Play purchase token.');
    }
    payload.purchase_token = params.purchaseToken;
  }

  const response = await purchaseApi.process(payload);
  return response.data;
}
