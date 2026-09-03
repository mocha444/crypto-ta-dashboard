/**
 * Classic technical-analysis helpers.  All functions accept plain arrays and
 * return numbers or arrays.  Intended to be used in the browser with data
 * coming from CoinGecko (price arrays) or computed server-side.
 *
 * NOTE: For simplicity we treat CoinGecko daily arrays (timestamp, price) as
 * `close` series.  In a real TA app you would pass true OHLCV series.
 */

import { getCoinHistory, type CoinHistory } from "@/lib/coingecko";

const last = <T,>(arr: T[]): T => arr[arr.length - 1];

/** Computed indicators for a single coin at the latest point. */
export interface CoinIndicators {
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  macdState: "Bull" | "Bear" | "Neutral";
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbPosition: number;   // 0 = at lower band, 1 = at upper band, >1 = above upper
  currentPrice: number;
  ema20: number;
  ema50: number;
  ema200: number;
  trend: "Bullish" | "Bearish" | "Neutral";
  sparkline: number[];  // ~30 most recent daily closes, oldest → newest
}

/**
 * Fetch 60 days of price history for a coin and compute RSI, MACD, Bollinger
 * Bands, EMA trend, and a sparkline at the latest data point.
 */
export async function getCoinIndicators(id: string): Promise<CoinIndicators | null> {
  try {
    const hist = await getCoinHistory(id, "usd", 200);
    const prices = hist.prices.map(([, p]) => p);
    if (prices.length < 60) return null;

    const rsi14Arr = rsi(prices, 14);
    const macdObj = macd(prices);
    const bbObj = bollingerBands(prices);
    const i = prices.length - 1;

    const macdLine = macdObj.macd[i];
    const macdSignal = macdObj.signal[i];
    const macdHistogram = macdObj.histogram[i];
    const macdState =
      !Number.isNaN(macdLine) && !Number.isNaN(macdSignal) && !Number.isNaN(macdHistogram)
        ? macdLine > 0 && macdHistogram > 0
          ? "Bull"
          : macdLine < 0 && macdHistogram < 0
            ? "Bear"
            : "Neutral"
        : "Neutral";

    const bbPosition = bbObj.upper[i] === bbObj.lower[i]
      ? 0.5
      : (prices[i] - bbObj.lower[i]) / (bbObj.upper[i] - bbObj.lower[i]);

    const ema20 = last(ema(prices, 20));
    const ema50 = last(ema(prices, 50));
    const ema200 = prices.length >= 200 ? last(ema(prices, 200)) : NaN;
    const price = prices[i];
    const trend =
      !Number.isNaN(ema20) && !Number.isNaN(ema50) && price > ema20 && ema20 > ema50
        ? "Bullish"
        : !Number.isNaN(ema20) && !Number.isNaN(ema50) && price < ema20 && ema20 < ema50
          ? "Bearish"
          : "Neutral";

    return {
      rsi14: rsi14Arr[i],
      macdLine,
      macdSignal,
      macdHistogram,
      macdState,
      bbUpper: bbObj.upper[i],
      bbMiddle: bbObj.middle[i],
      bbLower: bbObj.lower[i],
      bbPosition,
      currentPrice: price,
      ema20,
      ema50,
      ema200,
      trend,
      sparkline: prices.slice(-30),
    };
  } catch {
    return null;
  }
}

/**
 * Simple Moving Average
 * @param values number[]
 * @param period look-back window
 * @returns number[] same length, padded with NaN
 */
export function sma(values: number[], period: number): number[] {
  if (period <= 0) return values.map(() => NaN);
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j];
    out.push(sum / period);
  }
  return out;
}

/**
 * Exponential Moving Average
 * @param values number[]
 * @param period look-back window
 * @returns number[] same length
 */
export function ema(values: number[], period: number): number[] {
  if (period <= 0) return values.map(() => NaN);
  const out: number[] = [];
  // Seed with the SMA of the first `period` values for a proper warm-up,
  // leaving the earliest points as NaN like `sma` does.
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(NaN);
      continue;
    }
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      out.push(sum / period);
      continue;
    }
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

/**
 * Relative Strength Index (RSI)
 * @param closes number[]
 * @param period default 14
 * @returns number[] 0-100
 */
export function rsi(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return closes.map(() => NaN);
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  const out: number[] = [];
  // RSI at closes index `j` (j >= period) uses changes[j-1]
  for (let j = 0; j < closes.length; j++) {
    if (j < period) {
      out.push(NaN);
      continue;
    }
    // use changes indices [j-period, j-1]
    let gain = 0;
    let loss = 0;
    for (let k = j - period; k < j; k++) {
      const c = changes[k];
      if (c > 0) gain += c;
      else loss += -c;
    }
    const avgGain = gain / period;
    const avgLoss = loss / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    const value = rs === Infinity ? 100 : 100 - 100 / (1 + rs);
    out.push(value);
  }
  return out;
}

/**
 * MACD (12,26,9)
 * @returns { macd: number[], signal: number[], histogram: number[] }
 */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9,
) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: number[] = [];
  const signalLine: number[] = [];
  const histogram: number[] = [];

  // First index where both EMAs are valid (after slow-EMA warm-up).
  const start = slow - 1;
  for (let i = 0; i < values.length; i++) {
    const val = emaFast[i] - emaSlow[i];
    macdLine.push(Number.isNaN(val) ? NaN : val);
  }

  // Seed the signal line with the average of the first `signal` valid macd
  // values so it starts near the action instead of dragging up from 0.
  const seedSlice = macdLine.slice(start, start + signal).filter((v) => !Number.isNaN(v));
  const seed = seedSlice.length ? seedSlice.reduce((a, b) => a + b, 0) / seedSlice.length : 0;

  for (let i = 0; i < values.length; i++) {
    if (i < start || Number.isNaN(macdLine[i])) {
      signalLine.push(NaN);
      histogram.push(NaN);
      continue;
    }
    if (i === start) {
      signalLine.push(seed);
    } else {
      const k = 2 / (signal + 1);
      signalLine.push(macdLine[i] * k + signalLine[i - 1] * (1 - k));
    }
    histogram.push(macdLine[i] - signalLine[i]);
  }
  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Bollinger Bands (20,2)
 * @returns { upper: number[], middle: number[], lower: number[] }
 */
export function bollingerBands(values: number[], period = 20, mult = 2) {
  const middle = sma(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }
    // compute std-dev of the last `period` values
    const slice = values.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance =
      slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    upper.push(mean + mult * stdDev);
    lower.push(mean - mult * stdDev);
  }
  return { upper, middle, lower };
}