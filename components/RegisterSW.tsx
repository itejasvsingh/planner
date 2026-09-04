"use client";

import { useEffect } from 'react';

export default function RegisterSW() {
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            const register = () => {
                navigator.serviceWorker
                    .register('/sw.js')
                    .then((registration) => {
                        console.log('PWA Service Worker registered with scope:', registration.scope);
                    })
                    .catch((error) => {
                        console.warn('PWA Service Worker registration failed:', error);
                    });
            };

            if (document.readyState === 'complete') {
                register();
            } else {
                window.addEventListener('load', register);
                return () => window.removeEventListener('load', register);
            }
        }
    }, []);

    return null;
}
