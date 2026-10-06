import { GoogleAuthProvider, signInWithCustomToken, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { auth } from './firebase';
import { getItem, removeItem, setItem } from './storage';

export const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';
const VERIFIER_KEY = 'align_google_verifier';

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function bytesToB64(bytes: Uint8Array) {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/** The installed iPhone/Android home-screen web app, where Google's pop-up can't hand the result back. */
function standaloneWebApp() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not sign in with Google.');
  return data as T;
}

/**
 * Google sign-in through Align's server (see lib/googleLogin.ts on the server): for the Android app and the
 * home-screen web app. The device keeps a random secret and sends only its hash, so the one-time code that
 * comes back is useless to anyone else.
 */
async function signInThroughServer(): Promise<boolean> {
  const verifier = b64url(bytesToB64(await Crypto.getRandomBytesAsync(32)));
  const challenge = b64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
  const returnTo = Platform.OS === 'web' ? 'web' : 'app';
  const { url } = await post<{ url: string }>('/api/auth/google/start', { returnTo, challenge });
  if (Platform.OS === 'web') {
    // The page goes to Google and comes back to /login?google=…, which finishes with this secret
    await setItem(VERIFIER_KEY, verifier);
    window.location.href = url;
    return false;
  }
  const result = await WebBrowser.openAuthSessionAsync(url, 'align://login');
  if (result.type !== 'success') return false; // closed or cancelled
  const code = new URL(result.url).searchParams.get('google') || '';
  if (!code || ['expired', 'cancelled', 'failed'].includes(code)) {
    throw new Error(code === 'cancelled' ? 'Google sign-in was cancelled.' : 'Google sign-in didn’t finish. Try again.');
  }
  const { token } = await post<{ token: string }>('/api/auth/google/finish', { code, verifier });
  await signInWithCustomToken(auth, token);
  return true;
}

/** Signs in with Google: a pop-up in a browser, the server route in the apps. */
export async function signInWithGoogle() {
  if (Platform.OS === 'web' && !standaloneWebApp()) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const userCredential = await signInWithPopup(auth, provider);
      return userCredential.user;
    } catch (e) {
      const code = String((e as { code?: string })?.code || '');
      // Pop-ups not possible here: go to Google in this window instead
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInThroughServer();
        return null;
      }
      throw e;
    }
  }
  await signInThroughServer();
  return auth.currentUser;
}

/**
 * Web, back on /login?google=…: finish with the secret saved before going to Google. Returns an error to
 * show, or null when signed in (or there was nothing to finish).
 */
export async function finishGoogleRedirect(value: string): Promise<string | null> {
  if (value === 'cancelled') return null;
  if (value === 'expired' || value === 'failed') return 'Google sign-in didn’t finish. Try again.';
  const verifier = await getItem(VERIFIER_KEY);
  await removeItem(VERIFIER_KEY);
  if (!verifier) return 'Google sign-in didn’t finish. Try again.';
  try {
    const { token } = await post<{ token: string }>('/api/auth/google/finish', { code: value, verifier });
    await signInWithCustomToken(auth, token);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export async function signOutGoogle() {
  try {
    await fbSignOut(auth);
  } catch (e) {
    console.warn('Firebase signOut notice:', e);
  }
}

export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED'
};
