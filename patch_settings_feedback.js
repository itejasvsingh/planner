const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/settings/index.tsx', 'utf8');

// Imports
code = code.replace(/import \{ doc, onSnapshot, setDoc \} from 'firebase\/firestore';/, "import { doc, onSnapshot, setDoc, collection, serverTimestamp } from 'firebase/firestore';\nimport { TextInput, Modal, KeyboardAvoidingView } from 'react-native';");
code = code.replace(/MessageSquareText, Moon,/, "MessageSquareText, Moon, Send,");

// State
code = code.replace(/const \[dailySummaryTime, setDailySummaryTime\] = useState\('22:00'\);/, 
    "const [dailySummaryTime, setDailySummaryTime] = useState('22:00');\n  const [feedbackVisible, setFeedbackVisible] = useState(false);\n  const [feedbackText, setFeedbackText] = useState('');\n  const [sendingFeedback, setSendingFeedback] = useState(false);");

// Feedback Function
const sendFeedback = `
  const handleSendFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSendingFeedback(true);
    try {
        const feedbackRef = doc(collection(db, 'feedback'));
        await setDoc(feedbackRef, {
            text: feedbackText,
            userId: phone || 'anonymous',
            createdAt: serverTimestamp(),
            platform: Platform.OS
        });
        setFeedbackText('');
        setFeedbackVisible(false);
        Alert.alert('Thank you!', 'Your feedback has been sent directly to the developer.');
    } catch (e) {
        Alert.alert('Error', 'Could not send feedback. Try again later.');
    }
    setSendingFeedback(false);
  };
`;
code = code.replace(/  \/\/ Re-read device state each time the screen is shown/, sendFeedback + "\n  // Re-read device state each time the screen is shown");

// UI Button
const feedbackButton = `
        {/* Support */}
        <SettingsGroup title="SUPPORT">
          <SettingsItem 
            icon={<Send color={c.textTertiary} size={20} />} 
            title="Send Feedback" 
            subtitle="Report a bug or request a feature" 
            onPress={() => setFeedbackVisible(true)} 
            last 
          />
        </SettingsGroup>
        
        {/* About */}
`;
code = code.replace(/\{\/\* About \*\/\}/, feedbackButton);

// Modal UI
const modalUI = `
      {/* Feedback Modal */}
      <Modal visible={feedbackVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: c.background, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 50 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: c.text }}>Send Feedback</Text>
              <Pressable onPress={() => setFeedbackVisible(false)} style={{ padding: 8, backgroundColor: c.backgroundElement, borderRadius: Radius.pill }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>
            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="What's on your mind? (Bugs, features, etc.)"
              placeholderTextColor={c.textTertiary}
              multiline
              autoFocus
              style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 16, minHeight: 150, textAlignVertical: 'top' }}
            />
            <Pressable 
              onPress={handleSendFeedback} 
              disabled={sendingFeedback || !feedbackText.trim()}
              style={{ marginTop: 24, backgroundColor: feedbackText.trim() ? c.accent : c.border, padding: 16, borderRadius: Radius.md, alignItems: 'center' }}
            >
              <Text style={{ color: feedbackText.trim() ? '#FFF' : c.textTertiary, fontWeight: '700', fontSize: 16 }}>
                {sendingFeedback ? 'Sending...' : 'Send Feedback'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </ScrollView>
`;
code = code.replace(/    <\/ScrollView>/, modalUI);

fs.writeFileSync('align-native/src/app/settings/index.tsx', code);
console.log('Patched settings with feedback');
