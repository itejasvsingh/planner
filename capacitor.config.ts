import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.planner.alignapp',
  appName: 'Align',
  webDir: 'cap-assets',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    scheme: 'Align',
  },
  plugins: {
    OtaKit: {
      appId: 'ea40fc9a-2640-473b-8928-613020902ef1',
      appReadyTimeout: 10000,
    },
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#0F172A',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0F172A',
    },
  },
};

export default config;
