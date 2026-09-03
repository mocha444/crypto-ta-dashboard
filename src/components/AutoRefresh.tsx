"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface RefreshSource {
  key: string;
  label: string;
  nextRefreshAt: number;
  stale: boolean;
}

interface ScheduleEvent {
  serverTime: number;
  sources: RefreshSource[];
}

/**
 * Live auto-refresh status. No manual button.
 *
 * Connects to the server's SSE stream (/api/events). The server owns the
 * refresh cycle — it tracks each source's TTL, refreshes data when it's due,
 * and pushes an `update` event whenever the underlying cache changes. On an
 * update we call router.refresh() so the server components re-render with the
 * fresh data (no full page reload).
 */
export default function AutoRefresh() {
  const router = useRouter();
  const [sources, setSources] = useState<RefreshSource[]>([]);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);

    const handleSchedule = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as ScheduleEvent;
        setSources(data.sources);
        // On (re)connect, if a source is already stale, re-render immediately
        // so we show whatever fresh data was fetched while disconnected.
        if (data.sources.some((s) => s.stale) && !refreshingRef.current) {
          refreshingRef.current = true;
          router.refresh();
          setTimeout(() => { refreshingRef.current = false; }, 3_000);
        }
      } catch {
        /* ignore malformed frame */
      }
    };

    // The server only sends `update` when the on-disk cache actually changed,
    // so we always re-render the server components to pick up the new data.
    const handleUpdate = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as ScheduleEvent;
        setSources(data.sources);
      } catch {
        /* ignore malformed frame */
      }
      if (!refreshingRef.current) {
        refreshingRef.current = true;
        setLastUpdate(Date.now());
        router.refresh();
        refreshingRef.current = false;
      }
    };

    es.addEventListener("schedule", handleSchedule);
    es.addEventListener("update", handleUpdate);
    return () => es.close();
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const nextRefreshAt =
    sources.length > 0 ? Math.min(...sources.map((s) => s.nextRefreshAt)) : null;
  const remaining = nextRefreshAt == null ? null : Math.max(0, nextRefreshAt - now);
  const stale = remaining === 0;
  const countdown =
    remaining == null
      ? "—"
      : stale
        ? "refreshing…"
        : `${Math.floor(remaining / 60_000)}m ${Math.floor((remaining % 60_000) / 1000).toString().padStart(2, "0")}s`;

  return (
    <div className="flex items-center gap-3" title={sources.map((s) => `${s.label}: ${new Date(s.nextRefreshAt).toLocaleTimeString()}`).join(" · ")}>
      <span className={`inline-flex items-center gap-1.5 text-xs ${live ? "text-emerald-400" : "text-amber-400"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
        {live ? "Live" : "Reconnecting…"}
      </span>
      {countdown !== "—" && (
        <span className="text-xs text-zinc-500 tabular-nums">next refresh in {countdown}</span>
      )}
      {lastUpdate != null && Date.now() - lastUpdate < 6_000 && (
        <span className="text-xs text-emerald-500">updated just now</span>
      )}
    </div>
  );
}