import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { type PlannerItem } from '@/lib/planner-item';
import { timeToMinutes } from '@/lib/dates';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useLocalReminders(items: PlannerItem[], enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      Notifications.cancelAllScheduledNotificationsAsync().catch(console.warn);
      return;
    }

    const scheduleUpcoming = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        await Notifications.cancelAllScheduledNotificationsAsync();
        
        const now = new Date();
        const toSchedule: Notifications.NotificationRequestInput[] = [];

        items.forEach((item) => {
          if (item.type === 'task' && !item.done && item.dueDate && (item.reminderTime || item.dueTime)) {
            const timeStr = item.reminderTime || item.dueTime;
            const [h, m] = (timeStr as string).split(':').map(Number);
            if (!isNaN(h) && !isNaN(m)) {
              const [year, month, day] = item.dueDate.split('-').map(Number);
              const targetDate = new Date(year, month - 1, day, h, m, 0);

              if (targetDate.getTime() > now.getTime()) {
                toSchedule.push({
                  content: {
                    title: 'Planner Reminder',
                    body: item.title || 'Upcoming Task',
                    sound: true,
                  },
                  trigger: { 
                    date: targetDate,
                    type: Notifications.SchedulableTriggerInputTypes.DATE
                  },
                });
              }
            }
          }
        });

        for (const req of toSchedule) {
          await Notifications.scheduleNotificationAsync(req);
        }
      } catch (e) {
        console.warn('Local notification scheduling:', e);
      }
    };

    scheduleUpcoming();
  }, [items, enabled]);
}
