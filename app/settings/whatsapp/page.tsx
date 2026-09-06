"use client";

import React, { useState, useEffect } from 'react';
import {
    IconWhatsApp,
    IconCheck,
    IconClock,
    IconChevronRight,
    IconCopy,
    IconZap,
    IconSparkles
} from '../../../components/Icons';
import { db } from '../../../lib/firebase';
import MobileScreen from '../../../components/MobileScreen';
import { triggerHaptic } from '../../../lib/native';

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

export default function WhatsAppSettingsPage() {
    const [userPhone, setUserPhone] = useState<string | null>(null);
    const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
    const [dailySummaryTime, setDailySummaryTime] = useState('22:00');
    const [reminderTiming, setReminderTiming] = useState<'exact' | '1h_before' | 'both'>('exact');

    const [isSendingTest, setIsSendingTest] = useState(false);
    const [testStatus, setTestStatus] = useState<string | null>(null);
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

    // Synchronize Phone & Preferences with Firestore and LocalStorage
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
                if (data?.whatsappReminderTiming === 'exact' || data?.whatsappReminderTiming === '1h_before' || data?.whatsappReminderTiming === 'both') {
                    setReminderTiming(data.whatsappReminderTiming);
                    safeSetItem(`align_reminder_timing_${validPhone}`, data.whatsappReminderTiming);
                }
            }
        }, err => {
            console.warn("Preferences subscription notice:", err);
        });

        return () => unsubscribe();
    }, []);

    // Handlers
    const handleToggleDailySummary = async () => {
        await triggerHaptic('medium');
        const nextVal = !dailySummaryEnabled;
        setDailySummaryEnabled(nextVal);
        if (userPhone) {
            safeSetItem(`align_daily_summary_${userPhone}`, String(nextVal));
            try {
                await Promise.all([
                    db.collection('planner_settings').doc(`preferences_${userPhone}`).set({ dailySummaryEnabled: nextVal }, { merge: true }),
                    db.collection('user_sessions').doc(userPhone).set({ dailySummaryEnabled: nextVal }, { merge: true })
                ]);
            } catch (e) {
                console.warn("Failed to persist daily summary preference:", e);
            }
        }
    };

    const handleChangeDailySummaryTime = async (newTime: string) => {
        await triggerHaptic('light');
        setDailySummaryTime(newTime);
        if (userPhone) {
            safeSetItem(`align_daily_summary_time_${userPhone}`, newTime);
            try {
                await Promise.all([
                    db.collection('planner_settings').doc(`preferences_${userPhone}`).set({ dailySummaryTime: newTime }, { merge: true }),
                    db.collection('user_sessions').doc(userPhone).set({ dailySummaryTime: newTime }, { merge: true })
                ]);
            } catch (e) {
                console.warn("Failed to persist daily summary time:", e);
            }
        }
    };

    const handleChangeReminderTiming = async (timing: 'exact' | '1h_before' | 'both') => {
        await triggerHaptic('light');
        setReminderTiming(timing);
        if (userPhone) {
            safeSetItem(`align_reminder_timing_${userPhone}`, timing);
            try {
                await Promise.all([
                    db.collection('planner_settings').doc(`preferences_${userPhone}`).set({ whatsappReminderTiming: timing }, { merge: true }),
                    db.collection('user_sessions').doc(userPhone).set({ whatsappReminderTiming: timing }, { merge: true })
                ]);
            } catch (e) {
                console.warn("Failed to persist reminder timing:", e);
            }
        }
    };

    const handleSendTestSummary = async () => {
        if (!userPhone || isSendingTest) return;
        await triggerHaptic('light');
        setIsSendingTest(true);
        setTestStatus('Sending...');

        try {
            const res = await fetch(`/api/cron/daily-summary?phone=${encodeURIComponent(userPhone)}&force=true`);
            const data = await res.json();
            if (data.success) {
                await triggerHaptic('success');
                setTestStatus('Sent ✓');
            } else {
                setTestStatus(data.reason || 'Failed');
            }
        } catch {
            setTestStatus('Network error');
        } finally {
            setIsSendingTest(false);
            setTimeout(() => setTestStatus(null), 4000);
        }
    };

    const handleCopyCommand = async (cmdText: string) => {
        await triggerHaptic('light');
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(cmdText.replace(/^"|"$/g, ''));
                setCopiedCmd(cmdText);
                setTimeout(() => setCopiedCmd(null), 2000);
            } catch {}
        }
    };

    const reminderOptions: { id: 'exact' | '1h_before' | 'both'; title: string; desc: string }[] = [
        {
            id: 'exact',
            title: 'At Scheduled Time',
            desc: 'Notification fires right when your task begins'
        },
        {
            id: '1h_before',
            title: '1 Hour Before',
            desc: 'Advance heads-up notification 60 minutes prior'
        },
        {
            id: 'both',
            title: 'Both (1 Hour Before & At Time)',
            desc: 'Early 60-min warning plus the on-time alert'
        }
    ];

    const formattedPhone = userPhone
        ? (userPhone.length > 10 ? `+${userPhone.slice(0, userPhone.length - 10)} ` : '') + `******${userPhone.slice(-4)}`
        : 'Active Session';

    return (
        <MobileScreen
            title="WhatsApp"
            headerRight={
                <div
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'rgba(37, 211, 102, 0.14)',
                        color: '#25D366',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <IconWhatsApp style={{ width: 16, height: 16 }} />
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

                {/* ── Top Inset Group: WhatsApp Account Status ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-card" style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div
                                style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '50%',
                                    background: '#25D366',
                                    color: '#FFFFFF',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)'
                                }}
                            >
                                <IconWhatsApp style={{ width: 24, height: 24 }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.3px', lineHeight: 1.25 }}>
                                    {formattedPhone}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '2px' }}>
                                    {dailySummaryEnabled ? `Summary at ${format12Hour(dailySummaryTime)}` : 'Assistant Standby'}
                                </div>
                            </div>
                            <span
                                style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    padding: '3px 9px',
                                    borderRadius: '12px',
                                    background: dailySummaryEnabled ? 'rgba(52, 199, 89, 0.12)' : 'rgba(120, 120, 128, 0.12)',
                                    color: dailySummaryEnabled ? '#34C759' : 'var(--text-light)',
                                    flexShrink: 0
                                }}
                            >
                                {dailySummaryEnabled ? 'Connected' : 'Standby'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Group 1: DAILY AGENDA DIGEST ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">Daily Digest</div>
                    <div className="settings-card">
                        {/* Master Switch Row */}
                        <div className="settings-row">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, paddingRight: '12px' }}>
                                <div className="settings-icon-box" style={{ backgroundColor: '#34C759' }}>
                                    <IconSparkles style={{ width: 17, height: 17 }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px' }}>
                                        Daily Summary
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px', lineHeight: 1.25 }}>
                                        Recap of unfinished tasks &amp; schedule
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={dailySummaryEnabled}
                                className={`ios-switch ${dailySummaryEnabled ? 'active' : ''}`}
                                onClick={handleToggleDailySummary}
                                aria-label="Toggle daily summary"
                            >
                                <span className="ios-switch-thumb" />
                            </button>
                        </div>

                        {/* Animated Expandable Controls */}
                        <div
                            style={{
                                maxHeight: dailySummaryEnabled ? '200px' : '0px',
                                opacity: dailySummaryEnabled ? 1 : 0,
                                overflow: 'hidden',
                                transition: 'max-height 0.28s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease',
                            }}
                        >
                            <div className="settings-divider" />

                            {/* Scheduled Delivery Time Row with Native Wheel Trigger */}
                            <div className="settings-row">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                    <div className="settings-icon-box" style={{ backgroundColor: '#007AFF' }}>
                                        <IconClock style={{ width: 17, height: 17 }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px' }}>
                                            Delivery Time
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                            Scheduled evening recap
                                        </div>
                                    </div>
                                </div>

                                {/* Compact Native Wheel Trigger Pill */}
                                <div className="settings-time-pill" title="Tap to adjust summary delivery time">
                                    <span>{format12Hour(dailySummaryTime)}</span>
                                    <input
                                        type="time"
                                        value={dailySummaryTime}
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleChangeDailySummaryTime(e.target.value);
                                            }
                                        }}
                                        className="settings-native-time-input"
                                        aria-label="Delivery Time Picker"
                                    />
                                </div>
                            </div>

                            <div className="settings-divider" />

                            {/* Send Live Test Row */}
                            <div
                                className="settings-row clickable"
                                onClick={handleSendTestSummary}
                                style={{ cursor: isSendingTest ? 'wait' : 'pointer' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                    <div className="settings-icon-box" style={{ backgroundColor: '#AF52DE' }}>
                                        <IconZap style={{ width: 17, height: 17 }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '17px', fontWeight: 400, color: 'var(--blue)', letterSpacing: '-0.3px' }}>
                                            Send Test Summary Now
                                        </div>
                                        <div style={{ fontSize: '13px', color: testStatus ? '#34C759' : 'var(--text-light)', marginTop: '1px' }}>
                                            {testStatus || 'Dispatch sample message to verify'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ flexShrink: 0, paddingLeft: '8px' }}>
                                    {isSendingTest ? (
                                        <span style={{ fontSize: '14px', color: 'var(--text-light)' }}>Sending...</span>
                                    ) : testStatus === 'Sent ✓' ? (
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#34C759' }}>Sent ✓</span>
                                    ) : (
                                        <IconChevronRight style={{ width: 16, height: 16, color: '#C7C7CC' }} />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="settings-group-footer">
                        Align automatically prepares your unfinished tasks and next-day schedule, then delivers it to your WhatsApp chat at this time every day.
                    </div>
                </div>

                {/* ── Group 2: TASK REMINDER ALERTS ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">Task Reminder Alerts</div>
                    <div className="settings-card">
                        {reminderOptions.map((opt, idx) => {
                            const isSelected = reminderTiming === opt.id;
                            return (
                                <React.Fragment key={opt.id}>
                                    {idx > 0 && <div className="settings-divider-full" />}
                                    <div
                                        className="settings-row clickable"
                                        onClick={() => handleChangeReminderTiming(opt.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                                            <div
                                                style={{
                                                    fontSize: '17px',
                                                    fontWeight: 400,
                                                    letterSpacing: '-0.3px',
                                                    color: 'var(--text)'
                                                }}
                                            >
                                                {opt.title}
                                            </div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px', lineHeight: 1.25 }}>
                                                {opt.desc}
                                            </div>
                                        </div>

                                        <div style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {isSelected && (
                                                <IconCheck style={{ width: 19, height: 19, color: 'var(--blue)' }} />
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    <div className="settings-group-footer">
                        Reminders arrive as interactive WhatsApp messages with quick status buttons to mark tasks done or snooze.
                    </div>
                </div>

                {/* ── Group 3: WHATSAPP ASSISTANT & COMMANDS ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">WhatsApp Assistant</div>
                    <div className="settings-card">
                        {/* Open WhatsApp Chat Row */}
                        <a
                            href="https://wa.me"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="settings-row clickable"
                            style={{ textDecoration: 'none', cursor: 'pointer' }}
                            onClick={() => triggerHaptic('light')}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                <div className="settings-icon-box" style={{ backgroundColor: '#25D366' }}>
                                    <IconWhatsApp style={{ width: 18, height: 18 }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '17px', fontWeight: 400, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                                        Open Align in WhatsApp
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                        Send voice notes, tasks, or expenses
                                    </div>
                                </div>
                            </div>
                            <IconChevronRight style={{ width: 16, height: 16, color: '#C7C7CC' }} />
                        </a>

                        <div className="settings-divider" />

                        {/* Quick Natural Commands Section */}
                        <div style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                    Tap-To-Copy Commands
                                </span>
                                {copiedCmd && (
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#34C759' }}>
                                        Copied ✓
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                {[
                                    { cmd: '"what are my tasks for today?"', desc: 'Instant agenda recap' },
                                    { cmd: '"summary time 8:30pm"', desc: 'Update recap delivery time' },
                                    { cmd: '"turn on summary" / "turn off summary"', desc: 'Toggle daily digest' },
                                    { cmd: '"bought groceries 450"', desc: 'Record instant expense' },
                                    { cmd: '"remind me to call Mom at 6pm"', desc: 'Create task with alert' }
                                ].map((item, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleCopyCommand(item.cmd)}
                                        className="clickable"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '9px 12px',
                                            borderRadius: '10px',
                                            background: 'rgba(120, 120, 128, 0.08)',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.12s ease',
                                            userSelect: 'none',
                                            WebkitUserSelect: 'none',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                            <IconCopy style={{ width: 14, height: 14, color: 'var(--text-light)', flexShrink: 0 }} />
                                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.cmd}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '12px', color: 'var(--text-light)', flexShrink: 0, marginLeft: '8px' }}>
                                            {item.desc}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="settings-group-footer">
                        You can message Align anytime on WhatsApp using plain English or Hindi voice notes to organize tasks, log expenses, and review your day.
                    </div>
                </div>

            </div>
        </MobileScreen>
    );
}
