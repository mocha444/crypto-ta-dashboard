import { NextResponse } from "next/server";
import { getSummary } from "@/lib/summary";

/**
 * GET /api/ai-summary
 * Returns an AI-generated short TA summary for BTC, ALT index, and BTC dominance.
 * Falls back to a plain indicator summary (computed from cached data) when Groq
 * is unavailable or the rate limit is hit.
 */
export async function GET() {
  try {
    const summary = await getSummary();
    return NextResponse.json({ summary, ai: true });
  } catch (err) {
    console.error("[/api/ai-summary] error:", err);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 502 });
  }
}
