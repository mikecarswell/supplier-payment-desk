"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "code">("details");
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [demoOn, setDemoOn] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link")
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL
      setError("That sign-in link didn't work. It may have expired, or been opened in a different browser. Request a new one.");
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.authEnabled || d.session) router.replace("/");
        setDemoOn(Boolean(d.demoSignIn));
      })
      .catch(() => {});
  }, [router]);

  async function post(url: string, body: object) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded border border-slate-300 bg-white px-3 py-2 text-sm";
  const button = "rounded bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10 text-slate-900">
      <header>
        <h1 className="text-2xl font-semibold">Supplier Payment Desk</h1>
        <p className="text-sm text-slate-600">Sign in to check invoices and payments with Meridian Foods.</p>
      </header>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        {step === "details" ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = await post("/api/auth/request", { companyId, email });
              if (d) {
                setNote(d.message);
                setStep("code");
              }
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Supplier ID</span>
              <input className={input} placeholder="e.g. SUP-1001" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Work email</span>
              <input className={input} type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <button className={button} disabled={busy}>Email me a sign-in link</button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await post("/api/auth/verify", { email, token: code })) router.replace("/");
            }}
          >
            <p className="text-sm text-slate-600">{note}</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Code (only if your email shows one)</span>
              <input className={input} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            <div className="flex gap-2">
              <button className={button} disabled={busy}>Sign in</button>
              <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => setStep("details")}>
                Back
              </button>
            </div>
          </form>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      {demoOn && (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Try a demo account</h2>
          <p className="text-xs text-slate-600">Fictional suppliers, no email needed. The impostors are signed in but not registered to any supplier.</p>
          <div className="flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                disabled={busy}
                className="flex justify-between gap-2 rounded border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                onClick={async () => {
                  if (await post("/api/auth/demo", { email: a.email })) router.replace("/");
                }}
              >
                <span>{a.label}</span>
                <span className="text-xs text-slate-500">{a.email}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
