"use client";
import React, { useState } from 'react';

// Define the shape of our data
export interface SplitPerson {
    name: string;
    settled: boolean;
    splitMode: 'equal' | 'percentage' | 'custom';
    percentage?: number | string;
    share: number | string; // Updated to accept string inputs
}

interface SplitEditorProps {
    splits: SplitPerson[];
    setSplits: (splits: SplitPerson[]) => void;
    totalAmount: number | string;
    recentFriends?: string[];
}

export function calculateSplitAmounts(splits: SplitPerson[], totalAmount: number | string): SplitPerson[] {
    const total = Math.max(0, parseFloat(String(totalAmount)) || 0);
    const mode = splits[0]?.splitMode || 'equal';
    const participantCount = splits.length + 1; 
    return splits.map(person => {
        const amount = mode === 'percentage'
            ? total * (Math.max(0, parseFloat(String(person.percentage)) || 0) / 100)
            : mode === 'custom'
                ? Math.max(0, parseFloat(String(person.share)) || 0)
                : total / participantCount;
        return { ...person, splitMode: mode, share: Math.round(amount * 100) / 100 };
    });
}

export default function SplitEditor({ splits = [], setSplits, totalAmount, recentFriends = [] }: SplitEditorProps) {
    const [personName, setPersonName] = useState('');
    const [splitMode, setSplitMode] = useState<'equal' | 'percentage' | 'custom'>(splits[0]?.splitMode || 'equal');

    const calculatedSplits = calculateSplitAmounts(splits, totalAmount);
    const yourShare = Math.max(0, (parseFloat(String(totalAmount)) || 0) - calculatedSplits.reduce((sum, person) => sum + Number(person.share), 0));
    
    const setMode = (mode: 'equal' | 'percentage' | 'custom') => {
        setSplitMode(mode);
        setSplits(splits.map(person => ({ ...person, splitMode: mode })));
    };

    const addPeople = (names: string[]) => {
        const existing = new Set(splits.map(person => person.name));
        const additions = names
            .filter(name => !existing.has(name))
            .map(name => ({ name, settled: false, splitMode, percentage: 0, share: 0 }));
        if (additions.length) setSplits([...splits, ...additions]);
    };

    const addManualPerson = () => {
        if (!personName.trim()) return;
        addPeople([personName.trim()]);
        setPersonName('');
    };

    return (
        <div className="split-editor">
            <div className="split-editor-heading">Who owes you?</div>
            <div className="split-mode-options">
                {['equal', 'percentage', 'custom'].map(mode => (
                    <button 
                        type="button" 
                        key={mode} 
                        className={`split-mode-option ${splitMode === mode ? 'active' : ''}`} 
                        onClick={() => setMode(mode as 'equal' | 'percentage' | 'custom')}
                    >
                        {mode === 'custom' ? 'Custom' : mode === 'percentage' ? '%' : 'Equal'}
                    </button>
                ))}
            </div>
            
            {calculatedSplits.map((person, index) => (
                <div className="split-person" key={`${person.name}-${index}`}>
                    <div className="split-person-info"><strong>{person.name}</strong></div>
                    
                    {splitMode === 'percentage' && (
                        <input className="split-value-input" type="number" inputMode="decimal" min="0" max="100" placeholder="%" value={person.percentage || ''} onChange={e => setSplits(splits.map((entry, personIndex) => personIndex === index ? {...entry, splitMode, percentage: e.target.value} : entry))} />
                    )}
                    
                    {splitMode === 'custom' && (
                        <input className="split-value-input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="₹" value={person.share || ''} onChange={e => setSplits(splits.map((entry, personIndex) => personIndex === index ? {...entry, splitMode, share: e.target.value} : entry))} />
                    )}
                    
                    <span className="split-share">₹{Number(person.share).toFixed(2)}</span>
                    <button type="button" className="split-remove" onClick={() => setSplits(splits.filter((_, personIndex) => personIndex !== index))} aria-label={`Remove ${person.name}`}>×</button>
                </div>
            ))}
            
            <div className="split-your-share">Your share <strong>₹{yourShare.toFixed(2)}</strong></div>
            {splitMode === 'percentage' && <div className="split-help">Percentages are each person's share of the total. The remainder is yours.</div>}
            
            <div className="split-manual">
                <input className="input-box" placeholder="Enter friend's name..." value={personName} onChange={e => setPersonName(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addManualPerson())} />
                <button type="button" className="split-add-button" onClick={addManualPerson}>Add</button>
            </div>

            {recentFriends.length > 0 && (
                <div className="quick-friends-row">
                    {recentFriends.map(friend => (
                        <button type="button" key={friend} className="quick-friend-chip" onClick={() => addPeople([friend])}>+ {friend}</button>
                    ))}
                </div>
            )}
        </div>
    );
}