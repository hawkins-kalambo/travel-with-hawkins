import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSuperAdminRole, isViewerRole, normalizeAdminRole } from "@/lib/adminAuth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// `_` and `%` are LIKE/ILIKE wildcards — passing a raw email straight into
// .ilike() means a user whose own address happens to contain one (e.g.
// "jo_n@x.com") can match a DIFFERENT ambassador's row. Escaping them
// keeps the case-insensitive match this was written for without the
// wildcard behavior.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// IMPORTANT: role must only ever be a value resolved server-side from the
// `admins`/`ambassadors`/`profiles` tables (see resolveAdminRole below).
// `user.user_metadata` is writable by the token owner themselves via
// `supabase.auth.updateUser({ data: { role: "admin" } })`, so it must never
// be treated as an authorization signal — doing so let any authenticated
// user grant themselves admin access.
export function isAdminAccessAllowed(profileRole?: unknown) {
  const normalizedProfileRole = normalizeAdminRole(profileRole);
  return normalizedProfileRole === "admin" || normalizedProfileRole === "super_admin";
}

function normalizeAdminTableRole(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "super_admin" || normalized === "superadmin" || normalized === "true" || normalized === "yes" || normalized === "1") {
      return "super_admin";
    }
    if (normalized === "admin" || normalized === "staff" || normalized === "moderator" || normalized === "false" || normalized === "0") {
      return "admin";
    }
    if (normalized === "viewer") {
      return "viewer";
    }
    return normalized;
  }

  if (typeof value === "boolean") {
    return value ? "super_admin" : "admin";
  }

  return null;
}

export async function getAdminRoleFromDatabase(userId: string, email?: string | null): Promise<string | null> {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedUserId = userId?.trim().toLowerCase();

  try {
    const { data, error } = await supabaseAdmin
      .from("admins")
      .select("id, email, full_name, super_admin, created_at")
      .limit(1000);

    if (error) {
      const isMissingColumnError =
        typeof error.message === "string" &&
        (error.message.includes("does not exist") || error.message.includes("Could not find the column") || error.message.includes("Could not find the table"));

      if (!isMissingColumnError) {
        console.warn("Failed to load admins list for role resolution", error.message);
      }
      return null;
    }

    const rows = Array.isArray(data) ? data : [];

    const match = rows.find((row: Record<string, unknown>) => {
      const rowEmail = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      const rowId = typeof row.id === "string" ? row.id.trim().toLowerCase() : "";
      const rowUserId = typeof row.user_id === "string" ? row.user_id.trim().toLowerCase() : "";
      const rowAuthUserId = typeof row.auth_user_id === "string" ? row.auth_user_id.trim().toLowerCase() : "";

      return Boolean(
        (normalizedEmail && rowEmail && rowEmail === normalizedEmail) ||
        (normalizedUserId && (rowId === normalizedUserId || rowUserId === normalizedUserId || rowAuthUserId === normalizedUserId))
      );
    });

    if (match) {
      const normalizedRole = normalizeAdminTableRole(match.super_admin);
      return normalizedRole ?? null;
    }
  } catch (error) {
    console.warn("Admin role lookup failed", error instanceof Error ? error.message : String(error));
  }

  return null;
}

async function getAmbassadorRoleFromDatabase(user: { id: string; email?: string | null } | null | undefined): Promise<string | null> {
  if (!user?.id) {
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("ambassadors")
      .select("id")
      .or(`user_id.eq.${user.id},profile_id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.id) {
      return "ambassador";
    }

    const normalizedEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : null;
    if (!normalizedEmail) {
      return null;
    }

    const { data: emailRow, error: emailError } = await supabaseAdmin
      .from("ambassadors")
      .select("id")
      .ilike("email", escapeLikePattern(normalizedEmail))
      .limit(1)
      .maybeSingle();

    if (!emailError && emailRow?.id) {
      return "ambassador";
    }
  } catch (error) {
    console.warn("Failed to resolve ambassador role from database", error instanceof Error ? error.message : String(error));
  }

  return null;
}

export async function resolveAdminRole(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): Promise<string> {
  if (!user?.id) {
    return "unknown";
  }

  // An explicit university_admin profile narrows a formerly global staff
  // account. Prefer it before the legacy admins table, otherwise an old
  // admins row would silently restore global access.
  const roleFromProfile = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const profileRole = typeof roleFromProfile.data?.role === "string" ? roleFromProfile.data.role : null;
  if (normalizeAdminRole(profileRole) === "university_admin") return "university_admin";

  const dbRole = await getAdminRoleFromDatabase(user.id, user.email);
  if (dbRole) {
    return normalizeAdminRole(dbRole);
  }

  const ambassadorRole = await getAmbassadorRoleFromDatabase(user);
  if (ambassadorRole) {
    return "ambassador";
  }

  // Never fall back to user.user_metadata.role here — it's client-writable
  // and would let a user grant themselves admin. profiles.role is only ever
  // written server-side (see app/api/customers/profile for the whitelist).
  return normalizeAdminRole(profileRole ?? "unknown");
}

export function isViewerAuthorizedRoute(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/admin";
  if (normalizedPath === "/admin") return true;
  return ["/admin/trips", "/admin/bookings"].includes(normalizedPath);
}

export function canAccessAdminRoute(role: unknown, pathname: string): boolean {
  // Was previously written to only allow "super_admin", so a plain "admin"
  // row in the `admins` table (super_admin: false) could call every admin
  // API route (which checks isAdminAccessAllowed / requireAdminUser) but
  // couldn't load the /admin/* pages themselves. Since resolveAdminRole no
  // longer collapses every admin match to "super_admin" (see above), a
  // real "admin" role now needs to be let in here too.
  if (isSuperAdminRole(role) || normalizeAdminRole(role) === "admin") return true;
  if (normalizeAdminRole(role) === "university_admin") {
    const normalizedPath = pathname.replace(/\/+$/, "") || "/admin";
    return isViewerAuthorizedRoute(normalizedPath)
      || normalizedPath === "/admin/reports"
      || normalizedPath === "/admin/applications"
      || normalizedPath === "/admin/ambassadors"
      || normalizedPath.startsWith("/admin/ambassadors/")
      || normalizedPath === "/admin/referral-bookings"
      || normalizedPath === "/admin/business-configuration/routes-and-fares"
      || normalizedPath === "/admin/business-configuration/universities";
  }
  if (isViewerRole(role)) return isViewerAuthorizedRoute(pathname);
  return false;
}

export function createSupabaseServerClient(request: NextRequest, response: NextResponse) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value: "", ...options });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });
}

export async function requireAuthenticatedUser(request: NextRequest, response: NextResponse) {
  const supabase = createSupabaseServerClient(request, response);

  // If the client provided a Bearer token (Authorization header), validate it
  // directly with Supabase's `getUser(jwt)` API. This avoids relying on browser
  // session state being mirrored into the server client.
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const result = await supabase.auth.getUser(token);
        return {
          user: result.data.user,
          error: result.error,
        };
      } catch (err) {
        console.warn("Failed to validate Supabase bearer token", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Prevent middleware from stalling for a long time if Supabase is slow/unreachable.
  const timeoutMs = 2500;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Supabase auth getUser() timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      timeout,
    ]);

    return {
      user: result.data.user,
      error: result.error,
    };
  } catch (err) {
    // Treat failures as unauthenticated so middleware can redirect quickly.
    const message = err instanceof Error ? err.message : String(err);
    console.warn("requireAuthenticatedUser failed (treating as unauthenticated)", { message });
    return {
      user: null,
      error: err instanceof Error ? err : new Error("Unauthenticated"),
    };
  }
}

export async function requireAdminUser(request: NextRequest, response: NextResponse) {
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return { authorized: false, user: null, error: "Authentication required" };
  }

  const role = await resolveAdminRole(user);
  const isAdminRole = isAdminAccessAllowed(role);

  if (!isAdminRole) {
    return { authorized: false, user: null, error: "Admin access required" };
  }

  return { authorized: true, user, role, error: null };
}


