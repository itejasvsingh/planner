import React, { useEffect, useRef, useState } from 'react';
import { triggerHaptic } from '../lib/native';

interface IosTimePickerProps {
    value: string; // HH:mm (24h)
    onChange: (val: string) => void;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const AMPM = ['AM', 'PM'];
const ITEM_HEIGHT = 40; // 40px item height for better touch target

export default function IosTimePicker({ value, onChange }: IosTimePickerProps) {
    const hourRef = useRef<HTMLDivElement>(null);
    const minuteRef = useRef<HTMLDivElement>(null);
    const ampmRef = useRef<HTMLDivElement>(null);

    const isInitializingRef = useRef(true);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Parse initial time
    const parseTime = (timeStr: string) => {
        if (!timeStr) return { h: 10, m: 0, pm: true };
        const [hStr, mStr] = timeStr.split(':');
        let h24 = parseInt(hStr, 10);
        if (isNaN(h24)) h24 = 22;
        const m = parseInt(mStr, 10) || 0;
        const pm = h24 >= 12;
        let h12 = h24 % 12;
        if (h12 === 0) h12 = 12;
        return { h: h12, m, pm };
    };

    const initial = parseTime(value);
    const [selectedH, setSelectedH] = useState(initial.h);
    const [selectedM, setSelectedM] = useState(initial.m);
    const [selectedPm, setSelectedPm] = useState(initial.pm);

    useEffect(() => {
        isInitializingRef.current = true;

        const hIdx = HOURS.indexOf(selectedH);
        const mIdx = selectedM;
        const aIdx = selectedPm ? 1 : 0;

        const doSync = () => {
            if (hourRef.current) hourRef.current.scrollTop = (hIdx >= 0 ? hIdx : 10) * ITEM_HEIGHT;
            if (minuteRef.current) minuteRef.current.scrollTop = mIdx * ITEM_HEIGHT;
            if (ampmRef.current) ampmRef.current.scrollTop = aIdx * ITEM_HEIGHT;
        };

        doSync();
        const timer1 = setTimeout(doSync, 50);
        const timer2 = setTimeout(() => {
            doSync();
            isInitializingRef.current = false;
        }, 350);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
        };
    }, []);

    const handleScroll = () => {
        if (isInitializingRef.current) return;

        let newH = selectedH;
        let newM = selectedM;
        let newPm = selectedPm;

        if (hourRef.current) {
            const idx = Math.round(hourRef.current.scrollTop / ITEM_HEIGHT);
            const clampedIdx = Math.min(Math.max(idx, 0), HOURS.length - 1);
            newH = HOURS[clampedIdx];
        }
        if (minuteRef.current) {
            const idx = Math.round(minuteRef.current.scrollTop / ITEM_HEIGHT);
            const clampedIdx = Math.min(Math.max(idx, 0), MINUTES.length - 1);
            newM = clampedIdx;
        }
        if (ampmRef.current) {
            const idx = Math.round(ampmRef.current.scrollTop / ITEM_HEIGHT);
            const clampedIdx = Math.min(Math.max(idx, 0), AMPM.length - 1);
            newPm = clampedIdx === 1;
        }

        if (newH !== selectedH || newM !== selectedM || newPm !== selectedPm) {
            setSelectedH(newH);
            setSelectedM(newM);
            setSelectedPm(newPm);
            triggerHaptic('light').catch(() => {});
        }

        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
            let h24 = newH;
            if (newPm && h24 !== 12) h24 += 12;
            if (!newPm && h24 === 12) h24 = 0;
            const timeStr = `${h24.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
            onChange(timeStr);
        }, 200);
    };

    const colStyle: React.CSSProperties = {
        height: `${ITEM_HEIGHT * 3}px`,
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        flex: 1,
        textAlign: 'center',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y'
    };

    const itemStyle: React.CSSProperties = {
        height: `${ITEM_HEIGHT}px`,
        lineHeight: `${ITEM_HEIGHT}px`,
        scrollSnapAlign: 'center',
        fontSize: '18px',
        fontWeight: 600,
        color: 'var(--text)',
        userSelect: 'none',
        WebkitUserSelect: 'none'
    };

    return (
        <div style={{
            display: 'flex',
            position: 'relative',
            height: `${ITEM_HEIGHT * 3}px`,
            background: 'var(--surface)',
            borderRadius: '14px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            margin: '8px 16px'
        }}>
            {/* Selection Highlight Bar */}
            <div style={{
                position: 'absolute',
                top: `${ITEM_HEIGHT}px`,
                left: '8px',
                right: '8px',
                height: `${ITEM_HEIGHT}px`,
                background: 'rgba(120, 120, 128, 0.12)',
                borderRadius: '8px',
                pointerEvents: 'none',
                zIndex: 1
            }} />

            <style>{`
                .ios-picker-col::-webkit-scrollbar { display: none; }
            `}</style>

            {/* Hours Column */}
            <div ref={hourRef} onScroll={handleScroll} className="ios-picker-col" style={colStyle}>
                <div style={{ height: `${ITEM_HEIGHT}px` }} />
                {HOURS.map(hour => (
                    <div key={hour} style={{ ...itemStyle, opacity: hour === selectedH ? 1 : 0.35 }}>
                        {hour}
                    </div>
                ))}
                <div style={{ height: `${ITEM_HEIGHT}px` }} />
            </div>

            <div style={{ lineHeight: `${ITEM_HEIGHT * 3}px`, fontWeight: 700, fontSize: '18px', color: 'var(--text-light)', width: '12px', textAlign: 'center', zIndex: 2 }}>
                :
            </div>

            {/* Minutes Column */}
            <div ref={minuteRef} onScroll={handleScroll} className="ios-picker-col" style={colStyle}>
                <div style={{ height: `${ITEM_HEIGHT}px` }} />
                {MINUTES.map((minStr, idx) => (
                    <div key={minStr} style={{ ...itemStyle, opacity: idx === selectedM ? 1 : 0.35 }}>
                        {minStr}
                    </div>
                ))}
                <div style={{ height: `${ITEM_HEIGHT}px` }} />
            </div>

            {/* AM / PM Column */}
            <div ref={ampmRef} onScroll={handleScroll} className="ios-picker-col" style={colStyle}>
                <div style={{ height: `${ITEM_HEIGHT}px` }} />
                {AMPM.map((a, idx) => {
                    const active = (idx === 1) === selectedPm;
                    return (
                        <div key={a} style={{ ...itemStyle, opacity: active ? 1 : 0.35 }}>
                            {a}
                        </div>
                    );
                })}
                <div style={{ height: `${ITEM_HEIGHT}px` }} />
            </div>
        </div>
    );
}
