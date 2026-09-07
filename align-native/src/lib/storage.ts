import AsyncStorage from '@react-native-async-storage/async-storage';

export const PHONE_KEY = 'planner_user_phone';

export function itemsCacheKey(phone: string) {
  return `planner_cache_items_${phone}`;
}

export async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Ignore quota / unavailable storage.
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
