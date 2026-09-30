import ItemModal from '@/components/ItemModal';
import { useTheme } from '@/hooks/use-theme';
import { auth } from '@/lib/firebase';
import { Mic, Plus, Sparkles, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { expandQuickAdd, useQuickAddCollapsed } from '@/lib/quick-add-state';
import { ActivityIndicator, Alert, KeyboardAvoidingView, LayoutAnimation, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePhone } from '@/lib/phone-context';
import { injectParsedItemsLocally } from '@/lib/use-planner-items';

let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = () => {};

console.warn('Speech recognition explicitly disabled in this build to support Expo Go.');

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
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scrolledAway = useQuickAddCollapsed();
  // Shrink to a round button while the list scrolls, unless the bar is in use
  const collapsed = scrolledAway && !focused && !text.trim() && !isProcessing && !isListening && !feedback;
  useEffect(() => {
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [collapsed]);

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

  // Position cleanly 2px above the 60px bottom tab bar (taking into account safe area on iOS/web)
  const [webSab, setWebSab] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;';
    document.body.appendChild(el);
    setWebSab(el.getBoundingClientRect().height);
    document.body.removeChild(el);
  }, []);
  const bottomInset = Platform.OS === 'web' ? Math.max(insets.bottom, webSab) : insets.bottom;
  // Sit 8px above the tab bar (see (tabs)/_layout.tsx)
  const quickAddBottom = TabBarHeight + tabBarBottomPadding(bottomInset) + 8;

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0} 
      style={[styles.keyboardView, { bottom: quickAddBottom }]}
    >
      {!!feedback && <View style={[styles.feedback, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}><Text accessibilityLiveRegion="polite" style={{ color: hasError ? theme.red : theme.blue, flex: 1, fontSize: 13, lineHeight: 19 }}>{feedback}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => setFeedback('')}><X size={16} color={theme.textSecondary} /></Pressable></View>}
      {collapsed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quick add"
          onPress={() => {
            expandQuickAdd();
            setTimeout(() => inputRef.current?.focus(), 60);
          }}
          style={[styles.collapsedBtn, { backgroundColor: theme.accentFill }]}
        >
          <Sparkles color={theme.onAccent} size={22} />
        </Pressable>
      ) : (
      <View style={[styles.container, { backgroundColor: theme.backgroundElement, borderColor: theme.border, paddingLeft: 12 }]}>

        <Pressable accessibilityRole="button" accessibilityLabel="Add item manually" onPress={() => setManualOpen(true)} style={styles.iconBtn}><Plus size={22} color={theme.blue} /></Pressable>
        {Platform.OS !== 'web' && (
          <Pressable onPress={toggleListening} hitSlop={10} style={styles.iconBtn}>
            <Mic color={isListening ? theme.red : theme.textSecondary} size={24} />
          </Pressable>
        )}

        <TextInput
          ref={inputRef}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
            style={[styles.submitBtn, { backgroundColor: text.trim() || isProcessing ? theme.accentFill : theme.backgroundMuted }]}
          >
            {isProcessing ? (
              <ActivityIndicator color={theme.onAccent} size="small" />
            ) : (
              <Sparkles color={text.trim() ? theme.onAccent : theme.textSecondary} size={18} />
            )}
          </Pressable>
        </View>
      </View>
      )}
      <ItemModal visible={manualOpen} onClose={() => setManualOpen(false)} />
    </KeyboardAvoidingView>
  );
}

import { Radius, Shadow, TabBarHeight, tabBarBottomPadding } from '@/constants/theme';
const styles = StyleSheet.create({
  feedback: { padding: 12, borderRadius: Radius.md, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  keyboardView: {
    position: 'absolute',
    bottom: 60,
    width: '92%',
    maxWidth: 820,
    alignSelf: 'center',
    zIndex: 1000,
    alignItems: 'flex-end',
  },
  collapsedBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.raised,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    ...Shadow.raised,
    width: '100%',
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 8,
    minHeight: 36,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.raised,
  }
});

