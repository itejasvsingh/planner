"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    IconBell, IconMoon, IconSun, IconSettings, IconLogOut,
    IconRefresh, IconUser
} from './Icons';

interface DrawerMenuProps {
    isOpen: boolean;
    onClose: () => void;
    userPhone: string | null;
    themeMode: string;
    onChangeTheme: (mode: string) => void;
    darkMode: boolean;
    pushEnabled: boolean;
    onEnablePush: () => void;
    onOpenBudgetEdit: () => void;
    onLogout: () => void;
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
    onOpenBudgetEdit,
    onLogout,
    pendingTasksCount = 0
}: DrawerMenuProps) {
    const [isOnline, setIsOnline] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [dragX, setDragX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
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
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX.current;
        // Only allow dragging left (closing)
        if (diff < 0) {
            setDragX(diff);
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);
        if (dragX < -60) {
            onClose();
        }
        setDragX(0);
    };

    const handleRefreshSync = () => {
        setIsSyncing(true);
        if (typeof window !== 'undefined') {
            setTimeout(() => {
                window.location.reload();
            }, 300);
        }
    };

    if (!isOpen) return null;

    const formattedPhone = userPhone
        ? (userPhone.length > 10 ? `+${userPhone.slice(0, userPhone.length - 10)} ` : '') + `******${userPhone.slice(-4)}`
        : '';

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
                {/* Drag handle for swipe gesture feedback */}
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
                    <button
                        type="button"
                        className="drawer-item"
                        onClick={() => {
                            onClose();
                            onOpenBudgetEdit();
                        }}
                    >
                        <IconSettings />
                        <span>Budget Settings</span>
                        <span className="drawer-value">Edit</span>
                    </button>
                </div>

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
