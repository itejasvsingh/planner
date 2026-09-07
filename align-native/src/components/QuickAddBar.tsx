import { useState } from 'react';
import { View, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { Mic, Plus, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import AddItemModal from './AddItemModal';
import { usePhone } from '@/lib/phone-context';

// Default to localhost for development, in production use your domain
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function QuickAddBar() {
  const theme = useTheme();
  const { phone } = usePhone();
  const [modalVisible, setModalVisible] = useState(false);
  const [text, setText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const submitToAI = async () => {
    if (!text.trim() || isProcessing) return;
    setIsProcessing(true);
    
    try {
      const res = await fetch(`${API_BASE}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), phone }),
      });
      
      if (!res.ok) throw new Error('API error');
      
      setText('');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to process request. Make sure your Next.js backend is running on localhost:3000.');
    } finally {
      setIsProcessing(false);
    }
  };

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
          placeholder={isProcessing ? "AI is thinking..." : "Tell AI what to add..."}
          placeholderTextColor={theme.textSecondary}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submitToAI}
          editable={!isProcessing}
          returnKeyType="send"
        />

        <View style={styles.rightActions}>
          <Pressable onPress={() => setModalVisible(true)} hitSlop={10} style={styles.iconBtn} disabled={isProcessing}>
            <Plus color={theme.textSecondary} size={24} />
          </Pressable>
          <Pressable 
            onPress={submitToAI}
            disabled={!text.trim() || isProcessing}
            style={[styles.submitBtn, { backgroundColor: text.trim() ? theme.blue : 'rgba(120,120,128,0.2)' }]}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Sparkles color={text.trim() ? '#FFF' : theme.textSecondary} size={18} />
            )}
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

