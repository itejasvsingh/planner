import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const PAD = 6;

/** One account's balance over the last weeks: a line with the day's balance under your finger. Needs 2+ days saved. */
export default function BalanceTrend({ history, height = 90, hideNote = false }: { history?: { d: string; b: number }[]; height?: number; hideNote?: boolean }) {
  const H = height;
  const c = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const pts = Array.isArray(history) ? history : [];
  if (pts.length < 2) return hideNote ? null : <Text style={{ color: c.textTertiary, fontSize: 12 }}>Trend starts today: Align now keeps each day&apos;s balance.</Text>;

  const lo = Math.min(...pts.map(p => p.b));
  const hi = Math.max(...pts.map(p => p.b));
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * Math.max(1, w - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.b).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const i = sel ?? pts.length - 1;
  const day = new Date(`${pts[i].d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <View>
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, fontVariant: ['tabular-nums'] }}>{day} · {money(pts[i].b)}</Text>
      <Pressable
        accessibilityRole="image"
        accessibilityLabel={`Balance over time, now ${money(pts[pts.length - 1].b)}`}
        onLayout={e => setW(e.nativeEvent.layout.width)}
        onPress={e => w && setSel(Math.max(0, Math.min(pts.length - 1, Math.round(((e.nativeEvent.locationX - PAD) / Math.max(1, w - PAD * 2)) * (pts.length - 1)))))}
        style={{ height: H }}
      >
        {w > 0 && (
          <Svg width={w} height={H}>
            <Path d={area} fill={c.income} fillOpacity={0.12} />
            <Path d={line} stroke={c.income} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(i)} cy={y(pts[i].b)} r={4} fill={c.income} stroke={c.backgroundElement} strokeWidth={2} />
          </Svg>
        )}
      </Pressable>
    </View>
  );
}
