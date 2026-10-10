import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, User, Clock, Bookmark, CreditCard, HelpCircle, LogOut } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';

export default function ProfileScreen() {
  const theme = useTheme();
  const { firebaseUser, logout, phone } = usePhone();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const userEmail = firebaseUser?.email || 'user@example.com';
  const userName = phone || 'Align User';

  const menuItems = [
    { icon: User, label: 'Edit Profile', onPress: () => router.push('/settings') },
    { icon: Clock, label: 'My Activity', onPress: () => router.push('/(tabs)') },
    { icon: Bookmark, label: 'Saved Items', onPress: () => {} },
    { icon: CreditCard, label: 'Payment Methods', onPress: () => router.push('/(tabs)/finance') },
    { icon: HelpCircle, label: 'Help & Support', onPress: () => {} },
    { icon: LogOut, label: 'Log Out', onPress: () => logout(), isDestructive: true },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header section (Purple background) */}
      <View style={[styles.header, { backgroundColor: theme.accentFill, paddingTop: insets.top + 20 }]}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>A</Text>
        </View>
        <Text style={styles.name}>{userName}</Text>
        <Text style={styles.email}>{userEmail}</Text>
      </View>

      {/* Menu List */}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}>
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={index}
              style={({ pressed }) => [
                styles.menuItem,
                { borderBottomColor: theme.border },
                pressed && { backgroundColor: theme.backgroundElement }
              ]}
              onPress={item.onPress}
            >
              <View style={styles.menuLeft}>
                <Icon size={20} color={item.isDestructive ? theme.red : theme.textSecondary} />
                <Text style={[styles.menuLabel, { color: item.isDestructive ? theme.red : theme.text }]}>
                  {item.label}
                </Text>
              </View>
              {!item.isDestructive && (
                <ChevronRight size={20} color={theme.textTertiary} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingBottom: 40,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffffff30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
  },
  scroll: {
    flex: 1,
    marginTop: 20,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});

