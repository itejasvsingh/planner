import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isValidPhone, normalizePhone } from '@/lib/phone';
import { getItem, PHONE_KEY, removeItem, setItem } from '@/lib/storage';

type PhoneContextValue = {
  ready: boolean;
  phone: string | null;
  login: (raw: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
};

const PhoneContext = createContext<PhoneContextValue | null>(null);

export function PhoneProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await getItem(PHONE_KEY);
      const cleaned = raw ? normalizePhone(raw) : '';
      if (!cancelled) {
        setPhone(cleaned.length >= 10 ? cleaned : null);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (raw: string) => {
    const cleaned = normalizePhone(raw);
    if (!isValidPhone(cleaned)) {
      return { ok: false as const, message: 'Please enter a valid phone number with country code (e.g., 919876543210).' };
    }
    await setItem(PHONE_KEY, cleaned);
    setPhone(cleaned);
    return { ok: true as const };
  }, []);

  const logout = useCallback(async () => {
    await removeItem(PHONE_KEY);
    setPhone(null);
  }, []);

  const value = useMemo(() => ({ ready, phone, login, logout }), [ready, phone, login, logout]);

  return <PhoneContext.Provider value={value}>{children}</PhoneContext.Provider>;
}

export function usePhone() {
  const ctx = useContext(PhoneContext);
  if (!ctx) {
    throw new Error('usePhone must be used within PhoneProvider');
  }
  return ctx;
}
