import { useRef, useState } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CalendarCheck, ShieldCheck, ShoppingBag, Wallet } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';

const SLIDES = [
  { Icon: CalendarCheck, title: 'Welcome to\nAlign', body: 'Plan your days and keep an eye on your money, calmly.' },
  { Icon: Wallet, title: 'Your money,\nnoticed', body: 'Spending is added from your bank messages and emails. Nothing to type, nothing to forget.' },
  { Icon: ShoppingBag, title: 'Never forget\nto buy', body: 'Add it in a second. Get a reminder, and it ticks itself off when you pay.' },
  { Icon: ShieldCheck, title: 'Yours,\nalone', body: 'No ads, nothing sold. Download or delete everything, any time.' },
] as const;

/** First launch: swipe through the slides; the last one has Get Started. */
export default function WelcomeScreen() {
  const router = useRouter();
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [scrollX] = useState(() => new Animated.Value(0));
  const pager = useRef<{ scrollTo: (o: { x: number; animated: boolean }) => void } | null>(null);
  const last = index === SLIDES.length - 1;

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  const start = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    router.replace('/login');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <Animated.ScrollView
        ref={pager as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false, listener: (e: any) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width)) })}
        onMomentumScrollEnd={onEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map(({ Icon, title, body }, i) => {
          const shift = scrollX.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [60, 0, -60], extrapolate: 'clamp' });
          const fade = scrollX.interpolate({ inputRange: [(i - 0.6) * width, i * width, (i + 0.6) * width], outputRange: [0, 1, 0], extrapolate: 'clamp' });
          return (
            <View key={title} style={[styles.slide, { width }]}>
              <Animated.View style={[styles.art, { backgroundColor: c.accentSoft, opacity: fade, transform: [{ translateX: shift }] }]}>
                <Icon color={c.accentFill} size={72} strokeWidth={1.6} />
              </Animated.View>
              <Animated.View style={{ opacity: fade, alignItems: 'center' }}>
                <Text style={[styles.title, { color: c.text }]}>{title}</Text>
                <Text style={[styles.body, { color: c.textSecondary }]}>{body}</Text>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => {
            const w = scrollX.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [8, 24, 8], extrapolate: 'clamp' });
            return <Animated.View key={s.title} style={[styles.dot, { width: w, backgroundColor: i === index ? c.accentFill : c.border }]} />;
          })}
        </View>
        {last ? (
          <Pressable accessibilityRole="button" onPress={() => void start()} style={[styles.button, { backgroundColor: c.accentFill }]}>
            <Text style={{ color: c.onAccent, fontSize: 18, fontWeight: '700' }}>Get Started</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Next page" onPress={() => pager.current?.scrollTo({ x: (index + 1) * width, animated: true })} style={{ height: 56, justifyContent: 'center' }}>
            <Text style={{ color: c.textTertiary, fontSize: 14 }}>Swipe to continue</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 36 },
  art: { width: 220, height: 220, borderRadius: 110, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', letterSpacing: -0.6 },
  body: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginTop: 14, maxWidth: 320 },
  footer: { alignItems: 'center', gap: 24, paddingHorizontal: 32, paddingBottom: 28 },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  button: { width: '100%', maxWidth: 420, height: 56, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
});
