import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baseline hardening headers — none were previously set anywhere (checked
  // proxy.ts and here). Deliberately no Content-Security-Policy yet: this
  // app loads assets from several origins (Supabase Storage, Google profile
  // pictures, PayChangu's hosted checkout) and a wrong CSP fails silently
  // rather than loudly, so that needs its own dedicated audit pass first.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Safe to set globally: the only iframe in this app
          // (app/payment/return/page.tsx) embeds an *external* Supabase
          // Storage receipt URL — governed by that origin's own headers,
          // not ours. Nothing embeds our own pages.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No `preload` directive — submitting to browsers' HSTS preload
          // lists is effectively one-way and shouldn't happen as a side
          // effect of a hardening pass.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
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
      {
        // Google OAuth profile pictures (customer_profiles.profile_picture_url
        // populated from user_metadata.avatar_url on Google sign-in).
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
