import { authEnabled, createUserClient } from "@/lib/supabase/server";

// Step 2 of sign-in: the emailed code. Success sets the session cookie.
export async function POST(request: Request) {
  if (!authEnabled()) return Response.json({ error: "Sign-in is not configured." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const token = String(body.token ?? "").trim();
  if (!email || !/^\d{6,10}$/.test(token)) return Response.json({ error: "Enter the code from the email." }, { status: 400 });

  const supabase = await createUserClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return Response.json({ error: "That code is wrong or has expired." }, { status: 401 });
  return Response.json({ ok: true });
}
