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

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      if (!user) {
        setFirebaseUser(null);
        setPhone(null);
        setNeedsPhoneSetup(false);
        await removeItem(PHONE_KEY);
        setReady(true);
        return;
      }

      setFirebaseUser(user);

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userDocRef);

        if (cancelled) return;

        if (snap.exists() && snap.data()?.phone) {
          const userPhone = String(snap.data().phone);
          await setItem(PHONE_KEY, userPhone);
          setPhone(userPhone);
          setNeedsPhoneSetup(false);
        } else {
          // User exists in Firebase Auth but has not linked phone number yet
          setPhone(null);
          setNeedsPhoneSetup(true);
        }
      } catch (err) {
        console.warn('Error fetching users doc:', err);
        // Fallback to local storage cache if offline
        const cached = await getItem(PHONE_KEY);
        if (cached && cached.length >= 10) {
          setPhone(cached);
          setNeedsPhoneSetup(false);
        } else {
          setNeedsPhoneSetup(true);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
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
      return { ok: false as const, message: 'Please enter a valid phone number with country code (e.g., 919876543210).' };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { ok: false as const, message: 'Please sign in with Google first.' };
    }

    try {
      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          phone: cleaned,
          email: currentUser.email || null,
          displayName: currentUser.displayName || null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Verify the write is readable immediately before setting state & mounting listeners
      try {
        await getDoc(doc(db, 'users', currentUser.uid));
      } catch (_) {
        // non-blocking fallback
      }

      await setItem(PHONE_KEY, cleaned);
      setPhone(cleaned);
      setNeedsPhoneSetup(false);
      return { ok: true as const };
    } catch (err: any) {
      console.error('Failed to save user phone mapping:', err);
      return { ok: false as const, message: err.message || 'Failed to link phone number.' };
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
