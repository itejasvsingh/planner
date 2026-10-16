import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';

const money = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const H = 120;
const PAD = 8;

/** Running net (income less spending) through the cycle: one line on a zero baseline; tap to read a day. */
export default function NetSavingsChart({ points }: { points: { key: string; date: Date; net: number }[] }) {
  const c = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  if (points.length < 2) return <Text style={{ color: c.textSecondary, fontSize: 13 }}>A few more days and this line fills in.</Text>;

  const lo = Math.min(0, ...points.map(p => p.net));
  const hi = Math.max(0, ...points.map(p => p.net));
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * Math.max(1, w - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const zero = y(0);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.net).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${zero.toFixed(1)} L${x(0).toFixed(1)} ${zero.toFixed(1)} Z`;
  const i = sel ?? points.length - 1;
  const p = points[i];

  return (
    <View>
      <Text style={{ color: c.text, fontWeight: '600', fontSize: 13, marginBottom: 10, fontVariant: ['tabular-nums'] }}>
        {p.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {p.net >= 0 ? 'ahead by' : 'behind by'} {money(Math.abs(p.net))}
      </Text>
      <Pressable
        accessibilityRole="image"
        accessibilityLabel={`Net savings, ${money(points[points.length - 1].net)} so far`}
        onLayout={e => setW(e.nativeEvent.layout.width)}
        onPress={e => w && setSel(Math.max(0, Math.min(points.length - 1, Math.round(((e.nativeEvent.locationX - PAD) / Math.max(1, w - PAD * 2)) * (points.length - 1)))))}
        style={{ height: H }}
      >
        {w > 0 && (
          <Svg width={w} height={H}>
            <Path d={area} fill={c.accent} fillOpacity={0.14} />
            <Line x1={PAD} x2={w - PAD} y1={zero} y2={zero} stroke={c.textTertiary} strokeWidth={1} strokeDasharray="4 4" />
            <Path d={line} stroke={c.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(i)} cy={y(p.net)} r={4} fill={c.accent} stroke={c.backgroundElement} strokeWidth={2} />
          </Svg>
        )}
      </Pressable>
    </View>
  );
}
