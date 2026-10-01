import { Colors, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';

interface SegmentedControlProps {
    tabs: string[];
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export default function SegmentedControl({ tabs, activeTab, onTabChange }: SegmentedControlProps) {
    const { isDark } = useTheme();
    const c = isDark ? Colors.dark : Colors.light;

    return (
        <View style={{
            flexDirection: 'row',
            backgroundColor: c.backgroundMuted,
            padding: 3,
            borderRadius: Radius.md,
            marginBottom: 4
        }}>
            {tabs.map(tab => {
                const isActive = activeTab === tab;
                return (
                    <Pressable
                        key={tab}
                        onPress={() => onTabChange(tab)}
                        style={[
                            { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: Radius.sm + 1, borderWidth: 1, borderColor: 'transparent' },
                            isActive && { backgroundColor: c.backgroundElement, borderColor: c.border }
                        ]}
                    >
                        <Text style={{ 
                            fontSize: 13, 
                            fontWeight: isActive ? '700' : '500', 
                            color: isActive ? c.text : c.textSecondary 
                        }}>
                            {tab}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
