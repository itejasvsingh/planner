import { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import SplitEditor, { SplitPerson } from './SplitEditor';
import { usePlannerItems } from '@/lib/use-planner-items';
import { usePhone } from '@/lib/phone-context';
import { PlannerItem } from '@/lib/planner-item';

interface SplitEditorModalProps {
  visible: boolean;
  onClose: () => void;
  expense: PlannerItem | null;
}

export default function SplitEditorModal({ visible, onClose, expense }: SplitEditorModalProps) {
  const theme = useTheme();
  const { phone } = usePhone();
  const { saveSplit } = usePlannerItems(phone);
  const slideAnim = useRef(new Animated.Value(600)).current;

  // Local state for the splits while editing
  const [splits, setSplits] = useState<SplitPerson[]>([]);

  useEffect(() => {
    if (visible && expense) {
      setSplits(expense.splits || []);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, expense]);

  const handleSave = async () => {
    if (expense) {
      await saveSplit(expense.id, splits);
    }
    onClose();
  };

  if (!expense) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        justifyContent="flex-end"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        
        <Animated.View style={[styles.sheet, { backgroundColor: theme.background, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: theme.text }]}>Split Expense</Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                {expense.title} • ₹{expense.amount}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X color={theme.textSecondary} size={24} />
            </Pressable>
          </View>

          <View style={{ maxHeight: 400 }}>
            <SplitEditor 
              splits={splits} 
              setSplits={setSplits} 
              totalAmount={expense.amount || 0} 
            />
          </View>

          <Pressable 
            style={({ pressed }) => [styles.saveBtn, { backgroundColor: theme.blue, opacity: pressed ? 0.8 : 1 }]}
            onPress={handleSave}
          >
            <Text style={styles.saveBtnText}>Save Splits</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: 'rgba(120,120,128,0.12)',
    borderRadius: 16,
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  }
});
