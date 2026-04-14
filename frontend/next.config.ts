import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose env vars to client
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
  },
  // Next.js 15+ no longer runs ESLint during builds — `eslint` key is removed.
  // Disable TypeScript errors during build (type-check separately via tsc --noEmit)
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
