"use client";

import React, { useState } from 'react';
import { IconWhatsApp, IconRepeat, IconClock, IconBell, IconCheck } from './Icons';

interface WhatsAppSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userPhone: string | null;
    dailySummaryEnabled: boolean;
    onToggleDailySummary: () => void;
    dailySummaryTime: string;
    onChangeDailySummaryTime: (time: string) => void;
    autoPushEnabled: boolean;
    onToggleAutoPush: () => void;
    reminderTiming?: 'exact' | '1h_before' | 'both';
    onChangeReminderTiming?: (timing: 'exact' | '1h_before' | 'both') => void;
}

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

export default function WhatsAppSettingsModal({
    isOpen,
    onClose,
    userPhone,
    dailySummaryEnabled,
    onToggleDailySummary,
    dailySummaryTime,
    onChangeDailySummaryTime,
    autoPushEnabled,
    onToggleAutoPush,
    reminderTiming = 'exact',
    onChangeReminderTiming
}: WhatsAppSettingsModalProps) {
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [testStatus, setTestStatus] = useState<string | null>(null);

    if (!isOpen) return null;

    const parts = parseToParts(dailySummaryTime);

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

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 220 }}>
            <div
                className="modal-sheet"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxHeight: '90vh',
                    height: 'auto',
                    overflowY: 'auto',
                    borderTopLeftRadius: '24px',
                    borderTopRightRadius: '24px',
                    padding: '24px 20px calc(max(env(safe-area-inset-bottom), 24px))'
                }}
            >
                {/* ── Top Header Bar ── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                    paddingBottom: '14px',
                    borderBottom: '1px solid var(--border)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: '#22C55E',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(34,197,94,0.3)'
                        }}>
                            <IconWhatsApp />
                        </div>
                        <div>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                                WhatsApp Settings
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '1px' }}>
                                Summaries, task rollover & bot commands
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            color: 'var(--text)',
                            borderRadius: '20px',
                            padding: '6px 14px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Done
                    </button>
                </div>

                {/* ════════════════════ SECTION 1: DAILY WHATSAPP SUMMARY ════════════════════ */}
                <div style={{
                    background: 'var(--bg)',
                    borderRadius: '18px',
                    padding: '16px',
                    border: '1px solid var(--border)',
                    marginBottom: '20px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '18px' }}>🌙</span>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                                    Daily WhatsApp Summary
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '1px' }}>
                                    Automated financial & task wrap-up
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onToggleDailySummary}
                            style={{
                                border: 'none',
                                padding: '5px 14px',
                                borderRadius: '20px',
                                background: dailySummaryEnabled ? '#22C55E' : 'var(--surface)',
                                color: dailySummaryEnabled ? '#FFFFFF' : 'var(--text-light)',
                                fontWeight: 800,
                                fontSize: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: dailySummaryEnabled ? '0 3px 10px rgba(34,197,94,0.3)' : 'none'
                            }}
                        >
                            {dailySummaryEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>

                    {dailySummaryEnabled && (
                        <div style={{
                            marginTop: '14px',
                            paddingTop: '14px',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px'
                        }}>
                            {/* Time Display & AM/PM Switcher */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                background: 'var(--surface)',
                                borderRadius: '14px',
                                border: '1px solid var(--border)'
                            }}>
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                        Delivery Time
                                    </div>
                                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>
                                        {format12Hour(dailySummaryTime)}
                                    </div>
                                </div>

                                {/* AM / PM Switcher Button */}
                                <div style={{
                                    display: 'flex',
                                    background: 'var(--bg)',
                                    borderRadius: '10px',
                                    padding: '3px',
                                    border: '1px solid var(--border)'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (parts.ampm === 'PM') {
                                                const newTime = build24From12(parts.h12, parts.minute, 'AM');
                                                onChangeDailySummaryTime(newTime);
                                            }
                                        }}
                                        style={{
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 14px',
                                            fontWeight: 800,
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            background: parts.ampm === 'AM' ? 'var(--blue)' : 'transparent',
                                            color: parts.ampm === 'AM' ? '#FFFFFF' : 'var(--text-light)',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        AM
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (parts.ampm === 'AM') {
                                                const newTime = build24From12(parts.h12, parts.minute, 'PM');
                                                onChangeDailySummaryTime(newTime);
                                            }
                                        }}
                                        style={{
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 14px',
                                            fontWeight: 800,
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            background: parts.ampm === 'PM' ? 'var(--blue)' : 'transparent',
                                            color: parts.ampm === 'PM' ? '#FFFFFF' : 'var(--text-light)',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        PM
                                    </button>
                                </div>
                            </div>

                            {/* Exact Custom Time Picker */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                                    Custom Exact Time:
                                </span>
                                <input
                                    type="time"
                                    value={dailySummaryTime}
                                    onChange={(e) => onChangeDailySummaryTime(e.target.value)}
                                    style={{
                                        background: 'var(--surface)',
                                        color: 'var(--text)',
                                        border: '1.5px solid var(--blue)',
                                        borderRadius: '10px',
                                        padding: '6px 12px',
                                        fontSize: '15px',
                                        fontWeight: 800,
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                />
                            </div>

                            {/* Quick Presets Chips */}
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: '8px' }}>
                                    Preset Times
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    {[
                                        { label: '8:00 AM', time: '08:00' },
                                        { label: '2:00 PM', time: '14:00' },
                                        { label: '8:00 PM', time: '20:00' },
                                        { label: '9:00 PM', time: '21:00' },
                                        { label: '10:00 PM', time: '22:00' },
                                        { label: '11:00 PM', time: '23:00' },
                                    ].map((preset) => {
                                        const isActive = dailySummaryTime === preset.time;
                                        return (
                                            <button
                                                key={preset.time}
                                                type="button"
                                                onClick={() => onChangeDailySummaryTime(preset.time)}
                                                style={{
                                                    padding: '8px 4px',
                                                    borderRadius: '10px',
                                                    border: `1.5px solid ${isActive ? 'var(--blue)' : 'var(--border)'}`,
                                                    background: isActive ? 'var(--blue)' : 'var(--surface)',
                                                    color: isActive ? '#FFFFFF' : 'var(--text)',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Test Summary Trigger Button */}
                            <div style={{ marginTop: '6px' }}>
                                <button
                                    type="button"
                                    onClick={handleSendTestSummary}
                                    disabled={isSendingTest}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--blue)',
                                        borderRadius: '12px',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        cursor: isSendingTest ? 'wait' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <span>{isSendingTest ? '⏳ Sending...' : '💬 Send Test Summary Now'}</span>
                                </button>
                                {testStatus && (
                                    <div style={{ fontSize: '12px', textAlign: 'center', marginTop: '6px', color: 'var(--text-light)', fontWeight: 600 }}>
                                        {testStatus}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ════════════════════ SECTION 2: TASK ROLLOVER (AUTO-PUSH) ════════════════════ */}
                <div style={{
                    background: 'var(--bg)',
                    borderRadius: '18px',
                    padding: '16px',
                    border: '1px solid var(--border)',
                    marginBottom: '20px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: autoPushEnabled ? 'var(--blue)' : 'var(--surface)',
                                color: autoPushEnabled ? '#FFFFFF' : 'var(--text-light)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <IconRepeat />
                            </div>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                                    Auto Push Incomplete Tasks
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '1px' }}>
                                    Rolls unfinished tasks forward to tomorrow
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onToggleAutoPush}
                            style={{
                                border: 'none',
                                padding: '5px 14px',
                                borderRadius: '20px',
                                background: autoPushEnabled ? '#22C55E' : 'var(--surface)',
                                color: autoPushEnabled ? '#FFFFFF' : 'var(--text-light)',
                                fontWeight: 800,
                                fontSize: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: autoPushEnabled ? '0 3px 10px rgba(34,197,94,0.3)' : 'none'
                            }}
                        >
                            {autoPushEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>

                    <div style={{
                        fontSize: '12px',
                        color: 'var(--text-light)',
                        lineHeight: 1.4,
                        padding: '10px 12px',
                        background: 'var(--surface)',
                        borderRadius: '12px',
                        border: '1px solid var(--border)'
                    }}>
                        {autoPushEnabled
                            ? '✨ Any task left unchecked at the end of the day will automatically shift to tomorrow’s agenda with notes and reminder times intact.'
                            : '⏸️ Auto-push is disabled. Tasks left unfinished will remain pinned to their original scheduled date.'}
                    </div>
                </div>

                {/* ════════════════════ SECTION 3: REMINDER TIMING PREFERENCE ════════════════════ */}
                <div style={{
                    background: 'var(--bg)',
                    borderRadius: '18px',
                    padding: '16px',
                    border: '1px solid var(--border)',
                    marginBottom: '20px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(255, 149, 0, 0.15)',
                            color: 'var(--orange)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <IconBell />
                        </div>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                                Reminder Timing
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '1px' }}>
                                When to receive alerts for scheduled tasks
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                            { id: 'exact', label: 'At scheduled time', desc: 'Alert sends exactly at the scheduled hour/minute' },
                            { id: '1h_before', label: '1 hour before', desc: 'Advance warning 60 minutes prior to due time' },
                            { id: 'both', label: 'Both (1h before & exact)', desc: 'Advance heads-up plus an on-time reminder' },
                        ].map((opt) => {
                            const isSelected = reminderTiming === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => onChangeReminderTiming?.(opt.id as any)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 14px',
                                        borderRadius: '12px',
                                        border: `1.5px solid ${isSelected ? 'var(--blue)' : 'var(--border)'}`,
                                        background: isSelected ? 'rgba(10, 132, 255, 0.08)' : 'var(--surface)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                                            {opt.label}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                                            {opt.desc}
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <span style={{ color: 'var(--blue)', display: 'flex', alignItems: 'center' }}>
                                            <IconCheck />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ════════════════════ SECTION 4: BOT & QUICK COMMANDS ════════════════════ */}
                <div style={{
                    background: 'var(--bg)',
                    borderRadius: '18px',
                    padding: '16px',
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>
                        WhatsApp Bot Commands Cheatsheet
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-light)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>💰 <strong>Record Expenses:</strong> Text <em>"Lunch 250"</em>, <em>"Spent 400 on dinner"</em>, or send bank SMS.</div>
                        <div>⏰ <strong>Add Reminders:</strong> Text <em>"Remind me to call Mom at 5pm"</em> or forward assignments.</div>
                        <div>🎙️ <strong>Voice Notes:</strong> Send any audio message and Align will auto-extract expenses & to-dos.</div>
                        <div>🌙 <strong>On-Demand Summary:</strong> Text <em>"Daily summary"</em> or <em>"Wrap up"</em> anytime.</div>
                        <div>⚙️ <strong>Change Time via Chat:</strong> Text <em>"summary time 9:30pm"</em> or <em>"turn off summary"</em>.</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
