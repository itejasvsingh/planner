import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';

const ACTION_W = 84;
const LEFT_MAX = 96;

/**
 * A list row you can swipe: right does a quick action (e.g. bookmark) and snaps back; left reveals a Delete button to tap
 * (so nothing is removed by accident). Screen readers get the same two actions from the actions menu.
 */
export default function SwipeRow({ children, enabled = true, background, rightLabel, rightColor, onRight, deleteLabel = 'Delete', deleteColor, onDelete }: {
  children: React.ReactNode;
  enabled?: boolean;
  background: string;
  rightLabel: string;
  rightColor: string;
  onRight: () => void;
  deleteLabel?: string;
  deleteColor: string;
  onDelete: () => void;
}) {
  const [x] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);
  // Covers the row while it's being dragged (and just after), so letting go isn't also a tap on it
  const [block, setBlock] = useState(false);
  const released = useRef(0);
  const live = useRef({ enabled, onRight, open });
  const base = useRef(0);
  useEffect(() => { live.current = { enabled, onRight, open }; });

  const settle = (to: number) => {
    base.current = to;
    setOpen(to !== 0);
    Animated.spring(x, { toValue: to, useNativeDriver: false, bounciness: 4 }).start();
  };

  // The handlers read the latest values through refs only when a gesture happens, never during render
  /* eslint-disable react-hooks/refs */
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => live.current.enabled && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => setBlock(true),
      onPanResponderMove: (_, g) => x.setValue(Math.min(LEFT_MAX, Math.max(-ACTION_W, base.current + g.dx))),
      onPanResponderRelease: (_, g) => {
        released.current = Date.now();
        setTimeout(() => setBlock(false), 350);
        const end = base.current + g.dx;
        if (end > LEFT_MAX * 0.7) { live.current.onRight(); settle(0); }
        else if (end < -ACTION_W / 2) settle(-ACTION_W);
        else settle(0);
      },
      onPanResponderTerminate: () => { setTimeout(() => setBlock(false), 350); settle(base.current); },
    }),
  );
  /* eslint-enable react-hooks/refs */

  const rightOpacity = x.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });
  const delOpacity = x.interpolate({ inputRange: [-12, -1], outputRange: [1, 0], extrapolate: 'clamp' });
  return (
    <View
      accessible={false}
      accessibilityActions={enabled ? [{ name: 'bookmark', label: rightLabel }, { name: 'delete', label: deleteLabel }] : undefined}
      onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'bookmark') onRight(); else if (e.nativeEvent.actionName === 'delete') onDelete(); }}
      style={{ backgroundColor: background }}
    >
      <Animated.View pointerEvents="none" style={[styles.left, { opacity: rightOpacity }]}>
        <Text style={{ color: rightColor, fontWeight: '700', fontSize: 13 }}>{rightLabel}</Text>
      </Animated.View>
      <Animated.View style={[styles.right, { opacity: delOpacity }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={deleteLabel} onPress={() => { settle(0); onDelete(); }} style={[styles.del, { backgroundColor: deleteColor }]}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>{deleteLabel}</Text>
        </Pressable>
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ backgroundColor: background, transform: [{ translateX: x }] }}>
        {children}
        {(open || block) && <Pressable accessibilityLabel="Close actions" onPress={() => { if (open && Date.now() - released.current > 400) settle(0); }} style={StyleSheet.absoluteFill} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  left: { position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' },
  right: { position: 'absolute', right: 0, top: 0, bottom: 0, width: ACTION_W },
  del: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
