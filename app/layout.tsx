import type { Metadata, Viewport } from "next";
import "./globals.css";

// Locks the screen size so it doesn't accidentally zoom in when you tap inputs (Crucial for mobile)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#F4F5F7",
};

// Tells iOS and Android to hide their browser UI and act like a native app
export const metadata: Metadata = {
  title: "Planner",
  description: "Your daily alignment app",
  manifest: "/manifest.json", // Triggers the Android standalone UI
  appleWebApp: {
    capable: true,            // Triggers the iOS full-screen UI
    statusBarStyle: "default", 
    title: "Planner",
  },
  formatDetection: {
    telephone: false,         // Stops iOS from turning random numbers into blue links
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}