"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

type TitaniumFinish = 'desert' | 'natural' | 'black' | 'white';

const FINISHES: Record<TitaniumFinish, {
  name: string;
  frameBg: string;
  borderOuter: string;
  borderInner: string;
  buttonBg: string;
  highlight: string;
  accent: string;
}> = {
  desert: {
    name: 'Desert Titanium',
    frameBg: 'linear-gradient(145deg, #c7b29a 0%, #ad9982 50%, #8c7760 100%)',
    borderOuter: '#7d6952',
    borderInner: '#d9c7b0',
    buttonBg: '#968169',
    highlight: 'rgba(217, 199, 176, 0.45)',
    accent: '#C5A880',
  },
  natural: {
    name: 'Natural Titanium',
    frameBg: 'linear-gradient(145deg, #bbb8b2 0%, #9e9a93 50%, #7d7973 100%)',
    borderOuter: '#66635d',
    borderInner: '#d4d2cc',
    buttonBg: '#87837d',
    highlight: 'rgba(212, 210, 204, 0.45)',
    accent: '#A8A49C',
  },
  black: {
    name: 'Black Titanium',
    frameBg: 'linear-gradient(145deg, #3d3e42 0%, #26272a 50%, #17181a 100%)',
    borderOuter: '#101113',
    borderInner: '#4a4c52',
    buttonBg: '#232428',
    highlight: 'rgba(90, 92, 98, 0.35)',
    accent: '#4B4D54',
  },
  white: {
    name: 'White Titanium',
    frameBg: 'linear-gradient(145deg, #f5f6f8 0%, #e2e4e8 50%, #c4c6cc 100%)',
    borderOuter: '#a8abb3',
    borderInner: '#ffffff',
    buttonBg: '#d0d3da',
    highlight: 'rgba(255, 255, 255, 0.7)',
    accent: '#E5E7EB',
  },
};

export default function IPhone16Preview() {
  const [finish, setFinish] = useState<TitaniumFinish>('desert');
  const [scale, setScale] = useState<number>(0.88);
  const [islandExpanded, setIslandExpanded] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('9:41');
  const [flashCamera, setFlashCamera] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      hours = hours % 12 || 12;
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  const triggerCameraControl = () => {
    setFlashCamera(true);
    setTimeout(() => setFlashCamera(false), 300);
  };

  const currentTheme = FINISHES[finish];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 20%, #1E1F24 0%, #0D0E11 100%)',
      color: '#FFFFFF',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px 40px',
      boxSizing: 'border-box',
    }}>
      {/* HEADER CONTROL BAR */}
      <header style={{
        width: '100%',
        maxWidth: '860px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '20px',
        padding: '12px 20px',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.4px' }}>
            iPhone 16 Pro
          </span>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            padding: '4px 8px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#E5E7EB',
          }}>
            Titanium • 6.3"
          </span>
        </div>

        {/* FINISH SELECTOR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(Object.keys(FINISHES) as TitaniumFinish[]).map((fKey) => {
            const f = FINISHES[fKey];
            const isSelected = finish === fKey;
            return (
              <button
                key={fKey}
                onClick={() => setFinish(fKey)}
                title={f.name}
                type="button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '14px',
                  border: isSelected ? '2px solid #007AFF' : '1px solid rgba(255, 255, 255, 0.15)',
                  background: isSelected ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 0, 0, 0.3)',
                  color: isSelected ? '#FFFFFF' : '#9CA3AF',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: f.frameBg,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                }} />
                {f.name.split(' ')[0]}
              </button>
            );
          })}
        </div>

        {/* SCALE & REFRESH ACTIONS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {[0.75, 0.85, 0.95, 1.0].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScale(s)}
              style={{
                padding: '5px 10px',
                borderRadius: '10px',
                border: scale === s ? '1px solid #007AFF' : '1px solid rgba(255, 255, 255, 0.1)',
                background: scale === s ? '#007AFF' : 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {Math.round(s * 100)}%
            </button>
          ))}

          <Link
            href="/"
            target="_blank"
            style={{
              padding: '6px 14px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.12)',
              color: 'white',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
              marginLeft: '4px',
            }}
          >
            Open Full App ↗
          </Link>
        </div>
      </header>

      {/* HARDWARE ENCLOSURE (PHONE WRAPPER) */}
      <div style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        justifyContent: 'center',
        margin: '10px 0 60px',
      }}>
        {/* PHYSICAL PHONE CONTAINER WITH HARDWARE BUTTONS */}
        <div style={{ position: 'relative' }}>
          {/* ACTION BUTTON (LEFT TOP) */}
          <div
            title="Action Button"
            style={{
              position: 'absolute',
              left: '-4px',
              top: '115px',
              width: '4px',
              height: '32px',
              background: currentTheme.buttonBg,
              borderRadius: '2px 0 0 2px',
              boxShadow: `inset 1px 0 1px ${currentTheme.highlight}, -1px 0 3px rgba(0,0,0,0.5)`,
              cursor: 'pointer',
            }}
          />

          {/* VOLUME UP BUTTON (LEFT) */}
          <div
            title="Volume Up"
            style={{
              position: 'absolute',
              left: '-4px',
              top: '165px',
              width: '4px',
              height: '56px',
              background: currentTheme.buttonBg,
              borderRadius: '2px 0 0 2px',
              boxShadow: `inset 1px 0 1px ${currentTheme.highlight}, -1px 0 3px rgba(0,0,0,0.5)`,
            }}
          />

          {/* VOLUME DOWN BUTTON (LEFT) */}
          <div
            title="Volume Down"
            style={{
              position: 'absolute',
              left: '-4px',
              top: '232px',
              width: '4px',
              height: '56px',
              background: currentTheme.buttonBg,
              borderRadius: '2px 0 0 2px',
              boxShadow: `inset 1px 0 1px ${currentTheme.highlight}, -1px 0 3px rgba(0,0,0,0.5)`,
            }}
          />

          {/* SIDE / POWER BUTTON (RIGHT) */}
          <div
            title="Side Power Button"
            style={{
              position: 'absolute',
              right: '-4px',
              top: '175px',
              width: '4px',
              height: '76px',
              background: currentTheme.buttonBg,
              borderRadius: '0 2px 2px 0',
              boxShadow: `inset -1px 0 1px ${currentTheme.highlight}, 1px 0 3px rgba(0,0,0,0.5)`,
            }}
          />

          {/* CAMERA CONTROL SENSOR (NEW IN IPHONE 16 - LOWER RIGHT) */}
          <div
            onClick={triggerCameraControl}
            title="Camera Control Sensor (Click to simulate tap)"
            style={{
              position: 'absolute',
              right: '-3px',
              top: '590px',
              width: '4px',
              height: '54px',
              background: 'linear-gradient(180deg, #1A1A1A 0%, #333333 50%, #1A1A1A 100%)',
              borderRadius: '0 3px 3px 0',
              borderLeft: '1px solid rgba(255,255,255,0.2)',
              boxShadow: flashCamera
                ? '0 0 12px #007AFF, 1px 0 4px rgba(0,122,255,0.8)'
                : 'inset -1px 0 1px rgba(255,255,255,0.3), 1px 0 2px rgba(0,0,0,0.6)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          />

          {/* GRADE 5 TITANIUM CHASSIS FRAME */}
          <div style={{
            width: '402px',
            height: '874px',
            background: currentTheme.frameBg,
            borderRadius: '56px',
            padding: '3.5px', // Ultra-thin 1.2mm Apple bezel simulation
            boxShadow: `
              0 30px 80px -15px rgba(0, 0, 0, 0.85),
              0 0 0 1px ${currentTheme.borderOuter},
              inset 0 0 0 1px ${currentTheme.borderInner},
              inset 0 2px 4px ${currentTheme.highlight}
            `,
            position: 'relative',
            boxSizing: 'border-box',
            display: 'flex',
            overflow: 'hidden',
          }}>
            {/* DISPLAY SCREEN GLASS */}
            <div style={{
              flex: 1,
              background: '#000000',
              borderRadius: '52px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'inset 0 0 0 2px rgba(0, 0, 0, 0.95)',
            }}>
              {/* TOP STATUS BAR OVERLAY */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '48px',
                zIndex: 999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 28px',
                color: '#1C1C1E',
                pointerEvents: 'none',
              }}>
                {/* CLOCK */}
                <span style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  letterSpacing: '-0.3px',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {currentTime}
                </span>

                {/* STATUS ICONS (SIGNAL, 5G, BATTERY) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* CELLULAR SIGNAL BARS */}
                  <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
                    <rect x="0" y="8" width="3" height="3" rx="0.8" />
                    <rect x="4.5" y="5.5" width="3" height="5.5" rx="0.8" />
                    <rect x="9" y="3" width="3" height="8" rx="0.8" />
                    <rect x="13.5" y="0" width="3" height="11" rx="0.8" />
                  </svg>
                  {/* 5G */}
                  <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '-0.2px' }}>5G</span>
                  {/* BATTERY */}
                  <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
                    <rect x="0.5" y="0.5" width="20" height="11" rx="3.5" stroke="currentColor" strokeWidth="1" />
                    <rect x="2" y="2" width="14" height="8" rx="2" fill="currentColor" />
                    <path d="M22 4C22.6 4.4 23 5.1 23 6C23 6.9 22.6 7.6 22 8V4Z" fill="currentColor" />
                  </svg>
                </div>
              </div>

              {/* DYNAMIC ISLAND */}
              <div
                onClick={() => setIslandExpanded(!islandExpanded)}
                title="Tap Dynamic Island to toggle Live Activity"
                style={{
                  position: 'absolute',
                  top: '11px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  height: islandExpanded ? '64px' : '35px',
                  width: islandExpanded ? '320px' : '124px',
                  background: '#000000',
                  borderRadius: islandExpanded ? '32px' : '20px',
                  zIndex: 1000,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: islandExpanded ? '0 18px' : '0 10px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                  transition: 'all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  overflow: 'hidden',
                  userSelect: 'none',
                }}
              >
                {!islandExpanded ? (
                  <>
                    {/* CAMERA PUNCH HOLE */}
                    <div style={{
                      width: '11px',
                      height: '11px',
                      borderRadius: '50%',
                      background: '#111424',
                      border: '1px solid #1C233D',
                      boxShadow: 'inset 0 0 2px #0055FF',
                    }} />
                    {/* TRUEDEPTH SENSOR PILL */}
                    <div style={{
                      width: '11px',
                      height: '11px',
                      borderRadius: '50%',
                      background: '#0D0E12',
                      opacity: 0.8,
                    }} />
                  </>
                ) : (
                  <div style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: '#007AFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                      }}>
                        ⚡
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>Next Focus</span>
                        <span style={{ fontSize: '11px', color: '#9CA3AF' }}>#Academics in 25m</span>
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      background: 'rgba(52, 199, 89, 0.2)',
                      color: '#34C759',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}>
                      ₹650 Left Today
                    </div>
                  </div>
                )}
              </div>

              {/* REAL APP IFRAME */}
              <iframe
                ref={iframeRef}
                src="/"
                title="Planner App Live"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: '#F4F5F7',
                  borderRadius: '52px',
                }}
              />

              {/* HOME INDICATOR BAR (BOTTOM SAFE AREA) */}
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '134px',
                height: '5px',
                background: '#1C1C1E',
                borderRadius: '3px',
                zIndex: 999,
                opacity: 0.85,
                pointerEvents: 'none',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER HELPER */}
      <footer style={{
        textAlign: 'center',
        color: '#6B7280',
        fontSize: '12px',
        lineHeight: '1.6',
        maxWidth: '560px',
      }}>
        <p style={{ margin: '0 0 6px' }}>
          <strong>Interactive Features:</strong> Tap the <strong>Dynamic Island</strong> to expand Live Activity details • Click the <strong>Camera Control</strong> bar on the lower right to simulate quick tactile feedback.
        </p>
        <p style={{ margin: 0 }}>
          The embedded view runs your real local application with full Firestore persistence.
        </p>
      </footer>
    </div>
  );
}
