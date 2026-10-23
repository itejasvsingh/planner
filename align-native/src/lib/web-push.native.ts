/** The Android app schedules its own reminders on the phone (Settings → Notifications), so web push doesn't apply. */
export type PushStatus = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'off' | 'on';
export const pushStatus = async (): Promise<PushStatus> => 'unsupported';
export const enablePush = async (): Promise<PushStatus> => 'unsupported';
export const disablePush = async (): Promise<PushStatus> => 'unsupported';
export const sendTestPush = async (): Promise<number> => 0;
