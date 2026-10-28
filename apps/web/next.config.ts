import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  turbopack: { root: path.resolve(__dirname, '../..') },
  transpilePackages: ['@sincvete/shared', '@sincvete/db'],
  outputFileTracingIncludes: {
    '/api/historia-clinica/pdf': ['./public/fonts/*.ttf'],
  },
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_BUILD_ID ||
      'local',
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
