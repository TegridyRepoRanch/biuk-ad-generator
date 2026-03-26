import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "sharp"],
  // Include font files in the serverless bundle
  outputFileTracingIncludes: {
    "/api/pipeline/create": ["./src/fonts/**/*", "./fonts/**/*"],
  },
};

export default nextConfig;
