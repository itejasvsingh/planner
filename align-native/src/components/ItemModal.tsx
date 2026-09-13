import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Animated, Switch, ScrollView } from 'react-native';
import { Calendar, Wallet, Target, X, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatDateKey, parseDateKey, timeToMinutes } from '@/lib/dates';
import { type PlannerItem, type PlannerSubtask } from '@/lib/planner-item';

interface ItemModalProps {
  visible: boolean;
  onClose: () => void;
  initialItem?: PlannerItem | null;
  defaultDate?: string;
  defaultType?: 'task' | 'expense' | 'goal';
}

type TabType = 'task' | 'expense' | 'goal';

export default function ItemModal({ visible, onClose, initialItem, defaultDate, defaultType = 'task' }: ItemModalProps) {
  const theme = useTheme();
  const { phone } = usePhone();
  const { addTask, addExpense, addGoal, updateItem } = usePlannerItems(phone);
  
  const [activeTab, setActiveTab] = useState<TabType>(defaultType);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('#General');
  const [target, setTarget] = useState('');
  const [currentProgress, setCurrentProgress] = useState('0');
  const [unit, setUnit] = useState('');
  const [priority, setPriority] = useState('none');
  
  // Subtasks
  const [subtasks, setSubtasks] = useState<PlannerSubtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  
  // Recurring Expense
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'monthly'|'weekly'|'yearly'>('monthly');
  
  // Common Date/Time
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isTimeEnabled, setIsTimeEnabled] = useState(false);
  const [selectedTime, setSelectedTime] = useState(new Date());

  const [slideAnim] = useState(() => new Animated.Value(600));

  useEffect(() => {
    if (visible) {
      setFormError('');
      setNewSubtask('');
      setShowDatePicker(false);
      setShowTimePicker(false);
      if (initialItem) {
        // Edit Mode
        const typeStr = initialItem.type || 'task';
        setActiveTab(typeStr as TabType);
        setTitle(initialItem.title || '');
        setAmount(String(initialItem.amount || ''));
        setCategory(initialItem.category || '#General');
        setTarget(String(initialItem.target || ''));
        setCurrentProgress(String(initialItem.current || 0));
        setUnit(initialItem.unit || 'times');
        setPriority(initialItem.priority || 'none');
        setSubtasks((initialItem.subtasks || []).map(subtask => ({ ...subtask })));
        setIsRecurring(initialItem.isRecurring || false);
        setRecurringFrequency(initialItem.recurringFrequency || 'monthly');

        const dStr = initialItem.dueDate || initialItem.date;
        if (dStr) {
          const [y, m, d] = dStr.split('-');
          setSelectedDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
        } else {
          setSelectedDate(new Date());
        }

        const tStr = initialItem.reminderTime || initialItem.dueTime;
        if (tStr) {
          setIsTimeEnabled(true);
          const minutes = timeToMinutes(tStr) ?? 0;
          const tDate = new Date();
          tDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
          setSelectedTime(tDate);
        } else {
          setIsTimeEnabled(false);
          setSelectedTime(new Date());
        }
      } else {
        // Create Mode
        setActiveTab(defaultType);
        setCategory('#General');
        setTitle('');
        setAmount('');
        setTarget('');
        setCurrentProgress('0');
        setUnit('');
        setPriority('none');
        setSubtasks([]);
        setIsRecurring(false);
        setRecurringFrequency('monthly');
        
        if (defaultDate) {
          const [y, m, d] = defaultDate.split('-');
          setSelectedDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
        } else {
          setSelectedDate(new Date());
        }
        
        setIsTimeEnabled(false);
        setSelectedTime(new Date());
      }
      
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 800, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, initialItem, defaultDate, defaultType, slideAnim]);

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim()) { setFormError('Give this item a title first.'); return; }
    if (activeTab === 'expense' && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) { setFormError('Enter an amount greater than zero.'); return; }
    if (activeTab === 'goal' && (!Number.isFinite(Number(target)) || Number(target) <= 0)) { setFormError('Enter a target greater than zero.'); return; }
    if (activeTab === 'goal' && initialItem && (!Number.isFinite(Number(currentProgress)) || Number(currentProgress) < 0 || Number(currentProgress) > Number(target))) { setFormError('Progress must be between zero and your target.'); return; }
    setFormError('');
    setSaving(true);
    try {

    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;
    
    let timeStr = null;
    if (isTimeEnabled) {
      timeStr = `${pad(selectedTime.getHours())}:${pad(selectedTime.getMinutes())}`;
    }

    if (initialItem) {
      // Edit mode
      const patch: Partial<PlannerItem> = {
        title: title.trim(),
        type: activeTab
      };
      
      if (activeTab === 'task') {
        patch.dueDate = dateStr;
        patch.reminderTime = timeStr;
        patch.dueTime = timeStr;
        patch.priority = priority;
        patch.subtasks = subtasks.filter(s => s.title?.trim() !== '');
      } else if (activeTab === 'expense') {
        patch.date = dateStr;
        patch.amount = parseFloat(amount) || 0;
        patch.category = category;
        patch.tags = [category];
        patch.isRecurring = isRecurring;
        patch.recurringFrequency = recurringFrequency;
      } else if (activeTab === 'goal') {
        patch.date = dateStr;
        patch.target = Number(target);
        patch.current = Number(currentProgress);
        if (patch.current !== (initialItem.current || 0)) patch.progressHistory = [...(initialItem.progressHistory || []), { value: patch.current, at: new Date().toISOString() }];
        patch.unit = unit.trim() || 'times';
      }
      
      await updateItem(initialItem.id, patch);
    } else {
      // Create mode
      if (activeTab === 'task') {
        await addTask({ title: title.trim(), dueDate: dateStr, reminderTime: timeStr, priority, subtasks: subtasks.filter(s => s.title?.trim() !== '') });
        // The hook's `addTask` does NOT return the item or the ID. That's fine.
      } else if (activeTab === 'expense') {
        const parsedAmount = parseFloat(amount) || 0;
        await addExpense({ 
          title: title.trim(), 
          amount: parsedAmount, 
          date: dateStr, 
          category,
          isRecurring,
          recurringFrequency 
        });
      } else if (activeTab === 'goal') {
        const parsedTarget = Number(target);
        await addGoal({ title: title.trim(), target: parsedTarget, unit: unit.trim() || 'times', date: dateStr });
      }
    }

    onClose();
    } catch {
      setFormError('This item could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const addSubtaskInline = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { title: newSubtask.trim(), done: false }]);
    setNewSubtask('');
  };

  const renderTabButton = ({ type, icon: Icon, label }: { type: TabType, icon: any, label: string }) => {
    const isActive = activeTab === type;
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected: isActive }}
        style={[styles.tabButton, isActive && { backgroundColor: theme.backgroundElement }]} 
        onPress={() => { if (!initialItem) { setActiveTab(type); setFormError(''); } }}
        disabled={!!initialItem} // Cannot change type while editing
      >
        <Icon color={isActive ? theme.blue : theme.textSecondary} size={18} />
        <Text style={[styles.tabText, { color: isActive ? theme.blue : theme.textSecondary, fontWeight: isActive ? '600' : '400' }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
      <KeyboardAvoidingView 
        style={[styles.overlay, { justifyContent: 'flex-end' }]} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => !saving && onClose()} />
        
        <Animated.View style={[styles.sheet, { backgroundColor: theme.background, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{initialItem ? 'Edit Item' : 'Add New'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close editor" disabled={saving} onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X color={theme.textSecondary} size={24} />
            </Pressable>
          </View>

          {!initialItem && (
            <View style={[styles.tabsWrapper, { backgroundColor: 'rgba(120,120,128,0.12)' }]}>
              {renderTabButton({ type: 'task', icon: Calendar, label: 'Task' })}
              {renderTabButton({ type: 'expense', icon: Wallet, label: 'Expense' })}
              {renderTabButton({ type: 'goal', icon: Target, label: 'Goal' })}
            </View>
          )}

          <ScrollView style={{ maxHeight: '80%' }} contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
            <TextInput
              accessibilityLabel="Title"
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, fontSize: 18 }]}
              placeholder={activeTab === 'expense' ? "What did you pay for?" : "What do you want to do?"}
              placeholderTextColor={theme.textSecondary}
              value={title}
              onChangeText={setTitle}
              autoFocus={!initialItem}
            />

            {activeTab === 'expense' && (
              <>
                <TextInput
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, fontSize: 18 }]}
                  placeholder="Amount (₹)"
                  placeholderTextColor={theme.textSecondary}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Category</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['#General', '#Dining', '#Travel', '#Shopping', '#Bills', '#Health'].map(cat => <Pressable key={cat} accessibilityRole="button" onPress={() => setCategory(cat)} style={[styles.pill, { backgroundColor: category === cat ? theme.backgroundSelected : theme.backgroundElement }]}><Text style={{ color: category === cat ? theme.blue : theme.textSecondary }}>{cat.slice(1)}</Text></Pressable>)}</View>
                <View style={[styles.row, { alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }]}>
                  <Text style={{ color: theme.text, fontSize: 16 }}>Recurring Bill</Text>
                  <Switch value={isRecurring} onValueChange={setIsRecurring} />
                </View>
                {isRecurring && (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    {(['weekly', 'monthly', 'yearly'] as const).map(freq => (
                      <Pressable 
                        key={freq} 
                        style={[styles.pill, recurringFrequency === freq ? { backgroundColor: theme.blue } : { backgroundColor: theme.backgroundElement }]}
                        onPress={() => setRecurringFrequency(freq)}
                      >
                        <Text style={{ color: recurringFrequency === freq ? '#fff' : theme.text, fontSize: 14 }}>
                          {freq.charAt(0).toUpperCase() + freq.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
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

            {activeTab === 'goal' && initialItem && <><Text style={{ color: theme.textSecondary, fontSize: 13 }}>Current progress</Text><TextInput accessibilityLabel="Current progress" value={currentProgress} onChangeText={setCurrentProgress} keyboardType="decimal-pad" style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} /></>}
            {activeTab === 'task' && (
              <>
                <View style={{ marginVertical: 8 }}>
                  <Text style={{ color: theme.textSecondary, marginBottom: 8, fontSize: 14 }}>Priority</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['none', 'low', 'medium', 'high'] as const).map(p => (
                      <Pressable 
                        key={p} 
                        style={[styles.pill, priority === p ? { backgroundColor: theme.blue } : { backgroundColor: theme.backgroundElement }]}
                        onPress={() => setPriority(p)}
                      >
                        <Text style={{ color: priority === p ? '#fff' : theme.text, fontSize: 14, textTransform: 'capitalize' }}>
                          {p}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Subtasks */}
                <View style={{ marginVertical: 8 }}>
                  <Text style={{ color: theme.textSecondary, marginBottom: 8, fontSize: 14 }}>Subtasks</Text>
                  {subtasks.map((st, idx) => (
                    <View key={idx} style={[styles.subtaskRow, { borderColor: theme.border }]}>
                      <Pressable onPress={() => {
                        const newSt = [...subtasks];
                        newSt[idx].done = !newSt[idx].done;
                        setSubtasks(newSt);
                      }}>
                        {st.done ? <CheckCircle2 color={theme.blue} size={20} /> : <Circle color={theme.textSecondary} size={20} />}
                      </Pressable>
                      <TextInput 
                        style={{ flex: 1, color: theme.text, fontSize: 16 }}
                        value={st.title}
                        onChangeText={(text) => {
                          const newSt = [...subtasks];
                          newSt[idx].title = text;
                          setSubtasks(newSt);
                        }}
                      />
                      <Pressable onPress={() => setSubtasks(subtasks.filter((_, i) => i !== idx))}>
                        <Trash2 color="#FF3B30" size={18} />
                      </Pressable>
                    </View>
                  ))}
                  <View style={[styles.subtaskRow, { borderColor: theme.border, borderBottomWidth: 0 }]}>
                    <Plus color={theme.textSecondary} size={20} />
                    <TextInput 
                      style={{ flex: 1, color: theme.text, fontSize: 16 }}
                      placeholder="Add subtask..."
                      placeholderTextColor={theme.textSecondary}
                      value={newSubtask}
                      onChangeText={setNewSubtask}
                      onSubmitEditing={addSubtaskInline}
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </>
            )}

            {/* DateTime Section */}
            {activeTab === 'task' && (
              <View style={[styles.row, { marginTop: 12, alignItems: 'center' }]}>
                <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>Remind Me</Text>
                <Switch value={isTimeEnabled} onValueChange={setIsTimeEnabled} />
              </View>
            )}
            
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{activeTab === 'goal' ? 'Target date' : 'Date'}</Text>
            {Platform.OS === 'web' ? (
              <input aria-label="Date" type="date" value={formatDateKey(selectedDate)} onChange={event => { if (event.target.value) setSelectedDate(parseDateKey(event.target.value)); }} style={{ padding: 13, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.backgroundElement, color: theme.text, font: 'inherit', minHeight: 46, boxSizing: 'border-box', width: '100%' }} />
            ) : <><Pressable accessibilityRole="button" onPress={() => setShowDatePicker(true)} style={[styles.input, { backgroundColor: theme.backgroundElement }]}><Text style={{ color: theme.text }}>{selectedDate.toLocaleDateString()}</Text></Pressable>{showDatePicker && <DateTimePicker value={selectedDate} mode="date" onChange={(_, date) => { setShowDatePicker(Platform.OS === 'ios'); if (date) setSelectedDate(date); }} />}</>}
            {activeTab === 'task' && isTimeEnabled && (Platform.OS === 'web' ?
              <input aria-label="Reminder time" type="time" value={`${String(selectedTime.getHours()).padStart(2, '0')}:${String(selectedTime.getMinutes()).padStart(2, '0')}`} onChange={event => { if (!event.target.value) return; const [h, m] = event.target.value.split(':').map(Number); const next = new Date(selectedTime); next.setHours(h, m); setSelectedTime(next); }} style={{ padding: 13, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.backgroundElement, color: theme.text, font: 'inherit', minHeight: 46, boxSizing: 'border-box', width: '100%' }} /> :
              <><Pressable accessibilityRole="button" onPress={() => setShowTimePicker(true)} style={[styles.input, { backgroundColor: theme.backgroundElement }]}><Text style={{ color: theme.text }}>{selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></Pressable>{showTimePicker && <DateTimePicker value={selectedTime} mode="time" onChange={(_, time) => { setShowTimePicker(Platform.OS === 'ios'); if (time) setSelectedTime(time); }} />}</>)}
            {!!formError && <Text accessibilityRole="alert" style={{ color: theme.red, fontSize: 14 }}>{formError}</Text>}

            {/* Save Button */}
            <Pressable 
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: theme.blue, opacity: pressed ? 0.8 : 1 }]}
              accessibilityRole="button"
              disabled={saving}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : initialItem ? 'Save changes' : `Create ${activeTab}`}</Text>
            </Pressable>
          </ScrollView>
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
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    alignSelf: 'center',
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
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
