
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Chaudhary General Store | चौधरी जेनरल स्टोर',
    short_name: 'Chaudhary Store',
    description:
      'Fresh groceries and daily essentials in Bhagwanpur, Bihar.',
    lang: 'en-IN',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#159B4A',
    categories: ['shopping', 'food'],
    icons: [
      {
        src: '/icons/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/app-icon.png',
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
