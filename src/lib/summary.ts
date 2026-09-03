/**
 * Shared server-only TA summary generator.
 * Called from the AI summary section (server component) and /api/ai-summary.
 */

import { getDashboardData } from "@/lib/coingecko";
import { getSummaryMetrics } from "@/lib/altcoin";
import { groqChat } from "@/lib/groq";
import { HAS_GROQ_KEY } from "@/lib/env";
import { cacheOrLoad, HOUR } from "@/lib/cache";

/**
 * Builds a TA summary for the dashboard.
 * Uses Groq when GROQ_API_KEY is present; otherwise returns a plain
 * indicator summary computed from the cached CoinGecko data.
 */
export async function getSummary(force = false): Promise<string> {
  return cacheOrLoad("summary:text", 1 * HOUR, buildSummary, force);
}

async function buildSummary(): Promise<string> {
  const { markets, global } = await getDashboardData();
  const metrics = await getSummaryMetrics();

  const fmt = (n: number, decimals = 2) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  const fmtPct = (n: number) =>
    `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  const btcDominance = global.data.market_cap_percentage["btc"] ?? 0;
  const ethDominance = global.data.market_cap_percentage["eth"] ?? 0;
  const totalMCap = global.data.total_market_cap["usd"] ?? 0;

  const btc = markets.find((m) => m.id === "bitcoin");
  const eth = markets.find((m) => m.id === "ethereum");
  const ada = markets.find((m) => m.id === "cardano");
  const bnb = markets.find((m) => m.id === "binancecoin");

  function rawIndicatorSummary(coin: typeof markets[0] | undefined, label: string) {
    if (!coin) return `${label}: n/a`;
    const chg24h = coin.price_change_percentage_24h ?? 0;
    const chg7d = coin.price_change_percentage_7d ?? 0;

    let sentiment = "Neutral";
    if (chg24h > 5) sentiment = "Strong Bullish";
    else if (chg24h > 2) sentiment = "Bullish";
    else if (chg24h < -5) sentiment = "Strong Bearish";
    else if (chg24h < -2) sentiment = "Bearish";

    return `${label} ${fmt(coin.current_price)} 24h:${fmtPct(chg24h)} 7d:${fmtPct(chg7d)} ${sentiment}`;
  }

  const raw = [
    `MCap ${fmt(totalMCap / 1e12, 1)}T | BTCdom ${btcDominance.toFixed(1)}% | ETHdom ${ethDominance.toFixed(1)}%`,
    `ADA/BTC ${metrics.adaBtc.toFixed(6)} | AltSeasonIdx ${metrics.altSeasonIndex}`,
    rawIndicatorSummary(btc, "BTC"),
    rawIndicatorSummary(eth, "ETH"),
    rawIndicatorSummary(ada, "ADA"),
    rawIndicatorSummary(bnb, "BNB"),
    rawIndicatorSummary(markets.find((m) => m.id === "ripple"), "XRP"),
    rawIndicatorSummary(markets.find((m) => m.id === "dogecoin"), "DOGE"),
  ].join(" | ");

  if (!HAS_GROQ_KEY) {
    return raw;
  }

  try {
    const { text } = await groqChat({
      model: "groq/compound",
      system: `You are a concise crypto TA. In 2-4 short sentences: overall sentiment, one key level for BTC, one for the top altcoin, and short-term outlook. Do not invent prices.`,
      user: `Data:\n${raw}\n\nTA summary:`,
      maxTokens: 220,
      temperature: 0.3,
    });
    return text;
  } catch (llmErr) {
    console.error("[summary] Groq error, falling back to raw:", llmErr);
    return raw;
  }
}
