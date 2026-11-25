import { connection } from "next/server";
import { authEnabled, getSession } from "@/lib/supabase/server";

export async function GET() {
  await connection(); // per-user: always run at request time, never prerender
  if (!authEnabled()) return Response.json({ authEnabled: false, session: null });
  return Response.json({
    authEnabled: true,
    demoSignIn: process.env.DEMO_SIGNIN !== "off",
    session: await getSession(),
  });
}
