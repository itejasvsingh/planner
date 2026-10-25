import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { ArrowRight, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const KNOB = 48;

/**
 * Drag the knob to the end to confirm (a deliberate gesture for connecting something). Screen readers get a plain
 * "activate" action, and a tap on the track nudges the knob so it's clear what to do.
 */
export default function SlideToConnect({ label = 'Slide to connect', busy = false, onComplete }: { label?: string; busy?: boolean; onComplete: () => void }) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const max = Math.max(0, width - KNOB - 8);
  const state = useRef({ max: 0, busy: false, done: onComplete });
  useEffect(() => { state.current = { max, busy, done: onComplete }; });

  // The handlers read the latest values through a ref only when a gesture happens, never during render
  /* eslint-disable react-hooks/refs */
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !state.current.busy,
      onMoveShouldSetPanResponder: () => !state.current.busy,
      onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(0, g.dx), state.current.max)),
      onPanResponderRelease: (_, g) => {
        const { max: m, done } = state.current;
        if (m > 0 && g.dx >= m * 0.85) {
          Animated.timing(x, { toValue: m, duration: 90, useNativeDriver: false }).start(() => {
            done();
            setTimeout(() => x.setValue(0), 600);
          });
        } else Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
    }),
  );
  /* eslint-enable react-hooks/refs */

  const nudge = () => Animated.sequence([
    Animated.timing(x, { toValue: Math.min(40, max), duration: 140, useNativeDriver: false }),
    Animated.spring(x, { toValue: 0, useNativeDriver: false }),
  ]).start();

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => !busy && onComplete()}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      onTouchEnd={() => { if (!busy) nudge(); }}
      style={[styles.track, { backgroundColor: c.backgroundMuted, borderColor: c.border }]}
    >
      <Text style={{ color: c.textTertiary, fontWeight: '700', fontSize: 15, textAlign: 'center', width: '100%', paddingLeft: KNOB / 2 }}>{busy ? 'Connecting…' : label}</Text>
      <Animated.View {...pan.panHandlers} style={[styles.knob, { backgroundColor: c.accentFill, transform: [{ translateX: x }] }]}>
        {busy ? <Check color={c.onAccent} size={20} /> : <ArrowRight color={c.onAccent} size={20} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: KNOB + 8, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  knob: { position: 'absolute', left: 4, top: 4, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
});
