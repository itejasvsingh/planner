import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import { familyFor } from '@/lib/app-fonts';

/**
 * Text that follows the phone's font size setting up to a point. Large system font sizes (common on Android,
 * e.g. Xiaomi) otherwise blow every screen up until sheets no longer fit. Use these instead of react-native's.
 * They also apply the app font: the style's fontWeight picks the matching Figtree file (a style that sets its own
 * fontFamily, like the monospace code text, keeps it).
 */
export const MAX_FONT_SCALE = 1.2;

function withFont<T extends { style?: unknown }>(props: T): T {
  const flat = StyleSheet.flatten(props.style as never) as { fontFamily?: string; fontWeight?: unknown } | undefined;
  if (flat?.fontFamily) return props;
  // fontWeight is reset so the platform doesn't fake-bold a file that already is bold
  return { ...props, style: [props.style, { fontFamily: familyFor(flat?.fontWeight), fontWeight: 'normal' }] };
}

export function Text(props: TextProps & { ref?: React.Ref<RNText> }) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...withFont(props)} />;
}

export function TextInput(props: TextInputProps & { ref?: React.Ref<RNTextInput> }) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...withFont(props)} />;
}

// Same names work as types too, e.g. useRef<TextInput>(null)
export type Text = RNText;
export type TextInput = RNTextInput;
