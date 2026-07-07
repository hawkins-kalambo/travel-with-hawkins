import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

  const allowedAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  const userEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const normalizedAllowed = typeof allowedAdminEmail === "string" ? allowedAdminEmail.trim().toLowerCase() : "";

  if (normalizedAllowed && userEmail && userEmail !== normalizedAllowed) {
    return { authorized: false, user: null, error: "Admin access required" };
  }

  return { authorized: true, user, error: null };
}


