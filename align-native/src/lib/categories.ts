import {
  ArrowLeftRight,
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  CarTaxiFront,
  Clapperboard,
  Coffee,
  CreditCard,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Hotel,
  House,
  Landmark,
  Music,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  ReceiptText,
  Scissors,
  Shapes,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  TrendingUp,
  Undo2,
  UtensilsCrossed,
  WalletCards,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

export type CategoryKind = 'expense' | 'income' | 'transfer';

/** Icons a category can use, keyed by a stable name that is safe to store. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: UtensilsCrossed, coffee: Coffee, cart: ShoppingCart, bag: ShoppingBag, shirt: Shirt, taxi: CarTaxiFront,
  bus: Bus, fuel: Fuel, plane: Plane, hotel: Hotel, receipt: ReceiptText, phone: Smartphone, wifi: Wifi, zap: Zap,
  house: House, health: HeartPulse, pill: Pill, gym: Dumbbell, education: GraduationCap, book: BookOpen,
  movie: Clapperboard, music: Music, games: Gamepad2, gift: Gift, baby: Baby, pet: PawPrint, salon: Scissors,
  card: CreditCard, bank: Landmark, invest: TrendingUp, savings: PiggyBank, salary: Briefcase, received: HandCoins,
  refund: Undo2, transfer: ArrowLeftRight, wallet: WalletCards, sparkles: Sparkles, tag: Tag, other: Shapes,
};

export type Category = {
  /** Stable id: the built-in's original name, or "c_…" for a category the user created. */
  id: string;
  name: string;
  icon: LucideIcon;
  iconKey: string;
  kind: CategoryKind;
  builtin: boolean;
  hidden?: boolean;
  /**
   * Other spellings found in stored items: older in-app names ("Food Delivery"), the "#Dining"-style
   * tags written by the add form, the AI parser and the WhatsApp bot, and common merchant words.
   */
  aliases: string[];
};

type Builtin = { name: string; iconKey: string; aliases: string[] };

const BUILTIN: Record<CategoryKind, Builtin[]> = {
  expense: [
    { name: 'Food & Dining', iconKey: 'utensils', aliases: ['food delivery', 'dining', 'food', 'restaurant', 'eating out', 'swiggy', 'zomato', 'coffee', 'lunch', 'dinner'] },
    { name: 'Groceries', iconKey: 'cart', aliases: ['grocery', 'blinkit', 'zepto', 'bigbasket', 'instamart'] },
    { name: 'Transport', iconKey: 'taxi', aliases: ['cabs', 'cab', 'travel', 'transit', 'uber', 'ola', 'rapido', 'fuel', 'petrol', 'metro', 'auto', 'flights'] },
    { name: 'Shopping', iconKey: 'bag', aliases: ['festival shopping', 'amazon', 'flipkart', 'myntra', 'clothes'] },
    { name: 'Bills & Recharge', iconKey: 'receipt', aliases: ['bills', 'bill', 'mobile recharge', 'recharge', 'electricity', 'internet', 'wifi', 'utilities'] },
    { name: 'Home & Help', iconKey: 'house', aliases: ['maid/help', 'maid', 'help', 'rent', 'home', 'household'] },
    { name: 'Health', iconKey: 'health', aliases: ['medical', 'medicine', 'pharmacy', 'doctor', 'gym', 'fitness'] },
    { name: 'Education', iconKey: 'education', aliases: ['academics', 'courses', 'course', 'books', 'tuition'] },
    { name: 'Entertainment', iconKey: 'movie', aliases: ['movies', 'subscriptions', 'subscription', 'netflix', 'spotify', 'games'] },
    { name: 'Gifts', iconKey: 'gift', aliases: ['gift', 'donation', 'donations'] },
    { name: 'Other', iconKey: 'other', aliases: ['general', 'misc', 'miscellaneous', 'uncategorized'] },
  ],
  income: [
    { name: 'Salary', iconKey: 'salary', aliases: ['payroll', 'wages', 'bonus'] },
    { name: 'Money Received', iconKey: 'received', aliases: ['upi transfer', 'received', 'income', 'deposit', 'repayment'] },
    { name: 'Refund', iconKey: 'refund', aliases: ['refunds', 'cashback', 'reimbursement'] },
    { name: 'Other', iconKey: 'other', aliases: ['general', 'misc'] },
  ],
  transfer: [
    { name: 'Self Transfer', iconKey: 'transfer', aliases: ['transfer', 'own account'] },
    { name: 'Wallet Load', iconKey: 'wallet', aliases: ['wallet', 'paytm wallet'] },
    { name: 'Savings', iconKey: 'savings', aliases: ['investment', 'investments', 'sip', 'fd'] },
  ],
};

export type CustomCategory = { id: string; name: string; iconKey: string; kind: CategoryKind };

/** The user's edits, stored as `expenseCategories` in planner_settings/preferences_<phone>. */
export type CategoryConfig = {
  custom?: CustomCategory[];
  /** Ids hidden from pickers. Their transactions keep showing under them. */
  hidden?: string[];
  /** Built-in id -> the name the user gave it. */
  renamed?: Record<string, string>;
  /** Built-in id -> icon key chosen by the user. */
  icons?: Record<string, string>;
};

export const DEFAULT_CATEGORY: Record<CategoryKind, string> = {
  expense: 'Food & Dining',
  income: 'Salary',
  transfer: 'Self Transfer',
};

const iconFor = (key: string) => CATEGORY_ICONS[key] ?? Shapes;

function keyOf(raw: string) {
  return raw.trim().replace(/^#/, '').toLowerCase();
}

const cache = new WeakMap<CategoryConfig, Map<CategoryKind, Category[]>>();
const NO_CONFIG: CategoryConfig = {};

/** Every category of a kind (built-ins with the user's renames/icons, then custom ones), hidden ones included. */
export function allCategories(kind: CategoryKind, config: CategoryConfig = NO_CONFIG): Category[] {
  let byKind = cache.get(config);
  if (!byKind) cache.set(config, (byKind = new Map()));
  const hit = byKind.get(kind);
  if (hit) return hit;

  const hidden = new Set(config.hidden || []);
  const builtins: Category[] = BUILTIN[kind].map(b => {
    const name = config.renamed?.[b.name]?.trim() || b.name;
    const iconKey = config.icons?.[b.name] || b.iconKey;
    return {
      id: b.name,
      name,
      icon: iconFor(iconKey),
      iconKey,
      kind,
      builtin: true,
      hidden: hidden.has(b.name),
      // Keep the original name as an alias so items saved before a rename still match.
      aliases: name === b.name ? b.aliases : [b.name.toLowerCase(), ...b.aliases],
    };
  });
  const custom: Category[] = (config.custom || [])
    .filter(c => c.kind === kind)
    .map(c => ({ id: c.id, name: c.name, icon: iconFor(c.iconKey), iconKey: c.iconKey, kind, builtin: false, hidden: hidden.has(c.id), aliases: [] }));
  // "Other" stays last so it reads as the catch-all.
  const other = builtins.filter(c => c.id === 'Other');
  const list = [...builtins.filter(c => c.id !== 'Other'), ...custom, ...other];
  byKind.set(kind, list);
  return list;
}

/** Categories offered in pickers (hidden ones left out). */
export function categoriesFor(kind: CategoryKind, config?: CategoryConfig): Category[] {
  return allCategories(kind, config).filter(c => !c.hidden);
}

/** Built-in expense categories (no user edits); kept for callers that don't load the user's config. */
export const EXPENSE_CATEGORIES = allCategories('expense');
export const INCOME_CATEGORIES = allCategories('income');
export const TRANSFER_CATEGORIES = allCategories('transfer');

export function kindForType(type?: string): CategoryKind {
  if (type === 'income' || type === 'deposit') return 'income';
  if (type === 'transfer') return 'transfer';
  return 'expense';
}

const matches = (c: Category, key: string) => c.name.toLowerCase() === key || c.aliases.includes(key);

/**
 * Maps any stored category string ("#Dining", "Food Delivery", "food & dining", a custom name) onto the
 * user's list. Unknown values keep their own label (without the leading '#') and get the generic icon,
 * so AI-invented categories stay visible instead of being silently folded into "Other".
 */
export function resolveCategory(raw: string | null | undefined, kind: CategoryKind = 'expense', config?: CategoryConfig): Category {
  const list = allCategories(kind, config);
  const fallback = list.find(c => c.id === 'Other') ?? list[0];
  if (!raw || !raw.trim()) return fallback;
  const key = keyOf(raw);
  const match =
    list.find(c => c.name.toLowerCase() === key) ??
    list.find(c => matches(c, key)) ??
    // A category saved under another kind (e.g. an expense tagged "#Income") still gets a sensible icon.
    (['expense', 'income', 'transfer'] as CategoryKind[]).flatMap(k => allCategories(k, config)).find(c => matches(c, key));
  if (match) return match;
  const label = raw.trim().replace(/^#/, '');
  return { id: `unknown:${key}`, name: label.charAt(0).toUpperCase() + label.slice(1), icon: Shapes, iconKey: 'other', kind, builtin: false, aliases: [] };
}

/** True when a stored category string currently resolves to the given category. */
export function isInCategory(raw: string | null | undefined, kind: CategoryKind, categoryId: string, config?: CategoryConfig) {
  return resolveCategory(raw, kind, config).id === categoryId;
}

export function newCustomId() {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
