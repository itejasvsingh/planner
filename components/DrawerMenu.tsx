"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    IconBell, IconMoon, IconSun, IconSettings, IconLogOut,
    IconRefresh, IconUser, IconShield, IconKey, IconExport, IconFingerprint
} from './Icons';
import { checkBiometricAvailability, hasPinSet, clearPin, type BiometricAvailability } from '../lib/auth';

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
    onChangePIN: () => void;         // Opens LockScreen in 'choose-length' to reset PIN
    pendingTasksCount?: number;
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
    pendingTasksCount = 0
}: DrawerMenuProps) {
    const [isOnline, setIsOnline] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [dragX, setDragX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [biometryType, setBiometryType] = useState<BiometricAvailability>('none');
    const [pinSet, setPinSet] = useState(false);
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

    // Check biometry & PIN state when drawer opens
    useEffect(() => {
        if (!isOpen) return;
        checkBiometricAvailability().then(t => setBiometryType(t));
        setPinSet(hasPinSet());
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

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
        if (dragX < -60) onClose();
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
                {/* Drag handle */}
                <div className="drawer-swipe-indicator" />

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

                {/* ── Preferences ── */}
                <div className="drawer-section">Preferences</div>
                <div className="drawer-list">
                    <button type="button" className="drawer-item" onClick={onEnablePush}>
                        <IconBell />
                        <span>Notifications</span>
                        <span className="drawer-value">{pushEnabled ? 'On' : 'Off'}</span>
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
                    {/* Data Export (replaces Budget Settings) */}
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

                {/* ── Security ── */}
                <div className="drawer-section">Security</div>
                <div className="drawer-list">
                    {/* PIN status indicator */}
                    <div className="drawer-item" style={{ cursor: 'default', opacity: 0.8 }}>
                        <IconShield />
                        <span>App Lock</span>
                        <span className="drawer-value" style={{ color: pinSet ? '#22C55E' : '#F87171' }}>
                            {pinSet ? 'Active' : 'Not Set'}
                        </span>
                    </div>
                    {/* Change / Set PIN */}
                    <button
                        type="button"
                        className="drawer-item"
                        onClick={() => {
                            onClose();
                            onChangePIN();
                        }}
                    >
                        <IconKey />
                        <span>{pinSet ? 'Change PIN' : 'Set PIN'}</span>
                        <span className="drawer-value">→</span>
                    </button>
                    {/* Biometric status — informational only (no toggle; it auto-uses if available) */}
                    {biometryType !== 'none' && (
                        <div className="drawer-item" style={{ cursor: 'default', opacity: 0.8 }}>
                            <IconFingerprint />
                            <span>{biometricLabel}</span>
                            <span className="drawer-value" style={{ color: '#22C55E' }}>Enabled</span>
                        </div>
                    )}
                    {biometryType === 'none' && (
                        <div className="drawer-item" style={{ cursor: 'default', opacity: 0.55 }}>
                            <IconFingerprint />
                            <span>Biometrics</span>
                            <span className="drawer-value">Not available</span>
                        </div>
                    )}
                </div>

                {/* ── Footer / Danger Zone ── */}
                <div className="drawer-footer">
                    <button type="button" className="drawer-item drawer-danger" onClick={onLogout}>
                        <IconLogOut />
                        <span>Log out</span>
                    </button>
                </div>
            </aside>
        </div>
    );
}
