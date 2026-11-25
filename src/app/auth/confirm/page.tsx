"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The emailed sign-in link lands here with the session in the URL fragment
// (#access_token=…), which only the browser can read. Hand it to the server, then go home.
export default function ConfirmPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Remove the tokens from the address bar and history straight away.
    window.history.replaceState(null, "", window.location.pathname);
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token) {
      router.replace("/login?error=link");
      return;
    }
    fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token }),
    })
      .then((r) => {
        if (r.ok) router.replace("/");
        else router.replace("/login?error=link");
      })
      .catch(() => setMessage("Something went wrong. Go back and request a new link."));
  }, [router]);

  return <p className="p-6 text-sm text-slate-600">{message}</p>;
}
