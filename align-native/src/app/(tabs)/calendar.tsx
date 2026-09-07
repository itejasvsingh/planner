import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { Calendar } from 'lucide-react-native';

export default function CalendarScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Calendar</Text>
      </View>

      <View style={styles.content}>
        <Calendar color={theme.textSecondary} size={48} opacity={0.3} />
        <Text style={[styles.empty, { color: theme.text }]}>Month View</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 15, marginTop: 8 }}>
          Coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 160,
  },
  empty: {
    fontWeight: '700',
    fontSize: 18,
    marginTop: 16,
  }
});

