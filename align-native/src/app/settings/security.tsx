import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, Alert, Modal } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Shield, Key, Fingerprint, LogOut, ChevronRight } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import {
  checkBiometricAvailability,
  hasPinSet,
  clearPin,
  isSecurityEnabled,
  setSecurityEnabled,
  BiometricAvailability,
} from '@/lib/auth';
import LockScreen from '@/components/LockScreen';

export default function SecuritySettingsScreen() {
  const theme = useTheme();
  const [securityActive, setSecurityActive] = useState(false);
  const [biometryType, setBiometricType] = useState<BiometricAvailability>('none');
  const [pinSet, setPinSet] = useState(false);
  const [isSettingPin, setIsSettingPin] = useState(false);

  useEffect(() => {
    isSecurityEnabled().then(setSecurityActive);
    hasPinSet().then(setPinSet);
    checkBiometricAvailability().then(setBiometricType);
  }, []);

  const handleToggleSecurity = () => {
    if (!pinSet) {
      setIsSettingPin(true);
      return;
    }
    const next = !securityActive;
    setSecurityEnabled(next).then(() => setSecurityActive(next));
  };

  const handleRemovePIN = () => {
    Alert.alert(
      'Remove passcode?',
      'Anyone with access to your device will be able to open Align.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await clearPin();
            await setSecurityEnabled(false);
            setPinSet(false);
            setSecurityActive(false);
          },
        },
      ]
    );
  };

  const biometricLabel =
    biometryType === 'face'
      ? 'Face ID'
      : biometryType === 'fingerprint'
      ? 'Fingerprint / Touch ID'
      : biometryType === 'device'
      ? 'Device Credential'
      : 'Biometrics';

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border, alignItems: 'center', paddingVertical: 24 }]}>
          <View
            style={[
              styles.heroIcon,
              {
                backgroundColor: securityActive ? theme.accentFill : theme.backgroundMuted,
                shadowColor: 'transparent',
              },
            ]}>
            <Shield color={securityActive ? theme.onAccent : theme.text} size={32} />
          </View>
          <Text style={[styles.heroTitle, { color: theme.text }]}>Security</Text>
          <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
            {securityActive ? 'App Passcode Protection Active' : 'Passcode Protection Disabled'}
          </Text>
          <View style={[styles.badge, { backgroundColor: securityActive ? theme.accentSoft : theme.backgroundMuted }]}>
            <Text style={[styles.badgeText, { color: securityActive ? theme.accent : theme.textSecondary }]}>
              {securityActive ? 'Protected' : 'Off'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupHeader, { color: theme.textTertiary }]}>APP LOCK</Text>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border }]}>
          <Pressable style={styles.row} onPress={handleToggleSecurity}>
            <View style={[styles.iconBox, { backgroundColor: theme.backgroundMuted }]}>
              <Shield color={theme.text} size={18} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Require Passcode</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>Lock app when closing or in background</Text>
            </View>
            <Switch value={securityActive} onValueChange={handleToggleSecurity} trackColor={{ false: theme.backgroundMuted, true: theme.accentFill }} ios_backgroundColor={theme.backgroundMuted} />
          </Pressable>
        </View>
        <Text style={[styles.groupFooter, { color: theme.textSecondary }]}>
          When enabled, Align will require your PIN or biometric authentication whenever the app returns from the background.
        </Text>
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupHeader, { color: theme.textTertiary }]}>CREDENTIALS & BIOMETRICS</Text>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border }]}>
          <Pressable
            style={styles.row}
            onPress={() => setIsSettingPin(true)}>
            <View style={[styles.iconBox, { backgroundColor: theme.backgroundMuted }]}>
              <Key color={theme.text} size={18} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{pinSet ? 'Change Passcode' : 'Set Up Passcode'}</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                {pinSet ? 'Update 4 or 6-digit Security PIN' : 'Create 4 or 6-digit PIN'}
              </Text>
            </View>
            <ChevronRight color={theme.textSecondary} size={20} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={[styles.row, { opacity: securityActive ? 1 : 0.5 }]}>
            <View style={[styles.iconBox, { backgroundColor: theme.backgroundMuted }]}>
              <Fingerprint color={theme.text} size={18} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{biometricLabel}</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                {biometryType !== 'none'
                  ? securityActive
                    ? 'Verified automatically on launch'
                    : 'Enable passcode to activate'
                  : 'Not supported on this device'}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: biometryType !== 'none' && securityActive ? theme.accentSoft : theme.backgroundMuted }]}>
              <Text style={[styles.badgeText, { color: biometryType !== 'none' && securityActive ? theme.accent : theme.textSecondary }]}>
                {biometryType !== 'none' ? (securityActive ? 'Active' : 'Off') : 'N/A'}
              </Text>
            </View>
          </View>
        </View>
        <Text style={[styles.groupFooter, { color: theme.textSecondary }]}>
          Your passcode and biometric credentials remain securely encrypted inside your device hardware keychain.
        </Text>
      </View>

      {pinSet && (
        <View style={styles.group}>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border }]}>
            <Pressable style={[styles.row, { justifyContent: 'center' }]} onPress={handleRemovePIN}>
              <LogOut color={theme.red} size={20} />
              <Text style={[styles.rowTitle, { color: theme.red, marginLeft: 8, fontWeight: '600' }]}>Remove Passcode</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Modal visible={isSettingPin} animationType="slide">
        <LockScreen
          initialStage="choose-length"
          onUnlock={() => {
            setIsSettingPin(false);
            hasPinSet().then(setPinSet);
            isSecurityEnabled().then(setSecurityActive);
          }}
          onCancel={() => setIsSettingPin(false)}
        />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60, gap: 24 },
  group: { gap: 8 },
  groupHeader: { fontSize: 12, fontWeight: '700', paddingLeft: 4, letterSpacing: 0.6 },
  groupFooter: { fontSize: 13, paddingHorizontal: 16, lineHeight: 18 },
  card: { borderRadius: 14, overflow: 'hidden' },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  heroTitle: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  heroSub: { fontSize: 14, fontWeight: '500', marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowContent: { flex: 1, paddingRight: 8 },
  rowTitle: { fontSize: 17, fontWeight: '400', letterSpacing: -0.3 },
  rowSub: { fontSize: 13, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
});

