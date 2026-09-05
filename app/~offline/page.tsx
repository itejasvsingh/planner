"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

export default function OfflineFallback() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      // Auto return to app when connection is restored
      window.location.href = "/";
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0F172A",
        color: "#F8FAFC",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "72px",
          height: "72px",
          borderRadius: "20px",
          backgroundColor: "#1E293B",
          border: "1px solid #334155",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "24px",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#38BDF8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          letterSpacing: "-0.4px",
          marginBottom: "8px",
        }}
      >
        {isOnline ? "Back Online!" : "You're Offline"}
      </h1>

      <p
        style={{
          fontSize: "14px",
          color: "#94A3B8",
          maxWidth: "320px",
          lineHeight: 1.5,
          marginBottom: "28px",
        }}
      >
        {isOnline
          ? "Connection restored. Reconnecting to Planner..."
          : "Don't worry — all your saved tasks, budgets, and habits are stored locally on your device."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", maxWidth: "280px" }}>
        <Link
          href="/"
          style={{
            display: "block",
            padding: "14px 20px",
            backgroundColor: "#0284C7",
            color: "#FFFFFF",
            borderRadius: "14px",
            fontSize: "15px",
            fontWeight: 600,
            textDecoration: "none",
            boxShadow: "0 4px 16px rgba(2, 132, 199, 0.35)",
          }}
        >
          Open Planner
        </Link>

        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 20px",
            backgroundColor: "transparent",
            color: "#94A3B8",
            border: "1px solid #334155",
            borderRadius: "14px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Retry Connection
        </button>
      </div>
    </div>
  );
}
