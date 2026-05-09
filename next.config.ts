import type { NextConfig } from "next";

// Bridge: this project was deployed alongside the Vite-based IkambaVPN app, so
// Vercel still has the Firebase config saved under `VITE_FIREBASE_*` names.
// Next.js only ships `NEXT_PUBLIC_*` to the browser, so we mirror each
// VITE_FIREBASE_* into the matching NEXT_PUBLIC_FIREBASE_* at build time.
const firebaseEnvBridge: Record<string, string> = {};
const fbKeys = [
  'API_KEY',
  'AUTH_DOMAIN',
  'PROJECT_ID',
  'STORAGE_BUCKET',
  'MESSAGING_SENDER_ID',
  'APP_ID',
  'MEASUREMENT_ID',
  'DATABASE_URL',
];
for (const k of fbKeys) {
  const target = `NEXT_PUBLIC_FIREBASE_${k}`;
  const value = process.env[target] || process.env[`VITE_FIREBASE_${k}`];
  if (value) firebaseEnvBridge[target] = value;
}

const nextConfig: NextConfig = {
  // Inject the bridged Firebase env vars so the client bundle sees them.
  env: firebaseEnvBridge,

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
    ],
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
        ],
      },
    ];
  },

  // Production optimizations
  poweredByHeader: false,
  compress: true,
  
  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
};

export default nextConfig;
