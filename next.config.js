/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', '@vercel/blob'],

    outputFileTracingIncludes: {
      '/api/orders/[orderNumber]/invoice': [
        './node_modules/pdfkit/js/standard-fonts/**/*',
      ],
    },
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;