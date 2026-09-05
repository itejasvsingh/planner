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

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export const requestNotificationPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    try {
        if (Capacitor.isNativePlatform()) {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            const res = await LocalNotifications.requestPermissions();
            return res.display === 'granted';
        } else if ('Notification' in window) {
            const perm = await window.Notification.requestPermission();
            return perm === 'granted';
        }
    } catch (e) {
        console.warn('Notification permission request error:', e);
    }
    return false;
};

export const checkNotificationPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    try {
        if (Capacitor.isNativePlatform()) {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            const res = await LocalNotifications.checkPermissions();
            return res.display === 'granted';
        } else if ('Notification' in window) {
            return window.Notification.permission === 'granted';
        }
    } catch {
        return false;
    }
    return false;
};

export const sendNativeNotification = async (title: string, body: string, id?: number, scheduleAt?: Date) => {
    if (typeof window === 'undefined') return;
    try {
        if (Capacitor.isNativePlatform()) {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            const numId = id || Math.abs(hashCode(title + body + (scheduleAt ? scheduleAt.getTime() : Date.now())));
            await LocalNotifications.schedule({
                notifications: [
                    {
                        title,
                        body,
                        id: numId % 2147483647,
                        schedule: scheduleAt ? { at: scheduleAt, allowWhileIdle: true } : undefined,
                        sound: 'default',
                        smallIcon: 'ic_launcher_foreground',
                        actionTypeId: '',
                        extra: null
                    }
                ]
            });
        } else if ('Notification' in window && window.Notification.permission === 'granted') {
            new window.Notification(title, { body, icon: '/favicon.ico' });
        }
    } catch (e) {
        console.warn('Failed to send notification:', e);
    }
};


