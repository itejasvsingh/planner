import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { refreshCards, useCards } from '@/lib/cards-store';
import { adjustBalances } from '@/lib/account-balances';
import { upcomingPayments } from '@/lib/upcoming';
import { cardTitle } from '@/lib/card-format';
import { useCategoryConfig } from '@/lib/use-category-config';
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import ScreenHeader from '@/components/ScreenHeader';
import TransactionSheet from '@/components/TransactionSheet';
import CardsAccounts from '@/components/finance/CardsAccounts';
import UpcomingPayments from '@/components/finance/UpcomingPayments';
import WalletSummary from '@/components/finance/WalletSummary';
import StatementsCard from '@/components/finance/StatementsCard';
import UnreadMessages from '@/components/finance/UnreadMessages';

/**
 * Wallet: net worth, credit cards (dues, overdue), bank accounts with their trend and details, and the bills coming up.
 * Spending and transactions stay on the Money tab.
 */
export default function WalletScreen() {
  const { phone } = usePhone();
  const theme = useTheme();
  const c = theme.isDark ? Colors.dark : Colors.light;
  const router = useRouter();
  const { items, loading, updateItem, deleteItem, refresh } = usePlannerItems(phone);
  const { learnMerchant } = useCategoryConfig();
  const cardData = useCards(phone);
  const [refreshing, setRefreshing] = useState(false);
  if (refreshing && !loading) setRefreshing(false);
  const [editing, setEditing] = useState<any>(null);

  const adjusted = useMemo(() => (cardData ? adjustBalances(cardData.accounts || [], cardData.cards || [], items) : null), [cardData, items]);
  // Card dues use what's owed now; card reminder tasks aren't listed separately, so a card never shows twice
  const upcoming = useMemo(
    () => upcomingPayments(items as any, (adjusted?.cards || []).map(k => ({ title: cardTitle(k), dueDate: k.dueDate, outstanding: k.outstanding, hidden: k.hidden, status: k.status })), new Date(), 14),
    [items, adjusted],
  );

  // Same as editing in Money: a changed category teaches Align that merchant's category
  const save = async (updates: any) => {
    if (!editing) return;
    const typeChanged = updates.type && updates.type !== editing.type;
    if (updates.category && (updates.category !== editing.category || typeChanged) && (updates.title || editing.title)) {
      void learnMerchant(updates.title || editing.title, updates.category, updates.type || editing.type);
    }
    await updateItem(editing.id, updates);
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{ paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
        onScroll={collapseQuickAddOnScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={() => { setRefreshing(true); refresh(); }} />}
      >
        <ScreenHeader title="Wallet" subtitle="Net worth, cards and bank accounts" />
        <View style={{ paddingHorizontal: 16, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {/* Only when a statement needs its PDF password: it needs you, so it comes first */}
          <StatementsCard section="pending" items={items} cards={cardData?.cards || []} onCardsChanged={() => void refreshCards(phone)} />
          <WalletSummary cards={(adjusted?.cards || []) as any} accounts={(adjusted?.accounts || []) as any} />
          <UpcomingPayments rows={upcoming} />
          <View style={{ height: 16 }} />
          <CardsAccounts phone={phone} items={items} onOpenSettings={() => router.push('/settings/gmail')} onEditTransaction={setEditing} />
          <StatementsCard section="list" items={items} cards={cardData?.cards || []} checks={(cardData?.checks || []) as any} onCardsChanged={() => void refreshCards(phone)} />
          <UnreadMessages />
        </View>
      </ScrollView>
      <TransactionSheet visible={editing !== null} item={editing} onClose={() => setEditing(null)} onSave={save} onDelete={deleteItem} />
    </>
  );
}
