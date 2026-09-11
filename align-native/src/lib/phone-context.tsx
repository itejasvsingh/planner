import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';
import { signOutGoogle } from '@/lib/google-auth';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { getItem, PHONE_KEY, removeItem, setItem } from '@/lib/storage';

type PhoneContextValue = {
  ready: boolean;
  phone: string | null;
  firebaseUser: User | null;
  needsPhoneSetup: boolean;
  savePhone: (raw: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  login: (raw: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
};

const PhoneContext = createContext<PhoneContextValue | null>(null);

export function PhoneProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [needsPhoneSetup, setNeedsPhoneSetup] = useState(false);

  // 1. Load persisted phone from storage immediately on startup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await getItem(PHONE_KEY);
        const cleaned = raw ? normalizePhone(raw) : '';
        if (!cancelled && cleaned.length >= 10) {
          setPhone(cleaned);
        }
      } catch (e) {
        console.warn('Error reading phone from storage:', e);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Track Firebase Auth state without destroying local phone persistence
  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      if (!user) {
        setFirebaseUser(null);
        setNeedsPhoneSetup(false);
        return;
      }

      setFirebaseUser(user);

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userDocRef);

        if (cancelled) return;

        if (snap.exists() && snap.data()?.phone) {
          const userPhone = normalizePhone(String(snap.data().phone));
          await setItem(PHONE_KEY, userPhone);
          setPhone(userPhone);
          setNeedsPhoneSetup(false);
        } else {
          // If phone is already stored locally, auto-link it with this Google account!
          const localPhone = await getItem(PHONE_KEY);
          if (localPhone && localPhone.length >= 10) {
            const cleaned = normalizePhone(localPhone);
            await setDoc(
              userDocRef,
              {
                phone: cleaned,
                email: user.email || null,
                displayName: user.displayName || null,
                createdAt: serverTimestamp(),
              },
              { merge: true }
            );
            setPhone(cleaned);
            setNeedsPhoneSetup(false);
          } else {
            setNeedsPhoneSetup(true);
          }
        }
      } catch (err) {
        console.warn('Error fetching users doc:', err);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const savePhone = useCallback(async (raw: string) => {
    const cleaned = normalizePhone(raw);
    if (!isValidPhone(cleaned)) {
      return { ok: false as const, message: 'Please enter a valid phone number (e.g., 9876543210).' };
    }

    try {
      await setItem(PHONE_KEY, cleaned);
      setPhone(cleaned);
      setNeedsPhoneSetup(false);

      // If user is signed in with Google, also persist the mapping to Firestore
      const currentUser = auth.currentUser;
      if (currentUser) {
        setDoc(
          doc(db, 'users', currentUser.uid),
          {
            phone: cleaned,
            email: currentUser.email || null,
            displayName: currentUser.displayName || null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((err) => console.warn('Non-blocking user mapping sync notice:', err));
      }

      return { ok: true as const };
    } catch (err: any) {
      console.error('Failed to save phone:', err);
      return { ok: false as const, message: err.message || 'Failed to save phone number.' };
    }
  }, []);

  const login = useCallback(
    async (raw: string) => {
      return savePhone(raw);
    },
    [savePhone]
  );

  const logout = useCallback(async () => {
    try {
      await signOutGoogle();
    } catch (e) {
      console.warn('Logout error:', e);
    }
    await removeItem(PHONE_KEY);
    setPhone(null);
    setFirebaseUser(null);
    setNeedsPhoneSetup(false);
  }, []);

  const value = useMemo(
    () => ({ ready, phone, firebaseUser, needsPhoneSetup, savePhone, login, logout }),
    [ready, phone, firebaseUser, needsPhoneSetup, savePhone, login, logout]
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
