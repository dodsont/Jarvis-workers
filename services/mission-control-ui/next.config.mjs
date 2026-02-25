/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:8787', '127.0.0.1:8787'],
    },
  },
};

export default nextConfig;
