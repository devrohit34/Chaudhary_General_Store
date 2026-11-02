
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdfkit', '@vercel/blob'],

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
