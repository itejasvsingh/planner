import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { idSeeds, type StatementTxn } from '@/lib/statement-match';

const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';

export type PickedStatement = { name: string; base64: string };

const TYPES = [
  'application/pdf',
  'text/csv',
  'text/comma-separated-values',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Lets the user choose a statement file; null if they cancel. */
export async function pickStatement(): Promise<PickedStatement | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false, base64: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const buf = asset.file ? await asset.file.arrayBuffer() : await new File(asset.uri).arrayBuffer();
  return { name: asset.name, base64: toBase64(buf) };
}

export type ReadResponse =
  | { status: 'ok'; rows: StatementTxn[] }
  | { status: 'password'; incorrect: boolean }
  | { status: 'error'; message: string };

/** Sends the file to be read; the server keeps nothing. */
export async function readStatementFile(file: PickedStatement, password?: string): Promise<ReadResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/statement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: file.base64, password }),
    });
  } catch {
    return { status: 'error', message: 'Reading a statement needs an internet connection.' };
  }
  const data = await res.json().catch(() => null);
  if (!data) return { status: 'error', message: `Could not read this statement (error ${res.status}).` };
  if (data.status === 'ok' && Array.isArray(data.rows)) return { status: 'ok', rows: data.rows };
  if (data.status === 'password') return { status: 'password', incorrect: !!data.incorrect };
  return { status: 'error', message: data.message || 'Could not read this statement.' };
}

/** Document ids for the rows (see idSeeds), matching the ids SMS auto-import gives the same payments. */
export async function statementIds(phone: string, rows: StatementTxn[]) {
  const seeds = idSeeds(phone, rows);
  const hashes = await Promise.all(seeds.map(s => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s)));
  return hashes.map((h, i) => `${seeds[i].startsWith(`${phone}_ref_`) ? 'auto' : 'stmt'}_${h.slice(0, 28)}`);
}
