"use client";

import React, { useState, useEffect } from 'react';
import MobileScreen from '../../../components/MobileScreen';
import {
    IconShield,
    IconKey,
    IconFingerprint,
    IconLogOut,
    IconChevronRight
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
    const [biometryType, setBiometricType] = useState<BiometricAvailability>('none');
    const [pinSet, setPinSet] = useState(false);
    const [isSettingPin, setIsSettingPin] = useState(false);

    useEffect(() => {
        setSecurityActive(isSecurityEnabled());
        setPinSet(hasPinSet());
        checkBiometricAvailability().then(setBiometricType).catch(() => {});
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
        <MobileScreen
            title="Security"
            headerRight={
                <div
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: securityActive ? 'rgba(52, 199, 89, 0.14)' : 'rgba(120, 120, 128, 0.14)',
                        color: securityActive ? '#34C759' : 'var(--text-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <IconShield style={{ width: 15, height: 15 }} />
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

                {/* ── Top Hero Group: Centered Security Header ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-card" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        {/* Centered Green/Blue Shield Icon */}
                        <div
                            style={{
                                width: '64px',
                                height: '64px',
                                borderRadius: '50%',
                                background: securityActive ? '#34C759' : '#007AFF',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: securityActive ? '0 4px 14px rgba(52, 199, 89, 0.35)' : '0 4px 14px rgba(0, 122, 255, 0.35)',
                                marginBottom: '12px',
                                transition: 'all 0.25s ease'
                            }}
                        >
                            <IconShield style={{ width: 32, height: 32 }} />
                        </div>

                        {/* Centered Word "Security" */}
                        <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px 0', letterSpacing: '-0.4px', color: 'var(--text)' }}>
                            Security
                        </h2>

                        {/* Subtitle Description */}
                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-light)', marginBottom: '12px' }}>
                            {securityActive ? 'App Passcode Protection Active' : 'Passcode Protection Disabled'}
                        </div>

                        {/* Status Badge */}
                        <span
                            style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                padding: '4px 12px',
                                borderRadius: '12px',
                                background: securityActive ? 'rgba(52, 199, 89, 0.12)' : 'rgba(120, 120, 128, 0.12)',
                                color: securityActive ? '#34C759' : 'var(--text-light)',
                            }}
                        >
                            {securityActive ? 'Protected' : 'Off'}
                        </span>
                    </div>
                </div>

                {/* ── Group 1: APP LOCK CONTROL ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">App Lock</div>
                    <div className="settings-card">
                        <div
                            className="settings-row clickable"
                            onClick={handleToggleSecurity}
                            style={{ cursor: 'pointer' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                <div className="settings-icon-box" style={{ backgroundColor: '#34C759' }}>
                                    <IconShield style={{ width: 17, height: 17 }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px' }}>
                                        Require Passcode
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                        Lock app when closing or in background
                                    </div>
                                </div>
                            </div>

                            {/* Status Pill / Switch */}
                            <div className="settings-time-pill" style={{ background: securityActive ? 'rgba(52, 199, 89, 0.15)' : undefined, color: securityActive ? '#34C759' : undefined }}>
                                <span>{securityActive ? 'Active' : 'Enable'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="settings-group-footer">
                        When enabled, Align will require your PIN or biometric authentication whenever the app returns from the background.
                    </div>
                </div>

                {/* ── Group 2: PASSCODE & BIOMETRICS ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">Credentials &amp; Biometrics</div>
                    <div className="settings-card">
                        {/* Setup / Change Passcode Row */}
                        <div
                            className="settings-row clickable"
                            onClick={() => {
                                triggerHaptic('light');
                                setIsSettingPin(true);
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                <div className="settings-icon-box" style={{ backgroundColor: '#007AFF' }}>
                                    <IconKey style={{ width: 17, height: 17 }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px' }}>
                                        {pinSet ? 'Change Passcode' : 'Set Up Passcode'}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                        {pinSet ? 'Update 4 or 6-digit Security PIN' : 'Create 4 or 6-digit PIN'}
                                    </div>
                                </div>
                            </div>
                            <IconChevronRight style={{ width: 16, height: 16, color: '#C7C7CC' }} />
                        </div>

                        <div className="settings-divider" />

                        {/* Biometrics Status Row */}
                        <div
                            className="settings-row"
                            style={{ opacity: securityActive ? 1 : 0.6 }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                <div className="settings-icon-box" style={{ backgroundColor: '#AF52DE' }}>
                                    <IconFingerprint style={{ width: 17, height: 17 }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px' }}>
                                        {biometricLabel}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                        {biometryType !== 'none'
                                            ? (securityActive ? 'Verified automatically on launch' : 'Enable passcode to activate')
                                            : 'Not supported on this device'}
                                    </div>
                                </div>
                            </div>

                            <span
                                style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    padding: '3px 9px',
                                    borderRadius: '12px',
                                    background: biometryType !== 'none' && securityActive ? 'rgba(52, 199, 89, 0.12)' : 'rgba(120, 120, 128, 0.12)',
                                    color: biometryType !== 'none' && securityActive ? '#34C759' : 'var(--text-light)',
                                    flexShrink: 0
                                }}
                            >
                                {biometryType !== 'none' ? (securityActive ? 'Active' : 'Off') : 'N/A'}
                            </span>
                        </div>
                    </div>
                    <div className="settings-group-footer">
                        Your passcode and biometric credentials remain securely encrypted inside your device hardware keychain.
                    </div>
                </div>

                {/* ── Danger Zone: Remove Passcode ── */}
                {pinSet && (
                    <div className="settings-group" style={{ marginBottom: 0 }}>
                        <div className="settings-card">
                            <div
                                className="settings-row clickable"
                                onClick={handleRemovePIN}
                                style={{ cursor: 'pointer', justifyContent: 'center' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FF3B30', fontWeight: 600, fontSize: '17px' }}>
                                    <IconLogOut style={{ width: 18, height: 18 }} />
                                    <span>Remove Passcode</span>
                                </div>
                            </div>
                        </div>
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
