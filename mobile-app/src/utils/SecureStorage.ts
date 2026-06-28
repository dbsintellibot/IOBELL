import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * SecureStorage Wrapper
 * Uses expo-secure-store for native platforms (iOS/Android) 
 * and falls back to AsyncStorage for web.
 * Includes automatic migration of legacy AsyncStorage keys on first run.
 */
class SecureStorage {
  private static MIGRATED_FLAG = '@app_storage_migrated';

  /**
   * Initializes the storage by migrating any legacy AsyncStorage keys to SecureStore (if on native).
   */
  static async init(keysToMigrate: string[] = []) {
    if (Platform.OS === 'web') return;

    try {
      const hasMigrated = await AsyncStorage.getItem(this.MIGRATED_FLAG);
      if (hasMigrated === 'true') return;

      for (const key of keysToMigrate) {
        const legacyValue = await AsyncStorage.getItem(key);
        if (legacyValue !== null) {
          await SecureStore.setItemAsync(key, legacyValue);
          await AsyncStorage.removeItem(key);
        }
      }

      await AsyncStorage.setItem(this.MIGRATED_FLAG, 'true');
    } catch (e) {
      console.error('Failed to migrate storage:', e);
    }
  }

  static async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  }

  static async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(key);
    } else {
      return await SecureStore.getItemAsync(key);
    }
  }

  static async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  }
}

export default SecureStorage;
