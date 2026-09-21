const fs = require('fs');
const file = 'align-native/src/app/(tabs)/finance.tsx';
let code = `
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, ShoppingBag, Coffee, Car, Home, TrendingUp, AlertCircle, Calendar, Plus } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { useBudgetLimits } from '@/lib/use-budget-limits';
import { Colors, Radius, Shadow, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Helper for tabular numbers
const formatMoney = (amount: number) => {
  return \`₹\${Math.round(amount).toLocaleString('en-IN')}\`;
};

// SVG Circular Progress
function CircularProgress({ percent, color, size = 120, strokeWidth = 10 }: any) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle stroke={color + '20'} cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} fill="none" />
        <Circle
          stroke={color}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={\`\${circumference} \${circumference}\`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
    </View>
  );
}

// 7-day bar chart
function SpendChart({ data, c }: any) {
  const max = Math.max(...data.map((d: any) => d.val), 1);
  return (
    <View style={styles.chartContainer}>
      {data.map((d: any, i: number) => (
        <View key={i} style={styles.barCol}>
          <View style={[styles.barTrack, { backgroundColor: c.background }]}>
             <View style={[styles.barFill, { height: \`\${(d.val / max) * 100}%\`, backgroundColor: c.expense }]} />
          </View>
          <Text style={[Type.caption, { color: c.textTertiary, marginTop: 4 }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function FinanceScreen() {
  const { phone } = usePhone();
  const theme = useTheme();
  const c = theme.isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  
  const { items } = usePlannerItems(phone);
  const { limits } = useBudgetLimits(phone);

  const [timeframe, setTimeframe] = useState<'Today' | 'Week' | 'Month'>('Month');

  // Basic mock/calculated data
  const budget = limits?.monthlyBudget || 50000;
  const expenses = items.filter(i => i.type === 'expense');
  const spent = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  
  const available = Math.max(0, budget - spent);
  const percentUsed = Math.min((spent / budget) * 100, 100);
  const ringColor = percentUsed < 80 ? c.income : percentUsed < 95 ? c.warning : c.expense;

  // Chart data
  const chartData = [
    { label: 'M', val: 400 },
    { label: 'T', val: 900 },
    { label: 'W', val: 1200 },
    { label: 'T', val: 300 },
    { label: 'F', val: 2000 },
    { label: 'S', val: 150 },
    { label: 'S', val: 0 },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 100 }}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={[Type.displayLg, { color: c.text, textAlign: 'center' }]}>{formatMoney(available)}</Text>
        <Text style={[Type.body, { color: c.textSecondary, textAlign: 'center', marginTop: 4 }]}>available this month</Text>
        
        <View style={{ alignItems: 'center', marginVertical: 32 }}>
          <View style={{ position: 'relative' }}>
             <CircularProgress percent={percentUsed} color={ringColor} size={140} strokeWidth={12} />
             <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
               <Text style={[Type.title, { color: c.text }]}>{Math.round(percentUsed)}%</Text>
               <Text style={[Type.caption, { color: c.textTertiary }]}>used</Text>
             </View>
          </View>
        </View>

        {/* Toggle */}
        <View style={[styles.toggleWrap, { backgroundColor: c.backgroundElement }, Shadow.card]}>
           {['Today', 'Week', 'Month'].map(t => (
             <Pressable key={t} onPress={() => setTimeframe(t as any)} style={[styles.toggleBtn, timeframe === t && { backgroundColor: c.accentSoft }]}>
               <Text style={[Type.label, { color: timeframe === t ? c.accent : c.textSecondary }]}>{t}</Text>
             </Pressable>
           ))}
        </View>
      </View>

      {/* TREND */}
      <View style={[styles.section, { backgroundColor: c.backgroundElement, borderRadius: Radius.lg, marginHorizontal: 16, padding: 16, ...Shadow.card }]}>
        <Text style={[Type.title, { color: c.text, marginBottom: 16 }]}>Spending Trend</Text>
        <SpendChart data={chartData} c={c} />
      </View>

      {/* CATEGORIES */}
      <View style={styles.sectionNoBg}>
        <Text style={[Type.title, { color: c.text, marginLeft: 16, marginBottom: 12 }]}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
          {[
            { n: 'Food', amt: 1250, i: Coffee, col: '#F59E0B' },
            { n: 'Transport', amt: 840, i: Car, col: '#3B82F6' },
            { n: 'Shopping', amt: 3200, i: ShoppingBag, col: '#EC4899' },
          ].map(cat => (
            <View key={cat.n} style={[styles.catChip, { backgroundColor: c.backgroundElement }, Shadow.card]}>
              <View style={[styles.iconChip, { backgroundColor: cat.col + '20' }]}>
                <cat.i color={cat.col} size={20} />
              </View>
              <View>
                <Text style={[Type.label, { color: c.text }]}>{cat.n}</Text>
                <Text style={[Type.body, { color: c.textSecondary, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>₹{cat.amt}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* UPCOMING BILLS */}
      <View style={styles.sectionNoBg}>
        <Text style={[Type.title, { color: c.text, marginLeft: 16, marginBottom: 12 }]}>Upcoming Bills</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
          {[
            { n: 'Netflix', amt: 649, d: 'Due Today', warn: true },
            { n: 'Electricity', amt: 1420, d: 'In 3 days', warn: false },
          ].map(b => (
            <View key={b.n} style={[styles.billCard, { backgroundColor: c.backgroundElement }, Shadow.card]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={[styles.iconChip, { backgroundColor: c.accentSoft }]}>
                  <Calendar color={c.accent} size={20} />
                </View>
                <View style={[styles.badge, { backgroundColor: b.warn ? c.expenseSoft : c.background }]}>
                   <Text style={[Type.caption, { color: b.warn ? c.expense : c.textSecondary }]}>{b.d}</Text>
                </View>
              </View>
              <Text style={[Type.title, { color: c.text, marginTop: 12 }]}>{b.n}</Text>
              <Text style={[Type.body, { color: c.expense, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 4 }]}>-₹{b.amt}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* FRIENDS */}
      <View style={[styles.section, { backgroundColor: c.backgroundElement, borderRadius: Radius.lg, marginHorizontal: 16, padding: 16, ...Shadow.card }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={[Type.title, { color: c.text }]}>Friends</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {[
            { n: 'A', bal: 500 },
            { n: 'R', bal: -200 },
          ].map(f => (
            <View key={f.n} style={{ alignItems: 'center' }}>
               <View style={[styles.avatar, { backgroundColor: f.bal > 0 ? c.incomeSoft : c.expenseSoft }]}>
                 <Text style={[Type.title, { color: f.bal > 0 ? c.income : c.expense }]}>{f.n}</Text>
               </View>
               <Text style={[Type.caption, { color: f.bal > 0 ? c.income : c.expense, marginTop: 8, fontWeight: '700' }]}>
                 {f.bal > 0 ? '+' : ''}₹{f.bal}
               </Text>
            </View>
          ))}
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20 },
  toggleWrap: { flexDirection: 'row', borderRadius: Radius.pill, padding: 4, alignSelf: 'center' },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: Radius.pill },
  section: { marginTop: 32 },
  sectionNoBg: { marginTop: 32 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120 },
  barCol: { alignItems: 'center', gap: 4, flex: 1 },
  barTrack: { width: 24, height: 90, borderRadius: 12, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 12 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.lg, minWidth: 140 },
  iconChip: { width: 40, height: 40, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  billCard: { padding: 16, borderRadius: Radius.lg, width: 160 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.pill },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
`;
fs.writeFileSync(file, code);
