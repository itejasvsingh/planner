"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    checkBiometricAvailability,
    promptBiometric,
    hasPinSet,
    savePin,
    verifyPin,
    clearPin,
    setSecurityEnabled,
    type BiometricAvailability,
} from '../lib/auth';

/* ─────────────────── Types ─────────────────── */

export type AuthStage =
    | 'choose-length'  // New user: pick 4-digit or 6-digit PIN
    | 'locked'         // Returning user: show biometric prompt / PIN entry
    | 'set-pin'        // New user: enter PIN digits
    | 'confirm-pin'    // New user: re-enter to confirm
    | 'forgot-pin'     // Re-enter phone number to reset PIN
    | 'unlocked';      // App is unlocked — passed through to page.tsx

interface LockScreenProps {
    /** Called when the user successfully unlocks or finishes setup */
    onUnlock: () => void;
    /** Called when the user cancels out of changing passcode */
    onCancel?: () => void;
    /** Initial stage — pass 'set-pin' for first-time users (will redirect to choose-length) */
    initialStage?: AuthStage;
    /** Called when user confirms phone number during forgot-PIN flow */
    onPhoneConfirmed?: (phone: string) => void;
    /** Current stored phone number (for "forgot PIN" verification UI) */
    currentPhone?: string | null;
}

/* ─────────────────── Visual Helpers ─────────────────── */

function PinDots({ filled, total, shake }: { filled: number; total: number; shake: boolean }) {
    return (
        <div
            style={{
                display: 'flex',
                gap: total === 6 ? '10px' : '14px',
                justifyContent: 'center',
                animation: shake ? 'shake 0.4s ease' : undefined,
            }}
        >
            {Array.from({ length: total }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        width: total === 6 ? '12px' : '14px',
                        height: total === 6 ? '12px' : '14px',
                        borderRadius: '50%',
                        background: i < filled ? '#3B82F6' : 'transparent',
                        border: i < filled ? '2px solid #3B82F6' : '2px solid rgba(255,255,255,0.35)',
                        transition: 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transform: i < filled ? 'scale(1.1)' : 'scale(1)',
                    }}
                />
            ))}
        </div>
    );
}

const NUMPAD: (string | null)[] = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    null, '0', 'del',
];

function NumPad({ onPress }: { onPress: (key: string) => void }) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                width: '240px',
            }}
        >
            {NUMPAD.map((key, i) => {
                if (key === null) return <div key={i} />;
                return (
                    <button
                        key={i}
                        type="button"
                        onPointerDown={() => onPress(key)}
                        style={{
                            height: '64px',
                            borderRadius: '16px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: key === 'del' ? '20px' : '24px',
                            fontWeight: 600,
                            color: '#F8FAFC',
                            background: key === 'del'
                                ? 'rgba(255,255,255,0.07)'
                                : 'rgba(255,255,255,0.1)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            transition: 'background 0.1s ease',
                            WebkitTapHighlightColor: 'transparent',
                            userSelect: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        onPointerEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.17)')}
                        onPointerLeave={e => (e.currentTarget.style.background = key === 'del' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.1)')}
                    >
                        {key === 'del' ? '⌫' : key}
                    </button>
                );
            })}
        </div>
    );
}

/* ─────────────────── BiometricIcon ─────────────────── */

function BiometricIcon({ type }: { type: BiometricAvailability }) {
    if (type === 'face') {
        return (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 9h.01M15 9h.01M8 13s1 2 4 2 4-2 4-2"/>
                <rect x="2" y="2" width="20" height="20" rx="5"/>
            </svg>
        );
    }
    if (type === 'fingerprint') {
        return (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 10a2 2 0 0 1 2 2c0 1.5-.5 3-1.5 4.5"/>
                <path d="M12 3a9 9 0 0 1 9 9"/>
                <path d="M12 3a9 9 0 0 0-9 9c0 2.5.5 4.7 1.5 6.5"/>
                <path d="M12 7a5 5 0 0 1 5 5c0 3-1 5.5-3 7.5"/>
                <path d="M12 7a5 5 0 0 0-5 5c0 1.5.3 3 1 4.5"/>
            </svg>
        );
    }
    return null;
}

/* ─────────────────── PIN Length Chooser ─────────────────── */

function PinLengthChooser({ onChoose, onSkip }: { onChoose: (len: 4 | 6) => void; onSkip?: () => void }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            width: '100%',
            maxWidth: '300px',
        }}>
            {([4, 6] as const).map(len => (
                <button
                    key={len}
                    type="button"
                    onClick={() => onChoose(len)}
                    style={{
                        width: '100%',
                        padding: '18px 24px',
                        borderRadius: '18px',
                        border: '1.5px solid rgba(255,255,255,0.13)',
                        background: 'rgba(255,255,255,0.07)',
                        color: '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                    onPointerEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.2)')}
                    onPointerLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                >
                    {/* Preview dots */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {Array.from({ length: len }).map((_, i) => (
                            <div key={i} style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                border: '2px solid rgba(255,255,255,0.4)',
                            }} />
                        ))}
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 700 }}>{len}-Digit PIN</span>
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
                        {len === 4 ? 'Simpler & faster' : 'More secure'}
                    </span>
                </button>
            ))}

            {onSkip && (
                <button
                    type="button"
                    onClick={onSkip}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '10px 16px',
                        marginTop: '4px',
                        textDecoration: 'underline',
                        textUnderlineOffset: '4px',
                    }}
                >
                    Skip (No App Lock)
                </button>
            )}
        </div>
    );
}

/* ─────────────────── Main Component ─────────────────── */

const PIN_LENGTH_KEY = 'align_pin_length';

function getSavedPinLength(): 4 | 6 {
    try {
        const v = localStorage.getItem(PIN_LENGTH_KEY);
        return v === '6' ? 6 : 4;
    } catch { return 4; }
}

export default function LockScreen({
    onUnlock,
    onCancel,
    initialStage = 'locked',
    onPhoneConfirmed,
    currentPhone,
}: LockScreenProps) {
    // If set-pin is passed (new user), redirect to choose-length first
    const resolvedInitial: AuthStage = initialStage === 'set-pin' ? 'choose-length' : initialStage;

    const [stage, setStage] = useState<AuthStage>(resolvedInitial);
    const [pinLength, setPinLength] = useState<4 | 6>(getSavedPinLength);
    const [pin, setPin] = useState('');
    const [firstPin, setFirstPin] = useState('');
    const [shake, setShake] = useState(false);
    const [message, setMessage] = useState('');
    const [wrongCount, setWrongCount] = useState(0);
    const [biometryType, setBiometryType] = useState<BiometricAvailability>('none');
    const [biometricTried, setBiometricTried] = useState(false);
    const [forgotPhone, setForgotPhone] = useState('');
    const shakeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Detect biometry availability on mount
    useEffect(() => {
        checkBiometricAvailability().then(t => setBiometryType(t));
    }, []);

    // Auto-trigger biometrics when the lock screen first opens
    useEffect(() => {
        if (stage !== 'locked' || biometricTried || biometryType === 'none') return;
        if (!hasPinSet()) return;
        setBiometricTried(true);
        promptBiometric('Unlock Align').then(success => {
            if (success) onUnlock();
        });
    }, [stage, biometryType, biometricTried, onUnlock]);

    const doShake = useCallback((msg: string) => {
        setMessage(msg);
        setShake(true);
        clearTimeout(shakeTimeout.current);
        shakeTimeout.current = setTimeout(() => setShake(false), 420);
    }, []);

    const handleChooseLength = useCallback((len: 4 | 6) => {
        try { localStorage.setItem(PIN_LENGTH_KEY, String(len)); } catch {}
        setSecurityEnabled(true);
        setPinLength(len);
        setStage('set-pin');
        setMessage('');
    }, []);

    const handleNumPress = useCallback(async (key: string) => {
        if (key === 'del') {
            setPin(p => p.slice(0, -1));
            return;
        }

        const next = pin + key;
        // Don't exceed the chosen PIN length
        if (next.length > pinLength) return;
        setPin(next);
        setMessage('');

        // Auto-submit when the exact length is reached
        if (next.length < pinLength) return;

        if (stage === 'locked') {
            const ok = await verifyPin(next);
            if (ok) {
                setWrongCount(0);
                onUnlock();
            } else {
                setPin('');
                const newWrong = wrongCount + 1;
                setWrongCount(newWrong);
                doShake(newWrong >= 3 ? 'Too many attempts. Forgot PIN?' : 'Wrong PIN');
            }
        } else if (stage === 'set-pin') {
            setFirstPin(next);
            setPin('');
            setStage('confirm-pin');
            setMessage('Re-enter your PIN to confirm');
        } else if (stage === 'confirm-pin') {
            if (next === firstPin) {
                await savePin(next);
                onUnlock();
            } else {
                setPin('');
                doShake("PINs don't match. Try again.");
                setStage('set-pin');
                setFirstPin('');
            }
        }
    }, [pin, pinLength, stage, wrongCount, firstPin, doShake, onUnlock]);

    const handleRetryBiometric = useCallback(async () => {
        const success = await promptBiometric('Unlock Align');
        if (success) onUnlock();
    }, [onUnlock]);

    const handleForgotPin = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const digits = forgotPhone.replace(/\D/g, '');
        const normalized = digits.length === 10 ? `91${digits}` : digits;
        const stored = currentPhone?.replace(/\D/g, '') ?? '';
        if (normalized === stored || digits === stored) {
            clearPin();
            setPin('');
            setFirstPin('');
            setStage('choose-length');
            setMessage('PIN cleared. Choose a new PIN length.');
            if (onPhoneConfirmed) onPhoneConfirmed(normalized);
        } else {
            doShake("Phone number doesn't match");
        }
    }, [forgotPhone, currentPhone, doShake, onPhoneConfirmed]);

    /* ─── Render ─── */

    const stageTitle =
        stage === 'choose-length' ? 'Choose PIN Length' :
        stage === 'set-pin' ? 'Create Your PIN' :
        stage === 'confirm-pin' ? 'Confirm PIN' :
        stage === 'forgot-pin' ? 'Reset PIN' :
        'Unlock Align';

    const stageSubtitle =
        stage === 'choose-length' ? 'Select the number of digits for your PIN' :
        stage === 'set-pin' ? `Enter a ${pinLength}-digit PIN` :
        stage === 'confirm-pin' ? (message || 'Re-enter to confirm') :
        stage === 'forgot-pin' ? 'Enter your phone number to reset your PIN' :
        hasPinSet()
            ? (message || (biometryType !== 'none' && !biometricTried ? 'Use biometrics or enter your PIN' : 'Enter your PIN'))
            : 'Create a PIN to secure Align';

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(160deg, #0F172A 0%, #1E293B 100%)',
            padding: '24px',
            gap: '32px',
        }}>
            <style>{`
                @keyframes shake {
                    0%,100% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(8px); }
                    60% { transform: translateX(-6px); }
                    80% { transform: translateX(6px); }
                }
            `}</style>

            {/* Top Back/Cancel button when changing passcode or setup */}
            {onCancel && stage !== 'locked' && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(18px + env(safe-area-inset-top))',
                    left: '18px',
                    zIndex: 20
                }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '12px',
                            padding: '8px 14px',
                            color: '#F8FAFC',
                            fontSize: '14px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                        }}
                    >
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>←</span> Back
                    </button>
                </div>
            )}

            {/* App Icon */}
            <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 40px rgba(59, 130, 246, 0.35)',
                fontSize: '32px',
                userSelect: 'none',
            }}>
                ⚡
            </div>

            {/* Titles */}
            <div style={{ textAlign: 'center' }}>
                <h1 style={{
                    margin: 0,
                    fontSize: '24px',
                    fontWeight: 800,
                    color: '#F8FAFC',
                    letterSpacing: '-0.4px',
                }}>
                    {stageTitle}
                </h1>
                <p style={{
                    margin: '8px 0 0',
                    fontSize: '14px',
                    color: shake && message ? '#F87171' : '#94A3B8',
                    transition: 'color 0.2s',
                    minHeight: '20px',
                }}>
                    {stageSubtitle}
                </p>
            </div>

            {/* ── PIN Length Chooser ── */}
            {stage === 'choose-length' && (
                <PinLengthChooser
                    onChoose={handleChooseLength}
                    onSkip={() => {
                        setSecurityEnabled(false);
                        onUnlock();
                    }}
                />
            )}

            {/* ── Forgot PIN ── */}
            {stage === 'forgot-pin' && (
                <form onSubmit={handleForgotPin} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    width: '100%',
                    maxWidth: '280px',
                    alignItems: 'center',
                }}>
                    <input
                        type="tel"
                        value={forgotPhone}
                        onChange={e => { setForgotPhone(e.target.value); setMessage(''); }}
                        placeholder="e.g. 919876543210"
                        autoFocus
                        style={{
                            width: '100%',
                            padding: '14px 16px',
                            borderRadius: '14px',
                            border: '1.5px solid rgba(255,255,255,0.15)',
                            background: 'rgba(255,255,255,0.08)',
                            color: '#F8FAFC',
                            fontSize: '16px',
                            textAlign: 'center',
                            outline: 'none',
                            letterSpacing: '2px',
                        }}
                    />
                    <button type="submit" style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '14px',
                        border: 'none',
                        background: '#3B82F6',
                        color: '#fff',
                        fontSize: '15px',
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}>
                        Verify &amp; Reset PIN
                    </button>
                    <button type="button" onClick={() => { setStage('locked'); setMessage(''); }} style={{
                        background: 'none', border: 'none', color: '#64748B',
                        fontSize: '13px', cursor: 'pointer', padding: '4px',
                    }}>
                        Cancel
                    </button>
                </form>
            )}

            {/* ── PIN Pad (set-pin, confirm-pin, locked) ── */}
            {(stage === 'set-pin' || stage === 'confirm-pin' || stage === 'locked') && (
                <>
                    <PinDots filled={pin.length} total={pinLength} shake={shake} />
                    <NumPad onPress={handleNumPress} />

                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        width: '100%',
                    }}>
                        {/* Biometric retry */}
                        {stage === 'locked' && biometryType !== 'none' && (
                            <button
                                type="button"
                                onClick={handleRetryBiometric}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 20px',
                                    borderRadius: '14px',
                                    border: '1.5px solid rgba(255,255,255,0.15)',
                                    background: 'rgba(255,255,255,0.07)',
                                    color: '#94A3B8',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                <BiometricIcon type={biometryType} />
                                Use {biometryType === 'face' ? 'Face ID' : 'Fingerprint'}
                            </button>
                        )}

                        {/* Forgot PIN */}
                        {stage === 'locked' && wrongCount >= 1 && (
                            <button
                                type="button"
                                onClick={() => { setStage('forgot-pin'); setPin(''); setMessage(''); }}
                                style={{
                                    background: 'none', border: 'none',
                                    color: '#64748B', fontSize: '13px',
                                    cursor: 'pointer', padding: '4px',
                                }}
                            >
                                Forgot PIN?
                            </button>
                        )}

                        {/* Back to length chooser during set-pin */}
                        {stage === 'set-pin' && (
                            <button
                                type="button"
                                onClick={() => { setStage('choose-length'); setPin(''); setMessage(''); }}
                                style={{
                                    background: 'none', border: 'none',
                                    color: '#64748B', fontSize: '13px',
                                    cursor: 'pointer', padding: '4px',
                                }}
                            >
                                ← Change PIN length
                            </button>
                        )}

                        {/* Back to enter PIN during confirm-pin */}
                        {stage === 'confirm-pin' && (
                            <button
                                type="button"
                                onClick={() => {
                                    setPin('');
                                    setFirstPin('');
                                    setStage('set-pin');
                                    setMessage('');
                                }}
                                style={{
                                    background: 'none', border: 'none',
                                    color: '#94A3B8', fontSize: '13px',
                                    cursor: 'pointer', padding: '4px',
                                }}
                            >
                                ← Back to enter PIN
                            </button>
                        )}

                        {/* Cancel button if onCancel provided */}
                        {onCancel && stage !== 'locked' && (
                            <button
                                type="button"
                                onClick={onCancel}
                                style={{
                                    background: 'none', border: 'none',
                                    color: '#94A3B8', fontSize: '13px',
                                    cursor: 'pointer', padding: '4px',
                                }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
