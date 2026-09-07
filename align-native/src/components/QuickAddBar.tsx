import { useState } from 'react';
import { View, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { Mic, Plus, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import AddItemModal from './AddItemModal';

export default function QuickAddBar() {
  const theme = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [text, setText] = useState('');

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      keyboardVerticalOffset={Platform.OS === 'ios' ? 85 : 0} 
      style={styles.keyboardView}
    >
      <View style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Pressable hitSlop={10} style={styles.iconBtn}>
          <Mic color={theme.textSecondary} size={22} />
        </Pressable>

        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder="Tell AI what to add..."
          placeholderTextColor={theme.textSecondary}
          value={text}
          onChangeText={setText}
        />

        <View style={styles.rightActions}>
          <Pressable onPress={() => setModalVisible(true)} hitSlop={10} style={styles.iconBtn}>
            <Plus color={theme.textSecondary} size={24} />
          </Pressable>
          <Pressable 
            style={[styles.submitBtn, { backgroundColor: text.trim() ? theme.blue : 'rgba(120,120,128,0.2)' }]}
          >
            <Sparkles color={text.trim() ? '#FFF' : theme.textSecondary} size={18} />
          </Pressable>
        </View>
      </View>

      <AddItemModal 
        visible={modalVisible} 
        onClose={() => setModalVisible(false)} 
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    position: 'absolute',
    bottom: 85, // Above the tab bar
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    minHeight: 32,
  },
  iconBtn: {
    padding: 4,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  }
});

