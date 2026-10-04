import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { getItem, setItem } from '@/lib/storage';
import { findSuspicious } from '@/lib/suspicious';
import { todayKey } from '@/lib/dates';

/**
 * A phone notification when a new payment looks unusual (Money → "payments to check" has the details).
 * Each payment is announced once, and only recent ones (today or yesterday), so a first run on old
 * history doesn't flood you.
 */
export default function SuspiciousWatcher() {
  const { phone } = usePhone();
  const { items, loading } = usePlannerItems(phone);
  const today = todayKey();
  const flags = useMemo(() => findSuspicious(items, today), [items, today]);

  useEffect(() => {
    if (Platform.OS === 'web' || loading || !phone || !flags.length) return;
    const key = `align_suspicious_notified_${phone}`;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    void (async () => {
      try {
        const seen = new Set<string>(JSON.parse((await getItem(key)) || '[]'));
        const fresh = flags.filter(f => !seen.has(f.item.id) && (f.item.date || '') >= yesterday);
        if (!fresh.length) return;
        const { status } = await Notifications.getPermissionsAsync();
        for (const f of fresh.slice(0, 3)) {
          seen.add(f.item.id);
          if (status !== 'granted') continue;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Check this payment: ₹${Number(f.item.amount).toLocaleString('en-IN')}`,
              body: `${f.item.title || 'Payment'}: ${f.reasons[0]}. Open Money to tell Align if it was you.`,
              sound: true,
            },
            trigger: null,
          });
        }
        await setItem(key, JSON.stringify([...seen].slice(-300)));
      } catch (e) {
        console.warn('Suspicious payment notice:', e);
      }
    })();
  }, [flags, loading, phone]);

  return null;
}
