"use client";

import { useEffect } from 'react';

export default function RegisterSW() {
    useEffect(() => {
        try {
            // Service workers cannot and should not register inside iframes or webviews
            if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.self === window.top) {
                const register = () => {
                    try {
                        navigator.serviceWorker
                            .register('/sw.js')
                            .then((registration) => {
                                console.log('PWA Service Worker registered with scope:', registration.scope);
                            })
                            .catch((error) => {
                                console.warn('PWA Service Worker registration failed:', error);
                            });
                    } catch (err) {
                        console.warn('PWA register execution error:', err);
                    }
                };

                if (document.readyState === 'complete') {
                    register();
                } else {
                    window.addEventListener('load', register);
                    return () => window.removeEventListener('load', register);
                }
            }
        } catch (e) {
            console.warn('Service worker check error:', e);
        }
    }, []);

    return null;
}
