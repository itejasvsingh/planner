"use client";

import React, { useState, useRef } from 'react';

export default function SwipeAction({ children, onComplete, onDelete }: { children: React.ReactNode, onComplete?: () => void, onDelete?: () => void }) {
    const [dragX, setDragX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const currentX = useRef(0);

    const handleStart = (clientX: number) => { startX.current = clientX; setIsDragging(true); };
    const handleMove = (clientX: number) => {
        if (!isDragging) return;
        let diff = clientX - startX.current;
        if (!onComplete && diff > 0) diff = 0;
        if (!onDelete && diff < 0) diff = 0;
        if (diff > 100) currentX.current = 100;
        else if (diff < -100) currentX.current = -100;
        else currentX.current = diff;
        setDragX(currentX.current);
    };
    const handleEnd = () => {
        setIsDragging(false);
        if (currentX.current > 60 && onComplete) onComplete();
        else if (currentX.current < -60 && onDelete) onDelete();
        setDragX(0); currentX.current = 0;
    };

    return (
        <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', touchAction: 'pan-y', width: '100%' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundColor: dragX > 0 ? 'var(--green)' : dragX < 0 ? 'var(--red)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', color: 'white', fontWeight: 'bold', fontSize: '15px', borderRadius: '16px' }}>
                <span style={{ opacity: dragX > 30 ? 1 : 0, transform: `translateX(${dragX > 30 ? 0 : -20}px)`, transition: 'all 0.2s' }}>{onComplete ? 'Complete' : ''}</span>
                <span style={{ opacity: dragX < -30 ? 1 : 0, transform: `translateX(${dragX < -30 ? 0 : 20}px)`, transition: 'all 0.2s' }}>{onDelete ? 'Delete' : ''}</span>
            </div>
            <div onTouchStart={(e) => handleStart(e.touches[0].clientX)} onTouchMove={(e) => handleMove(e.touches[0].clientX)} onTouchEnd={handleEnd} onMouseDown={(e) => handleStart(e.clientX)} onMouseMove={(e) => handleMove(e.clientX)} onMouseUp={handleEnd} onMouseLeave={() => isDragging && handleEnd()} style={{ transform: `translateX(${dragX}px)`, transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.1, 0.9, 0.2, 1)', position: 'relative', zIndex: 1, backgroundColor: 'var(--surface)' }}>
                {children}
            </div>
        </div>
    );
}
