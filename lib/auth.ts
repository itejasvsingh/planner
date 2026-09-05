/**
 * lib/auth.ts
 * PIN hashing + biometric helpers for Align app lock screen.
 *
 * PIN storage: SHA-256 hash of the 4-6 digit PIN is stored in localStorage.
 * Biometrics: wrapped via @aparajita/capacitor-biometric-auth, gracefully
 * degrades to `false` on web / when not enrolled.
 */

import { Capacitor } from '@capacitor/core';

const PIN_HASH_KEY = 'align_pin_hash';
const PHONE_KEY = 'planner_user_phone';

/* ─────────────────── Crypto Helpers ─────────────────── */

async function sha256(text: string): Promise<string> {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const buffer = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
    // Fallback (non-secure environments like very old WebViews): store plain
    // This path should never be reached on modern Android/iOS.
    return text;
}

/* ─────────────────── PIN Helpers ─────────────────── */

export async function savePin(pin: string): Promise<void> {
    const hash = await sha256(pin);
    try {
        localStorage.setItem(PIN_HASH_KEY, hash);
        setSecurityEnabled(true);
    } catch {}
}

export async function verifyPin(input: string): Promise<boolean> {
    const stored = localStorage.getItem(PIN_HASH_KEY);
    if (!stored) return false;
    const hash = await sha256(input);
    return hash === stored;
}

export function hasPinSet(): boolean {
    try { return !!localStorage.getItem(PIN_HASH_KEY); } catch { return false; }
}

export function clearPin(): void {
    try { localStorage.removeItem(PIN_HASH_KEY); } catch {}
}

export function savedPhone(): string | null {
    try { return localStorage.getItem(PHONE_KEY); } catch { return null; }
}

/* ─────────────────── Security Toggle ─────────────────── */

const SECURITY_ENABLED_KEY = 'align_security_enabled';

/**
 * Returns whether the user has opted in to app lock (PIN / biometric).
 * Defaults to true if a PIN is already set (so existing users stay protected).
 */
export function isSecurityEnabled(): boolean {
    try {
        const val = localStorage.getItem(SECURITY_ENABLED_KEY);
        if (val === null) {
            // First time: auto-enable if a PIN hash exists (migration safety)
            return !!localStorage.getItem('align_pin_hash');
        }
        return val === 'true';
    } catch { return false; }
}

export function setSecurityEnabled(enabled: boolean): void {
    try { localStorage.setItem(SECURITY_ENABLED_KEY, String(enabled)); } catch {}
}

/* ─────────────────── Biometric Helpers ─────────────────── */

export type BiometricAvailability =
    | 'face'       // Face ID (iOS) or Face Unlock (Android)
    | 'fingerprint' // Touch ID / fingerprint
    | 'device'      // PIN/pattern (device credential fallback)
    | 'none';       // Not available

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
    if (!Capacitor.isNativePlatform()) return 'none';
    try {
        const { BiometricAuth, BiometryType } = await import('@aparajita/capacitor-biometric-auth');
        const result = await BiometricAuth.checkBiometry();
        if (!result.isAvailable) {
            return result.deviceIsSecure ? 'device' : 'none';
        }
        const t = result.biometryType;
        if (t === BiometryType.faceId || t === BiometryType.faceAuthentication) return 'face';
        return 'fingerprint';
    } catch {
        return 'none';
    }
}

/**
 * Prompt biometric / device-credential authentication.
 * Resolves true on success, false on cancel / failure / not available.
 */
export async function promptBiometric(reason: string = 'Unlock Align'): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
        const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
        await BiometricAuth.authenticate({
            reason,
            cancelTitle: 'Use PIN',
            allowDeviceCredential: false,
            iosFallbackTitle: 'Use PIN',
            androidTitle: 'Align',
            androidSubtitle: reason,
        });
        return true;
    } catch {
        return false;
    }
}

