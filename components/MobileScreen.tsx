"use client";

import React, { useEffect, useRef, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { IconArrowLeft } from './Icons';
import { triggerHaptic } from '../lib/native';

interface MobileScreenProps {
    title: string;
    children: ReactNode;
    headerRight?: ReactNode;
}

export default function MobileScreen({ title, children, headerRight }: MobileScreenProps) {
    const router = useRouter();
    const [dragOffset, setDragOffset] = useState(0);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    // 1. Android Capacitor Hardware Back Button (Strictly guarded for native)
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let handle: any = null;
        try {
            App.addListener('backButton', () => {
                router.back();
            }).then((h) => { handle = h; });
        } catch (e) {
            console.warn("Native back button listener unavailable:", e);
        }

        return () => {
            if (handle && typeof handle.remove === 'function') {
                handle.remove();
            }
        };
    }, [router]);

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
        const touch = e.touches[0];
        // Only initiate swipe if touch begins within the left 30px
        if (touch.clientX <= 30) {
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
            setIsDragging(true);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging || !touchStartRef.current) return;
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

        // Cancel drag if movement is predominantly vertical
        if (deltaY > deltaX) {
            setIsDragging(false);
            setDragOffset(0);
            return;
        }

        if (deltaX > 0) {
            setDragOffset(deltaX);
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);

        // Trigger back navigation if swiped past threshold
        if (dragOffset > 100) {
            triggerHaptic('light');
            router.back();
        } else {
            setDragOffset(0); // Snap back to origin
        }
        touchStartRef.current = null;
    };

    const handleBackButtonClick = async () => {
        await triggerHaptic('light');
        router.back();
    };

    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                transform: dragOffset > 0 ? `translateX(${dragOffset}px)` : undefined,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                backgroundColor: 'var(--bg)',
                color: 'var(--text)',
            }}
            className={`fixed inset-0 z-50 flex flex-col w-screen h-screen overflow-hidden select-none overscroll-none ${darkMode ? 'dark-mode' : ''}`}
        >
            {/* Top App Bar with safe-area spacing */}
            <header
                className="flex-shrink-0 flex items-center px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 border-b"
                style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                    boxShadow: 'var(--shadow)',
                }}
            >
                <button
                    type="button"
                    onClick={handleBackButtonClick}
                    className="p-2 -ml-2 mr-2 rounded-full active:opacity-40 transition-opacity [-webkit-tap-highlight-color:transparent]"
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text)',
                    }}
                    aria-label="Back"
                >
                    <IconArrowLeft style={{ width: 22, height: 22 }} />
                </button>
                <h1
                    className="text-lg font-semibold truncate flex-1"
                    style={{
                        fontSize: '18px',
                        fontWeight: 800,
                        margin: 0,
                        color: 'var(--text)',
                        letterSpacing: '-0.3px',
                    }}
                >
                    {title}
                </h1>
                {headerRight && (
                    <div className="flex-shrink-0 ml-2">
                        {headerRight}
                    </div>
                )}
            </header>

            {/* Scrollable Viewport with bottom safe-area spacing */}
            <main
                className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] overscroll-contain"
                style={{
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                <div style={{ maxWidth: '680px', width: '100%', margin: '0 auto' }}>
                    {children}
                </div>
            </main>
        </div>
    );
}

