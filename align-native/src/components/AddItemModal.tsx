import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Animated, Switch } from 'react-native';
import { Calendar, Wallet, Target, X } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import DateTimePicker from '@react-native-community/datetimepicker';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
}

type TabType = 'task' | 'expense' | 'goal';

export default function AddItemModal({ visible, onClose }: AddItemModalProps) {
  const theme = useTheme();
  const { phone } = usePhone();
  const { addTask, addExpense, addGoal } = usePlannerItems(phone);
  
  const [activeTab, setActiveTab] = useState<TabType>('task');
  
  // Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('#General');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  
  // Common Date/Time
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isTimeEnabled, setIsTimeEnabled] = useState(false);
  const [selectedTime, setSelectedTime] = useState(new Date());

  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      setTitle('');
      setAmount('');
      setTarget('');
      setUnit('');
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleSave = async () => {
    if (!title.trim()) return;

    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;
    
    let timeStr = null;
    if (isTimeEnabled) {
      timeStr = `${pad(selectedTime.getHours())}:${pad(selectedTime.getMinutes())}`;
    }

    if (activeTab === 'task') {
      await addTask({ title: title.trim(), dueDate: dateStr, reminderTime: timeStr });
    } else if (activeTab === 'expense') {
      const parsedAmount = parseFloat(amount) || 0;
      await addExpense({ title: title.trim(), amount: parsedAmount, date: dateStr, category });
    } else if (activeTab === 'goal') {
      const parsedTarget = parseInt(target, 10) || 1;
      await addGoal({ title: title.trim(), target: parsedTarget, unit: unit.trim() || 'times', date: dateStr });
    }

    onClose();
  };

  const TabButton = ({ type, icon: Icon, label }: { type: TabType, icon: any, label: string }) => {
    const isActive = activeTab === type;
    return (
      <Pressable 
        style={[styles.tabButton, isActive && { backgroundColor: theme.backgroundElement }]} 
        onPress={() => setActiveTab(type)}
      >
        <Icon color={isActive ? theme.blue : theme.textSecondary} size={18} />
        <Text style={[styles.tabText, { color: isActive ? theme.blue : theme.textSecondary, fontWeight: isActive ? '600' : '400' }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        justifyContent="flex-end"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        
        <Animated.View style={[styles.sheet, { backgroundColor: theme.background, transform: [{ translateY: slideAnim }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Add New</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X color={theme.textSecondary} size={24} />
            </Pressable>
          </View>

          {/* Segment Tabs */}
          <View style={[styles.tabsWrapper, { backgroundColor: 'rgba(120,120,128,0.12)' }]}>
            <TabButton type="task" icon={Calendar} label="Task" />
            <TabButton type="expense" icon={Wallet} label="Expense" />
            <TabButton type="goal" icon={Target} label="Goal" />
          </View>

          {/* Form Inputs */}
          <View style={styles.form}>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, fontSize: 18 }]}
              placeholder={activeTab === 'expense' ? "What did you pay for?" : "What do you want to do?"}
              placeholderTextColor={theme.textSecondary}
              value={title}
              onChangeText={setTitle}
              autoFocus
            />

            {activeTab === 'expense' && (
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, fontSize: 18 }]}
                placeholder="Amount (₹)"
                placeholderTextColor={theme.textSecondary}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            )}

            {activeTab === 'goal' && (
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1, color: theme.text, backgroundColor: theme.backgroundElement }]}
                  placeholder="Target (e.g. 5)"
                  placeholderTextColor={theme.textSecondary}
                  value={target}
                  onChangeText={setTarget}
                  keyboardType="number-pad"
                />
                <View style={{ width: 12 }} />
                <TextInput
                  style={[styles.input, { flex: 1, color: theme.text, backgroundColor: theme.backgroundElement }]}
                  placeholder="Unit (e.g. kg, times)"
                  placeholderTextColor={theme.textSecondary}
                  value={unit}
                  onChangeText={setUnit}
                />
              </View>
            )}

            {/* DateTime Section */}
            {activeTab === 'task' && (
              <View style={[styles.row, { marginTop: 12, alignItems: 'center' }]}>
                <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>Remind Me</Text>
                <Switch value={isTimeEnabled} onValueChange={setIsTimeEnabled} />
              </View>
            )}
            
            {(activeTab !== 'task' || isTimeEnabled) && (
              <View style={[styles.row, { marginTop: 12, justifyContent: 'space-between' }]}>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="compact"
                  onChange={(_, d) => d && setSelectedDate(d)}
                />
                {activeTab === 'task' && isTimeEnabled && (
                  <DateTimePicker
                    value={selectedTime}
                    mode="time"
                    display="compact"
                    onChange={(_, t) => t && setSelectedTime(t)}
                  />
                )}
              </View>
            )}

            {/* Save Button */}
            <Pressable 
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: theme.blue, opacity: pressed ? 0.8 : 1 }]}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          </View>
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
    alignItems: 'center',
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
  tabsWrapper: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabText: {
    fontSize: 14,
  },
  form: {
    gap: 16,
  },
  input: {
    padding: 16,
    borderRadius: 12,
  },
  row: {
    flexDirection: 'row',
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  }
});

