import { forwardRef } from 'react';
import { Pressable as RNPressable, type PressableProps, type View } from 'react-native';

/**
 * Pressable with iOS-style touch feedback (dims while pressed).
 * Callers that style the pressed state themselves (style as a function) are passed through unchanged.
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable({ style, ...rest }, ref) {
  if (typeof style === 'function') return <RNPressable ref={ref} style={style} {...rest} />;
  return <RNPressable ref={ref} {...rest} style={({ pressed }) => [style, pressed && !rest.disabled && { opacity: 0.6 }]} />;
});
