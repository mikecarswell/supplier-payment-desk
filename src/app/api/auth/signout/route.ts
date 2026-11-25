import { authEnabled, createUserClient } from "@/lib/supabase/server";

export async function POST() {
  if (authEnabled()) await (await createUserClient()).auth.signOut();
  return Response.json({ ok: true });
}
