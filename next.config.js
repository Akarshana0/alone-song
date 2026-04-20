/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Don't fail build on ESLint errors (handled separately)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Don't fail build on TS errors in CI (we fix errors manually)
  typescript: {
    ignoreBuildErrors: false,
  },

  // COEP/COOP headers required for SharedArrayBuffer (Tone.js/WaveSurfer AudioWorklets)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy",  value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, path: false, os: false, net: false, tls: false,
      };
    } else {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, path: false, os: false,
      };
    }
    return config;
  },

  // Transpile packages that use ES modules
  transpilePackages: ["tone", "wavesurfer.js"],
};

module.exports = nextConfig;
