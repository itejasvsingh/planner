import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Type } from '@/constants/theme';
import { triggerHaptic } from '@/lib/haptics';

/** Round bordered icon button used in screen headers. */
export function HeaderButton({
  label,
  onPress,
  children,
  filled,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  filled?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={() => {
        triggerHaptic('light');
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        filled
          ? { backgroundColor: c.accentFill, borderColor: c.accentFill }
          : { backgroundColor: c.backgroundElement, borderColor: c.border },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Shared header for the main tabs: menu button + actions row, then a large title and subtitle. */
export default function ScreenHeader({
  title,
  subtitle,
  onMenu,
  actions,
  aside,
}: {
  title: string;
  subtitle?: string;
  onMenu: () => void;
  /** Buttons shown top-right, next to the menu button row. */
  actions?: ReactNode;
  /** Small element aligned with the title's baseline (e.g. a count pill). */
  aside?: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? insets.top + 10 : Math.max(insets.top, 52);

  return (
    <View style={[styles.wrap, { paddingTop: topPadding }]}>
      <View style={styles.bar}>
        <HeaderButton label="Open menu" onPress={onMenu}>
          <Menu color={c.text} size={19} />
        </HeaderButton>
        <View style={styles.actions}>{actions}</View>
      </View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[Type.displayLg, { color: c.text }]} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && <Text style={[styles.subtitle, { color: c.textSecondary }]}>{subtitle}</Text>}
        </View>
        {aside}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
});
