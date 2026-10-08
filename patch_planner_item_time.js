const fs = require('fs');
let code = fs.readFileSync('align-native/src/lib/planner-item.ts', 'utf8');

const oldItemTime = `export function itemTime(item: PlannerItem) {
  return item.time || item.reminderTime || item.dueTime || null;
}`;

const newItemTime = `export function itemTime(item: PlannerItem) {
  let time = item.time || item.reminderTime || item.dueTime;
  if (!time && (item.type === 'expense' || item.type === 'income' || item.type === 'transfer') && item.createdAt) {
      try {
          const d = new Date(item.createdAt);
          time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      } catch (e) {}
  }
  return time || null;
}`;

code = code.replace(oldItemTime, newItemTime);

fs.writeFileSync('align-native/src/lib/planner-item.ts', code);
console.log('Patched itemTime fallback');
