import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { getItem, setItem, removeItem, PHONE_KEY } from './storage';

const PIN_HASH_KEY = 'align_pin_hash';
const SECURITY_ENABLED_KEY = 'align_security_enabled';

/* ─────────────────── Crypto Helpers ─────────────────── */

async function sha256(text: string): Promise<string> {
    return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        text
    );
}

/* ─────────────────── PIN Helpers ─────────────────── */

export async function savePin(pin: string): Promise<void> {
    const phone = (await getItem(PHONE_KEY)) ?? '';
    const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pin + 'align_2026_' + phone
    );
    await setItem(PIN_HASH_KEY, hash);
    await setSecurityEnabled(true);
}

export async function verifyPin(input: string): Promise<boolean> {
    const stored = await getItem(PIN_HASH_KEY);
    if (!stored) return false;
    const phone = (await getItem(PHONE_KEY)) ?? '';
    const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        input + 'align_2026_' + phone
    );
    return hash === stored;
}

export async function hasPinSet(): Promise<boolean> {
    const val = await getItem(PIN_HASH_KEY);
    return !!val;
}

export async function clearPin(): Promise<void> {
    await removeItem(PIN_HASH_KEY);
}

export async function savedPhone(): Promise<string | null> {
    return await getItem(PHONE_KEY);
}

/* ─────────────────── Security Toggle ─────────────────── */

export async function isSecurityEnabled(): Promise<boolean> {
    const val = await getItem(SECURITY_ENABLED_KEY);
    if (val === null) {
        return await hasPinSet();
    }
    return val === 'true';
}

export async function setSecurityEnabled(enabled: boolean): Promise<void> {
    await setItem(SECURITY_ENABLED_KEY, String(enabled));
}

/* ─────────────────── Biometric Helpers ─────────────────── */

export type BiometricAvailability = 'face' | 'fingerprint' | 'device' | 'none';

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (!hasHardware || !isEnrolled) {
        return 'none';
    }

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'face';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        return 'fingerprint';
    }
    
    return 'device'; // Fallback
}

export async function promptBiometric(reason: string = 'Unlock Align'): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: 'Use PIN',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
    });
    
    return result.success;
}

