"use client";

import { useEffect, useState } from "react";

export type DivergenceAlert = {
  id: string;
  coin: string;
  type: "price" | "volume";
  message: string;
  timestamp: number;
  strength: number;
};

export default function DivergenceBanner() {
  const [alerts, setAlerts] = useState<DivergenceAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "divergence-alerts" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          setAlerts(data);
        } catch {
          // ignore
        }
      }
    };

    // Load initial from localStorage
    try {
      const stored = localStorage.getItem("divergence-alerts");
      if (stored) {
        const data = JSON.parse(stored);
        setAlerts(data);
      }
    } catch {
      // ignore
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const dismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    const updated = alerts.filter((a) => a.id !== id);
    localStorage.setItem("divergence-alerts", JSON.stringify(updated));
    setAlerts(updated);
  };

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));
  if (visibleAlerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-xs">
      {visibleAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`pointer-events-auto bg-zinc-900 border rounded-xl p-4 shadow-xl transition-all duration-300 ${
            alert.type === "price" ? "border-amber-500" : "border-rose-500"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold text-amber-300">{alert.coin}</span>
                <span className="text-zinc-400 capitalize">{alert.type} divergence</span>
                <span className="text-xs text-zinc-500 ml-auto">
                  {Math.round((Date.now() - alert.timestamp) / 60000)}m ago
                </span>
              </div>
              <p className="text-zinc-200 text-sm mt-1 truncate">{alert.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 bg-zinc-800 rounded-full flex-1 max-w-xs">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, alert.strength * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-500">
                  {Math.round(alert.strength * 100)}%
                </span>
              </div>
            </div>
            <button
              onClick={() => dismiss(alert.id)}
              className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
              aria-label="Dismiss alert"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}