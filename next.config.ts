import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Ambassador/customer profile photos are stored in Supabase Storage
    // and rendered via next/image (app/ambassador/(protected)/dashboard,
    // app/ambassador/(protected)/profile). Without this, next/image throws
    // at runtime for any external hostname not explicitly allowed here —
    // this was previously unconfigured, so a real profile photo would have
    // crashed the page instead of rendering.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;
