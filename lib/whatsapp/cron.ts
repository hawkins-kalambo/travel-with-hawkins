import "server-only";

import type { NextRequest } from "next/server";

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. The same routes can
// also be invoked manually with that header. No secret configured -> not
// authorised (fail closed), so a misconfigured deployment cannot be triggered
// anonymously.
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}
