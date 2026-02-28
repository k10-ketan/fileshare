import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads (500MB)
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
