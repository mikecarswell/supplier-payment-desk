import { authEnabled, createServiceClient, createUserClient } from "@/lib/supabase/server";
import { isDemoAccount } from "@/lib/demo-accounts";

// Signs in as one of the fictional demo accounts without an email, so visitors can try the app.
// Only the fixed demo list is allowed. Set DEMO_SIGNIN=off to disable.
export async function POST(request: Request) {
  if (!authEnabled() || process.env.DEMO_SIGNIN === "off")
    return Response.json({ error: "Demo sign-in is off." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isDemoAccount(email)) return Response.json({ error: "Not a demo account." }, { status: 400 });

  const { data, error } = await createServiceClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    console.error("generateLink failed", error?.message);
    return Response.json({ error: "Demo sign-in failed." }, { status: 500 });
  }
  const supabase = await createUserClient();
  // A first-time demo user gets a "signup" token, a returning one a "magiclink" token.
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: data.properties.verification_type as "signup" | "magiclink",
  });
  if (verifyError) {
    console.error("demo verifyOtp failed", verifyError.message);
    return Response.json({ error: "Demo sign-in failed." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
