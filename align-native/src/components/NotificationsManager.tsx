import { useMemo } from 'react';
import * as Notifications from 'expo-notifications';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { useLocalReminders } from '@/lib/use-notifications';
import { useCards } from '@/lib/cards-store';
import { cardTitle, inr } from '@/lib/card-format';

/**
 * Local reminders: tasks with a time, and credit cards with reminders on, 3 days before and on the due date
 * at 10:00, with what's owed on the card (statement less payments, plus new spends).
 */
export default function NotificationsManager() {
  const { phone } = usePhone();
  const { items } = usePlannerItems(phone);
  const cards = useCards(phone);

  const cardReminders = useMemo(() => {
    if (!cards) return undefined;
    const out: Notifications.NotificationRequestInput[] = [];
    for (const c of Array.isArray(cards.cards) ? cards.cards : []) {
      if (!c.remind || c.hidden || c.status === 'paid' || !c.dueDate || c.outstanding <= 0) continue;
      const [y, m, d] = c.dueDate.split('-').map(Number);
      const due = new Date(y, m - 1, d, 10, 0, 0);
      const min = c.minDue && c.minDue < c.outstanding ? ` (min ${inr(c.minDue)})` : '';
      out.push({
        content: { title: `${cardTitle(c)} due in 3 days`, body: `${inr(c.outstanding)} to pay${min}. Open Money → Cards.`, sound: true },
        trigger: { date: new Date(due.getTime() - 3 * 86400000), type: Notifications.SchedulableTriggerInputTypes.DATE },
      });
      out.push({
        content: { title: `${cardTitle(c)} is due today`, body: `${inr(c.outstanding)} to pay${min}.`, sound: true },
        trigger: { date: due, type: Notifications.SchedulableTriggerInputTypes.DATE },
      });
    }
    return out;
  }, [cards]);

  useLocalReminders(items, true, cardReminders); // true: attempt if notifications are allowed
  return null;
}
