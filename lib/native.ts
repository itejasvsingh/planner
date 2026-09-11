// Web / PWA-first native helpers for iOS Add-to-HomeScreen and mobile browsers

export const isStandalonePWA = (): boolean => {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
    );
};

export const isNative = false;
export const isNativeApp = () => isStandalonePWA();

export const triggerHaptic = async (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light') => {
    if (typeof window === 'undefined') return;
    try {
        if ('vibrate' in navigator) {
            if (type === 'heavy' || type === 'error') {
                navigator.vibrate([30, 50, 30]);
            } else if (type === 'medium' || type === 'warning') {
                navigator.vibrate(25);
            } else {
                navigator.vibrate(10);
            }
        }
    } catch {
        // Haptic feedback not supported or suppressed by browser
    }
};

export const updateStatusBar = async (isDark: boolean) => {
    if (typeof document === 'undefined') return;
    try {
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', isDark ? '#0F172A' : '#F8FAFC');
    } catch {
        // Ignore in unsupported environments
    }
};

export const hideSplashScreen = async () => {
    // No-op on Web PWA
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
        if ('Notification' in window) {
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
        if ('Notification' in window) {
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
        if ('Notification' in window && window.Notification.permission === 'granted') {
            const delay = scheduleAt ? Math.max(0, scheduleAt.getTime() - Date.now()) : 0;
            if (delay > 0) {
                setTimeout(() => {
                    new window.Notification(title, { body, icon: '/favicon.ico' });
                }, delay);
            } else {
                new window.Notification(title, { body, icon: '/favicon.ico' });
            }
        }
    } catch (e) {
        console.warn('Failed to send notification:', e);
    }
};
