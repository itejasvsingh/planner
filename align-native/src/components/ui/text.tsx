import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

/**
 * Text that follows the phone's font size setting up to a point. Large system font sizes (common on Android,
 * e.g. Xiaomi) otherwise blow every screen up until sheets no longer fit. Use these instead of react-native's.
 */
export const MAX_FONT_SCALE = 1.2;

export function Text(props: TextProps & { ref?: React.Ref<RNText> }) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

export function TextInput(props: TextInputProps & { ref?: React.Ref<RNTextInput> }) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

// Same names work as types too, e.g. useRef<TextInput>(null)
export type Text = RNText;
export type TextInput = RNTextInput;
