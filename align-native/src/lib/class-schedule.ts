import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { auth } from '@/lib/firebase';
import { getItem, setItem } from '@/lib/storage';
import { usePhone } from '@/lib/phone-context';

const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';
const CACHE_KEY = 'align_class_schedule';

/** One class from your class timetable (see lib/q567.ts on the server). */
export type ClassSlot = {
  date: string;
  start: string;
  end: string;
  code: string;
  title: string;
  room: string | null;
  instructor: string | null;
  kind: 'class' | 'icrc';
  status: 'ok' | 'cancelled' | 'moved' | 'retimed';
  note: string | null;
};

/**
 * Your class timetable, read-only: asked from Align's server (only the configured owner gets anything back) and
 * kept on the phone so it shows offline. `[]` when the feature is off.
 */
export function useClassSchedule(): ClassSlot[] {
  const { phone } = usePhone();
  const [classes, setClasses] = useState<ClassSlot[]>([]);

  useEffect(() => {
    if (!phone) return;
    let live = true;
    void getItem(CACHE_KEY).then(raw => {
      if (!raw || !live) return;
      try { setClasses(JSON.parse(raw)); } catch { /* ignore a bad cache */ }
    });
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/q567/schedule`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);
        if (!live || !res.ok || !data) return;
        const next: ClassSlot[] = data.enabled ? data.classes || [] : [];
        setClasses(next);
        void setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // offline: keep the cached timetable
      }
    })();
    return () => { live = false; };
  }, [phone]);

  return classes;
}
