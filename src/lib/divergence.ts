/**
 * Trend Divergence detection.
 *
 * Compares the slope (linear-regression sign) of EMA(20) over the recent
 * sparkline window with the slope of RSI(14) over the same window.  When the
 * two slopes disagree the indicator is in divergence: price is being pushed
 * one way by trend while momentum is fading or reversing the other way.
 *
 *   - "Bullish": EMA trending up, RSI trending down  → hidden bullish / strength fading
 *                above 50 OR EMA up, RSI up but below prior peak (we treat as "no
 *                divergence" when both agree).
 *
 * We report:
 *   - emaSlope:     per-period % change of EMA(20) across the window
 *   - rsiSlope:     per-period RSI delta across the window
 *   - emaDir:       "Up" | "Down" | "Flat"
 *   - rsiDir:       "Up" | "Down" | "Flat"
 *   - divergence:   "Bull" | "Bear" | "None"
 *   - strength:     0..1 (|emaSlope|*|rsiSlope|, normalized; 0 if either is flat)
 *   - reason:       human-readable explanation
 */

const FLAT_EPS = 0.001; // EMA % slope below this counts as flat
const RSI_FLAT_EPS = 0.05; // RSI delta below this counts as flat

export type DivergenceState = "Bull" | "Bear" | "None";
export type SlopeDir = "Up" | "Down" | "Flat";

export interface DivergenceResult {
  emaSlope: number;       // % per period (e.g. 0.02 = +2%/period)
  rsiSlope: number;       // absolute RSI delta per period
  emaDir: SlopeDir;
  rsiDir: SlopeDir;
  divergence: DivergenceState;
  strength: number;       // 0..1
  reason: string;
}

/**
 * Simple ordinary-least-squares slope normalized by the mean of `ys` so it
 * returns a per-step relative change (good for % comparisons across scales).
 * Returns NaN if the input is too short or contains non-finite values.
 */
function normalizedSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return NaN;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(ys[i])) return NaN;
    sumX += i;
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  return meanY === 0 ? 0 : slope / Math.abs(meanY);
}

function classifyPct(x: number, eps: number): SlopeDir {
  if (!Number.isFinite(x) || Math.abs(x) < eps) return "Flat";
  return x > 0 ? "Up" : "Down";
}

function classifyAbs(x: number, eps: number): SlopeDir {
  if (!Number.isFinite(x) || Math.abs(x) < eps) return "Flat";
  return x > 0 ? "Up" : "Down";
}

/**
 * Compute divergence over a sparkline (oldest → newest) of closes.
 *
 * Requires at least 14 points (RSI needs warmup) and rejects if either slope
 * is non-finite.  Returns null when divergence cannot be computed — callers
 * should fall back to "—".
 */
export function detectDivergence(sparkline: number[]): DivergenceResult | null {
  if (!Array.isArray(sparkline) || sparkline.length < 14) return null;

  // Recompute EMA20 + RSI14 from the sparkline.  These can NaN early; we
  // trim to the longest valid suffix and compute slopes on that.
  const { ema: emaArr, rsi: rsiArr } = computeLocalTa(sparkline);

  // Build suffixes containing only finite values from the tail.
  const emaSuffix = trimTrailingNaN(emaArr);
  const rsiSuffix = trimTrailingNaN(rsiArr);
  if (emaSuffix.length < 5 || rsiSuffix.length < 5) return null;

  const emaSlopePct = normalizedSlope(emaSuffix);
  const rsiSlopeAbs = normalizedSlope(rsiSuffix); // RSI is already 0..100, this is a small number

  if (!Number.isFinite(emaSlopePct) || !Number.isFinite(rsiSlopeAbs)) return null;

  const emaDir = classifyPct(emaSlopePct, FLAT_EPS);
  const rsiDir = classifyAbs(rsiSlopeAbs, RSI_FLAT_EPS);

  // Divergence: trends disagree (and neither is flat).
  let divergence: DivergenceState = "None";
  if (emaDir !== "Flat" && rsiDir !== "Flat" && emaDir !== rsiDir) {
    divergence = rsiDir === "Down" && emaDir === "Up" ? "Bull" : "Bear";
  }

  // Strength: combine magnitudes.  Empirically EMA %-per-period tends to be
  // small (0.001-0.05) and RSI normalized slope is even smaller, so we scale.
  const emaMag = Math.min(1, Math.abs(emaSlopePct) * 50); // saturate at ~2%/period
  const rsiMag = Math.min(1, Math.abs(rsiSlopeAbs) * 200); // saturate at ~0.5/period
  const strength = Math.round(Math.min(1, emaMag * rsiMag + Math.max(emaMag, rsiMag) * 0.1) * 100) / 100;

  const reason =
    divergence === "Bull"
      ? "EMA trending up while RSI cooling — bullish divergence (momentum reset)."
      : divergence === "Bear"
        ? "EMA trending down while RSI rising — bearish divergence (momentum fading)."
        : emaDir === rsiDir
          ? `EMA and RSI both trending ${emaDir.toLowerCase()} — no divergence.`
          : `Mixed (EMA ${emaDir.toLowerCase()}, RSI ${rsiDir.toLowerCase()}) — no clean divergence.`;

  return {
    emaSlope: Math.round(emaSlopePct * 10000) / 10000,
    rsiSlope: Math.round(rsiSlopeAbs * 10000) / 10000,
    emaDir,
    rsiDir,
    divergence,
    strength,
    reason,
  };
}

function trimTrailingNaN(arr: number[]): number[] {
  let end = arr.length;
  while (end > 0 && !Number.isFinite(arr[end - 1])) end--;
  if (end === 0) return [];
  // also drop any NaN at the start so the slope is well-defined
  let start = 0;
  while (start < end && !Number.isFinite(arr[start])) start++;
  return arr.slice(start, end);
}

/** Local copy of the EMA + RSI used by ta.ts to avoid pulling in server-only deps. */
function computeLocalTa(prices: number[]) {
  return { ema: emaLocal(prices, 20), rsi: rsiLocal(prices, 14) };
}

function emaLocal(values: number[], period: number): number[] {
  if (period <= 0) return values.map(() => NaN);
  const out: number[] = [];
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

function rsiLocal(closes: number[], period: number): number[] {
  if (closes.length < period + 1) return closes.map(() => NaN);
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);
  const out: number[] = [];
  for (let j = 0; j < closes.length; j++) {
    if (j < period) {
      out.push(NaN);
      continue;
    }
    let gain = 0, loss = 0;
    for (let k = j - period; k < j; k++) {
      const c = changes[k];
      if (c > 0) gain += c;
      else loss += -c;
    }
    const avgGain = gain / period;
    const avgLoss = loss / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out.push(rs === Infinity ? 100 : 100 - 100 / (1 + rs));
  }
  return out;
}
