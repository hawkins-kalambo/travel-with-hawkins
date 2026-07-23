import { createClient } from "@supabase/supabase-js";

// ================= SUPABASE CLIENT =================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// ================= AUTH HELPERS =================

export async function getCurrentSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.warn("getCurrentSession warning", error.message);
      return null;
    }

    return session;
  } catch (error) {
    console.warn("getCurrentSession failed", error);
    return null;
  }
}

export async function getCurrentUser() {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.warn("getCurrentUser warning", error.message);
      return null;
    }

    return user;
  } catch (error) {
    console.warn("getCurrentUser failed", error);
    return null;
  }
}

export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.warn("logout warning", error.message);
    }
  } catch (error) {
    console.warn("logout failed", error);
  }
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const doFetch = async (token?: string) => {
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  };

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    let token = session?.access_token;
    if (!token) {
      const refreshResult = await supabase.auth.refreshSession();
      token = refreshResult.data?.session?.access_token ?? undefined;
    }

    let res = await doFetch(token);

    if (res.status === 401) {
      const refreshResult = await supabase.auth.refreshSession();
      token = refreshResult.data?.session?.access_token ?? undefined;
      if (token) {
        res = await doFetch(token);
      }
    }

    if (res.status === 401) {
      res = await doFetch();
    }

    return res;
  } catch {
    return doFetch();
  }
}