import { View, StyleSheet, SafeAreaView } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();

  const handleNext = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    router.replace('/login');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={{ color: theme.text, fontSize: 24 }}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.imageContainer}>
          <View style={[styles.placeholderImage, { backgroundColor: theme.accentFill + '20' }]}>
            <Text style={{ fontSize: 60 }}>📅</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>Stay Organized{'\n'}and Productive</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Create tasks, set reminders and get things done.
        </Text>

        <View style={styles.footer}>
          <View style={styles.dots}>
            <View style={[styles.dot, { backgroundColor: theme.border }]} />
            <View style={[styles.dot, { backgroundColor: theme.accentFill }]} />
            <View style={[styles.dot, { backgroundColor: theme.border }]} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.accentFill, opacity: pressed ? 0.8 : 1 }
            ]}
            onPress={handleNext}
          >
            <Text style={[styles.buttonText, { color: theme.onAccent }]}>Next</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backButton: {
    padding: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxHeight: '40%',
    marginTop: 20,
    marginBottom: 40,
  },
  placeholderImage: {
    width: 250,
    height: 250,
    borderRadius: 125,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  footer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 40,
    marginTop: 'auto',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

