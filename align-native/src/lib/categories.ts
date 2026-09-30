import {
  ArrowLeftRight,
  Briefcase,
  CarTaxiFront,
  Clapperboard,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  PiggyBank,
  ReceiptText,
  Shapes,
  ShoppingBag,
  ShoppingCart,
  Undo2,
  UtensilsCrossed,
  WalletCards,
  type LucideIcon,
} from 'lucide-react-native';

export type CategoryKind = 'expense' | 'income' | 'transfer';

export type Category = {
  name: string;
  icon: LucideIcon;
  /**
   * Other spellings found in stored items: older in-app names ("Food Delivery"), the "#Dining"-style
   * tags written by the add form, the AI parser and the WhatsApp bot, and common merchant words.
   */
  aliases: string[];
};

export const EXPENSE_CATEGORIES: Category[] = [
  { name: 'Food & Dining', icon: UtensilsCrossed, aliases: ['food delivery', 'dining', 'food', 'restaurant', 'eating out', 'swiggy', 'zomato', 'coffee', 'lunch', 'dinner'] },
  { name: 'Groceries', icon: ShoppingCart, aliases: ['grocery', 'blinkit', 'zepto', 'bigbasket', 'instamart'] },
  { name: 'Transport', icon: CarTaxiFront, aliases: ['cabs', 'cab', 'travel', 'transit', 'uber', 'ola', 'rapido', 'fuel', 'petrol', 'metro', 'auto', 'flights'] },
  { name: 'Shopping', icon: ShoppingBag, aliases: ['festival shopping', 'amazon', 'flipkart', 'myntra', 'clothes'] },
  { name: 'Bills & Recharge', icon: ReceiptText, aliases: ['bills', 'bill', 'mobile recharge', 'recharge', 'electricity', 'internet', 'wifi', 'utilities'] },
  { name: 'Home & Help', icon: House, aliases: ['maid/help', 'maid', 'help', 'rent', 'home', 'household'] },
  { name: 'Health', icon: HeartPulse, aliases: ['medical', 'medicine', 'pharmacy', 'doctor', 'gym', 'fitness'] },
  { name: 'Education', icon: GraduationCap, aliases: ['academics', 'courses', 'course', 'books', 'tuition'] },
  { name: 'Entertainment', icon: Clapperboard, aliases: ['movies', 'subscriptions', 'subscription', 'netflix', 'spotify', 'games'] },
  { name: 'Gifts', icon: Gift, aliases: ['gift', 'donation', 'donations'] },
  { name: 'Other', icon: Shapes, aliases: ['general', 'misc', 'miscellaneous', 'uncategorized'] },
];

export const INCOME_CATEGORIES: Category[] = [
  { name: 'Salary', icon: Briefcase, aliases: ['payroll', 'wages', 'bonus'] },
  { name: 'Money Received', icon: HandCoins, aliases: ['upi transfer', 'received', 'income', 'deposit', 'repayment'] },
  { name: 'Refund', icon: Undo2, aliases: ['refunds', 'cashback', 'reimbursement'] },
  { name: 'Other', icon: Shapes, aliases: ['general', 'misc'] },
];

export const TRANSFER_CATEGORIES: Category[] = [
  { name: 'Self Transfer', icon: ArrowLeftRight, aliases: ['transfer', 'own account'] },
  { name: 'Wallet Load', icon: WalletCards, aliases: ['wallet', 'paytm wallet'] },
  { name: 'Savings', icon: PiggyBank, aliases: ['investment', 'investments', 'sip', 'fd'] },
];

export const DEFAULT_CATEGORY: Record<CategoryKind, string> = {
  expense: 'Food & Dining',
  income: 'Salary',
  transfer: 'Self Transfer',
};

export function categoriesFor(kind: CategoryKind): Category[] {
  if (kind === 'income') return INCOME_CATEGORIES;
  if (kind === 'transfer') return TRANSFER_CATEGORIES;
  return EXPENSE_CATEGORIES;
}

export function kindForType(type?: string): CategoryKind {
  if (type === 'income' || type === 'deposit') return 'income';
  if (type === 'transfer') return 'transfer';
  return 'expense';
}

function keyOf(raw: string) {
  return raw.trim().replace(/^#/, '').toLowerCase();
}

/**
 * Maps any stored category string ("#Dining", "Food Delivery", "food & dining") onto the shared list.
 * Unknown values keep their own label (without the leading '#') and get the generic icon, so
 * AI-invented categories stay visible instead of being silently folded into "Other".
 */
export function resolveCategory(raw: string | null | undefined, kind: CategoryKind = 'expense'): Category {
  const list = categoriesFor(kind);
  const fallback = list.find(c => c.name === 'Other') ?? list[0];
  if (!raw || !raw.trim()) return fallback;
  const key = keyOf(raw);
  const match =
    list.find(c => c.name.toLowerCase() === key || c.aliases.includes(key)) ??
    // A category saved under another kind (e.g. an expense tagged "#Income") still gets a sensible icon.
    [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...TRANSFER_CATEGORIES].find(
      c => c.name.toLowerCase() === key || c.aliases.includes(key),
    );
  if (match) return match;
  const label = raw.trim().replace(/^#/, '');
  return { name: label.charAt(0).toUpperCase() + label.slice(1), icon: Shapes, aliases: [] };
}
