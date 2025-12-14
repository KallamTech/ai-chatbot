import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
      {
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Exclude test files from client bundle to prevent Edge Runtime issues
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        // Prevent test utilities from being bundled in client-side code
        'ai/test': false,
        async_hooks: false,
        net: false,
        _http_common: false,
      };
    }
    return config;
  },
};

export default nextConfig;
