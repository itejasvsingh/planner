import type { ExpenseSplit } from './splits';

export type PlannerSubtask = {
  done?: boolean;
  title?: string;
};

export type PlannerSplit = {
  name: string;
  amount: number;
  settled: boolean;
};

export type PlannerItem = {
  id: string;
  ownerId?: string;
  type?: 'task' | 'expense' | 'goal' | string;
  title?: string;
  
  // Task specific
  done?: boolean;
  dueDate?: string | null;
  reminderTime?: string | null;
  dueTime?: string | null;
  endTime?: string | null;
  priority?: string;
  subtasks?: PlannerSubtask[];
  
  // Expense specific
  date?: string | null;
  amount?: string | number;
  category?: string;
  tags?: string[];
  splits?: PlannerSplit[];
  /** Shared with friends; `amount` is then your share. See lib/splits.ts. */
  split?: ExpenseSplit | null;
  isRecurring?: boolean;
  recurringFrequency?: 'monthly' | 'weekly' | 'yearly';
  recurringParentId?: string;
  isGeneratedRecurring?: boolean;
  
  // Goal specific
  target?: number;
  current?: number;
  unit?: string;
  progressHistory?: { value: number; at: string }[];
  
  /** Set when the item was recorded automatically (e.g. from a bank SMS). */
  source?: 'sms' | 'email' | 'gmail' | 'statement' | string;
  /** 'card_bill': a credit card bill reminder task created from Gmail (see lib/cardBills.ts on the server). */
  kind?: 'card_bill' | string;
  // Note specific (type 'note'); `title` is optional for notes
  body?: string;
  pinned?: boolean;
  /** ISO time of the last edit (notes are listed newest first). */
  updatedAt?: string;
  /** Set when auto-push moved an overdue task to a later day: the day it was due. */
  rolledOverFrom?: string;
  bill?: { issuer: string; issuerName: string; last4: string | null; totalDue: number; minDue: number | null };
  /** When the money moved, HH:MM (24-hour, India), for transactions read from SMS, email or Gmail. */
  time?: string | null;
  /** Bank reference (UPI RRN / UTR) when known; lets the same payment from SMS, email and statements match. */
  ref?: string | null;
  autoDetected?: boolean;

  createdAt?: any;
};

export function itemDateKey(item: PlannerItem) {
  return item.dueDate || item.date || '';
}

export function itemTime(item: PlannerItem) {
  return item.reminderTime || item.dueTime || null;
}

export function isTaskForDate(item: PlannerItem, dateKey: string) {
  return item.type === 'task' && itemDateKey(item) === dateKey;
}
