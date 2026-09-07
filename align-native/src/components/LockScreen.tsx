import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, TextInput } from 'react-native';
import {
    checkBiometricAvailability,
    promptBiometric,
    hasPinSet,
    savePin,
    verifyPin,
    clearPin,
    setSecurityEnabled,
    BiometricAvailability,
} from '../lib/auth';
import { getItem } from '../lib/storage';
import { Fingerprint, ScanFace } from 'lucide-react-native';

export type AuthStage = 'choose-length' | 'locked' | 'set-pin' | 'confirm-pin' | 'forgot-pin' | 'unlocked';

interface LockScreenProps {
    onUnlock: () => void;
    onCancel?: () => void;
    initialStage?: AuthStage;
    onPhoneConfirmed?: (phone: string) => void;
    currentPhone?: string | null;
}

const PIN_LENGTH_KEY = 'align_pin_length';

async function getSavedPinLength(): Promise<4 | 6> {
    const v = await getItem(PIN_LENGTH_KEY);
    return v === '6' ? 6 : 4;
}

function PinDots({ filled, total, shakeAnim }: { filled: number; total: number; shakeAnim: Animated.Value }) {
    return (
        <Animated.View style={[styles.dotsContainer, { transform: [{ translateX: shakeAnim }], gap: total === 6 ? 10 : 14 }]}>
            {Array.from({ length: total }).map((_, i) => (
                <View
                    key={i}
                    style={[
                        styles.dot,
                        {
                            width: total === 6 ? 12 : 14,
                            height: total === 6 ? 12 : 14,
                            backgroundColor: i < filled ? '#3B82F6' : 'transparent',
                            borderColor: i < filled ? '#3B82F6' : 'rgba(255,255,255,0.35)',
                        }
                    ]}
                />
            ))}
        </Animated.View>
    );
}

const NUMPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'del'];

function NumPad({ onPress }: { onPress: (key: string) => void }) {
    return (
        <View style={styles.numpadContainer}>
            {NUMPAD.map((key, i) => {
                if (key === null) return <View key={i} style={styles.numpadButtonPlaceholder} />;
                return (
                    <TouchableOpacity
                        key={i}
                        onPress={() => onPress(key)}
                        style={[
                            styles.numpadButton,
                            key === 'del' ? styles.numpadButtonDel : styles.numpadButtonNormal
                        ]}
                    >
                        <Text style={[styles.numpadButtonText, key === 'del' && { fontSize: 20 }]}>
                            {key === 'del' ? '⌫' : key}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

function PinLengthChooser({ onChoose, onSkip }: { onChoose: (len: 4 | 6) => void; onSkip?: () => void }) {
    return (
        <View style={{ width: '100%', maxWidth: 300, gap: 16 }}>
            {([4, 6] as const).map(len => (
                <TouchableOpacity
                    key={len}
                    onPress={() => onChoose(len)}
                    style={styles.lengthBtn}
                >
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        {Array.from({ length: len }).map((_, i) => (
                            <View key={i} style={styles.lengthDot} />
                        ))}
                    </View>
                    <Text style={styles.lengthTitle}>{len}-Digit PIN</Text>
                    <Text style={styles.lengthSub}>{len === 4 ? 'Simpler & faster' : 'More secure'}</Text>
                </TouchableOpacity>
            ))}

            {onSkip && (
                <TouchableOpacity onPress={onSkip} style={{ alignItems: 'center', marginTop: 12 }}>
                    <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' }}>
                        Skip (No App Lock)
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

export default function LockScreen({
    onUnlock,
    onCancel,
    initialStage = 'locked',
    onPhoneConfirmed,
    currentPhone,
}: LockScreenProps) {
    const [stage, setStage] = useState<AuthStage>(initialStage === 'set-pin' ? 'choose-length' : initialStage);
    const [pinLength, setPinLength] = useState<4 | 6>(4);
    const [pin, setPin] = useState('');
    const [firstPin, setFirstPin] = useState('');
    const [message, setMessage] = useState('');
    const [wrongCount, setWrongCount] = useState(0);
    const [biometryType, setBiometryType] = useState<BiometricAvailability>('none');
    const [biometricTried, setBiometricTried] = useState(false);
    const [forgotPhone, setForgotPhone] = useState('');
    const shakeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        getSavedPinLength().then(setPinLength);
        checkBiometricAvailability().then(setBiometryType);
    }, []);

    useEffect(() => {
        if (stage !== 'locked' || biometricTried || biometryType === 'none') return;
        hasPinSet().then(isSet => {
            if (!isSet) return;
            setBiometricTried(true);
            promptBiometric('Unlock Align').then(success => {
                if (success) onUnlock();
            });
        });
    }, [stage, biometryType, biometricTried, onUnlock]);

    const doShake = useCallback((msg: string) => {
        setMessage(msg);
        shakeAnim.setValue(0);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
        ]).start();
    }, [shakeAnim]);

    const handleNumPress = useCallback(async (key: string) => {
        if (key === 'del') {
            setPin(p => p.slice(0, -1));
            return;
        }

        const next = pin + key;
        if (next.length > pinLength) return;
        setPin(next);
        setMessage('');

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

    const handleForgotPin = useCallback(() => {
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

    const stageTitle = 
        stage === 'choose-length' ? 'Choose PIN Length' : 
        stage === 'set-pin' ? 'Create PIN' : 
        stage === 'forgot-pin' ? 'Reset PIN' :
        'Unlock';

    return (
        <View style={styles.container}>
            {onCancel && stage !== 'locked' && (
                <TouchableOpacity onPress={onCancel} style={styles.cancelBtnTop}>
                    <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: '700' }}>← Back</Text>
                </TouchableOpacity>
            )}

            <View style={styles.header}>
                <View style={styles.logo}>
                    <Text style={styles.logoText}>⚡</Text>
                </View>
                <Text style={styles.title}>{stageTitle}</Text>
                <Text style={[styles.subtitle, { color: message && !message.includes('confirm') && !message.includes('cleared') ? '#F87171' : '#94A3B8' }]}>
                    {message || (stage === 'forgot-pin' ? 'Enter your phone number' : 'Enter your PIN')}
                </Text>
            </View>

            {stage === 'choose-length' && (
                <PinLengthChooser 
                    onChoose={(len) => {
                        setSecurityEnabled(true);
                        setPinLength(len);
                        setStage('set-pin');
                        setMessage('');
                    }}
                    onSkip={() => {
                        setSecurityEnabled(false);
                        onUnlock();
                    }}
                />
            )}

            {stage === 'forgot-pin' && (
                <View style={{ width: '100%', maxWidth: 280, alignItems: 'center' }}>
                    <Animated.View style={{ transform: [{ translateX: shakeAnim }], width: '100%', marginBottom: 12 }}>
                        <TextInput 
                            style={styles.phoneInput}
                            keyboardType="phone-pad"
                            placeholder="e.g. 919876543210"
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            value={forgotPhone}
                            onChangeText={(t) => { setForgotPhone(t); setMessage(''); }}
                            autoFocus
                        />
                    </Animated.View>
                    <TouchableOpacity onPress={handleForgotPin} style={styles.verifyBtn}>
                        <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>Verify & Reset PIN</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setStage('locked'); setMessage(''); }} style={{ marginTop: 12, padding: 8 }}>
                        <Text style={{ color: '#64748B', fontSize: 13 }}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            )}

            {(stage === 'locked' || stage === 'set-pin' || stage === 'confirm-pin') && (
                <View style={styles.pinArea}>
                    <View style={styles.dotsWrapper}>
                        <PinDots filled={pin.length} total={pinLength} shakeAnim={shakeAnim} />
                    </View>
                    <NumPad onPress={handleNumPress} />
                </View>
            )}

            {stage === 'locked' && biometryType !== 'none' && (
                <TouchableOpacity onPress={() => promptBiometric('Unlock')} style={styles.biometricButton}>
                    {biometryType === 'face' ? <ScanFace color="#94A3B8" size={20} /> : <Fingerprint color="#94A3B8" size={20} />}
                    <Text style={styles.biometricText}>Use {biometryType === 'face' ? 'Face ID' : 'Fingerprint'}</Text>
                </TouchableOpacity>
            )}

            {stage === 'locked' && wrongCount >= 1 && (
                <TouchableOpacity onPress={() => { setStage('forgot-pin'); setPin(''); setMessage(''); }} style={{ marginTop: 24, padding: 8 }}>
                    <Text style={{ color: '#64748B', fontSize: 13 }}>Forgot PIN?</Text>
                </TouchableOpacity>
            )}

            {stage === 'set-pin' && (
                <TouchableOpacity onPress={() => { setStage('choose-length'); setPin(''); setMessage(''); }} style={{ marginTop: 24, padding: 8 }}>
                    <Text style={{ color: '#64748B', fontSize: 13 }}>← Change PIN length</Text>
                </TouchableOpacity>
            )}

            {stage === 'confirm-pin' && (
                <TouchableOpacity onPress={() => { setStage('set-pin'); setFirstPin(''); setPin(''); setMessage(''); }} style={{ marginTop: 24, padding: 8 }}>
                    <Text style={{ color: '#94A3B8', fontSize: 13 }}>← Back to enter PIN</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    cancelBtnTop: {
        position: 'absolute',
        top: 60,
        left: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 14,
        zIndex: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logo: {
        width: 64,
        height: 64,
        backgroundColor: '#3B82F6',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    logoText: {
        color: '#ffffff',
        fontSize: 32,
    },
    title: {
        color: '#ffffff',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        color: '#94A3B8',
        fontSize: 14,
        textAlign: 'center',
        minHeight: 24,
    },
    lengthBtn: {
        width: '100%',
        paddingVertical: 18,
        paddingHorizontal: 24,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.13)',
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
    },
    lengthDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    lengthTitle: {
        color: '#F8FAFC',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    lengthSub: {
        color: '#64748B',
        fontSize: 12,
        fontWeight: '500',
    },
    phoneInput: {
        width: '100%',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.15)',
        backgroundColor: 'rgba(255,255,255,0.08)',
        color: '#F8FAFC',
        fontSize: 16,
        textAlign: 'center',
    },
    verifyBtn: {
        width: '100%',
        padding: 14,
        borderRadius: 14,
        backgroundColor: '#3B82F6',
        alignItems: 'center',
    },
    pinArea: {
        alignItems: 'center',
    },
    dotsWrapper: {
        marginBottom: 48,
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    dot: {
        borderRadius: 14,
        borderWidth: 2,
    },
    numpadContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        width: 260,
        justifyContent: 'center',
        gap: 12,
    },
    numpadButtonPlaceholder: {
        width: 70,
        height: 70,
    },
    numpadButton: {
        width: 70,
        height: 70,
        borderRadius: 35,
        alignItems: 'center',
        justifyContent: 'center',
    },
    numpadButtonNormal: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    numpadButtonDel: {
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    numpadButtonText: {
        color: '#ffffff',
        fontSize: 28,
        fontWeight: '600',
    },
    biometricButton: {
        marginTop: 32,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
    },
    biometricText: {
        color: '#94A3B8',
        marginLeft: 8,
        fontWeight: '600',
    },
});
