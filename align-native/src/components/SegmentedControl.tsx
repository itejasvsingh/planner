import { Colors, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Pressable, Text, View } from 'react-native';

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
            backgroundColor: isDark ? '#1C1C1E' : '#E5E5EA',
            padding: 3,
            borderRadius: 9,
            marginBottom: 20
        }}>
            {tabs.map(tab => {
                const isActive = activeTab === tab;
                return (
                    <Pressable
                        key={tab}
                        onPress={() => onTabChange(tab)}
                        style={[
                            { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 7 },
                            isActive && { backgroundColor: c.backgroundElement, ...Shadow.card, shadowOpacity: 0.1, shadowRadius: 3 }
                        ]}
                    >
                        <Text style={{ 
                            fontSize: 13, 
                            fontWeight: isActive ? '600' : '500', 
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
