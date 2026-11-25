import { ADMIN_COMPANY_ID, adminEmails, authEnabled, createServiceClient, createUserClient } from "@/lib/supabase/server";

// Step 1 of sign-in: company ID + email. A code is emailed only when that email is
// registered to that company (or is an AP admin using the admin company ID).
// The response is the same either way, so the form can't be used to discover who is registered.
export async function POST(request: Request) {
  if (!authEnabled()) return Response.json({ error: "Sign-in is not configured." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const companyId = String(body.companyId ?? "").trim().toUpperCase();
  if (!email.includes("@") || email.length > 200 || !companyId || companyId.length > 40)
    return Response.json({ error: "Enter your company ID and email." }, { status: 400 });

  let allowed = false;
  if (companyId === ADMIN_COMPANY_ID) {
    allowed = adminEmails().includes(email);
  } else {
    const { data } = await createServiceClient()
      .from("company_users")
      .select("email")
      .eq("email", email)
      .eq("company_id", companyId)
      .maybeSingle();
    allowed = Boolean(data);
  }

  if (allowed) {
    const supabase = await createUserClient();
    const origin = new URL(request.url).origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) console.error("signInWithOtp failed", error.message);
  }
  return Response.json({
    ok: true,
    message:
      "If that email is registered to that company, we've emailed it a sign-in link. Open it in this browser. If the email has a code instead, enter it below.",
  });
}
