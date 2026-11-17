/** @type {import('next').NextConfig} */

const path = require("path");

const nextConfig = {
  // Tree-shake large icon / UI packages in dev and prod
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },

  // Disable Next.js dev indicators
  devIndicators: {
    buildActivity: false,
    appIsrStatus: false,
  },

  // Add proxy rewrites to pass API requests and artifact requests to the backend API
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
    return [
      {
        source: "/api/outputs/:path*",
        destination: `${apiBase}/api/outputs/:path*`,
      },
    ];
  },

  // Transpile mermaid and related packages for proper ESM handling
  transpilePackages: ["mermaid"],

  // Turbopack configuration (Next.js 16+ uses Turbopack by default for dev)
  turbopack: {
    // Pin root to this app — avoids picking ~/package-lock.json when multiple lockfiles exist
    root: path.join(__dirname),
    resolveAlias: {
      // Fix for mermaid's cytoscape dependency - use CJS version
      cytoscape: "cytoscape/dist/cytoscape.cjs.js",
    },
  },

  // Webpack configuration (used for production builds - next build)
  webpack: (config) => {
    const path = require("path");
    config.resolve.alias = {
      ...config.resolve.alias,
      cytoscape: path.resolve(
        __dirname,
        "node_modules/cytoscape/dist/cytoscape.cjs.js",
      ),
    };
    return config;
  },
};

module.exports = nextConfig;
