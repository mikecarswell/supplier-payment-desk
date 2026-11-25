"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Company {
  id: string;
  name: string;
}
interface User {
  email: string;
  company_id: string;
  name: string;
}

export default function AdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ email: "", companyId: "", name: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Could not load users.");
    else {
      setCompanies(data.companies);
      setUsers(data.users);
      setForm((f) => ({ ...f, companyId: f.companyId || data.companies[0]?.id || "" }));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  async function call(method: "POST" | "DELETE", body: object) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Request failed.");
    await load();
    setBusy(false);
    return res.ok;
  }

  const input = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 text-slate-900">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Supplier users</h1>
          <p className="text-sm text-slate-600">Who can sign in for each supplier. Removing someone cuts off their data access immediately.</p>
        </div>
        <Link href="/" className="text-sm font-medium text-indigo-700 underline">
          Back to the agent
        </Link>
      </header>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {loaded && companies.length > 0 && (
        <>
          <form
            className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await call("POST", form)) setForm({ ...form, email: "", name: "" });
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Email</span>
              <input className={input} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Name</span>
              <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Supplier</span>
              <select className={input} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy} className="rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Add user
            </button>
          </form>

          {companies.map((c) => {
            const list = users.filter((u) => u.company_id === c.id);
            return (
              <section key={c.id} className="rounded-lg border border-slate-200 bg-white">
                <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">
                  {c.name} <span className="font-normal text-slate-500">({c.id})</span>
                </h2>
                {list.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">No users.</p>
                ) : (
                  <ul>
                    {list.map((u) => (
                      <li key={u.email} className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-sm first:border-t-0">
                        <span>
                          {u.email} {u.name && <span className="text-slate-500">· {u.name}</span>}
                        </span>
                        <button disabled={busy} className="text-xs text-red-700 underline disabled:opacity-50" onClick={() => call("DELETE", { email: u.email })}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
