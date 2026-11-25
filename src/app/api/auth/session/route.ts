import { authEnabled, createUserClient } from "@/lib/supabase/server";

// Turns the tokens from an emailed sign-in link into the app's session cookie.
// The tokens are checked with Supabase before the session is kept.
export async function POST(request: Request) {
  if (!authEnabled()) return Response.json({ error: "Sign-in is not configured." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const access_token = String(body.access_token ?? "");
  const refresh_token = String(body.refresh_token ?? "");
  if (!access_token || !refresh_token || access_token.length > 4000 || refresh_token.length > 1000)
    return Response.json({ error: "Invalid sign-in link." }, { status: 400 });

  const supabase = await createUserClient();
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  // setSession may trust an unexpired token locally; getUser asks Supabase to verify it.
  const { data, error: userError } = await supabase.auth.getUser();
  if (error || userError || !data.user) {
    await supabase.auth.signOut();
    return Response.json({ error: "That sign-in link didn't work." }, { status: 401 });
  }
  return Response.json({ ok: true });
}
