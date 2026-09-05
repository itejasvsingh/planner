import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.planner.alignapp',
  appName: 'Planner',
  webDir: 'cap-assets',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    scheme: 'Planner',
  },
  plugins: {
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
