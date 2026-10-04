import { syncGmail } from './gmail';

/** Opens new statements with the saved passwords, within what's left of a request started at `started`. */
export async function readInBackground(phone: string, started: number) {
  try {
    await syncGmail(phone, started + 55_000, { statements: 4 });
  } catch (e) {
    console.warn('Background statement read:', (e as Error).message);
  }
}
