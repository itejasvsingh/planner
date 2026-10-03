import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { cycleRange, elapsedDays } from '@/lib/finance-analysis';

/** How far back the stepper goes (two years of salary cycles). */
export const OLDEST_CYCLE = -23;

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** The cycle's name: "This cycle", "Last cycle", or the month it started in. */
export function cycleName(payday: number, offset: number) {
  if (offset === 0) return 'This cycle';
  if (offset === -1) return 'Last cycle';
  return cycleRange(payday, offset).start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** ‹ This cycle › — steps through salary cycles; shared by Overview and Analysis. */
export default function CycleStepper({ payday, offset, onChange }: { payday: number; offset: number; onChange: (offset: number) => void }) {
  const c = useTheme();
  const cycle = cycleRange(payday, offset);
  const lastDay = new Date(cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate() - 1);
  const inProgress = offset === 0;
  const atOldest = offset <= OLDEST_CYCLE;
  return (
    <View style={[styles.stepper, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous cycle" disabled={atOldest} onPress={() => onChange(offset - 1)} style={[styles.stepBtn, { opacity: atOldest ? 0.3 : 1 }]}>
        <ChevronLeft color={c.text} size={20} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={inProgress ? 'This cycle' : 'Back to this cycle'}
        disabled={inProgress}
        onPress={() => onChange(0)}
        style={{ alignItems: 'center', flex: 1 }}
      >
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{cycleName(payday, offset)}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 1 }}>
          {short(cycle.start)} – {short(lastDay)}
          {inProgress ? ` · day ${elapsedDays(cycle)} of ${cycle.days}` : ' · tap for today'}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next cycle" disabled={inProgress} onPress={() => onChange(Math.min(0, offset + 1))} style={[styles.stepBtn, { opacity: inProgress ? 0.3 : 1 }]}>
        <ChevronRight color={c.text} size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.lg, paddingVertical: 8, paddingHorizontal: 6, marginBottom: 8 },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
