import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
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
    await removeItem(WEB_CRED_KEY);
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

/*
 * Web (home-screen app): expo-local-authentication has no web support, so use WebAuthn with the
 * device's platform authenticator (Face ID / Touch ID). A credential is created once from Settings;
 * unlocking asks the OS to verify the user against it. Like the native path, this is a local gate.
 */
const WEB_CRED_KEY = 'align_webauthn_credential';
const web = globalThis as any;

function toB64(buf: ArrayBuffer): string {
    return web.btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): Uint8Array {
    return Uint8Array.from(web.atob(s) as string, (ch) => ch.charCodeAt(0));
}
function challenge(): Uint8Array {
    return web.crypto.getRandomValues(new Uint8Array(32));
}

/** Whether this browser can do Face ID / Touch ID via WebAuthn (independent of set-up). */
export async function webBiometricSupported(): Promise<boolean> {
    if (Platform.OS !== 'web') return false;
    try {
        return !!web.PublicKeyCredential && (await web.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
        return false;
    }
}

export async function hasWebBiometric(): Promise<boolean> {
    return Platform.OS === 'web' && !!(await getItem(WEB_CRED_KEY));
}

/** Creates the WebAuthn credential; iOS shows the Face ID prompt. Must run from a tap. */
export async function registerWebBiometric(): Promise<boolean> {
    try {
        const phone = (await getItem(PHONE_KEY)) || 'align-user';
        const cred = await web.navigator.credentials.create({
            publicKey: {
                challenge: challenge(),
                rp: { name: 'Align', id: web.location.hostname },
                user: { id: new TextEncoder().encode(phone), name: phone, displayName: 'Align' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
                attestation: 'none',
                timeout: 60000,
            },
        });
        if (!cred) return false;
        await setItem(WEB_CRED_KEY, toB64(cred.rawId));
        return true;
    } catch (e) {
        console.warn('Face ID set-up failed:', e);
        return false;
    }
}

export async function removeWebBiometric(): Promise<void> {
    await removeItem(WEB_CRED_KEY);
}

async function promptWebBiometric(): Promise<boolean> {
    const id = await getItem(WEB_CRED_KEY);
    if (!id) return false;
    try {
        const assertion = await web.navigator.credentials.get({
            publicKey: {
                challenge: challenge(),
                rpId: web.location.hostname,
                allowCredentials: [{ type: 'public-key', id: fromB64(id), transports: ['internal'] }],
                userVerification: 'required',
                timeout: 60000,
            },
        });
        return !!assertion;
    } catch {
        return false;
    }
}

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
    if (Platform.OS === 'web') {
        if (!(await hasWebBiometric()) || !(await webBiometricSupported())) return 'none';
        return /iPhone|iPad|iPod|Macintosh/.test(web.navigator.userAgent) ? 'face' : 'fingerprint';
    }
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
    if (Platform.OS === 'web') return promptWebBiometric();
    const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: 'Use PIN',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
    });
    
    return result.success;
}

