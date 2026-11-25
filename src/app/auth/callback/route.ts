import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, createUserClient } from "@/lib/supabase/server";

// Where the sign-in link in the email lands. Supabase's default email sends a link,
// not a code, unless custom SMTP is set up; this finishes that sign-in.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const home = new URL("/", url.origin);
  const login = new URL("/login?error=link", url.origin);
  if (!authEnabled()) return NextResponse.redirect(home);

  const supabase = await createUserClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(error ? login : home);
  }
  if (tokenHash && (type === "magiclink" || type === "signup" || type === "email")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return NextResponse.redirect(error ? login : home);
  }
  return NextResponse.redirect(login);
}
