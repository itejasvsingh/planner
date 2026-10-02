import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';

import { auth } from '@/lib/firebase';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { getItem, PHONE_KEY, removeItem, setItem } from '@/lib/storage';

const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';

type Result = { ok: true } | { ok: false; message: string };

type PhoneContextValue = {
  ready: boolean;
  /** The signed-in user's verified WhatsApp number (what their data is stored under), or null. */
  phone: string | null;
  firebaseUser: User | null;
  /** Signed in with Google but no verified number yet. */
  needsPhoneSetup: boolean;
  /** The number used last on this device, to prefill the sign-in form. */
  lastPhone: string | null;
  /** Sends a 6-digit code on WhatsApp. `template` false means it only arrives after messaging Align once. */
  sendCode: (raw: string) => Promise<({ ok: true; template: boolean }) | { ok: false; message: string }>;
  /** Checks the code: signs in with the number, or links it to the signed-in Google account. */
  verifyCode: (raw: string, code: string) => Promise<Result>;
  logout: () => Promise<void>;
};

const PhoneContext = createContext<PhoneContextValue | null>(null);

async function post(path: string, body: unknown, idToken?: string) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => ({ status: 'error', message: `Something went wrong (${res.status}).` }))) as Record<string, any>;
  } catch {
    return { status: 'error', message: 'Signing in needs an internet connection.' };
  }
}

/**
 * Who is signed in. Access to data comes only from Firebase sign-in: a WhatsApp number counts once the server
 * has checked a code sent to it, and reaches the app as the `phone` claim on the user's token. The number
 * saved on the device is only used to prefill the form and to keep working offline.
 */
export function PhoneProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [needsPhoneSetup, setNeedsPhoneSetup] = useState(false);
  const [lastPhone, setLastPhone] = useState<string | null>(null);

  const applyUser = useCallback(async (user: User | null) => {
    setFirebaseUser(user);
    if (!user) {
      setPhone(null);
      setNeedsPhoneSetup(false);
      return;
    }
    let verified: string | null = null;
    try {
      const claim = (await user.getIdTokenResult()).claims.phone;
      verified = typeof claim === 'string' ? claim : null;
    } catch {
      // Offline with an expired token: the number saved at sign-in still identifies this user's data.
      verified = await getItem(PHONE_KEY);
    }
    if (verified) {
      await setItem(PHONE_KEY, verified);
      setLastPhone(verified);
    }
    setPhone(verified);
    setNeedsPhoneSetup(!verified);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getItem(PHONE_KEY).then((p) => !cancelled && p && setLastPhone(p));
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void applyUser(user).finally(() => !cancelled && setReady(true));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyUser]);

  const sendCode = useCallback(async (raw: string) => {
    const cleaned = normalizePhone(raw);
    if (!isValidPhone(cleaned) || cleaned === 'guest') return { ok: false as const, message: 'Enter your WhatsApp number, e.g. 9876543210.' };
    const res = await post('/api/auth/code', { phone: cleaned });
    if (res.status === 'sent') return { ok: true as const, template: !!res.template };
    return { ok: false as const, message: String(res.message || 'Could not send the code.') };
  }, []);

  const verifyCode = useCallback(
    async (raw: string, code: string): Promise<Result> => {
      const cleaned = normalizePhone(raw);
      const current = auth.currentUser;
      const res = await post('/api/auth/verify', { phone: cleaned, code }, current ? await current.getIdToken() : undefined);
      try {
        if (res.status === 'ok' && res.token) {
          await signInWithCustomToken(auth, String(res.token));
          return { ok: true };
        }
        if (res.status === 'linked' && current) {
          await current.getIdToken(true); // pick up the new phone claim
          await applyUser(current);
          return { ok: true };
        }
      } catch {
        return { ok: false, message: 'Could not finish signing in. Try again.' };
      }
      return { ok: false, message: String(res.message || 'That code did not work.') };
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign-out notice:', e);
    }
    await removeItem(PHONE_KEY);
    setPhone(null);
    setFirebaseUser(null);
    setNeedsPhoneSetup(false);
  }, []);

  const value = useMemo(
    () => ({ ready, phone, firebaseUser, needsPhoneSetup, lastPhone, sendCode, verifyCode, logout }),
    [ready, phone, firebaseUser, needsPhoneSetup, lastPhone, sendCode, verifyCode, logout],
  );

  return <PhoneContext.Provider value={value}>{children}</PhoneContext.Provider>;
}

export function usePhone() {
  const ctx = useContext(PhoneContext);
  if (!ctx) {
    throw new Error('usePhone must be used within PhoneProvider');
  }
  return ctx;
}
