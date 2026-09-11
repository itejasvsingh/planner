import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/_web/index.html' },
        { source: '/calendar', destination: '/_web/calendar.html' },
        { source: '/finance', destination: '/_web/finance.html' },
        { source: '/goals', destination: '/_web/goals.html' },
        { source: '/login', destination: '/_web/login.html' },
        { source: '/settings/whatsapp', destination: '/_web/settings/whatsapp.html' },
        { source: '/settings/security', destination: '/_web/settings/security.html' },
        { source: '/settings/notifications', destination: '/_web/settings/notifications.html' },
      ],
      afterFiles: [],
      fallback: [
        { source: '/:path*', destination: '/_web/index.html' },
      ],
    };
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
        ],
      },
      {
        source: '/_web/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

