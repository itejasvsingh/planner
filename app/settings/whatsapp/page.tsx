"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App } from '@capacitor/app';
import {
    IconArrowLeft,
    IconWhatsApp,
    IconRepeat,
    IconClock,
    IconBell,
    IconCheck
} from '../../../components/Icons';
import { db } from '../../../lib/firebase';

const safeGetItem = (key: string): string | null => {
    try {
        return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
};

const safeSetItem = (key: string, val: string) => {
    try {
        if (typeof window !== 'undefined') localStorage.setItem(key, val);
    } catch {}
};

function format12Hour(time24: string) {
    if (!time24) return '10:00 PM';
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10) || 0;
    const m = mStr ? mStr.padStart(2, '0') : '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}

function parseToParts(time24: string) {
    const [hStr, mStr] = (time24 || '22:00').split(':');
    let h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return { h24: h, h12, minute: m, ampm };
}

function build24From12(h12: number, minute: number, ampm: 'AM' | 'PM') {
    let h24 = h12 % 12;
    if (ampm === 'PM') h24 += 12;
    return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function WhatsAppSettingsPage() {
    const router = useRouter();

    const [userPhone, setUserPhone] = useState<string | null>(null);
    const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
    const [dailySummaryTime, setDailySummaryTime] = useState('22:00');
    const [autoPushEnabled, setAutoPushEnabled] = useState(true);
    const [reminderTiming, setReminderTiming] = useState<'exact' | '1h_before' | 'both'>('exact');

    const [isSendingTest, setIsSendingTest] = useState(false);
    const [testStatus, setTestStatus] = useState<string | null>(null);
    const [darkMode, setDarkMode] = useState(false);

    // 1. Android Hardware Back Button listener via Capacitor
    useEffect(() => {
        let handle: any = null;
        try {
            App.addListener('backButton', () => {
                router.back();
            }).then(h => { handle = h; });
        } catch (e) {
            console.warn("Native back button listener unavailable:", e);
        }

        return () => {
            if (handle && typeof handle.remove === 'function') {
                handle.remove();
            }
        };
    }, [router]);

    // 2. Theme synchronization
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const savedTheme = safeGetItem('planner_theme');
        const isDarkPref = safeGetItem('planner_dark_mode') === 'true';
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const computeDark = () => {
            if (savedTheme === 'dark') return true;
            if (savedTheme === 'light') return false;
            if (savedTheme === 'system') return mediaQuery.matches;
            return isDarkPref || mediaQuery.matches;
        };
        setDarkMode(computeDark());

        const handleThemeChange = () => setDarkMode(computeDark());
        if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handleThemeChange);
        return () => {
            if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', handleThemeChange);
        };
    }, []);

    // 3. User Phone & Preferences retrieval + Firestore sync
    useEffect(() => {
        const rawPhone = safeGetItem('planner_user_phone');
        if (!rawPhone) return;
        const cleanPhone = String(rawPhone).replace(/\D/g, '');
        const validPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        setUserPhone(validPhone);

        // Load cached values
        const cachedSummary = safeGetItem(`align_daily_summary_${validPhone}`);
        if (cachedSummary !== null) setDailySummaryEnabled(cachedSummary === 'true');

        const cachedTime = safeGetItem(`align_daily_summary_time_${validPhone}`);
        if (cachedTime) setDailySummaryTime(cachedTime);

        const cachedAutoPush = safeGetItem(`align_auto_push_${validPhone}`);
        if (cachedAutoPush !== null) setAutoPushEnabled(cachedAutoPush === 'true');

        const cachedTiming = safeGetItem(`align_reminder_timing_${validPhone}`);
        if (cachedTiming === 'exact' || cachedTiming === '1h_before' || cachedTiming === 'both') {
            setReminderTiming(cachedTiming);
        }

        // Firestore real-time listener
        const unsubscribe = db.collection('planner_settings').doc(`preferences_${validPhone}`).onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                if (typeof data?.dailySummaryEnabled === 'boolean') {
                    setDailySummaryEnabled(data.dailySummaryEnabled);
                    safeSetItem(`align_daily_summary_${validPhone}`, String(data.dailySummaryEnabled));
                }
                if (data?.dailySummaryTime) {
                    setDailySummaryTime(data.dailySummaryTime);
                    safeSetItem(`align_daily_summary_time_${validPhone}`, data.dailySummaryTime);
                }
                if (typeof data?.autoPushEnabled === 'boolean') {
                    setAutoPushEnabled(data.autoPushEnabled);
                    safeSetItem(`align_auto_push_${validPhone}`, String(data.autoPushEnabled));
                }
                if (data?.whatsappReminderTiming === 'exact' || data?.whatsappReminderTiming === '1h_before' || data?.whatsappReminderTiming === 'both') {
                    setReminderTiming(data.whatsappReminderTiming);
                    safeSetItem(`align_reminder_timing_${validPhone}`, data.whatsappReminderTiming);
                }
            }
        }, err => {
            console.warn("Preferences subscription notice in WhatsApp settings page:", err);
        });

        return () => unsubscribe();
    }, []);

    // Handlers
    const handleToggleDailySummary = async () => {
        if (!userPhone) return;
        const nextVal = !dailySummaryEnabled;
        setDailySummaryEnabled(nextVal);
        safeSetItem(`align_daily_summary_${userPhone}`, String(nextVal));

        try {
            await Promise.all([
                db.collection('planner_settings').doc(`preferences_${userPhone}`).set({ dailySummaryEnabled: nextVal }, { merge: true }),
                db.collection('user_sessions').doc(userPhone).set({ dailySummaryEnabled: nextVal }, { merge: true })
            ]);
        } catch (e) {
            console.warn("Failed to persist daily summary preference:", e);
        }
    };

    const handleChangeDailySummaryTime = async (newTime: string) => {
        if (!userPhone || !newTime) return;
        setDailySummaryTime(newTime);
        safeSetItem(`align_daily_summary_time_${userPhone}`, newTime);

        try {
            await Promise.all([
                db.collection('planner_settings').doc(`preferences_${userPhone}`).set({ dailySummaryTime: newTime }, { merge: true }),
                db.collection('user_sessions').doc(userPhone).set({ dailySummaryTime: newTime }, { merge: true })
            ]);
        } catch (e) {
            console.warn("Failed to persist daily summary time:", e);
        }
    };

    const handleToggleAutoPush = async () => {
        if (!userPhone) return;
        const nextVal = !autoPushEnabled;
        setAutoPushEnabled(nextVal);
        safeSetItem(`align_auto_push_${userPhone}`, String(nextVal));

        try {
            await Promise.all([
                db.collection('planner_settings').doc(`preferences_${userPhone}`).set({ autoPushEnabled: nextVal }, { merge: true }),
                db.collection('user_sessions').doc(userPhone).set({ autoPushEnabled: nextVal }, { merge: true })
            ]);
        } catch (e) {
            console.warn("Failed to persist auto push preference:", e);
        }
    };

    const handleChangeReminderTiming = async (timing: 'exact' | '1h_before' | 'both') => {
        if (!userPhone) return;
        setReminderTiming(timing);
        safeSetItem(`align_reminder_timing_${userPhone}`, timing);

        try {
            await Promise.all([
                db.collection('planner_settings').doc(`preferences_${userPhone}`).set({ whatsappReminderTiming: timing }, { merge: true }),
                db.collection('user_sessions').doc(userPhone).set({ whatsappReminderTiming: timing }, { merge: true })
            ]);
        } catch (e) {
            console.warn("Failed to persist reminder timing:", e);
        }
    };

    const handleSendTestSummary = async () => {
        if (!userPhone || isSendingTest) return;
        setIsSendingTest(true);
        setTestStatus('Dispatching summary to your WhatsApp...');

        try {
            const res = await fetch(`/api/cron/daily-summary?phone=${encodeURIComponent(userPhone)}&force=true`);
            const data = await res.json();
            if (data.success) {
                setTestStatus('✅ Summary delivered to WhatsApp!');
            } else {
                setTestStatus(`⚠️ ${data.reason || 'Could not send message'}`);
            }
        } catch (err: any) {
            setTestStatus('❌ Network error sending test summary');
        } finally {
            setIsSendingTest(false);
            setTimeout(() => setTestStatus(null), 5000);
        }
    };

    const parts = parseToParts(dailySummaryTime);

    const presetTimes = [
        { label: '8:00 AM', time: '08:00' },
        { label: '2:00 PM', time: '14:00' },
        { label: '8:00 PM', time: '20:00' },
        { label: '9:00 PM', time: '21:00' },
        { label: '10:00 PM', time: '22:00' },
        { label: '11:00 PM', time: '23:00' },
    ];

    const reminderOptions: { id: 'exact' | '1h_before' | 'both'; title: string; desc: string }[] = [
        {
            id: 'exact',
            title: 'At Scheduled Time',
            desc: 'Receive alerts right when your task or event starts.'
        },
        {
            id: '1h_before',
            title: '1 Hour Before',
            desc: 'Receive a heads-up alert 60 minutes before scheduled time.'
        },
        {
            id: 'both',
            title: 'Both (1 Hour Before & At Time)',
            desc: 'Get an early 1-hour warning plus the on-time reminder.'
        }
    ];

    return (
        <div
            className={`fixed inset-0 z-50 flex flex-col h-screen w-screen overflow-y-auto ${darkMode ? 'dark-mode' : ''}`}
            style={{
                backgroundColor: 'var(--bg)',
                color: 'var(--text)',
                WebkitOverflowScrolling: 'touch'
            }}
        >
            {/* Top App Bar with Native Back Button */}
            <div
                className="sticky top-0 z-10 flex items-center px-4 py-3 border-b"
                style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                    paddingTop: 'calc(12px + env(safe-area-inset-top))',
                    boxShadow: 'var(--shadow)'
                }}
            >
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="p-2 mr-3 bg-transparent rounded-full active:opacity-60 transition-opacity"
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text)',
                        padding: '8px'
                    }}
                    aria-label="Go back"
                >
                    <IconArrowLeft style={{ width: 22, height: 22 }} />
                </button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                        WhatsApp Settings
                    </h1>
                    <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '1px' }}>
                        Automations, daily digests &amp; bot commands
                    </div>
                </div>
                <div
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'rgba(37,211,102,0.12)',
                        color: '#25D366',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <IconWhatsApp style={{ width: 18, height: 18 }} />
                </div>
            </div>

            {/* Main Content Area */}
            <div
                className="flex-1"
                style={{
                    padding: '20px 16px calc(60px + env(safe-area-inset-bottom))',
                    maxWidth: '680px',
                    width: '100%',
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px'
                }}
            >
                {/* ════════════════ SECTION 1: DAILY WHATSAPP SUMMARY ════════════════ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: '4px' }}>
                        1. Daily WhatsApp Summary
                    </div>

                    <div
                        style={{
                            background: 'var(--surface)',
                            borderRadius: '20px',
                            padding: '18px',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px'
                        }}
                    >
                        {/* Toggle row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: dailySummaryEnabled ? 'rgba(37,211,102,0.15)' : 'var(--bg)',
                                        color: dailySummaryEnabled ? '#25D366' : 'var(--text-light)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}
                                >
                                    <IconWhatsApp style={{ width: 22, height: 22 }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
                                        End-of-Day Summary
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                                        {dailySummaryEnabled ? `Delivers daily at ${format12Hour(dailySummaryTime)}` : 'Summary is currently turned off'}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleToggleDailySummary}
                                style={{
                                    border: 'none',
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    background: dailySummaryEnabled ? '#22C55E' : 'var(--border)',
                                    color: dailySummaryEnabled ? '#FFFFFF' : 'var(--text-light)',
                                    fontWeight: 800,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s ease',
                                    flexShrink: 0
                                }}
                            >
                                {dailySummaryEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>

                        {/* Delivery Time Picker (Shown when enabled) */}
                        {dailySummaryEnabled && (
                            <div
                                style={{
                                    paddingTop: '16px',
                                    borderTop: '1px solid var(--border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '14px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                                        Scheduled Delivery Time:
                                    </span>
                                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#25D366' }}>
                                        {format12Hour(dailySummaryTime)}
                                    </span>
                                </div>

                                {/* AM/PM Switcher & Native Input */}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            borderRadius: '12px',
                                            padding: '3px',
                                            background: 'var(--bg)',
                                            border: '1px solid var(--border)'
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (parts.ampm !== 'AM') {
                                                    const newTime = build24From12(parts.h12, parts.minute, 'AM');
                                                    handleChangeDailySummaryTime(newTime);
                                                }
                                            }}
                                            style={{
                                                border: 'none',
                                                padding: '6px 14px',
                                                borderRadius: '9px',
                                                fontSize: '12px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                background: parts.ampm === 'AM' ? '#25D366' : 'transparent',
                                                color: parts.ampm === 'AM' ? '#FFFFFF' : 'var(--text-light)',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            AM
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (parts.ampm !== 'PM') {
                                                    const newTime = build24From12(parts.h12, parts.minute, 'PM');
                                                    handleChangeDailySummaryTime(newTime);
                                                }
                                            }}
                                            style={{
                                                border: 'none',
                                                padding: '6px 14px',
                                                borderRadius: '9px',
                                                fontSize: '12px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                background: parts.ampm === 'PM' ? '#25D366' : 'transparent',
                                                color: parts.ampm === 'PM' ? '#FFFFFF' : 'var(--text-light)',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            PM
                                        </button>
                                    </div>

                                    <div style={{ flex: 1, position: 'relative' }}>
                                        <input
                                            type="time"
                                            value={dailySummaryTime}
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    handleChangeDailySummaryTime(e.target.value);
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '9px 12px',
                                                borderRadius: '12px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--bg)',
                                                color: 'var(--text)',
                                                fontSize: '14px',
                                                fontWeight: 700,
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Presets chips */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {presetTimes.map(p => {
                                        const isSelected = dailySummaryTime === p.time;
                                        return (
                                            <button
                                                key={p.time}
                                                type="button"
                                                onClick={() => handleChangeDailySummaryTime(p.time)}
                                                style={{
                                                    border: isSelected ? '1.5px solid #25D366' : '1px solid var(--border)',
                                                    background: isSelected ? 'rgba(37,211,102,0.12)' : 'var(--bg)',
                                                    color: isSelected ? '#25D366' : 'var(--text-light)',
                                                    padding: '5px 11px',
                                                    borderRadius: '10px',
                                                    fontSize: '12px',
                                                    fontWeight: isSelected ? 800 : 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Live Test Button */}
                                <div style={{ paddingTop: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={handleSendTestSummary}
                                        disabled={isSendingTest}
                                        style={{
                                            width: '100%',
                                            padding: '11px 14px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(37,211,102,0.3)',
                                            background: 'rgba(37,211,102,0.08)',
                                            color: '#25D366',
                                            fontWeight: 700,
                                            fontSize: '13px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            cursor: isSendingTest ? 'wait' : 'pointer',
                                            opacity: isSendingTest ? 0.7 : 1
                                        }}
                                    >
                                        <IconWhatsApp style={{ width: 16, height: 16 }} />
                                        <span>{isSendingTest ? 'Sending summary...' : 'Send Test Summary Now'}</span>
                                    </button>

                                    {testStatus && (
                                        <div
                                            style={{
                                                marginTop: '8px',
                                                padding: '8px 12px',
                                                borderRadius: '10px',
                                                background: testStatus.includes('✅') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                                                color: testStatus.includes('✅') ? '#22C55E' : '#EF4444',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                textAlign: 'center'
                                            }}
                                        >
                                            {testStatus}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ════════════════ SECTION 2: AUTO PUSH INCOMPLETE TASKS ════════════════ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: '4px' }}>
                        2. Task Rollover (Independent)
                    </div>

                    <div
                        style={{
                            background: 'var(--surface)',
                            borderRadius: '20px',
                            padding: '18px',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px'
                        }}
                    >
                        {/* Toggle row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: autoPushEnabled ? 'rgba(59,130,246,0.15)' : 'var(--bg)',
                                        color: autoPushEnabled ? '#3B82F6' : 'var(--text-light)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}
                                >
                                    <IconRepeat style={{ width: 22, height: 22 }} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
                                        Auto-Push Incomplete Tasks
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                                        {autoPushEnabled ? 'Unfinished tasks automatically roll over to tomorrow' : 'Tasks stay on their scheduled date'}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleToggleAutoPush}
                                style={{
                                    border: 'none',
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    background: autoPushEnabled ? '#22C55E' : 'var(--border)',
                                    color: autoPushEnabled ? '#FFFFFF' : 'var(--text-light)',
                                    fontWeight: 800,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s ease',
                                    flexShrink: 0
                                }}
                            >
                                {autoPushEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>

                        {/* Explainer card */}
                        <div
                            style={{
                                padding: '14px',
                                background: 'var(--bg)',
                                borderRadius: '14px',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}
                        >
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '14px', lineHeight: 1.2 }}>🌙</span>
                                <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 }}>
                                    <strong>End of Day Scan:</strong> Align reviews your agenda for any unchecked tasks scheduled for today.
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '14px', lineHeight: 1.2 }}>⏩</span>
                                <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 }}>
                                    <strong>Automatic Rollover:</strong> Due dates for unfinished tasks update to tomorrow so your morning starts with clarity.
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '14px', lineHeight: 1.2 }}>🔒</span>
                                <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 }}>
                                    <strong>Preserves Details:</strong> Your original reminders, notes, and priority tags remain intact.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ════════════════ SECTION 3: REMINDER TIMING ════════════════ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: '4px' }}>
                        3. Reminder Timing Alert
                    </div>

                    <div
                        style={{
                            background: 'var(--surface)',
                            borderRadius: '20px',
                            padding: '18px',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}
                    >
                        <div style={{ fontSize: '13px', color: 'var(--text-light)', lineHeight: 1.4 }}>
                            Choose when you want reminder alerts delivered for upcoming tasks and agenda events:
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {reminderOptions.map(opt => {
                                const isSelected = reminderTiming === opt.id;
                                return (
                                    <div
                                        key={opt.id}
                                        onClick={() => handleChangeReminderTiming(opt.id)}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '14px',
                                            border: isSelected ? '1.5px solid var(--blue)' : '1px solid var(--border)',
                                            background: isSelected ? 'rgba(0,122,255,0.08)' : 'var(--bg)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: '14px', color: isSelected ? 'var(--blue)' : 'var(--text)' }}>
                                                {opt.title}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                                                {opt.desc}
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                width: '22px',
                                                height: '22px',
                                                borderRadius: '50%',
                                                border: isSelected ? '2px solid var(--blue)' : '2px solid var(--border)',
                                                background: isSelected ? 'var(--blue)' : 'transparent',
                                                color: '#FFFFFF',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}
                                        >
                                            {isSelected && <IconCheck style={{ width: 12, height: 12 }} />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ════════════════ SECTION 4: WHATSAPP BOT & COMMANDS ════════════════ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: '4px' }}>
                        4. WhatsApp Bot &amp; Quick Commands
                    </div>

                    <div
                        style={{
                            background: 'var(--surface)',
                            borderRadius: '20px',
                            padding: '18px',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px'
                        }}
                    >
                        <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                            You can also chat directly with your Align Bot on WhatsApp. Just send any thought, reminder, or expense naturally!
                        </div>

                        {/* Direct WhatsApp link */}
                        <a
                            href="https://wa.me"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                textDecoration: 'none',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                background: '#25D366',
                                color: '#FFFFFF',
                                fontWeight: 700,
                                fontSize: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(37,211,102,0.3)'
                            }}
                        >
                            <IconWhatsApp style={{ width: 18, height: 18 }} />
                            <span>Open WhatsApp Chat</span>
                        </a>

                        {/* Commands table */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-light)' }}>
                                Natural Commands You Can Send Anytime:
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                                {[
                                    { cmd: '"what are my tasks for today?"', desc: 'Instant agenda query' },
                                    { cmd: '"summary time 8:30pm"', desc: 'Changes delivery time instantly' },
                                    { cmd: '"turn on summary" / "turn off summary"', desc: 'Toggles daily digest' },
                                    { cmd: '"turn on auto push"', desc: 'Enables automatic rollover' },
                                    { cmd: '"bought groceries 450"', desc: 'Logs an expense instantly' },
                                    { cmd: '"remind me to call Mom at 6pm"', desc: 'Schedules a task with alert' }
                                ].map((item, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '8px 12px',
                                            background: 'var(--bg)',
                                            borderRadius: '10px',
                                            border: '1px solid var(--border)',
                                            fontSize: '12px'
                                        }}
                                    >
                                        <code style={{ fontWeight: 700, color: 'var(--text)' }}>{item.cmd}</code>
                                        <span style={{ color: 'var(--text-light)', fontSize: '11px', marginLeft: '8px' }}>{item.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
