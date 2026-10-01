import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type AlignSmsNative = {
  configure(endpoint: string, token: string): void;
  disable(): void;
  isConfigured(): boolean;
  flushPending(): Promise<number>;
  readRecentTransactionSms(days: number): Promise<{ text: string; date: number }[]>;
};

/** Native SMS forwarder; only present in the Android APK build (null on iOS, web and Expo Go). */
export const AlignSms: AlignSmsNative | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<AlignSmsNative>('AlignSms') : null;
