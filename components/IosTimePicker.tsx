import React, { useEffect, useRef } from 'react';

interface IosTimePickerProps {
    value: string; // HH:mm 24h
    onChange: (val: string) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const AMPM = ['AM', 'PM'];

export default function IosTimePicker({ value, onChange }: IosTimePickerProps) {
    const hourRef = useRef<HTMLDivElement>(null);
    const minuteRef = useRef<HTMLDivElement>(null);
    const ampmRef = useRef<HTMLDivElement>(null);

    const [h, m] = value.split(':');
    let hNum = parseInt(h, 10);
    const isPM = hNum >= 12;
    hNum = hNum % 12 || 12;

    const handleScroll = (type: 'h' | 'm' | 'a') => {
        let newH = hNum;
        let newM = parseInt(m, 10) || 0;
        let newIsPM = isPM;

        if (type === 'h' && hourRef.current) {
            const idx = Math.round(hourRef.current.scrollTop / 32);
            newH = HOURS[Math.min(Math.max(idx, 0), HOURS.length - 1)];
        } else if (type === 'm' && minuteRef.current) {
            const idx = Math.round(minuteRef.current.scrollTop / 32);
            newM = parseInt(MINUTES[Math.min(Math.max(idx, 0), MINUTES.length - 1)], 10);
        } else if (type === 'a' && ampmRef.current) {
            const idx = Math.round(ampmRef.current.scrollTop / 32);
            newIsPM = idx === 1;
        }

        let outH = newH;
        if (newIsPM && outH !== 12) outH += 12;
        if (!newIsPM && outH === 12) outH = 0;

        onChange(`${outH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`);
    };

    useEffect(() => {
        // Set initial scroll positions
        if (hourRef.current) hourRef.current.scrollTop = HOURS.indexOf(hNum) * 32;
        if (minuteRef.current) minuteRef.current.scrollTop = parseInt(m, 10) * 32;
        if (ampmRef.current) ampmRef.current.scrollTop = (isPM ? 1 : 0) * 32;
    }, []);

    const colStyle: React.CSSProperties = {
        height: '96px',
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        flex: 1,
        textAlign: 'center'
    };

    const itemStyle: React.CSSProperties = {
        height: '32px',
        lineHeight: '32px',
        scrollSnapAlign: 'center',
        fontSize: '17px',
        fontWeight: 500
    };

    return (
        <div style={{ display: 'flex', position: 'relative', height: '96px', background: 'var(--surface)', margin: '0 16px', borderRadius: '12px' }}>
            {/* Selection Highlight */}
            <div style={{ position: 'absolute', top: '32px', left: 0, right: 0, height: '32px', background: 'rgba(120,120,128,0.12)', borderRadius: '6px', pointerEvents: 'none' }} />
            
            <style>{`
                .hide-scroll::-webkit-scrollbar { display: none; }
            `}</style>

            <div ref={hourRef} onScroll={() => handleScroll('h')} className="hide-scroll" style={colStyle}>
                <div style={{ height: '32px' }} />
                {HOURS.map(hour => <div key={hour} style={itemStyle}>{hour}</div>)}
                <div style={{ height: '32px' }} />
            </div>

            <div style={{ lineHeight: '96px', fontWeight: 600, width: '10px', textAlign: 'center' }}>:</div>

            <div ref={minuteRef} onScroll={() => handleScroll('m')} className="hide-scroll" style={colStyle}>
                <div style={{ height: '32px' }} />
                {MINUTES.map(min => <div key={min} style={itemStyle}>{min}</div>)}
                <div style={{ height: '32px' }} />
            </div>

            <div ref={ampmRef} onScroll={() => handleScroll('a')} className="hide-scroll" style={colStyle}>
                <div style={{ height: '32px' }} />
                {AMPM.map(a => <div key={a} style={itemStyle}>{a}</div>)}
                <div style={{ height: '32px' }} />
            </div>
        </div>
    );
}
