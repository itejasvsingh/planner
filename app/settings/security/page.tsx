"use client";

import React, { useState, useEffect } from 'react';
import MobileScreen from '../../../components/MobileScreen';
import {
    IconShield,
    IconKey,
    IconFingerprint,
    IconLogOut
} from '../../../components/Icons';
import {
    checkBiometricAvailability,
    hasPinSet,
    clearPin,
    isSecurityEnabled,
    setSecurityEnabled,
    type BiometricAvailability
} from '../../../lib/auth';
import { triggerHaptic } from '../../../lib/native';
import LockScreen from '../../../components/LockScreen';

export default function SecuritySettingsPage() {
    const [securityActive, setSecurityActive] = useState(false);
    const [biometryType, setBiometryType] = useState<BiometricAvailability>('none');
    const [pinSet, setPinSet] = useState(false);
    const [isSettingPin, setIsSettingPin] = useState(false);

    useEffect(() => {
        setSecurityActive(isSecurityEnabled());
        setPinSet(hasPinSet());
        checkBiometricAvailability().then(setBiometryType).catch(() => {});
    }, []);

    const handleToggleSecurity = () => {
        triggerHaptic('light');
        if (!pinSet) {
            // If no PIN set, guide user to set one first
            setIsSettingPin(true);
            return;
        }
        const next = !securityActive;
        setSecurityEnabled(next);
        setSecurityActive(next);
    };

    const handleRemovePIN = () => {
        triggerHaptic('warning');
        if (confirm('Remove passcode? Anyone with access to your device will be able to open Align.')) {
            clearPin();
            setSecurityEnabled(false);
            setPinSet(false);
            setSecurityActive(false);
            triggerHaptic('success');
        }
    };

    const biometricLabel =
        biometryType === 'face'
            ? 'Face ID'
            : biometryType === 'fingerprint'
            ? 'Fingerprint / Touch ID'
            : biometryType === 'device'
            ? 'Device Credential'
            : 'Biometrics';

    return (
        <MobileScreen title="Security">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Status Card */}
                <div
                    style={{
                        padding: '18px',
                        borderRadius: '20px',
                        background: securityActive ? 'rgba(34,197,94,0.08)' : 'var(--surface)',
                        border: `1.5px solid ${securityActive ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        boxShadow: 'var(--shadow)'
                    }}
                >
                    <div
                        style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: securityActive ? '#22C55E' : 'var(--bg)',
                            color: securityActive ? '#FFFFFF' : 'var(--text-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: securityActive ? '0 6px 16px rgba(34,197,94,0.3)' : 'none',
                            flexShrink: 0
                        }}
                    >
                        <IconShield style={{ width: 22, height: 22 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
                            {securityActive ? 'App Lock is Active' : 'App Lock is Off'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px', lineHeight: 1.3 }}>
                            {securityActive
                                ? 'Passcode & biometrics required whenever Align is launched.'
                                : 'Anyone can open Align without a passcode.'}
                        </div>
                    </div>
                </div>

                {/* Section: Protection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: '4px' }}>
                        Protection
                    </div>
                    <div
                        style={{
                            background: 'var(--surface)',
                            borderRadius: '16px',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow)'
                        }}
                    >
                        <button
                            type="button"
                            onClick={handleToggleSecurity}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '16px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ color: 'var(--text-light)' }}><IconShield style={{ width: 20, height: 20 }} /></div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                                        Require Passcode
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                                        Lock app on background or close
                                    </div>
                                </div>
                            </div>
                            <span
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
                </div>

                {/* Section: Passcode & Biometrics */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: '4px' }}>
                        Passcode &amp; Biometrics
                    </div>
                    <div
                        style={{
                            background: 'var(--surface)',
                            borderRadius: '16px',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow)',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setIsSettingPin(true)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '16px',
                                border: 'none',
                                borderBottom: '1px solid var(--border)',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ color: 'var(--text-light)' }}><IconKey style={{ width: 20, height: 20 }} /></div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                                        {pinSet ? 'Change Passcode' : 'Set Up Passcode'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '2px' }}>
                                        {pinSet ? 'Choose new 4 or 6-digit PIN' : 'Choose 4 or 6-digit PIN'}
                                    </div>
                                </div>
                            </div>
                            <span style={{ color: 'var(--text-light)', fontSize: '18px', fontWeight: 700 }}>›</span>
                        </button>

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '16px',
                                opacity: securityActive ? 1 : 0.6
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ color: 'var(--text-light)' }}><IconFingerprint style={{ width: 20, height: 20 }} /></div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                                        {biometricLabel}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                                        {biometryType !== 'none'
                                            ? (securityActive ? 'Verified automatically on launch' : 'Enable passcode to use')
                                            : 'Not available on this device'}
                                    </div>
                                </div>
                            </div>
                            <span
                                style={{
                                    color: biometryType !== 'none' && securityActive ? '#22C55E' : 'var(--text-light)',
                                    fontWeight: 700,
                                    fontSize: '12px'
                                }}
                            >
                                {biometryType !== 'none' ? (securityActive ? 'Active' : 'Off') : 'N/A'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Danger Zone: Remove Passcode */}
                {pinSet && (
                    <div style={{ marginTop: '12px' }}>
                        <button
                            type="button"
                            onClick={handleRemovePIN}
                            style={{
                                width: '100%',
                                padding: '14px',
                                borderRadius: '16px',
                                border: '1px solid rgba(239,68,68,0.25)',
                                background: 'rgba(239,68,68,0.06)',
                                color: '#EF4444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                fontWeight: 700,
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            <IconLogOut style={{ width: 18, height: 18 }} />
                            <span>Remove Passcode</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Inline PIN Setup Flow when requested */}
            {isSettingPin && (
                <LockScreen
                    initialStage="choose-length"
                    onUnlock={() => {
                        setIsSettingPin(false);
                        setPinSet(hasPinSet());
                        setSecurityActive(isSecurityEnabled());
                    }}
                    onCancel={() => setIsSettingPin(false)}
                />
            )}
        </MobileScreen>
    );
}

