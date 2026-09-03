/**
 * Server-side refresh scheduler + change detector for the dashboard's
 * file-backed caches.
 *
 * The SSE endpoint (/api/events) uses this to:
 *  1. tell the client when each source is going to refresh next,
 *  2. proactively refresh sources once their TTL elapses (so the dashboard
 *     updates even when nobody hits the page), and
 *  3. push an `update` the moment a cache file changes on disk.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getDashboardData } from "@/lib/coingecko";
import { getSummary } from "@/lib/summary";
import { getSummaryMetrics } from "@/lib/altcoin";
import { cleanStaleCache } from "@/lib/cache";

// Clean stale entries on module load (server startup / hot reload).
cleanStaleCache();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, "..", "..", ".cache");
export const DATA_FILE = join(CACHE_DIR, "data.json");
export const CG_FILE = join(CACHE_DIR, "coingecko.json");

export interface RefreshSource {
  key: string;
  label: string;
  nextRefreshAt: number; // epoch ms
  stale: boolean;
}

interface CacheEntry {
  data?: unknown;
  fetchedAt?: number;
  ttlMs?: number;
}

function readJson(path: string): Record<string, CacheEntry> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, CacheEntry>;
  } catch {
    return null;
  }
}

/** Earliest fetchedAt+ttl across the given entries (epoch ms), or null. */
function soonest(entries: [string, CacheEntry][]): number | null {
  let min: number | null = null;
  for (const [, entry] of entries) {
    if (entry?.fetchedAt == null || entry.ttlMs == null) continue;
    const at = entry.fetchedAt + entry.ttlMs;
    if (min === null || at < min) min = at;
  }
  return min;
}

function into(entries: [string, CacheEntry][], key: string, label: string): RefreshSource {
  // Ignore stale entries when computing the next refresh — they should be
  // refreshed immediately (stale=true) but shouldn't pull the schedule back.
  const freshEntries = entries.filter(([, e]) => {
    if (!e?.fetchedAt || !e?.ttlMs) return true;
    return Date.now() - e.fetchedAt <= e.ttlMs;
  });
  const nextRefreshAt = soonest(freshEntries) ?? Date.now();
  const hasStale = entries.some(([, e]) => e?.fetchedAt != null && e?.ttlMs != null && Date.now() - e.fetchedAt > e.ttlMs);
  return { key, label, nextRefreshAt, stale: hasStale || nextRefreshAt <= Date.now() };
}

/** Current refresh schedule for every data source the dashboard renders. */
export function getRefreshSchedule(): RefreshSource[] {
  const cg = readJson(CG_FILE) ?? {};
  const data = readJson(DATA_FILE) ?? {};

  const cgEntries = Object.entries(cg);
  const dataEntries = Object.entries(data);

  return [
    into(
      cgEntries.filter(([k]) => k.includes("/coins/markets") || k.includes("/global")),
      "markets",
      "Prices",
    ),
    into(
      cgEntries.filter(([k]) => k.includes("/market_chart")),
      "indicators",
      "Indicators",
    ),
    into(dataEntries.filter(([k]) => k === "metrics:altcoin"), "metrics", "Altcoin metrics"),
    into(dataEntries.filter(([k]) => k === "summary:text"), "summary", "AI summary"),
  ];
}

/** Sources whose cache has already expired (used to trigger a refresh). */
export function getDueSources(): RefreshSource[] {
  return getRefreshSchedule().filter((s) => s.stale);
}

/* ---------- proactive refresh (single-flight per source) ---------- */

const inflight = new Map<string, Promise<unknown>>();

async function refreshMarkets() {
  await getDashboardData(undefined, true);
}

async function refreshIndicators() {
  await getDashboardData([], true);
}

async function refreshMetrics() {
  await getSummaryMetrics(true);
}

async function refreshSummary() {
  await getSummary(true);
}

const REFRESHERS: Record<string, () => Promise<unknown>> = {
  markets: refreshMarkets,
  indicators: refreshIndicators,
  metrics: refreshMetrics,
  summary: refreshSummary,
};

/**
 * Force-refresh any sources whose cache TTL has elapsed. Safe to call from
 * every SSE connection: each source is single-flighted, so a second caller
 * just awaits the in-progress refresh instead of re-fetching.
 */
export async function refreshDueSources(): Promise<void> {
  const due = getDueSources();
  await Promise.all(
    due.map(async (s) => {
      const fn = REFRESHERS[s.key];
      if (!fn) return;

      const existing = inflight.get(s.key);
      if (existing) {
        try { await existing; } catch { /* first caller logged it */ }
        return;
      }

      const p = fn().catch((err) => console.error(`[refresh] ${s.key}:`, err));
      inflight.set(s.key, p);
      try {
        await p;
      } finally {
        if (inflight.get(s.key) === p) inflight.delete(s.key);
      }
    }),
  );
}

/* ---------- change detection ---------- */

export interface FileState {
  size: number;
  mtimeMs: number;
}

export function fileState(path: string): FileState | null {
  try {
    const st = statSync(path);
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

/** True if the on-disk cache snapshot differs from what we last saw. */
export function changed(
  last: Record<string, FileState | null>,
): Record<string, FileState | null> | null {
  const next: Record<string, FileState | null> = {
    [DATA_FILE]: fileState(DATA_FILE),
    [CG_FILE]: fileState(CG_FILE),
  };
  for (const path of [DATA_FILE, CG_FILE]) {
    if (last[path]?.size !== next[path]?.size || last[path]?.mtimeMs !== next[path]?.mtimeMs) {
      return next;
    }
  }
  return null;
}