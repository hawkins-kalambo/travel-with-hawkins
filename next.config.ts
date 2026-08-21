import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baseline hardening headers — none were previously set anywhere (checked
  // proxy.ts and here).
  async headers() {
    // Built from a full audit of every script/style/font/image/connect/
    // frame/form-action source actually used in this app (see
    // docs/marketplace-expansion/phase3-gap-and-continuation-plan.md,
    // "Step 2 slice 3") rather than guessed — a wrong CSP fails silently.
    //
    // script-src and style-src both carry 'unsafe-inline'. This wasn't the
    // original plan — a first pass shipped script-src 'self' with no
    // exception, and a live Playwright check against a real dev server
    // caught it immediately: Next.js's own framework runtime injects inline
    // bootstrap/hydration scripts on every page, completely independent of
    // any app code, and a strict script-src blocks those too — it would
    // have broken every page. Per Next's own CSP guide
    // (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
    // "Without Nonces" section), the alternative is a nonce-based policy,
    // but that requires forcing every page into dynamic rendering
    // (disables static optimization/ISR site-wide) — a far bigger
    // architectural change than a bounded hardening pass should make
    // unilaterally. 'unsafe-inline' for script-src does reduce inline-XSS
    // protection specifically; the other directives below (frame-ancestors,
    // form-action, base-uri, restricted img/connect/frame-src, object-src
    // 'none') still add real protection that didn't exist before. A
    // nonce-based upgrade remains available later if the dynamic-rendering
    // tradeoff is worth taking on.
    //
    // style-src's 'unsafe-inline' has the narrower, previously-planned
    // reason: 8 inline style={{}} spots across 3 files (app/global-error.tsx
    // — the root error boundary, intentionally self-contained so it
    // survives a layout/CSS failure — plus two dynamic-width progress bars
    // in app/admin/(sub)/trips/page.tsx and
    // app/ambassador/settings/security/page.tsx) would otherwise break.
    //
    // connect-src includes wss://*.supabase.co for Supabase Realtime even
    // though lib/useBookingsRealtime.ts is currently unused (zero imports)
    // — cheap to include now versus a silent break later if it's wired up.
    const isDev = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      // 'unsafe-eval' only in dev — React uses eval() there for enhanced
      // debugging (reconstructing server error stacks in the browser);
      // neither React nor Next.js use eval in production.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https://*.supabase.co https://lh3.googleusercontent.com data:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-src https://*.supabase.co",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Safe to set globally: the only iframe in this app
          // (app/payment/return/page.tsx) embeds an *external* Supabase
          // Storage receipt URL — governed by that origin's own headers,
          // not ours. Nothing embeds our own pages. Also enforced by
          // frame-ancestors 'none' in the CSP below (the modern
          // equivalent) — kept both for older-browser compatibility.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No `preload` directive — submitting to browsers' HSTS preload
          // lists is effectively one-way and shouldn't happen as a side
          // effect of a hardening pass.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
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
