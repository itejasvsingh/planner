import { useEffect, useRef } from 'react';
import { Animated, Platform, type DimensionValue, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

/** Pulsing placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const c = useTheme();
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver }),
      Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: c.backgroundMuted, opacity }, style]} />;
}
