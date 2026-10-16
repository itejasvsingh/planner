import { Colors, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
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
            gap: 2,
            marginBottom: 4
        }}>
            {tabs.map(tab => {
                const isActive = activeTab === tab;
                return (
                    <Pressable
                        key={tab}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                        onPress={() => onTabChange(tab)}
                        style={[
                            { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: Radius.sm, borderWidth: 1, borderColor: 'transparent' },
                            isActive && { backgroundColor: c.accentFill, borderColor: c.accentFill }
                        ]}
                    >
                        <Text style={{ 
                            fontSize: 12,
                            fontWeight: '600',
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                            color: isActive ? c.onAccent : c.textSecondary
                        }}>
                            {tab}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
