import type { Metadata, Viewport } from "next";
import "./globals.css";

// Locks the screen size so it doesn't accidentally zoom in when you tap inputs (Crucial for mobile)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // <-- THIS tells iOS 15+ to merge with the Dynamic Island
  themeColor: "#0F172A",
};

// Tells iOS and Android to hide their browser UI and act like a native app
export const metadata: Metadata = {
  title: "Align",
  description: "Your daily alignment app",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,            
    statusBarStyle: "black-translucent", // <-- THIS makes the top status bar transparent
    title: "Align",
  },
  formatDetection: {
    telephone: false,         
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocal) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for (var i = 0; i < registrations.length; i++) {
                      registrations[i].unregister();
                    }
                  });
                } else {
                  var refreshing = false;
                  navigator.serviceWorker.addEventListener('controllerchange', function() {
                    if (!refreshing) {
                      refreshing = true;
                      window.location.reload();
                    }
                  });

                  var registerSW = function() {
                    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function(reg) {
                      reg.addEventListener('updatefound', function() {
                        var newWorker = reg.installing;
                        if (newWorker) {
                          newWorker.addEventListener('statechange', function() {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                              newWorker.postMessage({ type: 'SKIP_WAITING' });
                            }
                          });
                        }
                      });
                      if (reg.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                      }
                      reg.update();
                    }).catch(function(err) {
                      console.warn('SW registration notice:', err);
                    });
                  };
                  registerSW();
                }
              }
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}