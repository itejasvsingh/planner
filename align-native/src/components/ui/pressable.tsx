import { forwardRef, useState } from 'react';
import { Pressable as RNPressable, type PressableProps, type View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Pressable with touch feedback: dims and shrinks slightly while pressed (feedback on press-in, 120 ms).
 * Reduced motion keeps the dim and drops the scale. Callers that style the pressed state themselves
 * (style as a function) are passed through unchanged.
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable({ style, onPressIn, onPressOut, ...rest }, ref) {
  const [down, setDown] = useState(false);
  const reduced = useReducedMotion();
  if (typeof style === 'function') return <RNPressable ref={ref} style={style} onPressIn={onPressIn} onPressOut={onPressOut} {...rest} />;
  const active = down && !rest.disabled;
  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      onPressIn={e => { setDown(true); onPressIn?.(e); }}
      onPressOut={e => { setDown(false); onPressOut?.(e); }}
      style={[
        style,
        { transitionProperty: ['opacity', 'transform'], transitionDuration: 120, transitionTimingFunction: 'ease-out' },
        active && { opacity: 0.6, ...(reduced ? null : { transform: [{ scale: 0.97 }] }) },
      ]}
    />
  );
});
