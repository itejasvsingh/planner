import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePhone } from '@/lib/phone-context';
import { refreshCards, useCards } from '@/lib/cards-store';
import { getItem, setItem } from '@/lib/storage';

const REFRESH_EVERY_MS = 10 * 60 * 1000;
const RECENT_MS = 7 * 86400000;

/**
 * Tells you when Align finds a statement it hasn't seen before (read and checked, or waiting for its PDF
 * password): a phone notification once per statement. Refreshes the cards data when the app opens and
 * comes back to the front, at most every 10 minutes.
 */
export default function StatementWatcher() {
  const { phone } = usePhone();
  const data = useCards(phone);
  const last = useRef(0);

  useEffect(() => {
    if (!phone) return;
    const refresh = () => {
      if (Date.now() - last.current < REFRESH_EVERY_MS) return;
      last.current = Date.now();
      void refreshCards(phone);
    };
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [phone]);

  useEffect(() => {
    if (Platform.OS === 'web' || !phone || !data?.checks?.length) return;
    const key = `align_statements_notified_${phone}`;
    void (async () => {
      try {
        const raw = await getItem(key);
        const seen = new Set<string>(raw ? JSON.parse(raw) : []);
        const fresh = data.checks!.filter((k) => k.msgId && k.foundAt && Date.now() - k.foundAt < RECENT_MS && !seen.has(`${k.slot}:${k.msgId}`));
        if (!fresh.length) return;
        const { status } = await Notifications.getPermissionsAsync();
        for (const k of fresh) {
          seen.add(`${k.slot}:${k.msgId}`);
          if (status !== 'granted') continue;
          const waiting = k.state === 'needs_password' || k.state === 'wrong_password';
          await Notifications.scheduleNotificationAsync({
            content: { title: waiting ? 'Statement needs its password' : 'New statement read', body: k.line || `${k.bankName} statement found.`, sound: true },
            trigger: null,
          });
        }
        await setItem(key, JSON.stringify([...seen].slice(-200)));
      } catch (e) {
        console.warn('Statement notice:', e);
      }
    })();
  }, [data, phone]);

  return null;
}
