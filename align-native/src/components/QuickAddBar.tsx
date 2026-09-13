import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { Mic, Sparkles, Plus, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import ItemModal from '@/components/ItemModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '@/lib/firebase';

import { usePhone } from '@/lib/phone-context';
import { injectParsedItemsLocally } from '@/lib/use-planner-items';

let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = () => {};

try {
  const SpeechModule = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = SpeechModule.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = SpeechModule.useSpeechRecognitionEvent;
} catch {
  console.warn('Speech recognition native module not found - running in Expo Go mode.');
}

// Always use the explicitly configured API URL (fails fast if missing)
const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL;

export default function QuickAddBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { phone } = usePhone();
  const [manualOpen, setManualOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [hasError, setHasError] = useState(false);
  const [text, setText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);

  useSpeechRecognitionEvent('result', (event: any) => {
    const transcript = event.results[0]?.transcript;
    if (transcript) setText(transcript);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });
  
  useSpeechRecognitionEvent('error', (event: any) => {
    console.warn('Speech recognition error:', event);
    setIsListening(false);
  });

  const submitToAI = async (textToProcess: string) => {
    if (!textToProcess.trim() || isProcessing) return;
    setFeedback('');
    setHasError(false);
    if (Platform.OS !== 'web' && !API_BASE) {
      setFeedback('Quick Add is not configured. Use + to add an item manually.');
      setHasError(true);
      return;
    }

    setIsProcessing(true);
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const user = auth.currentUser;
      if (user) {
        try {
          const token = await user.getIdToken();
          headers['Authorization'] = `Bearer ${token}`;
        } catch (tokenErr) {
          console.warn('Could not get Firebase token, sending without token:', tokenErr);
        }
      }

      const res = await fetch(`${API_BASE}/api/parse`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: textToProcess.trim(),
          phone: phone || undefined,
        }),
      });
      
      if (res.status === 429) {
        throw new Error('Rate limit reached (30 requests/hour). Please try again later.');
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }
      
      const result = await res.json();
      if (!result.success || !Array.isArray(result.items)) throw new Error('The item was not saved. Please try again.');

      // Immediately inject parsed items into local state and cache so they render instantly
      await injectParsedItemsLocally(phone, result.items);

      setFeedback(`${result.items.length} ${result.items.length === 1 ? 'item' : 'items'} added to your planner.`);
      setText('');
    } catch (err: any) {
      console.error(err);
      setHasError(true);
      setFeedback(err.message || 'Could not connect. Your text is here to retry.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = async () => {
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('Not Supported', 'Voice input requires a native build and is not supported in Expo Go.');
      return;
    }

    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
      // Wait a tick and then submit if we have text
      if (text.trim()) {
        setTimeout(() => submitToAI(text), 100);
      }
      return;
    }

    try {
      const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice input.');
        return;
      }
      setIsListening(true);
      setText('');
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
    } catch (e) {
      console.warn('Start listening failed', e);
      setIsListening(false);
    }
  };

  // Position cleanly 8px above the 50px bottom tab bar (taking into account safe area on iOS/web)
  const quickAddBottom = Platform.OS === 'web'
    ? ('calc(58px + env(safe-area-inset-bottom, 0px))' as any)
    : (58 + insets.bottom);

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0} 
      style={[styles.keyboardView, { bottom: quickAddBottom }]}
    >
      {!!feedback && <View style={[styles.feedback, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}><Text accessibilityLiveRegion="polite" style={{ color: hasError ? theme.red : theme.blue, flex: 1, fontSize: 13, lineHeight: 19 }}>{feedback}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => setFeedback('')}><X size={16} color={theme.textSecondary} /></Pressable></View>}
      <View style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.border, paddingLeft: 12 }]}>

        <Pressable accessibilityRole="button" accessibilityLabel="Add item manually" onPress={() => setManualOpen(true)} style={styles.iconBtn}><Plus size={22} color={theme.blue} /></Pressable>
        {Platform.OS !== 'web' && (
          <Pressable onPress={toggleListening} hitSlop={10} style={styles.iconBtn}>
            <Mic color={isListening ? theme.red : theme.textSecondary} size={24} />
          </Pressable>
        )}

        <TextInput
          accessibilityLabel="AI quick add"
          maxLength={500}
          style={[styles.input, { color: theme.text }]}
          placeholder={isProcessing ? "AI is thinking..." : isListening ? "Listening..." : "Plan a task or log an expense…"}
          placeholderTextColor={theme.textSecondary}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submitToAI(text)}
          editable={!isProcessing && !isListening}
          returnKeyType="send"
        />

        <View style={styles.rightActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add with AI"
            onPress={() => submitToAI(text)}
            disabled={!text.trim() || isProcessing || isListening}
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
      <ItemModal visible={manualOpen} onClose={() => setManualOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  feedback: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  keyboardView: {
    position: 'absolute',
    bottom: 58, // Sits directly 8px above the 50px bottom tab bar
    width: '92%',
    maxWidth: 820,
    alignSelf: 'center',
    zIndex: 1000,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 8,
    minHeight: 32,
  },
  iconBtn: {
    padding: 6,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  submitBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  }
});

