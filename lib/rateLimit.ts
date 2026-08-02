import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logWarn } from "@/lib/logger";

// Fixes AMB-012 from docs/ambassador-system-audit.md. The previous
// implementation kept counts in a plain in-process Map — every server
// instance/function invocation has its own independent bucket, so in any
// horizontally-scaled or serverless deployment a client could exceed the
// intended limit many times over just by landing on different instances.
//
// This is now backed by the `rate_limit_hit()` Postgres function (see
// db/migrations/2026_08_01_rate_limit_table.sql), which increments-or-resets
// a shared bucket atomically in a single statement — durable across
// instances and free of the read-then-write race a naive shared-store
// implementation would have.
const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 20;

export async function isRateLimited(key: string, windowSeconds = DEFAULT_WINDOW_SECONDS, max = DEFAULT_MAX_REQUESTS): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });

  if (error) {
    // Fail open, not closed: a rate-limiter outage should never be able to
    // take down booking/application submission for every legitimate user.
    // Logged so a persistent failure (e.g. the migration hasn't been
    // applied yet) is still visible.
    logWarn("Rate limit check failed; allowing request through", { key, error: error.message });
    return false;
  }

  return Boolean(data);
}
