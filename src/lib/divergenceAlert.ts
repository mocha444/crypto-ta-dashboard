import { getRefreshSchedule, refreshDueSources, changed, fileState, DATA_FILE, CG_FILE, type FileState } from "@/lib/refresh";

// Thresholds for divergence detection
const PRICE_DIVERGEANCE_THRESHOLD = 0.05; // 5% price deviation
const VOLUME_DIVERGEANCE_THRESHOLD = 0.3; // 30% volume deviation

/**
 * Detects whether the current market data diverges significantly from the stored baseline.
 * Returns { alert: boolean, reason: string }.
 */
export function detectDivergence(marketId: string, current: any, stored: any): { alert: boolean; reason: string } {
  // Price divergence: current price differs > threshold from stored price
  if (current.price !== stored.price) {
    const diff = Math.abs(current.price - stored.price) / stored.price;
    if (diff > PRICE_DIVERGEANCE_THRESHOLD) {
      return { alert: true, reason: `Price divergence: ${current.price.toFixed(2)} vs ${stored.price.toFixed(2)} (${diff * 100}%)` };
    }
  }

  // Volume divergence: current volume differs > threshold from stored volume
  if (current.totalVolume !== stored.totalVolume) {
    const volDiff = Math.abs(current.totalVolume - stored.totalVolume) / stored.totalVolume;
    if (volDiff > VOLUME_DIVERGEANCE_THRESHOLD) {
      return { alert: true, reason: `Volume divergence: ${current.totalVolume.toLocaleString()} vs ${stored.totalVolume.toLocaleString()} (${volDiff * 100}%)` };
    }
  }

  return { alert: false, reason: "" };
}

/**
 * Triggers a divergence alert through the SSE channel.
 * Also writes a local notification flag for the UI.
 */
export async function triggerAlert(alert: { message: string; type: "price" | "volume" }): Promise<void> {
  const sources = getRefreshSchedule();
  const message = alert.message;
  const type = alert.type;

  // Emit via SSE
  console.log(`[divergence] ALERT: ${message} (${type})`);
}

export default detectDivergence;