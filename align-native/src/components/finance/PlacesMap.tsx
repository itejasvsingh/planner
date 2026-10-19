import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';
import { Minus, Plus, Locate } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fitView, fromWorldPx, pointInView, tilesFor, worldPx, type Spot } from '@/lib/places';

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Pins on a map. Map pictures come from a public tile server (only the area in view is requested, never your
 * transactions); if they can't load (offline) the pins still show on a plain background with the places list below.
 */
export default function PlacesMap({ spots, onOpen, height = 240 }: { spots: Spot[]; onOpen?: (spot: Spot) => void; height?: number }) {
  const H = height;
  const c = useTheme();
  const pts = useMemo(() => spots.filter(s => typeof s.lat === 'number' && typeof s.lng === 'number') as (Spot & { lat: number; lng: number })[], [spots]);
  const [w, setW] = useState(340);
  const fit = useMemo(() => fitView(pts, w, H), [pts, w]);
  const [view, setView] = useState<{ center: { lat: number; lng: number }; zoom: number } | null>(null);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const [sel, setSel] = useState<string | null>(null);
  const [failed, setFailed] = useState(0);
  const cur = view || fit;
  const live = useRef({ cur, drag });
  live.current = { cur, drag };

  const centre = useMemo(() => {
    const p = worldPx(cur.center, cur.zoom);
    return fromWorldPx(p.x - drag.dx, p.y - drag.dy, cur.zoom);
  }, [cur, drag]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
    onPanResponderMove: (_, g) => setDrag({ dx: g.dx, dy: g.dy }),
    onPanResponderRelease: (_, g) => {
      const { cur: v } = live.current;
      const p = worldPx(v.center, v.zoom);
      setView({ center: fromWorldPx(p.x - g.dx, p.y - g.dy, v.zoom), zoom: v.zoom });
      setDrag({ dx: 0, dy: 0 });
    },
  }), []);

  if (!pts.length) return null;
  const maxTotal = Math.max(...pts.map(p => p.total), 1);
  const tiles = tilesFor(centre, cur.zoom, w, H);
  const url = (t: { x: number; y: number; z: number }) => `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`;
  const zoom = (d: number) => setView({ center: centre, zoom: Math.max(2, Math.min(18, cur.zoom + d)) });
  const picked = pts.find(p => p.key === sel) || null;

  return (
    <View style={[styles.wrap, { borderColor: c.border, backgroundColor: c.backgroundMuted }]} onLayout={e => setW(Math.max(200, Math.round(e.nativeEvent.layout.width)))}>
      <View style={[{ height: H, overflow: 'hidden' }, { touchAction: 'none' } as any]} {...pan.panHandlers} accessibilityLabel={onOpen ? "Map of where you spend" : "Map of where this was spent"}>
        {tiles.map(t => (
          <Image key={`${t.z}/${t.x}/${t.y}/${t.left}`} source={{ uri: url(t), headers: { 'User-Agent': 'AlignPlanner/1.0 (alignplanner.vercel.app)' } }} onError={() => setFailed(f => f + 1)}
            style={{ position: 'absolute', left: t.left, top: t.top, width: 256, height: 256 }} />
        ))}
        {c.isDark && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#0B1020', opacity: 0.55 }]} />}
        {pts.map(p => {
          const v = pointInView(p, centre, cur.zoom, w, H);
          if (v.x < -30 || v.x > w + 30 || v.y < -30 || v.y > H + 30) return null;
          const size = 16 + Math.round((p.total / maxTotal) * 18);
          const on = sel === p.key;
          return (
            <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`${p.name}, ${money(p.total)}`} onPress={() => setSel(on ? null : p.key)}
              style={{ position: 'absolute', left: v.x - size / 2, top: v.y - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: p.named ? c.accentFill : c.expense, opacity: 0.88, borderWidth: on ? 3 : 2, borderColor: '#fff' }} />
          );
        })}
        <View style={styles.zoom} pointerEvents="box-none">
          {[{ I: Plus, d: 1, l: 'Zoom in' }, { I: Minus, d: -1, l: 'Zoom out' }].map(({ I, d, l }) => (
            <Pressable key={l} accessibilityRole="button" accessibilityLabel={l} onPress={() => zoom(d)} style={[styles.zbtn, { backgroundColor: c.backgroundElement, borderColor: c.border }]}><I color={c.text} size={16} /></Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Fit all pins" onPress={() => { setView(null); setDrag({ dx: 0, dy: 0 }); }} style={[styles.zbtn, { backgroundColor: c.backgroundElement, borderColor: c.border }]}><Locate color={c.text} size={16} /></Pressable>
        </View>
        <Text style={[styles.credit, { color: failed ? c.textTertiary : '#444' }]}>{failed ? 'Map pictures unavailable offline' : '© OpenStreetMap contributors'}</Text>
      </View>
      {picked && (
        <View style={[styles.callout, { backgroundColor: c.backgroundElement, borderTopColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{picked.name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{money(picked.total)} · {picked.count} {picked.count === 1 ? 'transaction' : 'transactions'}</Text>
          </View>
          {picked.named && onOpen && (
            <Pressable accessibilityRole="button" onPress={() => onOpen(picked)} hitSlop={8}><Text style={{ color: c.accent, fontWeight: '700' }}>See transactions</Text></Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: 10 },
  zoom: { position: 'absolute', right: 8, top: 8, gap: 6 },
  zbtn: { width: 32, height: 32, borderRadius: Radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  credit: { position: 'absolute', left: 6, bottom: 4, fontSize: 10 },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: 1 },
});
