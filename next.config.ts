import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  cacheStartUrl: true,
  dynamicStartUrl: false,
  disable: false,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
  },
  fallbacks: {
    document: "/",
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
};

export default withPWA(nextConfig);
