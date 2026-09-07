import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
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

export default function LockScreen({
    onUnlock,
    onCancel,
    initialStage = 'locked',
}: LockScreenProps) {
    const [stage, setStage] = useState<AuthStage>(initialStage === 'set-pin' ? 'choose-length' : initialStage);
    const [pinLength, setPinLength] = useState<4 | 6>(4);
    const [pin, setPin] = useState('');
    const [firstPin, setFirstPin] = useState('');
    const [message, setMessage] = useState('');
    const [wrongCount, setWrongCount] = useState(0);
    const [biometryType, setBiometryType] = useState<BiometricAvailability>('none');
    const [biometricTried, setBiometricTried] = useState(false);
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
                doShake(newWrong >= 3 ? 'Too many attempts.' : 'Wrong PIN');
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.logo}>
                    <Text style={styles.logoText}>⚡</Text>
                </View>
                <Text style={styles.title}>
                    {stage === 'choose-length' ? 'Choose PIN Length' : stage === 'set-pin' ? 'Create PIN' : 'Unlock'}
                </Text>
                <Text style={styles.subtitle}>
                    {message || 'Enter your PIN'}
                </Text>
            </View>

            {stage === 'locked' || stage === 'set-pin' || stage === 'confirm-pin' ? (
                <View style={styles.pinArea}>
                    <View style={styles.dotsWrapper}>
                        <PinDots filled={pin.length} total={pinLength} shakeAnim={shakeAnim} />
                    </View>
                    <NumPad onPress={handleNumPress} />
                </View>
            ) : null}

            {stage === 'locked' && biometryType !== 'none' && (
                <TouchableOpacity onPress={() => promptBiometric('Unlock')} style={styles.biometricButton}>
                    {biometryType === 'face' ? <ScanFace color="#94A3B8" size={20} /> : <Fingerprint color="#94A3B8" size={20} />}
                    <Text style={styles.biometricText}>Use {biometryType === 'face' ? 'Face ID' : 'Fingerprint'}</Text>
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
