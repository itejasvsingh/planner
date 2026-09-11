import { useState } from 'react';
import { View, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { Mic, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';

let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = (event: string, cb: any) => {};

try {
  const SpeechModule = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = SpeechModule.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = SpeechModule.useSpeechRecognitionEvent;
} catch (e) {
  console.warn('Speech recognition native module not found - running in Expo Go mode.');
}

// Always use the explicitly configured API URL (fails fast if missing)
const API_BASE = process.env.EXPO_PUBLIC_API_URL;

export default function QuickAddBar() {
  const theme = useTheme();
  const { phone } = usePhone();
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
    if (!API_BASE) {
      Alert.alert('Configuration Error', 'EXPO_PUBLIC_API_URL is not set.');
      return;
    }

    setIsProcessing(true);
    
    try {
      const res = await fetch(`${API_BASE}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToProcess.trim(), phone }),
      });
      
      if (!res.ok) throw new Error('API error');
      
      setText('');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', `Failed to connect to ${API_BASE}`);
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

  // Position cleanly 8px above the 50px bottom tab bar
  const quickAddBottom = 50 + 8;

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0} 
      style={[styles.keyboardView, { bottom: quickAddBottom }]}
    >
      <View style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.border, paddingLeft: 12 }]}>

        {Platform.OS !== 'web' && (
          <Pressable onPress={toggleListening} hitSlop={10} style={styles.iconBtn}>
            <Mic color={isListening ? theme.red : theme.textSecondary} size={24} />
          </Pressable>
        )}

        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder={isProcessing ? "AI is thinking..." : isListening ? "Listening..." : "Tell AI what to add..."}
          placeholderTextColor={theme.textSecondary}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submitToAI(text)}
          editable={!isProcessing && !isListening}
          returnKeyType="send"
        />

        <View style={styles.rightActions}>
          <Pressable 
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 96 : 85, // Above the tab bar
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

