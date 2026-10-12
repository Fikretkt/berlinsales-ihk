import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["*.trycloudflare.com"],
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
