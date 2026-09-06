"use client";

import React, { useState, useEffect } from 'react';
import {
    IconWhatsApp,
    IconCheck,
    IconClock,
    IconChevronRight,
    IconCopy
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

function parseToParts(time24: string) {
    const [hStr, mStr] = (time24 || '22:00').split(':');
    const h = parseInt(hStr, 10) || 0;
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
    const [userPhone, setUserPhone] = useState<string | null>(null);
    const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
    const [dailySummaryTime, setDailySummaryTime] = useState('22:00');
    const [reminderTiming, setReminderTiming] = useState<'exact' | '1h_before' | 'both'>('exact');

    const [isSendingTest, setIsSendingTest] = useState(false);
    const [testStatus, setTestStatus] = useState<string | null>(null);
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

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
            console.warn("Preferences subscription notice in WhatsApp settings page:", err);
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
        setTestStatus('Dispatching summary to your WhatsApp...');

        try {
            const res = await fetch(`/api/cron/daily-summary?phone=${encodeURIComponent(userPhone)}&force=true`);
            const data = await res.json();
            if (data.success) {
                await triggerHaptic('success');
                setTestStatus('✅ Summary delivered to WhatsApp!');
            } else {
                setTestStatus(`⚠️ ${data.reason || 'Could not send message'}`);
            }
        } catch {
            setTestStatus('❌ Network error sending test summary');
        } finally {
            setIsSendingTest(false);
            setTimeout(() => setTestStatus(null), 5000);
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
            desc: 'Receive alerts right when your task or event begins'
        },
        {
            id: '1h_before',
            title: '1 Hour Before',
            desc: 'Receive a heads-up alert 60 minutes prior'
        },
        {
            id: 'both',
            title: 'Both (1 Hour Before & At Time)',
            desc: 'Get an early 60-min warning plus the on-time alert'
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
                        background: 'rgba(37,211,102,0.14)',
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

                {/* ── Status Card ── */}
                <div
                    className="settings-card"
                    style={{
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                    }}
                >
                    <div
                        style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: 'rgba(37, 211, 102, 0.12)',
                            color: '#25D366',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            boxShadow: '0 2px 8px rgba(37, 211, 102, 0.15)'
                        }}
                    >
                        <IconWhatsApp style={{ width: 22, height: 22 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                            {formattedPhone}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                            {dailySummaryEnabled ? `Daily recap active at ${format12Hour(dailySummaryTime)}` : 'Summary is currently off'}
                        </div>
                    </div>
                    <span
                        style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: '16px',
                            background: dailySummaryEnabled ? 'rgba(37, 211, 102, 0.12)' : 'var(--bg)',
                            color: dailySummaryEnabled ? '#25D366' : 'var(--text-light)',
                            border: `1px solid ${dailySummaryEnabled ? 'rgba(37, 211, 102, 0.3)' : 'var(--border)'}`,
                            flexShrink: 0
                        }}
                    >
                        {dailySummaryEnabled ? 'Active' : 'Standby'}
                    </span>
                </div>

                {/* ── Group 1: DAILY RECAP ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">Daily Digest</div>
                    <div className="settings-card">
                        {/* Master Switch Row */}
                        <div className="settings-row">
                            <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                                    End-of-Day Summary
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px', lineHeight: 1.3 }}>
                                    {dailySummaryEnabled
                                        ? `Automated agenda recap delivered at ${format12Hour(dailySummaryTime)}`
                                        : 'Automatically sends unfinished tasks and daily recap'}
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

                        {/* Animated Expandable Configuration */}
                        <div
                            style={{
                                maxHeight: dailySummaryEnabled ? '450px' : '0px',
                                opacity: dailySummaryEnabled ? 1 : 0,
                                transform: dailySummaryEnabled ? 'translateY(0)' : 'translateY(-6px)',
                                overflow: 'hidden',
                                transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.24s ease, transform 0.24s ease',
                            }}
                        >
                            <div className="settings-divider" style={{ marginLeft: '16px' }} />

                            {/* Scheduled Delivery Time Row */}
                            <div className="settings-row" style={{ alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                                        Delivery Time
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#25D366', fontWeight: 700, marginTop: '2px' }}>
                                        {format12Hour(dailySummaryTime)}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {/* Native iOS Segmented AM/PM Control */}
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            background: 'rgba(120, 120, 128, 0.12)',
                                            padding: '2px',
                                            borderRadius: '9px',
                                            gap: '2px'
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
                                                padding: '4px 10px',
                                                borderRadius: '7px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                background: parts.ampm === 'AM' ? '#25D366' : 'transparent',
                                                color: parts.ampm === 'AM' ? '#FFFFFF' : 'var(--text-light)',
                                                boxShadow: parts.ampm === 'AM' ? '0 2px 5px rgba(37,211,102,0.3)' : 'none',
                                                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)'
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
                                                padding: '4px 10px',
                                                borderRadius: '7px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                background: parts.ampm === 'PM' ? '#25D366' : 'transparent',
                                                color: parts.ampm === 'PM' ? '#FFFFFF' : 'var(--text-light)',
                                                boxShadow: parts.ampm === 'PM' ? '0 2px 5px rgba(37,211,102,0.3)' : 'none',
                                                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }}
                                        >
                                            PM
                                        </button>
                                    </div>

                                    {/* Seamless Native Time Wheel Trigger */}
                                    <div style={{ position: 'relative' }}>
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 10px',
                                                borderRadius: '10px',
                                                background: 'var(--bg)',
                                                border: '1px solid var(--border)',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                color: 'var(--text)'
                                            }}
                                        >
                                            <IconClock style={{ width: 14, height: 14, color: 'var(--blue)' }} />
                                            <span>Edit</span>
                                            <input
                                                type="time"
                                                value={dailySummaryTime}
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        handleChangeDailySummaryTime(e.target.value);
                                                    }
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    opacity: 0,
                                                    cursor: 'pointer',
                                                    width: '100%',
                                                    height: '100%'
                                                }}
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Preset Quick Chips */}
                            <div style={{ padding: '0 16px 14px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-light)', marginBottom: '8px' }}>
                                    Quick Presets
                                </div>
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
                                                    color: isSelected ? '#25D366' : 'var(--text)',
                                                    padding: '5px 11px',
                                                    borderRadius: '10px',
                                                    fontSize: '12px',
                                                    fontWeight: isSelected ? 800 : 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    boxShadow: isSelected ? '0 2px 6px rgba(37,211,102,0.18)' : 'none'
                                                }}
                                                className="active:scale-95 transition-transform"
                                            >
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="settings-divider" style={{ marginLeft: '16px' }} />

                            {/* Live Test Trigger */}
                            <div style={{ padding: '12px 16px' }}>
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
                                        opacity: isSendingTest ? 0.7 : 1,
                                    }}
                                    className="active:scale-[0.98] transition-transform"
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
                    </div>
                </div>

                {/* ── Group 2: REMINDER ALERTS ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">Task Reminder Timing</div>
                    <div className="settings-card">
                        {reminderOptions.map((opt, idx) => {
                            const isSelected = reminderTiming === opt.id;
                            return (
                                <React.Fragment key={opt.id}>
                                    {idx > 0 && <div className="settings-divider" style={{ marginLeft: '16px' }} />}
                                    <div
                                        className="settings-row clickable"
                                        onClick={() => handleChangeReminderTiming(opt.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                                            <div
                                                style={{
                                                    fontSize: '14px',
                                                    fontWeight: 600,
                                                    color: isSelected ? 'var(--blue)' : 'var(--text)',
                                                    letterSpacing: '-0.2px'
                                                }}
                                            >
                                                {opt.title}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px', lineHeight: 1.3 }}>
                                                {opt.desc}
                                            </div>
                                        </div>

                                        <div style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {isSelected && (
                                                <div
                                                    style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        background: 'var(--blue)',
                                                        color: '#FFFFFF',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    <IconCheck style={{ width: 11, height: 11 }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-light)', padding: '6px 16px 0', lineHeight: 1.4 }}>
                        Alerts are delivered directly to your WhatsApp with your daily agenda schedule.
                    </div>
                </div>

                {/* ── Group 3: WHATSAPP BOT & QUICK COMMANDS ── */}
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
                                <div
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        background: '#25D366',
                                        color: '#FFFFFF',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}
                                >
                                    <IconWhatsApp style={{ width: 18, height: 18 }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                                        Chat with Align Bot
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '1px' }}>
                                        Send expenses, voice notes, or questions
                                    </div>
                                </div>
                            </div>
                            <IconChevronRight style={{ width: 18, height: 18, color: 'var(--text-light)' }} />
                        </a>

                        <div className="settings-divider" style={{ marginLeft: '16px' }} />

                        {/* Natural Commands Section */}
                        <div style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                                    Quick Commands
                                </span>
                                {copiedCmd && (
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#25D366' }}>
                                        Copied!
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {[
                                    { cmd: '"what are my tasks for today?"', desc: 'Instant agenda query' },
                                    { cmd: '"summary time 8:30pm"', desc: 'Change delivery time' },
                                    { cmd: '"turn on summary" / "turn off summary"', desc: 'Toggle daily digest' },
                                    { cmd: '"bought groceries 450"', desc: 'Instant expense logging' },
                                    { cmd: '"remind me to call Mom at 6pm"', desc: 'Schedule task with alert' }
                                ].map((item, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleCopyCommand(item.cmd)}
                                        className="active:scale-[0.99] transition-transform"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 10px',
                                            borderRadius: '10px',
                                            background: 'var(--bg)',
                                            border: '1px solid var(--border)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                            <IconCopy style={{ width: 13, height: 13, color: 'var(--text-light)', flexShrink: 0 }} />
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.cmd}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '11px', color: 'var(--text-light)', flexShrink: 0, marginLeft: '8px' }}>
                                            {item.desc}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </MobileScreen>
    );
}

