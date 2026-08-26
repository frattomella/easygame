/** @type {import('next').NextConfig} */

const nextConfig = {
  /**
   * Dove finisce la build.
   *
   * `.next` resta il valore predefinito e nessun comando cambia. La variabile
   * serve a poter avere **due build sulla stessa copia di lavoro**: un
   * `next dev` in ascolto e un `next build` che gira per una verifica si
   * pestano i piedi dentro `.next` — il secondo cancella i chunk che il primo
   * sta servendo, e il server risponde `Cannot find module './6859.js'` su
   * ogni pagina. Non e un difetto ipotetico: e successo mentre si verificava
   * il responsive del Blocco Finale C.
   *
   *     NEXT_DIST_DIR=.next-verify npm run build
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  webpack: (config, { isServer, dev }) => {
    if (!isServer && dev) {
      // Profiling build di React solo in sviluppo.
      config.resolve.alias = {
        ...config.resolve.alias,
        'react-dom$': 'react-dom/profiling',
        'scheduler/tracing': 'scheduler/tracing-profiling',
      };
    }
    return config;
  },
};

module.exports = nextConfig;
