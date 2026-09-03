/**
 * Locally-computed altcoin metrics from cached CoinGecko data.
 *
 * - ADA/BTC ratio: cardano current_price / bitcoin current_price
 * - Altcoin Season Index: share of top coins (outperforming BTC over the
 *   trailing window) scaled 0-100. >=75 signals "altcoin season".
 */

import { getMarkets } from "@/lib/coingecko";
import { cacheOrLoad, HOUR } from "@/lib/cache";

export interface AltcoinMetrics {
  adaBtc: number;
  altSeasonIndex: number;
  seasonLabel: "Altcoin Season" | "Bitcoin Season" | "Neutral";
  outperforming: number;
  total: number;
}

const TOP_N = 50; // number of top coins to compare vs BTC
// CoinGecko /coins/markets exposes up to 30d performance (suffixed
// `_in_currency`). We use 30d as the alt-season window.
const WINDOW_KEY = "price_change_percentage_30d_in_currency";

export function classifySeason(index: number): AltcoinMetrics["seasonLabel"] {
  if (index >= 75) return "Altcoin Season";
  if (index <= 25) return "Bitcoin Season";
  return "Neutral";
}

export async function getSummaryMetrics(force = false): Promise<AltcoinMetrics> {
  return cacheOrLoad("metrics:altcoin", 1 * HOUR, computeMetrics, force);
}

async function computeMetrics(): Promise<AltcoinMetrics> {
  const markets = await getMarkets("usd", undefined); // top 250 by market cap

  const bitcoin = markets.find((m) => m.id === "bitcoin");
  const cardano = markets.find((m) => m.id === "cardano");
  const adaBtc = bitcoin && cardano ? cardano.current_price / bitcoin.current_price : 0;

  const btcChg = bitcoin?.[WINDOW_KEY] ?? 0;

  const candidates = markets
    .filter((m) => typeof m[WINDOW_KEY] === "number")
    .slice(0, TOP_N);

  const outperforming = candidates.filter((m) => (m[WINDOW_KEY] as number) > btcChg).length;
  const total = candidates.length || 1;
  const altSeasonIndex = Math.round((outperforming / total) * 100);

  return {
    adaBtc,
    altSeasonIndex,
    seasonLabel: classifySeason(altSeasonIndex),
    outperforming,
    total,
  };
}
