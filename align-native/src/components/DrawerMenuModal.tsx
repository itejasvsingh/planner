import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated, Dimensions } from 'react-native';
import { LogOut, Shield, MessageCircle, Moon, Sun, Bell, RefreshCw, Smartphone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';

interface DrawerMenuModalProps {
  visible: boolean;
  onClose: () => void;
}

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.75;

export default function DrawerMenuModal({ visible, onClose }: DrawerMenuModalProps) {
  const theme = useTheme();
  const { phone, logout } = usePhone();
  const router = useRouter();
  
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 250, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true })
      ]).start();
    }
  }, [visible]);

  if (!visible && slideAnim.setOffset === undefined) return null;

  const navigateTo = (path: any) => {
    onClose();
    setTimeout(() => router.push(path), 300);
  };

  const formattedPhone = phone ? (phone.length > 10 ? `+${phone.slice(0, phone.length - 10)} ` : '') + `******${phone.slice(-4)}` : '';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.drawer, { backgroundColor: theme.background, transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.header}>
            <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
              <Smartphone color={theme.text} size={24} />
            </View>
            <View style={styles.accountInfo}>
              <Text style={[styles.phoneText, { color: theme.text }]}>{formattedPhone}</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Cloud Synced</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Settings</Text>
            
            <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/whatsapp')}>
              <MessageCircle color={theme.text} size={22} />
              <Text style={[styles.menuText, { color: theme.text }]}>WhatsApp & Bot</Text>
            </Pressable>

            <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/security')}>
              <Shield color={theme.text} size={22} />
              <Text style={[styles.menuText, { color: theme.text }]}>Security & Privacy</Text>
            </Pressable>
            
            <View style={[styles.menuItem, { borderBottomColor: theme.border }]}>
              <Moon color={theme.text} size={22} />
              <Text style={[styles.menuText, { color: theme.text }]}>Appearance</Text>
              <Text style={{ color: theme.textSecondary }}>Auto</Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <Pressable style={[styles.menuItem, { borderBottomWidth: 0, marginTop: 24 }]} onPress={() => { onClose(); logout(); }}>
            <LogOut color={theme.red} size={22} />
            <Text style={[styles.menuText, { color: theme.red, fontWeight: '700' }]}>Log out</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 40,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  phoneText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  }
});

