import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, whenSignedIn } from '@/lib/firebase';
import { todayKey } from '@/lib/dates';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { overdueTasks } from '@/lib/task-rollover';

/**
 * Auto-push tasks (Settings → Notifications): while the app is open, undone tasks from earlier days move to
 * today: on open, when the app comes back to the front, and at midnight.
 */
export default function TaskRollover() {
  const { phone } = usePhone();
  const { items, loading, moveTasks } = usePlannerItems(phone);
  const [enabled, setEnabled] = useState(false);
  const [today, setToday] = useState(todayKey);

  // The setting lives in planner_settings/preferences_<phone>.autoPushEnabled (off unless turned on)
  useEffect(() => {
    if (!phone) return;
    return whenSignedIn(() =>
      onSnapshot(
        doc(db, 'planner_settings', `preferences_${phone}`),
        (snap) => setEnabled(snap.exists() && snap.data()?.autoPushEnabled === true),
        (err) => console.warn('Auto-push setting notice:', err),
      ),
    );
  }, [phone]);

  // Notice a new day: when the app returns to the front, and once a minute while it's open
  useEffect(() => {
    const check = () => setToday(todayKey());
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    const timer = setInterval(check, 60_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!enabled || loading) return;
    const moves = overdueTasks(items, today);
    if (moves.length) void moveTasks(moves, today);
  }, [enabled, loading, items, today, moveTasks]);

  return null;
}
