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
  isRecurring?: boolean;
  
  // Goal specific
  target?: number;
  current?: number;
  unit?: string;
  progressHistory?: { value: number; at: string }[];
  
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
