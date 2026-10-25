import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { getItem, setItem } from '@/lib/storage';
import { matchPurchase, nearbyBuys, openBuys } from '@/lib/buy';
import { lastPosition } from '@/lib/last-position';
import { todayKey } from '@/lib/dates';

/**
 * Keeps the "Buy later" list honest: an item is ticked off when a later spend looks like buying it (merchant is its shop, its
 * name, or the price matches), and in the Android app a phone notice says when you're near a place you pinned an item to
 * (checked when the app is open or comes back; location is never read in the background).
 */
export default function BuyWatcher() {
  const { phone } = usePhone();
  const { items, loading, updateItem } = usePlannerItems(phone);
  const open = useMemo(() => openBuys(items as any[]), [items]);

  // Ticking off
  useEffect(() => {
    if (loading || !open.length) return;
    const spends = (items as any[]).filter(i => i.type === 'expense');
    for (const b of open) {
      const hit = matchPurchase(b, spends);
      if (hit) void updateItem(b.id, { done: true, boughtTx: hit.id });
    }
  }, [items, loading, open, updateItem]);

  // Near a pinned place
  useEffect(() => {
    if (Platform.OS === 'web' || loading || !phone || !open.some(b => b.place)) return;
    void (async () => {
      try {
        const here = await lastPosition();
        if (!here) return;
        const near = nearbyBuys(open, here);
        if (!near.length) return;
        const key = `align_buy_near_${phone}_${todayKey()}`;
        const told = new Set<string>(JSON.parse((await getItem(key)) || '[]'));
        const fresh = near.filter(b => !told.has(b.id));
        if (!fresh.length) return;
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          await Notifications.scheduleNotificationAsync({
            content: { title: 'You’re near a place on your list', body: fresh.map(b => b.title).slice(0, 4).join(', '), sound: true },
            trigger: null,
          });
        }
        fresh.forEach(b => told.add(b.id));
        await setItem(key, JSON.stringify([...told]));
      } catch (e) {
        console.warn('Buy list nearby notice:', e);
      }
    })();
  }, [open, loading, phone]);

  return null;
}
