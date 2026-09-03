/**
 * Tiny file-backed cache shared by all data sources.
 * Backs onto `.cache/data.json` so every source (CoinGecko, Groq summaries,
 * locally-computed metrics) respects a per-key TTL and survives dev restarts.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, "..", "..", ".cache");
const CACHE_FILE = join(CACHE_DIR, "data.json");

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  ttlMs: number;
}

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function readAll(): Record<string, CacheEntry<unknown>> {
  try {
    ensureCacheDir();
    if (!existsSync(CACHE_FILE)) return {};
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAll(raw: Record<string, CacheEntry<unknown>>) {
  ensureCacheDir();
  writeFileSync(CACHE_FILE, JSON.stringify(raw, null, 2));
}

/** Read a cached value if present and within its TTL, else null. */
export function cacheGet<T>(key: string, ttlMs: number): T | null {
  const raw = readAll();
  const entry = raw[key] as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > entry.ttlMs) return null;
  return entry.data;
}

/** Store a value under a key with its TTL. */
export function cacheSet<T>(key: string, data: T, ttlMs: number) {
  const raw = readAll();
  raw[key] = { data, fetchedAt: Date.now(), ttlMs };
  writeAll(raw);
}

/**
 * Drop entries older than maxAge from the cache file. Called on startup to
 * prevent stale entries from ever pulling a refresh schedule into the past.
 */
export function cleanStaleCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000) {
  try {
    const raw = readAll();
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;
    for (const [k, entry] of Object.entries(raw)) {
      if (entry?.fetchedAt && entry.fetchedAt < cutoff) {
        delete raw[k];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      writeAll(raw);
      console.log(`[cache] cleaned ${cleaned} stale entries (>${maxAgeMs / 1000 / 60 / 60}h old)`);
    }
  } catch (err) {
    console.error("[cache] cleanStaleCache failed:", err);
  }
}

/**
 * Return cached value if fresh; otherwise run `loader()` and cache the result.
 * If `loader()` throws, falls back to stale cache (if any) so transient
 * upstream failures don't take down the page.
 */
export async function cacheOrLoad<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  force = false,
): Promise<T> {
  if (!force) {
    const fresh = cacheGet<T>(key, ttlMs);
    if (fresh !== null) return fresh;
  }

  const stale = force ? null : cacheGet<T>(key, Number.MAX_SAFE_INTEGER);
  try {
    const data = await loader();
    cacheSet(key, data, ttlMs);
    return data;
  } catch (err) {
    if (stale !== null) return stale;
    throw err;
  }
}
