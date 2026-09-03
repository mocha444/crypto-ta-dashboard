import { Suspense } from "react";
import { getDashboardData, type CoinMarket } from "@/lib/coingecko";
import { getSummary } from "@/lib/summary";
import { getSummaryMetrics } from "@/lib/altcoin";
import { getCoinIndicators, type CoinIndicators } from "@/lib/ta";
import { detectDivergence } from "@/lib/divergence";
import AutoRefresh from "@/components/AutoRefresh";
import InstallPWA from "@/components/InstallPWA";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
      <header className="max-w-6xl mx-auto mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-amber-300 via-amber-500 to-amber-300 bg-clip-text text-transparent mb-2">
          Crypto TA Dashboard
        </h1>
        <p className="text-zinc-400 text-sm">Live CoinGecko data + Groq AI summaries · Cache: .cache/data.json</p>
        <div className="mt-3 flex items-center gap-4">
          <Suspense fallback={null}>
            <AutoRefresh />
          </Suspense>
          <Suspense fallback={null}>
            <InstallPWA />
          </Suspense>
        </div>
      </header>

      {/* ADA first — the focal point */}
      <Suspense fallback={<RundownSkeleton />}>
        <AdaRundownSection />
      </Suspense>

      <Suspense fallback={<SummarySkeleton />}>
        <AiSummarySection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton rows={3} />}>
        <OverviewSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton rows={1} />}>
        <CoinsSection />
      </Suspense>

      <footer className="max-w-6xl mx-auto mt-12 text-xs text-zinc-600 flex gap-4">
        <span>Port 4444 · 0.0.0.0</span>
        <span>Cache: .cache/data.json</span>
        <span>API: /api/markets · /api/ai-summary</span>
      </footer>
    </main>
  );
}

async function OverviewSection() {
  const { global } = await getDashboardData();
  const btcDom = global.data.market_cap_percentage["btc"] ?? 0;
  const totalMCap = global.data.total_market_cap["usd"] ?? 0;

  return (
    <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <OverviewCard title="BTC Dominance" value={`${btcDom.toFixed(1)}%`} sub="of total market cap" />
      <OverviewCard title="Total MCap" value={fmtUsd(totalMCap / 1e12) + "T"} sub="USD" />
      <OverviewCard title="Market Change (24h)" value={fmtPct(global.data.market_cap_change_percentage_24h_usd ?? 0)} sub="global" />
    </section>
  );
}

async function AiSummarySection() {
  const summary = await getSummary();
  return (
    <section className="max-w-6xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8 shadow-xl">
      <div className="flex items-center gap-3 mb-3">
        <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-500 text-black">GROQ AI</span>
        <span className="text-xs text-zinc-500">groq/compound · cached 60m</span>
      </div>
      <h2 className="text-xl font-bold mb-2">TA Direction & Patterns — Brief Summary</h2>
      <div className="prose prose-invert text-zinc-200 whitespace-pre-wrap leading-relaxed">
        {summary}
      </div>
    </section>
  );
}

async function AdaRundownSection() {
  const { markets, global } = await getDashboardData();
  const m = await getSummaryMetrics();
  const ada = markets.find((x) => x.id === "cardano");
  const btc = markets.find((x) => x.id === "bitcoin");
  const btcDom = global.data.market_cap_percentage["btc"] ?? 0;

  const [adaIndR] = await Promise.allSettled([getCoinIndicators("cardano")]);
  const ind =
    adaIndR.status === "fulfilled" ? (adaIndR.value ?? undefined) : undefined;

  const chg24 = ada?.price_change_percentage_24h ?? 0;
  const chg7 = ada?.price_change_percentage_7d ?? 0;

  const trendColor = ind?.trend == null
    ? "bg-zinc-800 text-zinc-300"
    : ind.trend === "Bullish"
      ? "bg-emerald-900 text-emerald-300 border-emerald-700"
      : ind.trend === "Bearish"
        ? "bg-rose-900 text-rose-300 border-rose-700"
        : "bg-amber-900 text-amber-300 border-amber-700";

  const macdColor = !ind
    ? "bg-zinc-800 text-zinc-300"
    : ind.macdState === "Bull"
      ? "bg-emerald-900 text-emerald-300 border-emerald-700"
      : ind.macdState === "Bear"
        ? "bg-rose-900 text-rose-300 border-rose-700"
        : "bg-amber-900 text-amber-300 border-amber-700";

  const rsiVal = ind?.rsi14;
  const rsiColor = rsiVal == null
    ? "bg-zinc-800 text-zinc-300"
    : rsiVal > 70
      ? "bg-rose-900 text-rose-300 border-rose-700"
      : rsiVal < 30
        ? "bg-emerald-900 text-emerald-300 border-emerald-700"
        : "bg-zinc-800 text-zinc-300";

  const bbPct = ind?.bbPosition == null
    ? null
    : Math.round(Math.max(0, Math.min(1, ind.bbPosition)) * 100);
  const bbLabel = ind?.bbPosition == null
    ? "—"
    : ind.bbPosition > 1
      ? `Above U ${bbPct}%`
      : ind.bbPosition < 0
        ? `Below L ${bbPct}%`
        : ind.bbPosition > 0.8
          ? `High ${bbPct}%`
          : ind.bbPosition < 0.2
            ? `Low ${bbPct}%`
            : `Mid ${bbPct}%`;
  const bbColor = !ind
    ? "bg-zinc-800 text-zinc-300"
    : ind.bbPosition > 0.8
      ? "bg-amber-900 text-amber-300 border-amber-700"
      : ind.bbPosition < 0.2
        ? "bg-emerald-900 text-emerald-300 border-emerald-700"
        : "bg-zinc-800 text-zinc-300";

  const adaBtcChange =
    btc && ada ? ((ada.current_price / btc.current_price) / m.adaBtc - 1) * 100 : 0;

  const narrative = ind
    ? [
        ind.trend === "Bullish" ? "EMA alignment bullish (price > 20 > 50 EMA)." : ind.trend === "Bearish" ? "EMA alignment bearish (price < 20 < 50 EMA)." : "EMA alignment mixed; no clear trend.",
        ind.rsi14 >= 70 ? `RSI ${ind.rsi14.toFixed(1)} overbought; pullback risk.` : ind.rsi14 <= 30 ? `RSI ${ind.rsi14.toFixed(1)} oversold; bounce possible.` : `RSI ${ind.rsi14.toFixed(1)} neutral.`,
        ind.macdState === "Bull" ? "MACD above zero with positive histogram; bullish momentum." : ind.macdState === "Bear" ? "MACD below zero with negative histogram; bearish momentum." : "MACD momentum mixed / turning; no clean signal.",
        ind.bbPosition > 1 ? `Price ${((ind.bbPosition - 1) * 100).toFixed(0)}% above upper Bollinger band — overextended.` : ind.bbPosition < 0 ? `Price ${(ind.bbPosition * 100).toFixed(0)}% below lower Bollinger band — deeply oversold.` : `Price at ${bbPct ?? 0}% up the Bollinger band range.`,
      ].join(" ")
    : "Waiting for ADA indicator data…";

  const spark = ind?.sparkline;

  return (
    <>
      {/* ADA hero — the focal point */}
      <section className="max-w-6xl mx-auto mb-4">
        <div className="bg-gradient-to-br from-amber-900/30 to-zinc-950 border border-amber-700/40 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {ada ? <Image src={ada.image} alt="Cardano" width={48} height={48} className="w-12 h-12 rounded-full shadow-md" unoptimized /> : null}
            <div>
              <h2 className="text-xl font-extrabold leading-none">Cardano (ADA)</h2>
              <div className="text-xs text-zinc-400">Primary focus · live TA</div>
            </div>
          </div>
          <div className="text-4xl font-extrabold text-amber-400 mb-1">
            {ada ? `$${ada.current_price.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : "—"}
          </div>
          <div className="flex gap-3 text-sm">
            <span className={chg24 >= 0 ? "text-emerald-400" : "text-rose-400"}>24h {chg24 >= 0 ? "+" : ""}{chg24.toFixed(2)}%</span>
            <span className={chg7 >= 0 ? "text-emerald-400" : "text-rose-400"}>7d {chg7 >= 0 ? "+" : ""}{chg7.toFixed(2)}%</span>
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <SignalBadge label="Trend" value={ind?.trend ?? "—"} color={trendColor} />
            <SignalBadge label="RSI" value={rsiVal == null ? "—" : rsiVal.toFixed(1)} color={rsiColor} />
            <SignalBadge label="MACD" value={ind?.macdState ?? "—"} color={macdColor} />
            <SignalBadge label="Bollinger" value={bbLabel} color={bbColor} />
            <SignalBadge
              label="Divergence"
              value={(() => {
                if (!ind?.sparkline) return "—";
                const d = detectDivergence(ind.sparkline);
                return d ? d.divergence === "None" ? "None" : `${d.divergence} ×${d.strength}` : "—";
              })()}
              color={
                (() => {
                  if (!ind?.sparkline) return "bg-zinc-800 text-zinc-300";
                  const d = detectDivergence(ind.sparkline);
                  if (!d) return "bg-zinc-800 text-zinc-300";
                  return d.divergence === "Bull"
                    ? "bg-emerald-900 text-emerald-300 border-emerald-700"
                    : d.divergence === "Bear"
                      ? "bg-rose-900 text-rose-300 border-rose-700"
                      : "bg-zinc-800 text-zinc-300";
                })()
              }
            />
          </div>
          <div className="mt-3 text-[12px] text-zinc-400 leading-snug border-t border-amber-700/20 pt-3">
            {narrative}
          </div>
          {spark ? <Sparkline data={spark} /> : null}
        </div>
      </section>

      {/* Brief rundown: ADA · ADA/BTC · BTC dominance */}
      <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <RundownMetric title="ADA / BTC" sub="Cardano vs Bitcoin" value={`₿${m.adaBtc.toFixed(8)}`} detail={adaBtcChange >= 0 ? `+${adaBtcChange.toFixed(2)}% vs these levels` : `${adaBtcChange.toFixed(2)}% vs these levels`} />
        <RundownMetric title="BTC Dominance" sub="of total market cap" value={`${btcDom.toFixed(1)}%`} detail="Bitcoin's weight in the market" />
        <RundownMetric title="Altcoin Season" sub="top coins beating BTC (30d)" value={String(m.altSeasonIndex)} detail={`${m.seasonLabel}`} />
      </section>
    </>
  );
}

function RundownMetric({ title, value, sub, detail }: { title: string; value: string; sub: string; detail: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg">
      <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">{title}</div>
      <div className="text-2xl font-extrabold text-amber-400">{value}</div>
      <div className="text-xs text-zinc-400">{sub}</div>
      <div className="mt-2 text-[11px] text-zinc-500 leading-snug">{detail}</div>
    </div>
  );
}

function Sparkline({ data }: { data?: number[] }) {
  if (!data || data.length < 2) return null;
  const w = 260, h = 40, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 mt-3" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function RundownSkeleton() {
  return (
    <>
      <section className="max-w-6xl mx-auto mb-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 animate-pulse h-44" />
      </section>
      <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse h-28" />
        ))}
      </section>
    </>
  );
}

async function CoinsSection() {
  const { markets } = await getDashboardData();
  const btc = markets.find((m) => m.id === "bitcoin");

  // Fetch TA indicators for BTC (throttled + cached 2h via CoinGecko)
  const [btcInd] = await Promise.allSettled([
    getCoinIndicators("bitcoin"),
  ]);

  const ind = (r: PromiseSettledResult<CoinIndicators | null>) =>
    r.status === "fulfilled" ? (r.value ?? undefined) : undefined;

  return (
    <section className="max-w-6xl mx-auto grid grid-cols-1 gap-4">
      <CoinCard coin={btc} label="BTC / USD" ind={ind(btcInd)} />
    </section>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse h-28" />
      ))}
    </section>
  );
}

function SummarySkeleton() {
  return (
    <section className="max-w-6xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8 animate-pulse">
      <div className="h-4 w-24 bg-zinc-800 rounded mb-4" />
      <div className="h-4 w-1/2 bg-zinc-800 rounded mb-3" />
      <div className="h-4 w-3/4 bg-zinc-800 rounded mb-3" />
      <div className="h-4 w-2/3 bg-zinc-800 rounded" />
    </section>
  );
}

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function OverviewCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-lg hover:border-zinc-600 transition">
      <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">{title}</div>
      <div className="text-2xl font-extrabold text-amber-400">{value}</div>
      <div className="text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

function CoinCard({ coin, label, ind }: { coin?: CoinMarket; label: string; ind?: CoinIndicators }) {
  if (!coin) {
    return <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-zinc-500">{label} — no data</div>;
  }
  const chg24 = coin.price_change_percentage_24h ?? 0;
  const chg7 = coin.price_change_percentage_7d ?? 0;
  const positive = chg24 >= 0;

  const rsiVal = ind?.rsi14;
  const rsiLabel = rsiVal == null ? "—" : rsiVal.toFixed(1);
  const rsiColor = rsiVal == null
    ? "bg-zinc-800 text-zinc-300"
    : rsiVal > 70
      ? "bg-rose-900 text-rose-300 border-rose-700"
      : rsiVal < 30
        ? "bg-emerald-900 text-emerald-300 border-emerald-700"
        : "bg-zinc-800 text-zinc-300";

  const macdLabel = ind?.macdState ?? "—";
  const macdColor = !ind
    ? "bg-zinc-800 text-zinc-300"
    : macdLabel === "Bull"
      ? "bg-emerald-900 text-emerald-300 border-emerald-700"
      : macdLabel === "Bear"
        ? "bg-rose-900 text-rose-300 border-rose-700"
        : "bg-amber-900 text-amber-300 border-amber-700";

  // Bollinger band position: where price sits within the lower→upper range.
  const bbPct = ind?.bbPosition == null
    ? null
    : Math.round(Math.max(0, Math.min(1, ind.bbPosition)) * 100);
  const bbLabel = ind?.bbPosition == null
    ? "—"
    : ind.bbPosition > 1
      ? `Above U ${bbPct}%`
      : ind.bbPosition < 0
        ? `Below L ${bbPct}%`
        : ind.bbPosition > 0.8
          ? `High ${bbPct}%`
          : ind.bbPosition < 0.2
            ? `Low ${bbPct}%`
            : `Mid ${bbPct}%`;
  const bbColor = ind?.bbPosition == null
    ? "bg-zinc-800 text-zinc-300"
    : ind.bbPosition > 0.8
      ? "bg-amber-900 text-amber-300 border-amber-700"
      : ind.bbPosition < 0.2
        ? "bg-emerald-900 text-emerald-300 border-emerald-700"
        : "bg-zinc-800 text-zinc-300";

  const trendLabel = ind?.trend ?? "—";
  const trendColor = ind?.trend == null
    ? "bg-zinc-800 text-zinc-300"
    : ind.trend === "Bullish"
      ? "bg-emerald-900 text-emerald-300 border-emerald-700"
      : ind.trend === "Bearish"
        ? "bg-rose-900 text-rose-300 border-rose-700"
        : "bg-amber-900 text-amber-300 border-amber-700";

  const narrative = ind
    ? [
        ind.trend === "Bullish" ? "EMA alignment bullish (price > 20 > 50 EMA)." : ind.trend === "Bearish" ? "EMA alignment bearish (price < 20 < 50 EMA)." : "EMA alignment mixed; no clear trend.",
        ind.rsi14 >= 70 ? `RSI ${ind.rsi14.toFixed(1)} overbought; pullback risk.` : ind.rsi14 <= 30 ? `RSI ${ind.rsi14.toFixed(1)} oversold; bounce possible.` : `RSI ${ind.rsi14.toFixed(1)} neutral.`,
        ind.macdState === "Bull" ? "MACD above zero with positive histogram; bullish momentum." : ind.macdState === "Bear" ? "MACD below zero with negative histogram; bearish momentum." : "MACD momentum mixed / turning; no clean signal.",
        ind.bbPosition > 1 ? `Price ${((ind.bbPosition - 1) * 100).toFixed(0)}% above upper Bollinger band — overextended.` : ind.bbPosition < 0 ? `Price ${((ind.bbPosition) * 100).toFixed(0)}% below lower Bollinger band — deeply oversold.` : `Price at ${bbPct}% up the Bollinger band range.`,
      ].join(" ")
    : chg24 > 2
      ? "Price above 20-day EMA; momentum positive. Watch for resistance at recent highs."
      : chg24 < -2
        ? "Price below support; volume rising on downside. Caution near key levels."
        : "Consolidating between support/resistance. Wait for breakout confirmation.";

  return (
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl hover:border-zinc-600 transition">
      <div className="flex items-center gap-3 mb-4">
        <Image src={coin.image} alt={coin.name} width={40} height={40} className="w-10 h-10 rounded-full shadow-md" unoptimized />
        <div>
          <h3 className="text-lg font-bold leading-none">{label}</h3>
          <div className="text-xs text-zinc-400">{coin.name}</div>
        </div>
      </div>

      <div className="text-3xl font-extrabold mb-1">${coin.current_price.toLocaleString("en-US", { maximumFractionDigits: coin.current_price < 1 ? 4 : 2 })}</div>
      <div className="flex gap-3 text-sm mb-4">
        <span className={positive ? "text-emerald-400" : "text-rose-400"}>
          24h {positive ? "+" : ""}{chg24.toFixed(2)}%
        </span>
        <span className="text-zinc-500">7d {chg7 >= 0 ? "+" : ""}{chg7.toFixed(2)}%</span>
      </div>

      <div className="space-y-2 text-xs text-zinc-400">
        <div className="flex justify-between"><span>Market Cap</span> <span className="text-zinc-200">${(coin.market_cap / 1e9).toFixed(2)}B</span></div>
        <div className="flex justify-between"><span>Rank</span> <span className="text-zinc-200">#{coin.market_cap_rank}</span></div>
        <div className="flex justify-between"><span>24h Vol</span> <span className="text-zinc-200">${(coin.total_volume / 1e6).toFixed(1)}M</span></div>
      </div>

      <div className="mt-4 pt-3 border-t border-zinc-800">
        <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">TA Pattern Signal</div>
        <div className="flex gap-2 flex-wrap">
          <SignalBadge label="Trend" value={trendLabel} color={trendColor} />
          <SignalBadge label="RSI" value={rsiLabel} color={rsiColor} />
          <SignalBadge label="MACD" value={macdLabel} color={macdColor} />
          <SignalBadge label="Bollinger" value={bbLabel} color={bbColor} />
          <SignalBadge
            label="Divergence"
            value={(() => {
              if (!ind?.sparkline) return "—";
              const d = detectDivergence(ind.sparkline);
              return d ? d.divergence === "None" ? "None" : `${d.divergence} ×${d.strength}` : "—";
            })()}
            color={
              (() => {
                if (!ind?.sparkline) return "bg-zinc-800 text-zinc-300";
                const d = detectDivergence(ind.sparkline);
                if (!d) return "bg-zinc-800 text-zinc-300";
                return d.divergence === "Bull"
                  ? "bg-emerald-900 text-emerald-300 border-emerald-700"
                  : d.divergence === "Bear"
                    ? "bg-rose-900 text-rose-300 border-rose-700"
                    : "bg-zinc-800 text-zinc-300";
              })()
            }
          />
        </div>
        <div className="mt-2 text-[11px] text-zinc-500 leading-snug">
          {narrative}
        </div>
        <Sparkline data={ind?.sparkline} />
      </div>
    </div>
  );
}

function SignalBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${color}`}>
      {label}: {value}
    </div>
  );
}
