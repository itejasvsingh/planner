import { StyleSheet, View } from 'react-native';
import { GraduationCap } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { useClassSchedule } from '@/lib/class-schedule';

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** Your classes on a day, read-only. Shows nothing when there are none (or the feature is off). */
export default function ClassesSection({ dateKey }: { dateKey: string }) {
  const c = useTheme();
  const rows = useClassSchedule().filter(k => k.date === dateKey);
  if (!rows.length) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.header, { color: c.textTertiary }]}>Classes</Text>
      <View style={{ gap: 8 }}>
        {rows.map((k, i) => {
          const off = k.status === 'cancelled';
          const state = off ? 'Cancelled' : k.status === 'moved' ? 'Moved here' : k.status === 'retimed' ? 'New time' : '';
          const extra = [state, k.note].filter(Boolean).join(' · ');
          return (
            <View key={`${k.code}-${k.start}-${i}`} style={[styles.row, { backgroundColor: c.backgroundElement, borderColor: c.border, opacity: off ? 0.6 : 1 }]}>
              <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><GraduationCap color={c.accent} size={18} /></View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: c.text, fontWeight: '700', fontSize: 15, textDecorationLine: off ? 'line-through' : 'none' }}>{k.title}</Text>
                <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 13 }}>
                  {clock(k.start)} – {clock(k.end)}{k.room ? ` · Room ${k.room}` : ''}
                </Text>
                {!!extra && <Text numberOfLines={2} style={{ color: off ? c.expense : c.warning, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{extra}</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Radius.lg, padding: 14 },
  icon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
