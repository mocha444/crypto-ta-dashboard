"use client";

import { useEffect, useState } from "react";

export default function InstallPWA() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setDeferred(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (installed) return <span className="text-xs text-emerald-400">installed</span>;
  if (!deferred) return null;

  return (
    <button
      onClick={async () => {
        deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") setInstalled(true);
        setDeferred(null);
      }}
      className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-700 border border-amber-600 text-white hover:bg-amber-600 transition"
    >
      Install App
    </button>
  );
}
