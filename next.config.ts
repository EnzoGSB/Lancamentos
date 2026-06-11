import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas', 'pdfjs-dist'],
  outputFileTracingIncludes: {
    '/api/processar': [
      './node_modules/pdf-parse/**/*',
      './node_modules/pdfjs-dist/**/*',
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-*/**/*',
    ],
  },
};

export default nextConfig;