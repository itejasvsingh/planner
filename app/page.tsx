"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { db } from '../lib/firebase';
import SplitEditor, { calculateSplitAmounts } from '../components/SplitEditor';
import SwipeAction from '../components/SwipeAction';
import DrawerMenu from '../components/DrawerMenu';
import {
    IconCheck, IconStar, IconCalendar, IconTarget, IconWallet,
    IconPlus, IconClock, IconList, IconMic, IconSparkles, IconEdit,
    IconTrendingUp, IconMenu
} from '../components/Icons';

// --- HELPERS ---
function pad(n: number | string) { return String(n).padStart(2, '0'); }
function formatDateKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function getCurrentTime() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function timeToMinutes(timeStr: string | null) {
    if (!timeStr) return null;
    const normalized = timeStr.trim().toUpperCase();
    const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (minutes > 59 || hours > 23 || (match[3] && hours > 12)) return null;
    if (match[3] === 'AM' && hours === 12) hours = 0;
    if (match[3] === 'PM' && hours !== 12) hours += 12;
    return hours * 60 + minutes;
}
function getTransactionCategory(item: any) { return item.category || (Array.isArray(item.tags) && item.tags[0]) || ''; }
function formatPhone(phone: string | null) {
    if (!phone) return '';
    const countryCodeLength = phone.length > 10 ? phone.length - 10 : 0;
    const countryCode = countryCodeLength ? `+${phone.slice(0, countryCodeLength)}` : '';
    return `${countryCode} ******${phone.slice(-4)}`;
}
function normalizePhone(phone: string | null) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length === 10 ? `91${digits}` : digits;
}
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatTimeInput(timeStr: string) {
    if (!timeStr) return '';
    if (timeStr.match(/AM|PM/i)) {
        const parts = timeStr.trim().split(/\s+/);
        if(parts.length < 2) return timeStr;
        const [rawHours, minutes] = parts[0].split(':');
        let hours = rawHours;
        if (hours === '12') hours = '00';
        if (parts[1].toUpperCase() === 'PM') hours = String(parseInt(hours, 10) + 12);
        return `${pad(hours)}:${minutes}`;
    }
    return timeStr;
}

const DEFAULT_BUDGET_LIMITS = { 'MONTHLY': 20000, 'DAILY': 1000, '#Dining': 4000, '#Travel': 3000, '#Academics': 2000, '#General': 5000 };

// --- MAIN APP ---
export default function PlannerApp() {
    const [isLoaded, setIsLoaded] = useState(false);
    const [userPhone, setUserPhone] = useState<string | null>(null);
    const [loginInput, setLoginInput] = useState('');

    const [items, setItems] = useState<any[]>([]);
    const [tab, setTab] = useState('daily');
    const [financeView, setFinanceView] = useState('transactions'); 
    const [calDate, setCalDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date()); 
    const [dailyDate, setDailyDate] = useState(new Date()); 
    
    const [budgetLimits, setBudgetLimits] = useState<any>(DEFAULT_BUDGET_LIMITS);
    const [isEditingBudgets, setIsEditingBudgets] = useState(false);
    const [budgetEditScope, setBudgetEditScope] = useState<'all' | 'daily' | 'monthly'>('all');
    const [tempBudgets, setTempBudgets] = useState<any>({});
    const [newCatName, setNewCatName] = useState('');

    const [quickAddText, setQuickAddText] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [addType, setAddType] = useState('task'); 
    const [draftTitle, setDraftTitle] = useState('');
    const [draftDate, setDraftDate] = useState(formatDateKey(new Date()));
    const [draftTime, setDraftTime] = useState(getCurrentTime());
    const [draftEndTime, setDraftEndTime] = useState('');
    const [draftPriority, setDraftPriority] = useState('none');
    const [draftTarget, setDraftTarget] = useState('');
    const [draftAmount, setDraftAmount] = useState('');
    const [draftCategory, setDraftCategory] = useState('#General');
    const [editingItem, setEditingItem] = useState<any>(null);
    const [splittingItem, setSplittingItem] = useState<any>(null);
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    
    const [pushEnabled, setPushEnabled] = useState(false);
    const [notifiedItems, setNotifiedItems] = useState(new Set());
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [themeMode, setThemeMode] = useState('system');
    const [darkMode, setDarkMode] = useState(false);
    // --- HOLY GRAIL iOS KEYBOARD FIX ---
    const [vpStyle, setVpStyle] = useState({ height: '100dvh', top: '0px' });
    const [kbHeight, setKbHeight] = useState(0);

    // Initial load from localStorage
    useEffect(() => {
        try {
            const rawPhone = localStorage.getItem('planner_user_phone');
            const savedPhone = rawPhone ? normalizePhone(rawPhone) : null;
            setUserPhone(savedPhone && savedPhone.length >= 10 ? savedPhone : null);

            const savedTheme = localStorage.getItem('planner_theme');
            if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') setThemeMode(savedTheme);
            else setThemeMode(localStorage.getItem('planner_dark_mode') === 'true' ? 'dark' : 'system');

            try {
                setPushEnabled("Notification" in window ? window.Notification.permission === "granted" : false);
            } catch {}
        } catch (err) {
            console.warn("Initial load notice:", err);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Handle Login
    const handleLogin = (e: any) => {
        e.preventDefault();
        const cleaned = normalizePhone(loginInput);
        if (cleaned.length >= 10) {
            localStorage.setItem('planner_user_phone', cleaned);
            setUserPhone(cleaned);
        } else {
            alert('Please enter a valid phone number with country code (e.g., 919876543210).');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('planner_user_phone');
        setUserPhone(null);
        setItems([]);
        setIsDrawerOpen(false);
    };

    // DB Subscription (Filtered by userPhone)
    useEffect(() => {
        if (!userPhone) return;

        const unsubscribeItems = db.collection('planner_items')
            .where('ownerId', '==', String(userPhone))
            .onSnapshot((snapshot) => {
                const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setItems(fetched);
            });
        
        const unsubscribeBudgets = db.collection('planner_settings').doc(`budgets_${userPhone}`).onSnapshot((doc) => {
            if (doc.exists) { setBudgetLimits((prev: any) => ({...prev, ...doc.data()})); }
        });

        return () => { unsubscribeItems(); unsubscribeBudgets(); }
    }, [userPhone]);

    useEffect(() => {
        if (isAdding && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
    }, [isAdding, addType]);

    // Push Notification Tracker
    useEffect(() => {
        if (!userPhone) return;
        const interval = setInterval(() => {
            const now = new Date();
            const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const today = formatDateKey(now);

            items.forEach(item => {
                const reminderMinutes = timeToMinutes(item.reminderTime || item.dueTime);
                if (item.type === 'task' && !item.done && item.dueDate === today && reminderMinutes === currentMinutes) {
                    if (!notifiedItems.has(item.id)) {
                        if (pushEnabled && "Notification" in window) {
                            new window.Notification("Planner Reminder", { body: item.title, icon: "https://cdn-icons-png.flaticon.com/512/109/109613.png" });
                        }
                        fetch('https://planner-wheat-three.vercel.app/api/ping-whatsapp', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: item.title, time: currentTime, phone: userPhone })
                        }).catch(e => console.error(e));
                        setNotifiedItems(prev => new Set(prev).add(item.id));
                    }
                }
            });
        }, 10000);
        return () => clearInterval(interval);
    }, [items, notifiedItems, pushEnabled, userPhone]);

    const enablePush = async () => {
        if (!("Notification" in window)) {
            alert('Notifications are not supported in this browser.');
            return;
        }
        const perm = await window.Notification.requestPermission();
        setPushEnabled(perm === 'granted');
        if (perm === 'denied') alert('Notifications are blocked. Allow them for this site in your browser settings.');
    };

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const updateTheme = () => setDarkMode(themeMode === 'dark' || (themeMode === 'system' && mediaQuery.matches));
        updateTheme();
        if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', updateTheme);
        else mediaQuery.addListener(updateTheme);
        return () => {
            if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', updateTheme);
            else mediaQuery.removeListener(updateTheme);
        };
    }, [themeMode]);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.visualViewport) return;

        const handleResize = () => {
            const vv = window.visualViewport;
            if (!vv) return;
            setVpStyle({ height: `${vv.height}px`, top: `${vv.offsetTop}px` });
            const diff = window.innerHeight - vv.height;
            setKbHeight(Math.max(0, diff));
        };

        const handleFocus = (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
                setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
            }
        };

        window.visualViewport.addEventListener('resize', handleResize);
        window.visualViewport.addEventListener('scroll', handleResize);
        document.addEventListener('focusin', handleFocus);
        handleResize();
        return () => {
            window.visualViewport?.removeEventListener('resize', handleResize);
            window.visualViewport?.removeEventListener('scroll', handleResize);
            document.removeEventListener('focusin', handleFocus);
        };
    }, []);

    const changeTheme = (mode: string) => {
        setThemeMode(mode);
        localStorage.setItem('planner_theme', mode);
        localStorage.removeItem('planner_dark_mode');
    };

    const shiftDaily = (days: number) => {
        const d = new Date(dailyDate); d.setDate(d.getDate() + days); setDailyDate(d);
    };

    const switchTab = (newTab: string) => {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate(10); } catch {}
        }
        setTab(newTab);
    };

    async function toggleItem(id: string, currentDone: boolean) { await db.collection('planner_items').doc(id).update({ done: !currentDone }); }
    async function toggleGoal(id: string, current: number, target: number) {
        if (current >= target) return;
        const next = current + 1;
        await db.collection('planner_items').doc(id).update({
            current: next,
            progressHistory: firebase.firestore.FieldValue.arrayUnion({ value: next, at: new Date().toISOString() }),
            ...(next >= target ? { completedAt: firebase.firestore.FieldValue.serverTimestamp() } : {})
        });
    }
    
    async function deleteItem(id: string) { await db.collection('planner_items').doc(id).delete(); setEditingItem(null); }

    // SPLIT LOGIC
    async function handleSaveSplit(e: any) {
        e.preventDefault();
        if (!splittingItem) return;
        setIsProcessing(true);
        try {
            const splits = calculateSplitAmounts(splittingItem.splits || [], splittingItem.amount);
            await db.collection('planner_items').doc(splittingItem.id).update({ splits });
            setSplittingItem(null);
        } catch (error: any) {
            console.error('Failed to save split:', error);
            alert(`Could not save the split: ${error.message || 'Please check your connection.'}`);
        } finally {
            setIsProcessing(false);
        }
    }
    
    async function toggleSplit(expenseId: string, splitIdx: number, currentSplits: any[]) {
        const newSplits = [...currentSplits];
        newSplits[splitIdx].settled = !newSplits[splitIdx].settled;
        await db.collection('planner_items').doc(expenseId).update({ splits: newSplits });
    }

    async function settleUpWith(personName: string) {
        const confirmSettle = window.confirm(`Mark all debts from ${personName} as settled?`);
        if (!confirmSettle) return;
        
        const batch = db.batch();
        let hasUpdates = false;

        items.forEach(item => {
            if (item.type === 'expense' && item.splits) {
                let changed = false;
                const newSplits = item.splits.map((s: any) => {
                    if (s.name === personName && !s.settled) {
                        changed = true;
                        return { ...s, settled: true };
                    }
                    return s;
                });
                if (changed) {
                    const ref = db.collection('planner_items').doc(item.id);
                    batch.update(ref, { splits: newSplits });
                    hasUpdates = true;
                }
            }
        });

        if (hasUpdates) {
            await batch.commit();
        }
    }

    const recentFriends = useMemo(() => {
        const friends = new Set<string>();
        items.forEach(item => {
            if(item.splits) item.splits.forEach((s: any) => friends.add(s.name));
        });
        return Array.from(friends);
    }, [items]);

    const friendsBalances = useMemo(() => {
        const balances: any = {};
        items.forEach(item => {
            if (item.type === 'expense' && item.splits?.length > 0) {
                item.splits.forEach((split: any) => {
                    if (!split.settled) {
                        const name = split.name;
                        balances[name] = (balances[name] || 0) + (parseFloat(split.share) || 0);
                    }
                });
            }
        });
        return Object.entries(balances)
            .map(([name, amount]) => ({ name, amount: amount as number }))
            .filter(b => b.amount > 0)
            .sort((a,b) => b.amount - a.amount);
    }, [items]);

    function openDetailedAdd() {
        setDraftTitle(quickAddText); setDraftTime(getCurrentTime()); setDraftEndTime(''); setDraftAmount(''); setDraftCategory('#General');
        setDraftDate(tab === 'daily' ? formatDateKey(dailyDate) : formatDateKey(selectedDate));
        setQuickAddText(''); setAddType(tab === 'expenses' ? 'expense' : 'task'); setIsAdding(true);
    }

    async function handleSaveFull(e: any) {
        e.preventDefault(); 
        const title = draftTitle.trim();
        if (!title) {
            alert('Please enter a title before saving.');
            return;
        }
        setIsProcessing(true);
        let newItem;
        if (addType === 'task') {
            newItem = { ownerId: userPhone, type: 'task', title, done: false, dueDate: draftDate, reminderTime: draftTime || null, endTime: draftEndTime || null, priority: draftPriority, subtasks: [], createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        } else if (addType === 'expense' || addType === 'income') {
            newItem = { ownerId: userPhone, type: addType, title, amount: parseFloat(draftAmount) || 0, date: draftDate, category: draftCategory, tags: draftCategory ? [draftCategory] : [], splits: [], createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        } else {
            newItem = { ownerId: userPhone, type: 'goal', title, target: parseInt(draftTarget) || 5, current: 0, progressHistory: [], month: draftDate.substring(0, 7), createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        }
        try {
            await db.collection('planner_items').add(newItem);
            setIsAdding(false); setDraftTitle(''); setDraftPriority('none'); setDraftTarget(''); setDraftAmount('');
        } catch (error) {
            console.error('Failed to save item:', error);
            alert(`Could not save to the database. Please check your connection.`);
        } finally {
            setIsProcessing(false);
        }
    }

    async function handleSaveEdit(e: any) {
        e.preventDefault();
        if (!editingItem || !editingItem.title.trim()) return;
        const cleanItem = {...editingItem};
        if (cleanItem.type === 'task') cleanItem.subtasks = cleanItem.subtasks.filter((s: any) => s.text.trim() !== '');
        if (cleanItem.type === 'goal') {
            cleanItem.current = Math.max(0, Math.min(parseInt(cleanItem.current, 10) || 0, parseInt(cleanItem.target, 10) || 1));
            cleanItem.progressHistory = firebase.firestore.FieldValue.arrayUnion({ value: cleanItem.current, at: new Date().toISOString() });
            if (cleanItem.current >= cleanItem.target) cleanItem.completedAt = cleanItem.completedAt || firebase.firestore.FieldValue.serverTimestamp();
        }
        if (cleanItem.type === 'expense' || cleanItem.type === 'income') cleanItem.amount = parseFloat(cleanItem.amount) || 0;
        if (cleanItem.type === 'expense') cleanItem.splits = calculateSplitAmounts(cleanItem.splits || [], cleanItem.amount);
        const docId = cleanItem.id; delete cleanItem.id;
        await db.collection('planner_items').doc(docId).update(cleanItem);
        setEditingItem(null);
    }

    const handleOpenBudgetEdit = (scope: 'all' | 'daily' | 'monthly' = 'all') => {
        const combined = { ...budgetLimits };
        Object.keys(categorySpend).forEach(tag => { if (combined[tag] === undefined) combined[tag] = 5000; });
        if (combined['MONTHLY'] === undefined) combined['MONTHLY'] = 20000;
        if (combined['DAILY'] === undefined) combined['DAILY'] = 1000;
        setTempBudgets(combined);
        setBudgetEditScope(scope);
        setIsEditingBudgets(true);
    };

    async function handleSaveBudgets(e: any) {
        e.preventDefault();
        try {
            await db.collection('planner_settings').doc(`budgets_${userPhone}`).set(tempBudgets);
            setBudgetLimits(tempBudgets);
        } catch(e) { console.error(e); }
        setIsEditingBudgets(false);
    }

    async function submitToAI(textToProcess: string) {
        if (!textToProcess.trim()) return;
        setIsProcessing(true);
        try {
            const res = await fetch('https://planner-wheat-three.vercel.app/api/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textToProcess, phone: userPhone })
            });
            const data = await res.json();
            if (data.success) {
                setQuickAddText('');
            } else {
                alert("AI Error: " + (data.error || "Failed to parse"));
            }
        } catch {
            alert("Network Error: Could not reach Vercel API.");
        }
        setIsProcessing(false);
    }

    function startListening() {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) { alert("Voice recognition not supported on this browser."); return; }
        const recognition = new SpeechRecognition();
        recognition.continuous = false; recognition.interimResults = false;
        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setQuickAddText(transcript); submitToAI(transcript); 
        };
        recognition.onerror = (event: any) => { setIsListening(false); alert("Microphone error: " + event.error); };
        recognition.onend = () => setIsListening(false);
        recognition.start();
    }

    // Hydration guard
    if (!isLoaded) {
        return (
            <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F5F7' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #E5E5EA', borderTopColor: '#007AFF', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#8E8E93', letterSpacing: '0.2px' }}>Loading Planner...</span>
                </div>
            </div>
        );
    }

    // --- LOGIN SCREEN RENDER ---
    if (!userPhone) {
        return (
            <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg)' }}>
                <div style={{ width: '80px', height: '80px', backgroundColor: 'var(--blue)', borderRadius: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', marginBottom: '24px', boxShadow: '0 10px 30px rgba(0, 122, 255, 0.3)' }}>
                    <IconStar />
                </div>
                <h1 className="title" style={{ textAlign: 'center', marginBottom: '8px', fontSize: '32px' }}>Planner</h1>
                <p style={{ textAlign: 'center', color: 'var(--text-light)', marginBottom: '32px', fontSize: '16px', lineHeight: '1.4', maxWidth: '300px' }}>Enter your WhatsApp number to sync your personalized timeline and finances.</p>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '340px' }}>
                    <input 
                        type="tel" 
                        className="input-box" 
                        placeholder="e.g. 919876543210" 
                        value={loginInput} 
                        onChange={e => setLoginInput(e.target.value)} 
                        autoFocus 
                        style={{ textAlign: 'center', fontSize: '18px', padding: '16px', boxShadow: 'var(--shadow)' }}
                    />
                    <button type="submit" className="btn-save" style={{ margin: 0, padding: '16px' }}>Continue</button>
                </form>
            </div>
        );
    }

    // FILTER & RENDER LOGIC
    const dailyDateKey = formatDateKey(dailyDate);
    
    // UPDATED FILTER: Check if dueDate is less than or equal to dailyDateKey
    const anytimeTasks = items.filter(i => i.type === 'task' && i.dueDate <= dailyDateKey && !(i.reminderTime || i.dueTime) && !i.done);
    const rawDailyTasks = items.filter(i => i.type === 'task' && i.dueDate <= dailyDateKey && !i.done);
    
    const scheduledTimelineItems = rawDailyTasks
        .filter(i => (i.reminderTime || i.dueTime))
        .map(t => ({...t, sortTime: t.reminderTime || t.dueTime}))
        .sort((a,b) => a.sortTime.localeCompare(b.sortTime))
        .map((item, index, arr) => {
            let isConflict = false;
            if (index > 0 && arr[index - 1].sortTime === item.sortTime) isConflict = true;
            if (index < arr.length - 1 && arr[index + 1].sortTime === item.sortTime) isConflict = true;
            return { ...item, isConflict };
        });

    let monthExp = 0, monthInc = 0, dayExp = 0, dayInc = 0;
    const categorySpend: any = {};

    const allTransactions = items
        .filter(i => i.type === 'expense' || i.type === 'income')
        .sort((a, b) => new Date(b.date || b.dueDate || 0).getTime() - new Date(a.date || a.dueDate || 0).getTime());

    const monthPrefix = formatDateKey(new Date()).substring(0, 7);
    const todayKey = formatDateKey(new Date());
    const todayTransactions = allTransactions.filter(item => (item.date || item.dueDate || '') === todayKey);
    const olderTransactions = allTransactions.filter(item => (item.date || item.dueDate || '') !== todayKey);

    allTransactions.forEach(item => {
        const d = item.date || item.dueDate || '';
        const amt = parseFloat(item.amount) || 0;

        if (d.startsWith(monthPrefix)) {
            if (item.type === 'expense') {
                monthExp += amt;
                const tag = getTransactionCategory(item);
                if (tag) categorySpend[tag] = (categorySpend[tag] || 0) + amt;
            }
            if (item.type === 'income') {
                monthInc += amt;
            }
        }

        if (d === todayKey) {
            if (item.type === 'expense') dayExp += amt;
            if (item.type === 'income') dayInc += amt;
        }
    });

    const netMonthSpend = monthExp - monthInc;
    const netDaySpend = dayExp - dayInc;
    
    const monthlyLimit = budgetLimits['MONTHLY'] ?? 20000;
    const dailyLimit = budgetLimits['DAILY'] ?? 1000;
    const monthlyRemaining = monthlyLimit - netMonthSpend;
    const dailyRemaining = dailyLimit - netDaySpend;

    const getBudgetClass = (spent: number, limit: number) => {
        const pct = spent / limit;
        if (pct > 0.9) return 'danger';
        if (pct > 0.7) return 'warning';
        return 'safe';
    };

    const financeMonths = Array.from({length: 6}, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - (5 - index));
        const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
        const totals = allTransactions.reduce((result, item) => {
            const itemDate = item.date || item.dueDate || '';
            if (!itemDate.startsWith(key)) return result;
            const amount = parseFloat(item.amount) || 0;
            if (item.type === 'expense') result.expense += amount;
            if (item.type === 'income') result.income += amount;
            return result;
        }, {expense: 0, income: 0});
        return {key, label: date.toLocaleDateString('en-US', {month: 'short'}), ...totals};
    });
    const financeMaxValue = Math.max(...financeMonths.flatMap(month => [month.expense, month.income]), 1);
    
    const selectedDateKey = formatDateKey(selectedDate);
    const rawSelectedItems = items.filter(i => 
        (i.type === 'task' && i.dueDate === selectedDateKey) || 
        ((i.type === 'expense' || i.type === 'income') && (i.date === selectedDateKey || i.dueDate === selectedDateKey))
    );
    const agendaItems = rawSelectedItems.map(t => ({...t, sortTime: t.reminderTime || t.dueTime || (t.type === 'expense' || t.type === 'income' ? '23:59' : '24:00')}))
        .sort((a,b) => a.sortTime.localeCompare(b.sortTime));
    
    const monthGrid = (() => {
        const year = calDate.getFullYear(); const month = calDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
        return cells;
    })();

    const goals = items.filter(i => i.type === 'goal' && (i.current || 0) < (i.target || 0));
    const achievedGoals = items.filter(i => i.type === 'goal' && (i.current || 0) >= (i.target || 0));
    const getGoalHistory = (goal: any) => (Array.isArray(goal.progressHistory) ? goal.progressHistory : []).slice(-4).reverse();
    const formatHistoryDate = (entry: any) => new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const getPrioLabel = (prio: string) => {
        if (prio === 'high') return <span className="pill pill-high">High</span>;
        if (prio === 'med') return <span className="pill pill-med">Medium</span>;
        if (prio === 'low') return <span className="pill pill-low">Low</span>;
        return null;
    }
    const getPrioClass = (prio: string) => {
        if (prio === 'high') return 'block-prio-high';
        if (prio === 'med') return 'block-prio-med';
        if (prio === 'low') return 'block-prio-low';
        return '';
    }

    const renderTransaction = (item: any) => (
        <SwipeAction key={item.id} onDelete={() => deleteItem(item.id)}>
            <div className={`task-card ${item.type === 'income' ? 'income-card' : 'expense-card'}`} onClick={() => setEditingItem(item)}>
                <div className={`icon-box ${item.type === 'income' ? 'green' : 'red'}`}>{item.type === 'income' ? <IconTrendingUp /> : <IconWallet />}</div>
                <div className="task-content">
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                        <span className="task-title">{item.title}</span>
                        <span className={item.type === 'income' ? 'income-amount' : 'expense-amount'}>{item.type === 'income' ? '+' : '-'}₹{item.amount}</span>
                    </div>
                    <div className="expense-date">{(item.date || item.dueDate) ? new Date(item.date || item.dueDate).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}) : ''}</div>
                    {item.splits && item.splits.length > 0 && (
                        <div style={{marginTop: '4px'}}>
                            {item.splits.map((s: any, idx: number) => (
                                <span key={idx} className={`split-tag ${s.settled ? 'settled' : ''}`} onClick={(e) => { e.stopPropagation(); toggleSplit(item.id, idx, item.splits); }}>
                                    {s.settled ? '✅' : '🔄'} {s.name} owes ₹{s.share}
                                </span>
                            ))}
                        </div>
                    )}
                    {item.type === 'expense' && <button type="button" className="split-action" onClick={(e) => { e.stopPropagation(); setSplittingItem(item); }}>Split{item.splits?.length ? ` (${item.splits.length})` : ''}</button>}
                </div>
            </div>
        </SwipeAction>
    );

    return (
        <div className={`safe-bottom ${darkMode ? 'dark-mode' : ''}`}>
            <div className="account-bar">
                <button type="button" className="menu-trigger" onClick={() => setIsDrawerOpen(true)} aria-label="Open menu" title="Open menu"><IconMenu /></button>
                <div className="account-badge">
                    <span>{formatPhone(userPhone)}</span>
                    <button type="button" className="account-logout" onClick={handleLogout}>Log out</button>
                </div>
            </div>
            <DrawerMenu
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                userPhone={userPhone}
                themeMode={themeMode}
                onChangeTheme={changeTheme}
                darkMode={darkMode}
                pushEnabled={pushEnabled}
                onEnablePush={enablePush}
                onOpenBudgetEdit={handleOpenBudgetEdit}
                onLogout={handleLogout}
                pendingTasksCount={rawDailyTasks.length}
            />
            {/* DAILY TAB */}
            {tab === 'daily' && (
                <div className="safe-top fade-in">
                    <div className="header">
                        <div className="date-navigator">
                            <button
                                className="nav-arrow"
                                onClick={() => shiftDaily(-1)}
                                type="button"
                            >
                                ‹
                            </button>

                            <div className="nav-center" onDoubleClick={handleLogout} style={{cursor: 'pointer'}}>
                                <h1 className="title">Agenda</h1>
                                <div className="date-sub">
                                    {formatDateKey(dailyDate) === formatDateKey(new Date())
                                        ? 'TODAY'
                                        : dailyDate.toLocaleDateString('en-US', {
                                            weekday: 'short',
                                            month: 'short',
                                            day: 'numeric'
                                        })}
                                </div>
                            </div>

                            <button
                                className="nav-arrow"
                                onClick={() => shiftDaily(1)}
                                type="button"
                            >
                                ›
                            </button>
                        </div>
                    </div>
                    
                    <div className="list-container">
                        {anytimeTasks.length === 0 && scheduledTimelineItems.length === 0 && <div style={{padding: '20px', color: 'var(--text-light)', textAlign: 'center', fontWeight: '500'}}>Schedule is clear for this day.</div>}
                        
                        {anytimeTasks.map(item => {
                            const subsDone = item.subtasks?.filter((s: any) => s.done).length || 0;
                            const subsTotal = item.subtasks?.length || 0;
                            return (
                                <SwipeAction key={item.id} onComplete={() => toggleItem(item.id, item.done)} onDelete={() => deleteItem(item.id)}>
                                    <div className="task-card" onClick={() => setEditingItem(item)}>
                                        <div className="circle-check" onClick={(e) => { e.stopPropagation(); toggleItem(item.id, item.done); }}>
                                            <IconCheck style={{ color: 'transparent' }} />
                                        </div>
                                        <div className="task-content">
                                            <span className="task-title">{item.title}</span>
                                            <div className="task-meta-row">
                                                {getPrioLabel(item.priority)}
                                                {subsTotal > 0 && <span className="pill pill-time"><IconList /> {subsDone}/{subsTotal}</span>}
                                                {item.dueDate < todayKey && <span className="pill pill-red">Overdue</span>}
                                            </div>
                                        </div>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setEditingItem(item); }} aria-label="Edit task" title="Edit task" style={{background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', display: 'flex', padding: '4px'}}>
                                            <IconEdit />
                                        </button>
                                    </div>
                                </SwipeAction>
                            );
                        })}
                    </div>

                    {scheduledTimelineItems.length > 0 && (
                        <div className="timeline">
                            <div className="timeline-header">Live Timeline</div>
                            <div style={{position: 'relative'}}>
                                {scheduledTimelineItems.map(item => {
                                    const subsDone = item.subtasks?.filter((s: any) => s.done).length || 0;
                                    const subsTotal = item.subtasks?.length || 0;
                                    return (
                                        <div key={item.id} className="timeline-row">
                                            <div className="time-line"></div>
                                            <div className="time-label">{item.reminderTime || item.dueTime}</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <SwipeAction onComplete={() => toggleItem(item.id, item.done)} onDelete={() => deleteItem(item.id)}>
                                                    <div className={`task-block ${item.endTime ? 'class-card' : getPrioClass(item.priority)} ${item.isConflict ? 'conflict-pulse' : ''}`} onClick={() => setEditingItem(item)}>
                                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                                            <div className="block-title">{item.title}</div>
                                                            <div className="circle-check" style={{width: 20, height: 20}} onClick={(e) => { e.stopPropagation(); toggleItem(item.id, item.done); }}>
                                                                <IconCheck style={{ width: 10, height: 10, color: 'transparent' }} />
                                                            </div>
                                                        </div>
                                                        <div className="block-meta">
                                                            <span className={`pill ${item.endTime ? 'pill-purple' : 'pill-time'}`}>
                                                                <IconClock /> {item.reminderTime || item.dueTime}{item.endTime ? ` - ${item.endTime}` : ''}
                                                            </span>
                                                            {subsTotal > 0 && <span><IconList /> {subsDone}/{subsTotal}</span>}
                                                        </div>
                                                        {item.isConflict && <span className="pill pill-med" style={{marginTop: '6px', width: 'max-content'}}>⚠️ Time Conflict</span>}
                                                    </div>
                                                </SwipeAction>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* CALENDAR TAB */}
            {tab === 'calendar' && (
                <div className="safe-top fade-in">
                    <div className="header" style={{marginBottom: '4px'}}>
                        <h1 className="title">Calendar</h1>
                    </div>
                    <div className="cal-header">
                        <span onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))} style={{cursor:'pointer', color:'var(--blue)'}}>Prev</span>
                        <span>{calDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                        <span onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))} style={{cursor:'pointer', color:'var(--blue)'}}>Next</span>
                    </div>
                    <div className="cal-daynames">{DAYS.map((d, i) => <div key={i}>{d}</div>)}</div>
                    <div className="cal-grid">
                        {monthGrid.map((date, idx) => {
                            if (!date) return <div key={idx} />;
                            const key = formatDateKey(date);
                            const hasTask = items.some(i => i.type === 'task' && i.dueDate === key);
                            const hasExpense = items.some(i => (i.type === 'expense' || i.type === 'income') && (i.date === key || i.dueDate === key));
                            
                            return (
                                <div key={idx} className={`cal-cell ${key === todayKey ? 'today' : ''} ${key === formatDateKey(selectedDate) ? 'selected' : ''}`} onClick={() => setSelectedDate(date)}>
                                    {date.getDate()}
                                    {hasTask && <div className="cal-dot"></div>}
                                    {hasExpense && <div className="cal-dot-expense" style={{ background: 'var(--green)', width: '4px', height: '4px', borderRadius: '50%', position: 'absolute', bottom: '6px', right: '12px' }}></div>}
                                </div>
                            );
                        })}
                    </div>
                    
                    <div className="list-container" style={{marginTop: '24px'}}>
                        <div style={{fontSize: '14px', fontWeight: '700', color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: '4px'}}>Agenda for {selectedDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</div>
                        {agendaItems.length === 0 && <div style={{color: 'var(--text-light)', padding: '12px 0'}}>No events scheduled.</div>}
                        
                        {agendaItems.map(item => {
                            if (item.type === 'expense' || item.type === 'income') {
                                return (
                                    <SwipeAction key={item.id} onDelete={() => deleteItem(item.id)}>
                                        <div className={`task-card ${item.type === 'income' ? 'income-card' : 'expense-card'}`} onClick={() => setEditingItem(item)}>
                                            <div className={`icon-box ${item.type === 'income' ? 'green' : 'red'}`}>
                                                {item.type === 'income' ? <IconTrendingUp /> : <IconWallet />}
                                            </div>
                                            <div className="task-content">
                                                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                                                    <span className="task-title">{item.title}</span>
                                                    <span className={item.type === 'income' ? 'income-amount' : 'expense-amount'}>{item.type === 'income' ? '+' : '-'}₹{item.amount}</span>
                                                </div>
                                                {item.type === 'expense' && <button type="button" className="split-action" onClick={(e) => { e.stopPropagation(); setSplittingItem(item); }}>Split{item.splits?.length ? ` (${item.splits.length})` : ''}</button>}
                                            </div>
                                        </div>
                                    </SwipeAction>
                                )
                            } else {
                                return (
                                    <SwipeAction key={item.id} onComplete={() => toggleItem(item.id, item.done)} onDelete={() => deleteItem(item.id)}>
                                        <div className="task-card" onClick={() => setEditingItem(item)}>
                                            <div className={`circle-check ${item.done ? 'done' : ''}`} onClick={(e) => { e.stopPropagation(); toggleItem(item.id, item.done); }}><IconCheck style={{ color: item.done ? 'white' : 'transparent' }} /></div>
                                            <div className="task-content">
                                                <span className={`task-title ${item.done ? 'done' : ''}`}>{item.title}</span>
                                                {(item.reminderTime || item.dueTime) && (
                                                    <div className="task-meta-row">
                                                        <span className={`pill ${item.endTime ? 'pill-purple' : 'pill-time'}`}><IconClock /> {item.reminderTime || item.dueTime}{item.endTime ? ` - ${item.endTime}` : ''}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </SwipeAction>
                                )
                            }
                        })}
                    </div>
                </div>
            )}

            {/* FINANCE TAB */}
            {tab === 'expenses' && (
                <div className="safe-top fade-in">
                    <div className="header" style={{paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div>
                            <h1 className="title">Finance</h1>
                            <div className="date-sub">Daily & Monthly Net</div>
                        </div>
                        <button onClick={() => handleOpenBudgetEdit()} aria-label="Edit budgets" title="Edit budgets" style={{background: 'var(--surface)', border: 'none', color: 'var(--blue)', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)', cursor: 'pointer'}}><IconEdit /></button>
                    </div>

                    <div className="finance-shell">
                        <div className="segment-control" style={{marginBottom: '16px'}}>
                            <button type="button" className={`segment-btn ${financeView === 'transactions' ? 'active' : ''}`} onClick={() => setFinanceView('transactions')}>Transactions</button>
                            <button type="button" className={`segment-btn ${financeView === 'insights' ? 'active' : ''}`} onClick={() => setFinanceView('insights')}>Insights</button>
                            <button type="button" className={`segment-btn ${financeView === 'balances' ? 'active' : ''}`} onClick={() => setFinanceView('balances')}>Balances</button>
                        </div>

                        {financeView === 'balances' && (
                            <>
                                <section className="finance-section">
                                    <div className="finance-section-head" style={{marginBottom: '8px'}}><h2 className="finance-section-title">Who owes you</h2></div>
                                    {friendsBalances.length === 0 ? (
                                        <div className="finance-empty" style={{padding: '24px 0'}}>You are all settled up! 🎉</div>
                                    ) : (
                                        <div>
                                            {friendsBalances.map(friend => (
                                                <div key={friend.name} className="balance-card">
                                                    <div className="balance-avatar">{friend.name.charAt(0)}</div>
                                                    <div className="balance-info">
                                                        <div className="balance-name">{friend.name}</div>
                                                        <div className="balance-amount">Owes you ₹{friend.amount.toFixed(2)}</div>
                                                    </div>
                                                    <button type="button" className="btn-settle" onClick={() => settleUpWith(friend.name)}>Settle Up</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                                <div style={{color: 'var(--text-light)', fontSize: '12px', textAlign: 'center', marginTop: '16px', padding: '0 20px'}}>
                                    To add a new split, go to Transactions, tap "Split" on an expense, and add your friends.
                                </div>
                            </>
                        )}

                        {financeView === 'insights' && (<>
                        <section className="finance-hero">
                            <div className="finance-kicker">Net this month</div>
                            <div className={`finance-balance ${netMonthSpend > 0 ? 'negative' : ''}`}>₹{Math.abs(netMonthSpend).toLocaleString('en-IN')}</div>
                            <div className="finance-summary"><div className="finance-summary-item"><span className="finance-summary-label">Spent</span><span className="finance-summary-value">₹{monthExp.toLocaleString('en-IN')}</span></div><div className="finance-summary-item"><span className="finance-summary-label">Received</span><span className="finance-summary-value">₹{monthInc.toLocaleString('en-IN')}</span></div></div>
                        </section>
                        <section className="finance-section">
                            <div className="finance-section-head"><h2 className="finance-section-title">Monthly flow</h2><span className="finance-section-note">Last 6 months</span></div>
                            <div className="finance-chart">{financeMonths.map(month => <div className="finance-chart-column" key={month.key}><div className="finance-chart-bars"><div className="finance-chart-bar expense" title={`Spent ₹${month.expense}`} style={{height: `${Math.max((month.expense / financeMaxValue) * 100, month.expense ? 5 : 2)}%`}}></div><div className="finance-chart-bar income" title={`Received ₹${month.income}`} style={{height: `${Math.max((month.income / financeMaxValue) * 100, month.income ? 5 : 2)}%`}}></div></div><span className="finance-chart-label">{month.label}</span></div>)}</div>
                            <div className="finance-legend"><span><i className="expense-dot"></i>Spent</span><span><i className="income-dot"></i>Received</span></div>
                        </section>
                        <section className="finance-section">
                            <div className="finance-section-head"><h2 className="finance-section-title">Category budgets</h2><span className="finance-section-note">This month</span></div>
                            {Array.from(new Set([...Object.keys(budgetLimits).filter(k => !['TOTAL', 'MONTHLY', 'DAILY'].includes(k)), ...Object.keys(categorySpend)])).map(tag => { const spent = categorySpend[tag] || 0; const limit = budgetLimits[tag] || 5000; return <div key={tag} className="finance-category"><div className="finance-category-head"><span>{tag}</span><span className="finance-category-amount">₹{spent.toLocaleString('en-IN')} / ₹{limit.toLocaleString('en-IN')}</span></div><div className="finance-category-track"><div className={`finance-category-fill ${getBudgetClass(spent, limit)}`} style={{width: `${Math.min((spent / limit) * 100, 100)}%`}}></div></div></div>; })}
                        </section>
                        </>)}
                        {financeView === 'transactions' && (
                        <>
                        <div className="finance-budget-grid">
                            <div className="finance-budget-card" onClick={() => handleOpenBudgetEdit('daily')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleOpenBudgetEdit('daily'); }} title="Edit daily limit"><div className="finance-budget-label">Today available</div><div className={`finance-budget-available ${dailyRemaining < 0 ? 'negative' : ''}`}>₹{dailyRemaining.toLocaleString('en-IN')}</div><div className="finance-budget-detail"><span className="expense-value">-₹{dayExp.toLocaleString('en-IN')}</span><span className="income-value">+₹{dayInc.toLocaleString('en-IN')}</span></div></div>
                            <div className="finance-budget-card" onClick={() => handleOpenBudgetEdit('monthly')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleOpenBudgetEdit('monthly'); }} title="Edit monthly limit"><div className="finance-budget-label">Month available</div><div className={`finance-budget-available ${monthlyRemaining < 0 ? 'negative' : ''}`}>₹{monthlyRemaining.toLocaleString('en-IN')}</div><div className="finance-budget-detail"><span className="expense-value">-₹{monthExp.toLocaleString('en-IN')}</span><span className="income-value">+₹{monthInc.toLocaleString('en-IN')}</span></div></div>
                        </div>
                        <section className="finance-section finance-transactions">
                            <div className="finance-section-head"><h2 className="finance-section-title">Recent activity</h2><span className="finance-section-note">{todayTransactions.length} entries</span></div>
                            {todayTransactions.length === 0 && <div className="finance-empty">No transactions today.</div>}
                            <div className="list-container" style={{padding: 0, marginTop: 0}}>
                                {todayTransactions.map(renderTransaction)}
                            </div>
                        </section>
                        {olderTransactions.length > 0 && <section className="finance-section finance-transactions" style={{marginTop: '20px'}}>
                            <div className="finance-section-head"><h2 className="finance-section-title">Earlier activity</h2><span className="finance-section-note">{olderTransactions.length} entries</span></div>
                            <div className="list-container" style={{padding: 0, marginTop: 0}}>
                                {olderTransactions.map(renderTransaction)}
                            </div>
                        </section>}
                        </>
                        )}
                    </div>
                </div>
            )}

            {/* GOALS TAB */}
            {tab === 'goals' && (
                <div className="safe-top fade-in">
                    <div className="header" style={{marginBottom: '16px'}}>
                        <h1 className="title">Monthly Goals</h1>
                    </div>
                    <div className="goal-grid">
                        {goals.map(g => (
                            <div key={g.id} className="goal-card" onClick={() => toggleGoal(g.id, g.current, g.target)}>
                                <div className="goal-header">
                                    <span>{g.title}</span>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                                        <span style={{color: 'var(--blue)'}}>{g.current || 0} / {g.target || 0}</span>
                                        <button onClick={(e) => { e.stopPropagation(); setEditingItem(g); }} style={{background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', display: 'flex', padding: 0}}>
                                            <IconEdit />
                                        </button>
                                    </div>
                                </div>
                                <div className="progress-track"><div className="progress-fill" style={{width: `${Math.round(((g.current || 0) / (g.target || 1)) * 100)}%`}}></div></div>
                            </div>
                        ))}
                        <div className="goal-card" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px', background: 'transparent', border: '2px dashed var(--border)', boxShadow: 'none'}} onClick={() => { setAddType('goal'); setIsAdding(true); }}>
                            <span style={{color: 'var(--text-light)', fontWeight: '600'}}>+ Add Goal</span>
                        </div>
                    </div>
                    {achievedGoals.length > 0 && (
                        <div className="achieved-goals">
                            <div className="achieved-goals-title">Achieved Goals</div>
                            <div className="goal-grid">
                                {achievedGoals.map(g => (
                                    <div key={g.id} className="goal-card completed">
                                        <div className="goal-header">
                                            <span className="goal-title">{g.title}</span>
                                            <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                                                <span style={{color: 'var(--green)'}}>Completed</span>
                                                <button type="button" className="goal-edit-button" onClick={() => setEditingItem(g)} aria-label={`Edit ${g.title}`}>
                                                    <IconEdit /> Edit
                                                </button>
                                            </div>
                                        </div>
                                        <div className="progress-track"><div className="progress-fill" style={{width: '100%', background: 'var(--green)'}}></div></div>
                                        {getGoalHistory(g).length > 0 && <div className="goal-history">Progress: {getGoalHistory(g).map((entry: any) => `${entry.value} on ${formatHistoryDate(entry)}`).join(' · ')}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <nav className="tab-bar">
                <button className={`tab-btn ${tab === 'daily' ? 'active' : ''}`} onClick={() => switchTab('daily')}>
                    <IconStar /> Daily
                    {rawDailyTasks.length > 0 && <span className="tab-badge">{rawDailyTasks.length}</span>}
                </button>
                <button className={`tab-btn ${tab === 'calendar' ? 'active' : ''}`} onClick={() => switchTab('calendar')}><IconCalendar /> Calendar</button>
                <button className={`tab-btn ${tab === 'expenses' ? 'active' : ''}`} onClick={() => switchTab('expenses')}><IconWallet /> Finance</button>
                <button className={`tab-btn ${tab === 'goals' ? 'active' : ''}`} onClick={() => switchTab('goals')}><IconTarget /> Goals</button>
            </nav>

            {/* QUICK ADD BAR (SLIDES UP WITH KEYBOARD) */}
            {(tab !== 'goals') && !isAdding && !editingItem && !splittingItem && !isEditingBudgets && (
                <div className="quick-add-container fade-in" style={{ transform: `translateY(-${kbHeight}px)`, transition: 'transform 0.1s ease-out' }}>
                    <div className="quick-add-box">
                        <button className="btn-icon" onClick={startListening} style={{color: isListening ? 'var(--red)' : 'var(--text-light)'}} title="Use Voice">
                            <IconMic />
                        </button>
                        <input 
                            type="text" 
                            className="quick-add-input" 
                            placeholder={isProcessing ? "AI is thinking..." : isListening ? "Listening..." : "Tell AI what to add..."} 
                            value={quickAddText}
                            onChange={(e) => setQuickAddText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && submitToAI(quickAddText)}
                            disabled={isProcessing || isListening}
                            enterKeyHint="send"
                        />
                        <div className="quick-actions">
                            <button className="btn-icon" onClick={openDetailedAdd} title="Manual Input" disabled={isProcessing || isListening}>
                                <IconPlus />
                            </button>
                            <button className="btn-icon btn-submit" onClick={() => submitToAI(quickAddText)} disabled={isProcessing || isListening || !quickAddText.trim()}>
                                {isProcessing ? <div className="spinner"></div> : <IconSparkles />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BUDGET EDIT MODAL */}
            {isEditingBudgets && (
                <div className="modal-overlay" onClick={() => setIsEditingBudgets(false)} style={{...vpStyle, bottom: 'auto'}}>
                    <form className="modal-sheet" onClick={e => e.stopPropagation()} onSubmit={handleSaveBudgets} style={{ maxHeight: 'calc(100% - 16px)' }}>
                        <div className="input-title" style={{fontSize: '22px', marginBottom: '16px', fontWeight: 800}}>{budgetEditScope === 'daily' ? 'Edit Daily Limit' : budgetEditScope === 'monthly' ? 'Edit Monthly Limit' : 'Edit Budgets'}</div>
                        <div className="ios-list">
                            {(budgetEditScope === 'all' || budgetEditScope === 'daily') && <div className="ios-list-item" style={{backgroundColor: 'var(--bg)'}}>
                                <div className="ios-list-label" style={{color: 'var(--purple)'}}>Daily Net Limit</div>
                                <span style={{color: 'var(--purple)', fontWeight: '800', marginRight: '4px'}}>₹</span>
                                <input type="number" inputMode="decimal" className="ios-list-input" style={{color: 'var(--purple)'}} value={tempBudgets['DAILY'] ?? 0} onChange={e => setTempBudgets({...tempBudgets, 'DAILY': Number(e.target.value) || 0})} />
                            </div>}
                            {(budgetEditScope === 'all' || budgetEditScope === 'monthly') && <div className="ios-list-item" style={{backgroundColor: 'var(--bg)'}}>
                                <div className="ios-list-label" style={{color: 'var(--blue)'}}>Monthly Net Limit</div>
                                <span style={{color: 'var(--blue)', fontWeight: '800', marginRight: '4px'}}>₹</span>
                                <input type="number" inputMode="decimal" className="ios-list-input" style={{color: 'var(--blue)'}} value={tempBudgets['MONTHLY'] ?? 0} onChange={e => setTempBudgets({...tempBudgets, 'MONTHLY': Number(e.target.value) || 0})} />
                            </div>}
                            
                            {budgetEditScope === 'all' && Object.keys(tempBudgets).filter(k => !['TOTAL','MONTHLY','DAILY'].includes(k)).map(tag => (
                                <div key={tag} className="ios-list-item">
                                    <button type="button" onClick={() => { const b = {...tempBudgets}; delete b[tag]; setTempBudgets(b); }} style={{background:'none', border:'none', color:'var(--red)', fontSize:'18px', marginRight:'12px', padding:0, cursor:'pointer'}}>⛔</button>
                                    <div className="ios-list-label">{tag}</div>
                                    <span style={{color: 'var(--text-light)', fontWeight: '600', marginRight: '4px'}}>₹</span>
                                    <input type="number" inputMode="decimal" className="ios-list-input" value={tempBudgets[tag]} onChange={e => setTempBudgets({...tempBudgets, [tag]: Number(e.target.value) || 0})} />
                                </div>
                            ))}
                            
                            {budgetEditScope === 'all' && <div className="ios-list-item" style={{backgroundColor: 'rgba(52, 199, 89, 0.05)'}}>
                                <div style={{color:'var(--green)', fontSize:'18px', marginRight:'12px'}}>➕</div>
                                <input type="text" className="ios-list-input" style={{flex: 1, textAlign: 'left', color: 'var(--text)', width: 'auto'}} placeholder="New Tag (e.g. #Gym)" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                                <button type="button" onClick={() => { if(newCatName) { const t = newCatName.startsWith('#') ? newCatName : '#'+newCatName; setTempBudgets({...tempBudgets, [t]: 1000}); setNewCatName(''); } }} style={{background:'none', border:'none', color:'var(--green)', fontWeight:700, cursor:'pointer'}}>Add</button>
                            </div>}
                        </div>
                        <button type="submit" className="btn-save" style={{marginTop: '16px'}}>Save Limits</button>
                    </form>
                </div>
            )}

            {/* SPLIT EXPENSE MODAL */}
            {splittingItem && (
                <div className="modal-overlay" onClick={() => setSplittingItem(null)} style={{...vpStyle, bottom: 'auto'}}>
                    <form className="modal-sheet" onClick={e => e.stopPropagation()} onSubmit={handleSaveSplit} style={{ maxHeight: 'calc(100% - 16px)' }}>
                        <div style={{fontSize: '22px', fontWeight: 800, marginBottom: '4px'}}>Split expense</div>
                        <div style={{color: 'var(--text-light)', fontSize: '13px', marginBottom: '16px'}}>{splittingItem.title} · ₹{splittingItem.amount}</div>
                        <SplitEditor
                            splits={splittingItem.splits || []}
                            totalAmount={splittingItem.amount}
                            setSplits={(splits: any) => setSplittingItem({...splittingItem, splits})}
                            recentFriends={recentFriends}
                        />
                        <button type="submit" className="btn-save" disabled={isProcessing}>{isProcessing ? 'Saving...' : 'Save split'}</button>
                    </form>
                </div>
            )}

            {/* ADD MODAL */}
            {isAdding && (
                <div className="modal-overlay" onClick={() => setIsAdding(false)} style={{...vpStyle, bottom: 'auto'}}>
                    <form className="modal-sheet" onClick={e => e.stopPropagation()} onSubmit={handleSaveFull} style={{ maxHeight: 'calc(100% - 16px)' }}>
                        <div className="segment-control">
                            <div className={`segment-btn ${addType === 'task' ? 'active' : ''}`} onClick={() => setAddType('task')}>Task</div>
                            <div className={`segment-btn ${addType === 'expense' ? 'active' : ''}`} onClick={() => setAddType('expense')}>Expense</div>
                            <div className={`segment-btn ${addType === 'income' ? 'active' : ''}`} onClick={() => setAddType('income')}>Income</div>
                            <div className={`segment-btn ${addType === 'goal' ? 'active' : ''}`} onClick={() => setAddType('goal')}>Goal</div>
                        </div>
                        <input ref={inputRef} type="text" className="input-title" placeholder={addType === 'expense' ? "What did you buy?" : addType === 'income' ? "Income source?" : `New ${addType}...`} value={draftTitle} onChange={e => setDraftTitle(e.target.value)} enterKeyHint="done" />
                        
                        {(addType === 'expense' || addType === 'income') && (
                            <>
                                <div className="modal-row">
                                    <input type="number" step="0.01" inputMode="decimal" className="input-box" placeholder="Total Amount (₹)" value={draftAmount} onChange={e => setDraftAmount(e.target.value)} />
                                    <input type="date" className="input-box" value={draftDate} onChange={e => setDraftDate(e.target.value)} />
                                </div>
                                <div className="modal-row">
                                    <select className="input-box" value={draftCategory} onChange={e => setDraftCategory(e.target.value)}>
                                        <option value="">No Tag</option>
                                        {Object.keys(budgetLimits).filter(k => !['TOTAL','MONTHLY','DAILY'].includes(k)).map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                        {!Object.keys(budgetLimits).includes(draftCategory) && (
                                            <option value={draftCategory}>{draftCategory}</option>
                                        )}
                                    </select>
                                </div>
                            </>
                        )}

                        {addType === 'task' && (
                            <>
                                <div className="modal-row">
                                    <input type="date" className="input-box" value={draftDate} onChange={e => setDraftDate(e.target.value)} />
                                </div>
                                <div className="modal-row">
                                    <input type="time" className="input-box" value={draftTime} onChange={e => setDraftTime(e.target.value)} />
                                    <span style={{padding: '0 4px', display:'flex', alignItems:'center', color:'var(--text-light)', fontWeight: 600}}>to</span>
                                    <input type="time" className="input-box" value={draftEndTime} onChange={e => setDraftEndTime(e.target.value)} />
                                </div>
                                <div className="modal-row"><select className="input-box" value={draftPriority} onChange={e => setDraftPriority(e.target.value)}><option value="none">No Priority</option><option value="high">High Priority</option><option value="med">Medium Priority</option><option value="low">Low Priority</option></select></div>
                            </>
                        )}
                        {addType === 'goal' && (<div className="modal-row"><input type="number" inputMode="numeric" className="input-box" placeholder="Target Number (e.g. 10)" value={draftTarget} onChange={e => setDraftTarget(e.target.value)} /></div>)}
                        <button type="submit" className="btn-save" disabled={isProcessing}>{isProcessing ? 'Saving...' : 'Save to Database'}</button>
                    </form>
                </div>
            )}

            {/* EDIT MODAL */}
            {editingItem && (
                <div className="modal-overlay" onClick={() => setEditingItem(null)} style={{...vpStyle, bottom: 'auto'}}>
                    <form className="modal-sheet" onClick={e => e.stopPropagation()} onSubmit={handleSaveEdit} style={{ maxHeight: 'calc(100% - 16px)' }}>
                        <div style={{fontSize: '22px', fontWeight: 800, marginBottom: '16px'}}>Edit {editingItem.type === 'goal' ? 'Goal' : editingItem.type === 'expense' ? 'Expense' : editingItem.type === 'income' ? 'Income' : 'Task'}</div>
                        <input
                            type="text"
                            className="input-title"
                            value={editingItem.title || ''}
                            onChange={e => setEditingItem({...editingItem, title: e.target.value})}
                            autoFocus
                        />

                        {editingItem.type === 'task' && (
                            <>
                                <div className="modal-row">
                                    <input
                                        type="date"
                                        className="input-box"
                                        value={editingItem.dueDate || ''}
                                        onChange={e => setEditingItem({...editingItem, dueDate: e.target.value})}
                                    />
                                </div>
                                <div className="modal-row">
                                    <input
                                        type="time"
                                        className="input-box"
                                        value={formatTimeInput(editingItem.reminderTime || editingItem.dueTime || '')}
                                        onChange={e => setEditingItem({...editingItem, reminderTime: e.target.value, dueTime: null})}
                                    />
                                    <span style={{padding: '0 4px', display:'flex', alignItems:'center', color:'var(--text-light)', fontWeight: 600}}>to</span>
                                    <input
                                        type="time"
                                        className="input-box"
                                        value={formatTimeInput(editingItem.endTime || '')}
                                        onChange={e => setEditingItem({...editingItem, endTime: e.target.value || null})}
                                    />
                                </div>
                                <div className="modal-row">
                                    <select
                                        className="input-box"
                                        value={editingItem.priority || 'none'}
                                        onChange={e => setEditingItem({...editingItem, priority: e.target.value})}
                                    >
                                        <option value="none">No Priority</option>
                                        <option value="high">High Priority</option>
                                        <option value="med">Medium Priority</option>
                                        <option value="low">Low Priority</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {(editingItem.type === 'expense' || editingItem.type === 'income') && (
                            <>
                                <div className="modal-row">
                                    <input
                                        type="number"
                                        step="0.01"
                                        inputMode="decimal"
                                        className="input-box"
                                        value={editingItem.amount || ''}
                                        onChange={e => setEditingItem({...editingItem, amount: e.target.value})}
                                    />
                                    <input
                                        type="date"
                                        className="input-box"
                                        value={editingItem.date || ''}
                                        onChange={e => setEditingItem({...editingItem, date: e.target.value})}
                                    />
                                </div>
                                <div className="modal-row">
                                    <select
                                        className="input-box"
                                        value={getTransactionCategory(editingItem)}
                                        onChange={e => setEditingItem({
                                            ...editingItem,
                                            category: e.target.value,
                                            tags: [e.target.value]
                                        })}
                                    >
                                        <option value="">No Tag</option>
                                        {Object.keys(budgetLimits)
                                            .filter(k => !['TOTAL', 'MONTHLY', 'DAILY'].includes(k))
                                            .map(category => (
                                                <option key={category} value={category}>{category}</option>
                                            ))}
                                    </select>
                                </div>
                            </>
                        )}

                        {editingItem.type === 'goal' && (
                            <>
                                <div className="modal-row">
                                    <div style={{flex: 1}}>
                                        <label style={{display: 'block', fontSize: '12px', color: 'var(--text-light)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase'}}>Current</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            className="input-box"
                                            value={editingItem.current ?? 0}
                                            onChange={e => setEditingItem({...editingItem, current: parseInt(e.target.value, 10) || 0})}
                                        />
                                    </div>
                                    <div style={{flex: 1}}>
                                        <label style={{display: 'block', fontSize: '12px', color: 'var(--text-light)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase'}}>Target</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            className="input-box"
                                            value={editingItem.target || ''}
                                            onChange={e => setEditingItem({
                                                ...editingItem,
                                                target: parseInt(e.target.value, 10) || 1
                                            })}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <button type="submit" className="btn-save" style={{marginTop: '24px'}}>Save Changes</button>
                        <button
                            type="button"
                            className="btn-delete"
                            onClick={() => deleteItem(editingItem.id)}
                        >
                            Delete {editingItem.type}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}