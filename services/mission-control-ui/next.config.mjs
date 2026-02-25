/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local always-on service: keep default output so `next start` works.
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:8787',
        '127.0.0.1:8787',
        // LAN access (adjust as needed)
        '192.168.1.183:8787',
      ],
    },
  },
};

export default nextConfig;
