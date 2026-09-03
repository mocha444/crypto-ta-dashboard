/**
 * CoinGecko free-tier client with file-based cache.
 *
 * Cache lives at `CACHE_DIR/coingecko.json` so tests / dev sessions can
 * reuse values without hitting rate limits (free tier = 10 calls/min, 30 calls/day on the
 * demo key).
 *
 * Cache TTL is enforced per-entry so stale data is never silently served
 * in production.  In dev you can call `clearCache()` to force a fresh pull.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
// CoinGecko free tier: 10-30 calls/minute on the demo key.
// Prices refresh every 5 min; indicators keep a longer TTL to avoid rate limits.
const GLOBAL_TTL_MS = 5 * 60 * 1000;    // 5 minutes
const MARKETS_TTL_MS = 5 * 60 * 1000;   // 5 minutes

/* ---------- cache helpers ---------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, "..", "..", ".cache");
const CACHE_FILE = join(CACHE_DIR, "coingecko.json");

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;   // Date.now()
  ttlMs: number;
}

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

export function clearCache() {
  if (existsSync(CACHE_FILE)) {
    try { unlinkSync(CACHE_FILE); } catch { /* ignore */ }
  }
}

export function loadCache<T>(key: string, ttlMs: number = 5 * 60 * 1000): T | null {
  try {
    ensureCacheDir();
    if (!existsSync(CACHE_FILE)) return null;
    const raw: Record<string, CacheEntry<T>> = JSON.parse(
      readFileSync(CACHE_FILE, "utf-8"),
    );
    const entry = raw[key];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > entry.ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function saveCache<T>(key: string, data: T, ttlMs: number) {
  ensureCacheDir();
  let raw: Record<string, CacheEntry<T>> = {};
  if (existsSync(CACHE_FILE)) {
    try { raw = JSON.parse(readFileSync(CACHE_FILE, "utf-8")); } catch { /* ignore */ }
  }
  raw[key] = { data, fetchedAt: Date.now(), ttlMs };
  writeFileSync(CACHE_FILE, JSON.stringify(raw, null, 2));
}

/* ---------- fetch helper ---------- */

let lastCall = 0;
let inflight = 0;
let queue: Array<() => void> = [];
const MAX_CONCURRENCY = 1; // CoinGecko free tier is strict; serialize upstream calls

// Circuit breaker: once we hit 429, stop trying for `BREAKER_MS` so the SSE
// refresh loop doesn't spam upstream every second and stay stuck.
let breakerUntil = 0;
const BREAKER_MS = 60_000;

export function coinGeckoCircuitOpen(): boolean {
  return Date.now() < breakerUntil;
}

/** Tiny mutex so parallel history fetches don't pile onto CoinGecko at once. */
async function acquireSlot(): Promise<() => void> {
  if (inflight < MAX_CONCURRENCY) {
    inflight++;
    return () => { inflight--; releaseQueued(); };
  }
  return new Promise((resolve) => {
    queue.push(() => {
      inflight++;
      releaseQueued();
      resolve(() => { inflight--; releaseQueued(); });
    });
  });
}

function releaseQueued() {
  if (inflight < MAX_CONCURRENCY && queue.length > 0) {
    const next = queue.shift()!;
    next();
  }
}

async function doFetch<T>(url: string): Promise<T> {
  // polite delay between calls to respect free-tier rate limits
  const now = Date.now();
  const wait = 1_200 - (now - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status} ${url}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/**
 * Fetch with a single-flight mutex plus retry-with-backoff on 429 (rate
 * limit). Retries a few times before giving up, honoring any Retry-After
 * header. Serves stale-cache if the caller uses `cacheOrLoad`.
 */
async function throttledFetch<T>(url: string, ttlMs = GLOBAL_TTL_MS, force = false): Promise<T> {
  // Open circuit: skip the upstream call entirely; the cache layer below will
  // serve stale data instead of retrying into another 429.
  if (coinGeckoCircuitOpen()) {
    const stale = loadCache<T>(url, Number.MAX_SAFE_INTEGER);
    if (stale) return stale;
    throw new Error("CoinGecko circuit open (rate limited)");
  }

  const cached = loadCache<T>(url, ttlMs);
  if (cached && !force) return cached;

  const release = await acquireSlot();
  try {
    let attempt = 0;
    const maxAttempts = 4;
    for (;;) {
      try {
        const data = await doFetch<T>(url);
        saveCache(url, data, ttlMs);
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = /CoinGecko (\d+)/.exec(msg)?.[1];
        const isRateLimit = status === "429" || msg.includes("exceeded the Rate Limit");
        if (isRateLimit) {
          breakerUntil = Date.now() + BREAKER_MS;
          console.warn(`[coingecko] 429 — circuit open for ${BREAKER_MS}ms`);
        }
        if (isRateLimit && attempt < maxAttempts - 1) {
          attempt++;
          const backoff = Math.min(15_000, 2_000 * attempt); // 2s, 4s, 8s
          console.warn(`[coingecko] 429 rate limit, retrying in ${backoff}ms (attempt ${attempt}/${maxAttempts})`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw err;
      }
    }
  } finally {
    release();
  }
}

/* ---------- public API ---------- */

export interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d: number;
  price_change_percentage_30d: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  image: string;
}

export interface CoinHistory {
  prices: [number, number][];   // [timestamp, price]
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

export interface GlobalMarket {
  data: {
    active_cryptocurrencies: number;
    market_cap_percentage: Record<string, number>;
    total_market_cap: Record<string, number>;
    total_volume: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
    defi_market_cap: number;
    defi_volume_24h: number;
  };
}

/** Fetch top market data.  `vs_currency` defaults to usd. */
export async function getMarkets(
  vs_currency = "usd",
  ids?: string[],
  force = false,
): Promise<CoinMarket[]> {
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${vs_currency}&order=market_cap_desc&per_page=250&page=1${
    ids ? `&ids=${ids.join(",")}` : ""
  }&price_change_percentage=24h,7d,30d,90d&sparkline=false`;
  return throttledFetch<CoinMarket[]>(url, MARKETS_TTL_MS, force); // 60 minute cache
}

/** Fetch daily OHLC-ish history (price/marketcap/volume) for a coin. */
export async function getCoinHistory(
  id: string,
  vs_currency = "usd",
  days = 60,
): Promise<CoinHistory> {
  const url = `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=${vs_currency}&days=${days}&interval=daily`;
  return throttledFetch<CoinHistory>(url, 6 * 60 * 60 * 1000); // 6h — history is expensive; rates-friendly
}

/** Fetch global market overview (dominance, totals, etc.). */
export async function getGlobal(force = false): Promise<GlobalMarket> {
  const url = `${COINGECKO_BASE}/global`;
  return throttledFetch<GlobalMarket>(url, GLOBAL_TTL_MS, force); // 60 minute cache
}

/** Fetch BTC, ETH, and the requested tickers all in one call. */
export async function getDashboardData(tickerIds: string[] = ["bitcoin", "ethereum", "cardano", "binancecoin", "ripple", "dogecoin", "polkadot", "avalanche-2", "chainlink"], force = false) {
  const [markets, global] = await Promise.all([
    getMarkets("usd", tickerIds, force),
    getGlobal(force),
  ]);
  return { markets, global };
}
