import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterSW from "../components/RegisterSW";

// Locks the screen size so it doesn't accidentally zoom in when you tap inputs (Crucial for mobile)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // <-- THIS tells iOS 15+ to merge with the Dynamic Island
  themeColor: "#F4F5F7",
};

// Tells iOS and Android to hide their browser UI and act like a native app
export const metadata: Metadata = {
  title: "Planner",
  description: "Your daily alignment app",
  manifest: "/manifest.json", 
  appleWebApp: {
    capable: true,            
    statusBarStyle: "black-translucent", // <-- THIS makes the top status bar transparent
    title: "Planner",
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
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}