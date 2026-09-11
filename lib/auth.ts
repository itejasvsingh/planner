/**
 * lib/auth.ts
 * PIN hashing + biometric helpers for Align app lock screen.
 *
 * PIN storage: SHA-256 hash of the 4-6 digit PIN is stored in localStorage.
 * Biometrics: WebAuthn (PublicKeyCredential) platform authenticator (Touch ID, Face ID, Fingerprint).
 */

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
    | 'face'        // Face ID (iOS)
    | 'fingerprint' // Touch ID / fingerprint
    | 'device'      // PIN/pattern (device credential fallback)
    | 'none';       // Not available

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
    // Web / Safari PWA WebAuthn Platform Authenticator (Face ID / Touch ID / Fingerprint)
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
        try {
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            if (available) {
                const ua = navigator.userAgent;
                if (/iPhone|iPad|iPod/.test(ua)) {
                    return 'face'; // iOS Face ID / Touch ID
                }
                return 'fingerprint'; // Touch ID / Fingerprint
            }
        } catch {}
    }

    return 'none';
}

/**
 * WebAuthn Biometric Prompt (Safari PWA / Chrome Web)
 */
async function promptWebAuthn(): Promise<boolean> {
    try {
        if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
        
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        // Try getting existing platform authenticator assertion
        await navigator.credentials.get({
            publicKey: {
                challenge,
                timeout: 60000,
                userVerification: 'required',
            }
        });
        return true;
    } catch {
        // If assertion fails or no existing key, prompt creation to verify user presence
        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            const userId = new Uint8Array(16);
            window.crypto.getRandomValues(userId);

            await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: { name: 'Align' },
                    user: {
                        id: userId,
                        name: 'user@align.app',
                        displayName: 'Align User'
                    },
                    pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
                    timeout: 60000,
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required'
                    }
                }
            });
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Prompt biometric / device-credential authentication.
 * Resolves true on success, false on cancel / failure / not available.
 */
export async function promptBiometric(_reason: string = 'Unlock Align'): Promise<boolean> {
    return await promptWebAuthn();
}
