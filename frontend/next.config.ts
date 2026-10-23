import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Fly image (see ../Dockerfile)
  output: "standalone",
  // Expose the internal FastAPI at /backend/* (same machine in production), so local frontend
  // dev can use BACKEND_API_URL=https://quanthouse.casa/backend without the backend's secrets.
  async rewrites() {
    return [{ source: "/backend/:path*", destination: "http://127.0.0.1:8000/:path*" }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
