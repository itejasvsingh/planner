import { Platform, Share } from 'react-native';
import { toCsv } from '@/lib/finance-analysis';

/** One account's transactions (the ones Align has recorded against it) as a CSV: saved from the browser, or handed to the share sheet. */
export async function downloadStatement(account: { bankName: string; last4?: string | null }, txns: any[]): Promise<void> {
  const csv = toCsv(txns, (t: any) => t.category || '');
  const name = `${account.bankName}${account.last4 ? `-${account.last4}` : ''}`.replace(/[^A-Za-z0-9-]+/g, '-');
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `align-${name}-transactions.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: `${account.bankName} transactions`, message: csv });
}
