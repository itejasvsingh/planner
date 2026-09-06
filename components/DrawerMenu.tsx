"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    IconBell, IconMoon, IconSun, IconLogOut,
    IconRefresh, IconUser, IconShield, IconKey, IconExport, IconFingerprint, IconRepeat, IconWhatsApp
} from './Icons';
import {
    checkBiometricAvailability,
    hasPinSet,
    clearPin,
    isSecurityEnabled,
    setSecurityEnabled,
    type BiometricAvailability
} from '../lib/auth';

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

interface DrawerMenuProps {
    isOpen: boolean;
    onClose: () => void;
    userPhone: string | null;
    themeMode: string;
    onChangeTheme: (mode: string) => void;
    darkMode: boolean;
    pushEnabled: boolean;
    onEnablePush: () => void;
    onLogout: () => void;
    onChangePIN: () => void;         // Opens LockScreen in 'choose-length' to reset/set PIN
    pendingTasksCount?: number;
    dailySummaryEnabled?: boolean;
    onToggleDailySummary?: () => void;
    dailySummaryTime?: string;
    onChangeDailySummaryTime?: (time: string) => void;
    autoPushEnabled?: boolean;
    onToggleAutoPush?: () => void;
}

export default function DrawerMenu({
    isOpen,
    onClose,
    userPhone,
    themeMode,
    onChangeTheme,
    darkMode,
    pushEnabled,
    onEnablePush,
    onLogout,
    onChangePIN,
    pendingTasksCount = 0,
    dailySummaryEnabled = true,
    onToggleDailySummary,
    dailySummaryTime = '22:00',
    onChangeDailySummaryTime,
    autoPushEnabled = true,
    onToggleAutoPush
}: DrawerMenuProps) {
    const router = useRouter();
    const [currentView, setCurrentView] = useState<'main' | 'security'>('main');
    const [isOnline, setIsOnline] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [dragX, setDragX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [biometryType, setBiometryType] = useState<BiometricAvailability>('none');
    const [pinSet, setPinSet] = useState(false);
    const [pinLength, setPinLength] = useState<string>('4');
    const [securityActive, setSecurityActive] = useState(false);
    const [exportMsg, setExportMsg] = useState('');
    const startX = useRef(0);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Check biometry, PIN state & security toggle when drawer opens
    useEffect(() => {
        if (!isOpen) {
            setCurrentView('main');
            return;
        }
        checkBiometricAvailability().then(t => setBiometryType(t));
        const hasPin = hasPinSet();
        setPinSet(hasPin);
        setSecurityActive(isSecurityEnabled() && hasPin);
        try {
            const len = localStorage.getItem('align_pin_length') || '4';
            setPinLength(len);
        } catch {}
    }, [isOpen]);

    // Close on Escape key or back to main view
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (currentView === 'security') setCurrentView('main');
                else onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, currentView, onClose]);

    // Touch swipe left to close
    const handleTouchStart = (e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        setIsDragging(true);
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const diff = e.touches[0].clientX - startX.current;
        if (diff < 0) setDragX(diff);
    };
    const handleTouchEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);
        if (dragX < -60) {
            if (currentView === 'security') {
                setCurrentView('main');
            } else {
                onClose();
            }
        }
        setDragX(0);
    };

    const handleRefreshSync = () => {
        setIsSyncing(true);
        if (typeof window !== 'undefined') {
            setTimeout(() => { window.location.reload(); }, 300);
        }
    };

    // Export all data as JSON file
    const handleExportData = () => {
        try {
            const keys = Object.keys(localStorage).filter(k =>
                k.startsWith('planner_') || k.startsWith('align_')
            );
            const data: Record<string, any> = {};
            keys.forEach(k => {
                try { data[k] = JSON.parse(localStorage.getItem(k) || ''); } catch {
                    data[k] = localStorage.getItem(k);
                }
            });
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `align-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setExportMsg('Exported ✓');
            setTimeout(() => setExportMsg(''), 3000);
        } catch {
            setExportMsg('Export failed');
            setTimeout(() => setExportMsg(''), 3000);
        }
    };

    const handleToggleSecurity = () => {
        if (securityActive) {
            setSecurityEnabled(false);
            setSecurityActive(false);
        } else {
            if (pinSet) {
                setSecurityEnabled(true);
                setSecurityActive(true);
            } else {
                onClose();
                onChangePIN();
            }
        }
    };

    const handleRemovePIN = () => {
        if (typeof window !== 'undefined' && window.confirm('Remove your PIN and turn off App Lock?')) {
            clearPin();
            setSecurityEnabled(false);
            setPinSet(false);
            setSecurityActive(false);
        }
    };

    if (!isOpen) return null;

    const formattedPhone = userPhone
        ? (userPhone.length > 10 ? `+${userPhone.slice(0, userPhone.length - 10)} ` : '') + `******${userPhone.slice(-4)}`
        : '';

    const biometricLabel =
        biometryType === 'face' ? 'Face ID' :
        biometryType === 'fingerprint' ? 'Fingerprint' :
        'Biometrics';

    return (
        <div className="drawer-overlay" onClick={onClose}>
            <aside
                className="drawer"
                onClick={e => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    transform: dragX < 0 ? `translateX(${dragX}px)` : undefined,
                    transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.1, 0.9, 0.2, 1)'
                }}
            >
                {/* Drag handle indicator */}
                <div className="drawer-swipe-indicator" />

                {/* ════════════════════ SUBVIEW: SECURITY WINDOW ════════════════════ */}
                {currentView === 'security' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {/* Top Back Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '20px',
                            paddingBottom: '12px',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <button
                                type="button"
                                onClick={() => setCurrentView('main')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--blue)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '15px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    padding: '6px 0',
                                }}
                            >
                                <span style={{ fontSize: '18px', lineHeight: 1 }}>←</span> Back
                            </button>
                            <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                                Security
                            </span>
                            <div style={{ width: '48px' }} />
                        </div>

                        {/* Security Status Card */}
                        <div style={{
                            padding: '16px',
                            borderRadius: '16px',
                            background: securityActive ? 'rgba(34,197,94,0.08)' : 'var(--bg)',
                            border: `1.5px solid ${securityActive ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
                            marginBottom: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px'
                        }}>
                            <div style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '12px',
                                background: securityActive ? '#22C55E' : 'var(--surface)',
                                color: securityActive ? '#FFFFFF' : 'var(--text-light)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: securityActive ? '0 6px 16px rgba(34,197,94,0.3)' : 'none',
                                flexShrink: 0
                            }}>
                                <IconShield />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                                    {securityActive ? 'App Lock is Active' : 'App Lock is Off'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px', lineHeight: 1.3 }}>
                                    {securityActive
                                        ? 'Passcode & biometrics required on launch.'
                                        : 'Anyone can open Align without a passcode.'}
                                </div>
                            </div>
                        </div>

                        {/* Section: Master Switch */}
                        <div className="drawer-section">Protection</div>
                        <div className="drawer-list">
                            <button
                                type="button"
                                className="drawer-item"
                                onClick={handleToggleSecurity}
                                style={{ justifyContent: 'space-between' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <IconShield />
                                    <span>Require Passcode</span>
                                </div>
                                <span
                                    className="drawer-value"
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        background: securityActive ? '#22C55E' : 'var(--bg)',
                                        color: securityActive ? '#FFFFFF' : 'var(--text-light)',
                                        fontWeight: 800,
                                        fontSize: '12px'
                                    }}
                                >
                                    {securityActive ? 'ON' : 'OFF'}
                                </span>
                            </button>
                        </div>

                        {/* Section: Passcode & Biometrics */}
                        <div className="drawer-section">Passcode & Biometrics</div>
                        <div className="drawer-list">
                            {/* Change or Set Up PIN */}
                            <button
                                type="button"
                                className="drawer-item"
                                onClick={() => {
                                    onClose();
                                    onChangePIN();
                                }}
                            >
                                <IconKey />
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                                        {pinSet ? 'Change Passcode' : 'Set Up Passcode'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                                        {pinSet ? `${pinLength}-digit PIN active` : 'Choose 4 or 6-digit PIN'}
                                    </div>
                                </div>
                                <span className="drawer-value">→</span>
                            </button>

                            {/* Biometric Status Row */}
                            <div
                                className="drawer-item"
                                style={{
                                    cursor: 'default',
                                    opacity: securityActive ? 1 : 0.6
                                }}
                            >
                                <IconFingerprint />
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                                        {biometricLabel}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                                        {biometryType !== 'none'
                                            ? (securityActive ? 'Verified automatically on launch' : 'Enable passcode to use')
                                            : 'Not available on this device'}
                                    </div>
                                </div>
                                <span
                                    className="drawer-value"
                                    style={{
                                        color: biometryType !== 'none' && securityActive ? '#22C55E' : 'var(--text-light)',
                                        fontWeight: 700
                                    }}
                                >
                                    {biometryType !== 'none' ? (securityActive ? 'Active' : 'Off') : 'N/A'}
                                </span>
                            </div>
                        </div>

                        {/* Danger zone / Remove PIN */}
                        {pinSet && (
                            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                                <button
                                    type="button"
                                    className="drawer-item drawer-danger"
                                    onClick={handleRemovePIN}
                                    style={{ color: 'var(--red)' }}
                                >
                                    <IconLogOut />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--red)' }}>
                                            Remove Passcode
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '1px' }}>
                                            Wipes PIN and turns off app lock
                                        </div>
                                    </div>
                                    <span className="drawer-value" style={{ color: 'var(--red)' }}>Delete</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════ MAIN MENU VIEW ════════════════════ */}
                {currentView === 'main' && (
                    <>
                        {/* Account & Sync Header Card */}
                        <div className="drawer-account-card">
                            <div className="drawer-avatar">
                                <IconUser />
                            </div>
                            <div className="drawer-account-details">
                                <div className="drawer-phone">{formattedPhone}</div>
                                <div className="drawer-sync-status">
                                    <span className={`sync-dot ${isOnline ? 'online' : 'offline'}`} />
                                    <span>{isOnline ? 'Cloud Synced' : 'Offline Mode'}</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className={`drawer-refresh-btn ${isSyncing ? 'spinning' : ''}`}
                                onClick={handleRefreshSync}
                                title="Force refresh & sync"
                                aria-label="Force refresh & sync"
                            >
                                <IconRefresh />
                            </button>
                        </div>

                        {/* Today's Tasks Badge Banner */}
                        {pendingTasksCount > 0 && (
                            <div className="drawer-badge-banner">
                                <span>⚡ {pendingTasksCount} task{pendingTasksCount > 1 ? 's' : ''} remaining today</span>
                            </div>
                        )}

                        {/* ── General Settings ── */}
                        <div className="drawer-section">General Settings</div>
                        <div className="drawer-list">
                            <button type="button" className="drawer-item" onClick={onEnablePush}>
                                <IconBell />
                                <span>Notifications</span>
                                <span className="drawer-value">{pushEnabled ? 'On' : 'Off'}</span>
                            </button>

                            {/* Auto-Push Rollover Incomplete Tasks */}
                            <button
                                type="button"
                                className="drawer-item"
                                onClick={onToggleAutoPush}
                                style={{ justifyContent: 'space-between' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <IconRepeat />
                                    <div style={{ textAlign: 'left' }}>
                                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                                            Auto-Push Rollover
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                                            Move unfinished tasks to tomorrow
                                        </div>
                                    </div>
                                </div>
                                <span
                                    className="drawer-value"
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        background: autoPushEnabled ? '#22C55E' : 'var(--bg)',
                                        color: autoPushEnabled ? '#FFFFFF' : 'var(--text-light)',
                                        fontWeight: 800,
                                        fontSize: '12px'
                                    }}
                                >
                                    {autoPushEnabled ? 'ON' : 'OFF'}
                                </span>
                            </button>

                            <div className="drawer-item" style={{ cursor: 'default' }}>
                                {darkMode ? <IconMoon /> : <IconSun />}
                                <span>Appearance</span>
                                <span className="drawer-value">{themeMode}</span>
                            </div>
                            <div className="theme-options" role="group" aria-label="Appearance">
                                <button
                                    type="button"
                                    className={`theme-option ${themeMode === 'light' ? 'active' : ''}`}
                                    onClick={() => onChangeTheme('light')}
                                >
                                    Light
                                </button>
                                <button
                                    type="button"
                                    className={`theme-option ${themeMode === 'dark' ? 'active' : ''}`}
                                    onClick={() => onChangeTheme('dark')}
                                >
                                    Dark
                                </button>
                                <button
                                    type="button"
                                    className={`theme-option ${themeMode === 'system' ? 'active' : ''}`}
                                    onClick={() => onChangeTheme('system')}
                                >
                                    System
                                </button>
                            </div>
                            {/* Data Export */}
                            <button
                                type="button"
                                className="drawer-item"
                                onClick={handleExportData}
                            >
                                <IconExport />
                                <span>Export Data</span>
                                <span className="drawer-value" style={{ color: exportMsg.includes('✓') ? '#22C55E' : exportMsg ? '#F87171' : undefined }}>
                                    {exportMsg || 'JSON'}
                                </span>
                            </button>
                        </div>

                        {/* ── WhatsApp Settings Entry Item ── */}
                        <div className="drawer-section">WhatsApp &amp; Bot</div>
                        <div className="drawer-list">
                            <button
                                type="button"
                                className="drawer-item"
                                onClick={() => {
                                    onClose();
                                    router.push('/settings/whatsapp');
                                }}
                            >
                                <IconWhatsApp />
                                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
                                        WhatsApp Settings
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                                        {dailySummaryEnabled ? `Summary at ${format12Hour(dailySummaryTime)} • Active` : 'Daily summary, reminders & bot'}
                                    </div>
                                </div>
                                <span
                                    className="drawer-value"
                                    style={{
                                        color: dailySummaryEnabled ? '#22C55E' : 'var(--text-light)',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    {dailySummaryEnabled ? 'Active' : 'Configure'}
                                    <span style={{ fontSize: '14px' }}>›</span>
                                </span>
                            </button>
                        </div>

                        {/* ── Security Entry Item ── */}
                        <div className="drawer-section">Security &amp; Privacy</div>
                        <div className="drawer-list">
                            <button
                                type="button"
                                className="drawer-item"
                                onClick={() => setCurrentView('security')}
                            >
                                <IconShield />
                                <span>Security</span>
                                <span
                                    className="drawer-value"
                                    style={{
                                        color: securityActive ? '#22C55E' : 'var(--text-light)',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    {securityActive ? 'On' : 'Off'}
                                    <span style={{ fontSize: '14px' }}>›</span>
                                </span>
                            </button>
                        </div>

                        {/* ── Footer / Danger Zone ── */}
                        <div className="drawer-footer">
                            <button type="button" className="drawer-item drawer-danger" onClick={onLogout}>
                                <IconLogOut />
                                <span>Log out</span>
                            </button>
                        </div>
                    </>
                )}
            </aside>
        </div>
    );
}
