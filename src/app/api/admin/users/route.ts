import { authEnabled, createServiceClient, getSession } from "@/lib/supabase/server";

// AP admins (ADMIN_EMAILS) manage which emails belong to which supplier.
async function requireAdmin() {
  if (!authEnabled()) return Response.json({ error: "Sign-in is not configured." }, { status: 404 });
  const s = await getSession();
  if (!s) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!s.isAdmin) return Response.json({ error: "Admins only." }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const db = createServiceClient();
  const [{ data: companies }, { data: users }] = await Promise.all([
    db.from("companies").select("id, name").order("id"),
    db.from("company_users").select("email, company_id, name, created_at").order("email"),
  ]);
  return Response.json({ companies: companies ?? [], users: users ?? [] });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const companyId = String(body.companyId ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
  const { error } = await createServiceClient().from("company_users").insert({ email, company_id: companyId, name });
  if (error) {
    const msg = error.code === "23505" ? "That email is already registered." : error.code === "23503" ? "Unknown supplier ID." : "Could not add user.";
    return Response.json({ error: msg }, { status: 400 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const { error } = await createServiceClient().from("company_users").delete().eq("email", email);
  if (error) return Response.json({ error: "Could not remove user." }, { status: 400 });
  // Their session stays valid, but row level security stops returning any supplier data at once.
  return Response.json({ ok: true });
}
