import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { usePhone } from '@/lib/phone-context';
import { useBudgetLimits, usePlannerItems } from '@/lib/use-planner-items';
import { buildWidgetSnapshot } from '@/lib/widget-snapshot';
import { AlignWidget, WIDGET_KEY } from '@/widget/AlignWidget';

/** Keeps the Android home-screen widget current: saves a small snapshot and asks the widget to redraw. */
export default function WidgetSync() {
  const { phone } = usePhone();
  const { items } = usePlannerItems(phone);
  const { budgetLimits } = useBudgetLimits(phone);
  const payday = budgetLimits?.payday || 1;

  useEffect(() => {
    if (!phone) return;
    const snapshot = buildWidgetSnapshot(items, payday);
    void (async () => {
      try {
        await AsyncStorage.setItem(WIDGET_KEY, JSON.stringify(snapshot));
        await requestWidgetUpdate({ widgetName: 'AlignToday', renderWidget: () => <AlignWidget snapshot={snapshot} /> });
      } catch (e) {
        console.warn('Widget update:', e);
      }
    })();
  }, [phone, items, payday]);

  return null;
}
