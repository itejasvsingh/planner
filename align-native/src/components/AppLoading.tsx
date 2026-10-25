import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Colors, Radius } from '@/constants/theme';

/**
 * The page shown while the app starts: the Align mark breathing gently, one calm line saying what it is waiting for, and,
 * if that takes unusually long, a plain message with a way to try again (never an endless spinner).
 */
export default function AppLoading({ scheme, waitingFor }: { scheme: 'light' | 'dark'; waitingFor: string }) {
  const c = Colors[scheme];
  const [pulse] = useState(() => new Animated.Value(0));
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    const t = setTimeout(() => setSlow(true), 8000);
    return () => { loop.stop(); clearTimeout(t); };
  }, [pulse]);

  const reload = async () => {
    if (Platform.OS === 'web') { window.location.reload(); return; }
    try { await Updates.reloadAsync(); } catch { /* nothing to reload into: stay here */ }
  };

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  return (
    <View style={[styles.wrap, { backgroundColor: c.background }]} accessibilityRole="progressbar" accessibilityLabel={`Align is starting. ${waitingFor}`}>
      <Animated.View style={[styles.mark, { backgroundColor: c.accentFill, transform: [{ scale }], opacity: glow }]}>
        <Text style={{ color: c.onAccent, fontSize: 38, fontWeight: '800', letterSpacing: -1 }}>A</Text>
      </Animated.View>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', marginTop: 20, letterSpacing: -0.4 }}>Align</Text>
      <Text style={{ color: c.textTertiary, fontSize: 14, marginTop: 6 }}>{waitingFor}</Text>
      {slow && (
        <View style={{ alignItems: 'center', marginTop: 28, gap: 12, paddingHorizontal: 32 }}>
          <Text style={{ color: c.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
            This is taking longer than usual. Check your connection, then try again.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void reload()} style={[styles.btn, { backgroundColor: c.accentFill }]}>
            <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 15 }}>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  btn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.pill },
});
