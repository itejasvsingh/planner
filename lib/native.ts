import { Capacitor } from '@capacitor/core';

export const isNativeApp = () => {
    if (typeof window === 'undefined') return false;
    return Capacitor.isNativePlatform();
};

export const triggerHaptic = async (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light') => {
    if (typeof window === 'undefined') return;
    try {
        const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
        if (type === 'light') {
            await Haptics.impact({ style: ImpactStyle.Light });
        } else if (type === 'medium') {
            await Haptics.impact({ style: ImpactStyle.Medium });
        } else if (type === 'heavy') {
            await Haptics.impact({ style: ImpactStyle.Heavy });
        } else if (type === 'success') {
            await Haptics.notification({ type: NotificationType.Success });
        } else if (type === 'warning') {
            await Haptics.notification({ type: NotificationType.Warning });
        } else if (type === 'error') {
            await Haptics.notification({ type: NotificationType.Error });
        }
    } catch {
        // Graceful fallback for non-native web environments
    }
};

export const updateStatusBar = async (isDark: boolean) => {
    if (typeof window === 'undefined') return;
    try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        if (Capacitor.isNativePlatform()) {
            await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
            await StatusBar.setBackgroundColor({ color: isDark ? '#0F172A' : '#F8FAFC' });
        }
    } catch {
        // Ignore in unsupported environments
    }
};

export const hideSplashScreen = async () => {
    if (typeof window === 'undefined') return;
    try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        if (Capacitor.isNativePlatform()) {
            await SplashScreen.hide();
        }
    } catch {
        // Ignore
    }
};

