import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient, resolveAdminRole } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { isAdminLikeRole } from "@/lib/permissions";

// Admin and ambassador login used to call supabase.auth.signInWithPassword
// directly from the browser — real, but the app's own rate limiting never
// saw those requests, since they went straight to Supabase's auth API. An
// attacker scripting against that endpoint directly skipped this app's
// throttle entirely. This mirrors app/api/customers/login/route.ts: sign
// in through a server-bound client (so the session cookie the browser
// needs still gets written), with rate limiting and the role check both
// enforced before any response goes back.
async function checkRateLimit(email: string, req: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const normalizedEmail = email.trim().toLowerCase();
  const [accountLimited, ipLimited] = await Promise.all([
    isRateLimited(`login:account:${normalizedEmail}`, 300, 5),
    isRateLimited(`login:ip:${ip}`, 300, 20),
  ]);

  if (accountLimited || ipLimited) {
    return NextResponse.json(
      { success: false, error: "Too many login attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  return null;
}

export async function handleAdminLogin(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ success: false, error: "Email and password are required" }, { status: 400 });
  }

  const rateLimitResponse = await checkRateLimit(email, req);
  if (rateLimitResponse) return rateLimitResponse;

  const cookieResponse = NextResponse.next();
  const supabaseClient = createSupabaseServerClient(req, cookieResponse);

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    return NextResponse.json({ success: false, error: error?.message || "Invalid login details" }, { status: 401 });
  }

  const role = await resolveAdminRole(data.user);

  if (!isAdminLikeRole(role)) {
    await supabaseClient.auth.signOut();
    return NextResponse.json({ success: false, error: "This account is not authorized for the admin portal." }, { status: 403 });
  }

  const finalResponse = NextResponse.json({ success: true, role });
  cookieResponse.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}

export async function handleAmbassadorLogin(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ success: false, error: "Email and password are required" }, { status: 400 });
  }

  const rateLimitResponse = await checkRateLimit(email, req);
  if (rateLimitResponse) return rateLimitResponse;

  const cookieResponse = NextResponse.next();
  const supabaseClient = createSupabaseServerClient(req, cookieResponse);

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    return NextResponse.json({ success: false, error: error?.message || "Invalid login details" }, { status: 401 });
  }

  const role = await resolveAdminRole(data.user);

  if (role !== "ambassador") {
    await supabaseClient.auth.signOut();
    return NextResponse.json({ success: false, error: "This login is not assigned to an ambassador account." }, { status: 403 });
  }

  const { data: ambassadorRow } = await supabaseAdmin
    .from("ambassadors")
    .select("status")
    .or(`user_id.eq.${data.user.id},profile_id.eq.${data.user.id}`)
    .limit(1)
    .maybeSingle();

  const status = String(ambassadorRow?.status || "active").toLowerCase();
  if (status === "suspended" || status === "inactive") {
    await supabaseClient.auth.signOut();
    return NextResponse.json({ success: false, error: "This ambassador account is currently suspended." }, { status: 403 });
  }

  const finalResponse = NextResponse.json({ success: true });
  cookieResponse.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}
