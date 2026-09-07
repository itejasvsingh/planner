import { useEffect, useState } from 'react';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { useLocalReminders } from '@/lib/use-notifications';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function NotificationsManager() {
  const { phone } = usePhone();
  const { items } = usePlannerItems(phone);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    async function load() {
      if (!phone) return;
      try {
        const pref = await getDoc(doc(db, 'planner_settings', `preferences_${phone}`));
        if (pref.exists()) {
          // If we had a specific setting for local reminders, we'd read it here.
          // But for now, we just check if we have permissions and if so, enable local reminders.
        }
      } catch (e) {
        console.warn(e);
      }
    }
    load();
  }, [phone]);

  useLocalReminders(items, true); // True means we will attempt if permissions are granted

  return null;
}

