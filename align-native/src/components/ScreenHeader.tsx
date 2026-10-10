import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloudOff, RefreshCw, UserRound } from 'lucide-react-native';
import { usePhone } from '@/lib/phone-context';
import { setSideMenuOpen } from '@/lib/side-menu-state';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Type } from '@/constants/theme';
import { triggerHaptic } from '@/lib/haptics';
import { flush, useOutbox } from '@/lib/outbox';

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
        { transform: [{ scale: pressed ? 0.94 : 1 }] },
        filled
          ? { backgroundColor: c.accentFill, borderColor: c.accentFill }
          : { backgroundColor: c.backgroundElement, borderColor: c.border },
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Avatar button that opens the side menu. */
function ProfileButton() {
  const c = useTheme();
  const { firebaseUser } = usePhone();
  const initial = (firebaseUser?.displayName || firebaseUser?.email || '').trim().charAt(0).toUpperCase();
  return (
    <HeaderButton label="Open menu" onPress={() => setSideMenuOpen(true)}>
      {initial
        ? <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{initial}</Text>
        : <UserRound color={c.text} size={19} />}
    </HeaderButton>
  );
}

/** Shows when changes made on this device haven't reached the server yet; tap to retry now. */
function SyncStatus() {
  const c = useTheme();
  const { phone } = usePhone();
  const owner = phone || 'guest';
  const { queue, online } = useOutbox(owner);
  if (!queue.length) return null;
  const offline = online === false;
  const Icon = offline ? CloudOff : RefreshCw;
  const label = offline
    ? `Offline · ${queue.length} ${queue.length === 1 ? 'change' : 'changes'} saved`
    : `Syncing ${queue.length}…`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to sync now.`}
      onPress={() => void flush(owner)}
      style={[styles.sync, { backgroundColor: offline ? c.warningSoft : c.backgroundMuted }]}
    >
      <Icon size={13} color={offline ? c.warning : c.textSecondary} />
      <Text style={{ color: offline ? c.warning : c.textSecondary, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/** Shared header for the main tabs: profile button + actions row, then a large title and subtitle. */
export default function ScreenHeader({
  title,
  subtitle,
  actions,
  aside,
}: {
  title: string;
  subtitle?: string;
  /** Buttons shown top-right. */
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
        <ProfileButton />
        <SyncStatus />
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
  sync: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill },
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
