"use client";

import React, { useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { IconChevronLeft } from './Icons';
import { triggerHaptic } from '../lib/native';

interface MobileScreenProps {
    title: string;
    children: ReactNode;
    headerRight?: ReactNode;
}

export default function MobileScreen({ title, children, headerRight }: MobileScreenProps) {
    const router = useRouter();
    const [dragOffset, setDragOffset] = useState(0);
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    // 1. Smooth Dismiss Routine
    const handleDismiss = useCallback(async () => {
        if (isExiting) return;
        await triggerHaptic('light');
        setIsExiting(true);
        setTimeout(() => {
            router.back();
        }, 260);
    }, [isExiting, router]);

    // 2. Android Capacitor Hardware Back Button (Strictly guarded for native)
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let handle: any = null;
        try {
            App.addListener('backButton', () => {
                handleDismiss();
            }).then((h) => { handle = h; });
        } catch (e) {
            console.warn("Native back button listener unavailable:", e);
        }

        return () => {
            if (handle && typeof handle.remove === 'function') {
                handle.remove();
            }
        };
    }, [handleDismiss]);

    // 2. Theme Synchronization
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const savedTheme = localStorage.getItem('planner_theme');
        const isDarkPref = localStorage.getItem('planner_dark_mode') === 'true';
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

    // 3. iOS PWA Edge-Swipe Back Gesture Handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        if (isExiting) return;
        const touch = e.touches[0];
        // Only initiate swipe if touch begins within the left 32px
        if (touch.clientX <= 32) {
            touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
            setIsDragging(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging || !touchStartRef.current || isExiting) return;
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

        // Cancel drag if movement is predominantly vertical (user is scrolling content)
        if (deltaY > deltaX && deltaX < 20) {
            setIsDragging(false);
            setDragOffset(0);
            return;
        }

        if (deltaX > 0) {
            setDragOffset(deltaX);
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging || !touchStartRef.current || isExiting) return;
        setIsDragging(false);

        const timeDiff = Math.max(1, Date.now() - touchStartRef.current.time);
        const velocity = dragOffset / timeDiff; // px per ms

        // Trigger back navigation if swiped past 80px or flicked quickly (> 0.4 px/ms)
        if (dragOffset > 80 || (velocity > 0.35 && dragOffset > 30)) {
            triggerHaptic('light');
            setIsExiting(true);
            setTimeout(() => {
                router.back();
            }, 220);
        } else {
            setDragOffset(0); // Snap back to origin
        }
        touchStartRef.current = null;
    };

    const screenClass = isExiting
        ? 'mobile-screen-exit'
        : dragOffset === 0 && !isDragging
            ? 'mobile-screen-enter'
            : '';

    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                transform: isExiting
                    ? 'translateX(100%)'
                    : dragOffset > 0
                        ? `translateX(${dragOffset}px)`
                        : undefined,
                transition: isDragging
                    ? 'none'
                    : isExiting
                        ? 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)'
                        : 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
                backgroundColor: 'var(--bg)',
                color: 'var(--text)',
                boxShadow: '-8px 0 25px rgba(0, 0, 0, 0.12)',
            }}
            className={`fixed inset-0 z-50 flex flex-col w-screen h-screen overflow-hidden select-none overscroll-none ${darkMode ? 'dark-mode' : ''} ${screenClass}`}
        >
            {/* Native Frosted Glass Top Navigation Bar */}
            <header
                className="flex-shrink-0 flex items-center px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2.5 border-b"
                style={{
                    backgroundColor: darkMode ? 'rgba(28, 28, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                }}
            >
                {/* Back Button with Native Touch Response */}
                <button
                    type="button"
                    onClick={handleDismiss}
                    className="flex items-center gap-1 py-1.5 px-2 -ml-1 rounded-xl text-blue-500 active:opacity-40 transition-opacity [-webkit-tap-highlight-color:transparent]"
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--blue)',
                    }}
                    aria-label="Back"
                >
                    <IconChevronLeft style={{ width: 22, height: 22 }} />
                    <span style={{ fontSize: '16px', fontWeight: 500, letterSpacing: '-0.3px', lineHeight: 1 }}>Settings</span>
                </button>

                {/* Centered Title */}
                <h1
                    className="truncate flex-1 text-center pr-14"
                    style={{
                        fontSize: '17px',
                        fontWeight: 700,
                        margin: 0,
                        color: 'var(--text)',
                        letterSpacing: '-0.4px',
                    }}
                >
                    {title}
                </h1>

                {headerRight && (
                    <div className="flex-shrink-0">
                        {headerRight}
                    </div>
                )}
            </header>

            {/* Scrollable Viewport with safe-area spacing */}
            <main
                className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(env(safe-area-inset-bottom,0px)+2.5rem)] overscroll-contain"
                style={{
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                <div style={{ maxWidth: '580px', width: '100%', margin: '0 auto' }}>
                    {children}
                </div>
            </main>
        </div>
    );
}


