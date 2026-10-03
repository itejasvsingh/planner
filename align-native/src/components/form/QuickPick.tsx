import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, Clock } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';

/**
 * One-tap date and time choices for the add/edit sheets: the common answers as chips, plus the system
 * picker for anything else (a native dialog in the app, a date/time field on the web).
 */

const pad = (n: number) => String(n).padStart(2, '0');
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const shiftDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: React.ReactNode }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, on ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border }]}
    >
      {icon}
      <Text style={{ color: on ? c.onAccent : c.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Today / Yesterday (or Tomorrow) / any date. `mode` picks which neighbour of today is offered. */
export function DatePick({ value, onChange, mode }: { value: Date; onChange: (d: Date) => void; mode: 'past' | 'future' }) {
  const c = useTheme();
  const [picking, setPicking] = useState(false);
  const today = new Date();
  const other = shiftDays(today, mode === 'past' ? -1 : 1);
  const isToday = sameDay(value, today);
  const isOther = sameDay(value, other);
  const custom = !isToday && !isOther;
  const customLabel = custom ? value.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Pick a date';
  const icon = <CalendarDays size={15} color={custom ? c.onAccent : c.textSecondary} />;

  return (
    <View style={styles.row}>
      <Chip label="Today" on={isToday} onPress={() => onChange(today)} />
      <Chip label={mode === 'past' ? 'Yesterday' : 'Tomorrow'} on={isOther} onPress={() => onChange(other)} />
      {Platform.OS === 'web' ? (
        <label style={{ position: 'relative', display: 'flex' }}>
          <Chip label={customLabel} on={custom} onPress={() => {}} icon={icon} />
          <input
            aria-label="Pick a date"
            type="date"
            value={keyOf(value)}
            onChange={(e) => e.target.value && onChange(fromKey(e.target.value))}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
          />
        </label>
      ) : (
        <>
          <Chip label={customLabel} on={custom} onPress={() => setPicking(true)} icon={icon} />
          {picking ? (
            <DateTimePicker
              value={value}
              mode="date"
              onChange={(_, d) => {
                setPicking(Platform.OS === 'ios');
                if (d) onChange(d);
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const TIMES: [string, number, number][] = [['9 AM', 9, 0], ['1 PM', 13, 0], ['6 PM', 18, 0], ['9 PM', 21, 0]];

/** Reminder time: none, a few common times, or any time. `value` is "HH:MM" or null. */
export function TimePick({ value, onChange }: { value: string | null; onChange: (t: string | null) => void }) {
  const c = useTheme();
  const [picking, setPicking] = useState(false);
  const preset = TIMES.find(([, h, m]) => value === `${pad(h)}:${pad(m)}`);
  const custom = !!value && !preset;
  const customLabel = custom ? (() => {
    const [h, m] = value!.split(':').map(Number);
    return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
  })() : 'Other time';
  const asDate = () => {
    const d = new Date();
    if (value) {
      const [h, m] = value.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    }
    return d;
  };
  const icon = <Clock size={15} color={custom ? c.onAccent : c.textSecondary} />;

  return (
    <View style={styles.row}>
      <Chip label="No reminder" on={!value} onPress={() => onChange(null)} />
      {TIMES.map(([label, h, m]) => (
        <Chip key={label} label={label} on={value === `${pad(h)}:${pad(m)}`} onPress={() => onChange(`${pad(h)}:${pad(m)}`)} />
      ))}
      {Platform.OS === 'web' ? (
        <label style={{ position: 'relative', display: 'flex' }}>
          <Chip label={customLabel} on={custom} onPress={() => {}} icon={icon} />
          <input
            aria-label="Other time"
            type="time"
            value={value || ''}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
          />
        </label>
      ) : (
        <>
          <Chip label={customLabel} on={custom} onPress={() => setPicking(true)} icon={icon} />
          {picking ? (
            <DateTimePicker
              value={asDate()}
              mode="time"
              onChange={(_, d) => {
                setPicking(Platform.OS === 'ios');
                if (d) onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: Radius.pill, borderWidth: 1 },
});
