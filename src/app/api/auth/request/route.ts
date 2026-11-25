import { createClient } from "@supabase/supabase-js";
import { adminEmails, authEnabled, createServiceClient } from "@/lib/supabase/server";

// Step 1 of sign-in: just the email. A sign-in link is sent only when the email is
// registered to a supplier or is an AP admin; the supplier comes from that registration.
// The response is the same either way, so the form can't be used to discover who is registered.
export async function POST(request: Request) {
  if (!authEnabled()) return Response.json({ error: "Sign-in is not configured." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    return Response.json({ error: "Enter your work email." }, { status: 400 });

  let allowed = adminEmails().includes(email);
  if (!allowed) {
    const { data } = await createServiceClient().from("company_users").select("email").eq("email", email).maybeSingle();
    allowed = Boolean(data);
  }

  if (allowed) {
    // "Implicit" flow: the emailed link carries the session itself, so it works in any
    // browser or email app. (The default flow needs a cookie from the browser that asked,
    // and breaks if the link is opened elsewhere or a second link was requested.)
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
    });
    const origin = new URL(request.url).origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/confirm` },
    });
    if (error) console.error("signInWithOtp failed", error.message);
  }
  return Response.json({
    ok: true,
    message:
      "If that email is registered, we've sent it a sign-in link. Click it to sign in. If the email has a code instead, enter it below.",
  });
}
