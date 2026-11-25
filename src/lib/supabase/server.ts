import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Sign-in is on when Supabase is configured. Without it the app falls back to
// the original demo mode (persona picker + in-memory data), which evals use too.
export const authEnabled = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Acts as the signed-in user (their session cookie), so row level security applies.
export async function createUserClient() {
  const store = await cookies();
  return createServerClient(url(), anonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes sessions.
        }
      },
    },
  });
}

// Server-only privileged client. Never import this into client code.
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export interface SessionInfo {
  email: string;
  company: { id: string; name: string } | null;
  isAdmin: boolean;
}

export async function getSession(): Promise<SessionInfo | null> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: membership } = await supabase
    .from("company_users")
    .select("companies(id, name)")
    .eq("email", email)
    .maybeSingle();
  const company = (membership?.companies as unknown as { id: string; name: string } | null) ?? null;
  return { email, company, isAdmin: adminEmails().includes(email) };
}
