import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/coingecko";

/**
 * GET /api/markets
 * Optional query: ?ids=bitcoin,ethereum,cardano...
 * Returns cached markets + global data.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").map((s) => s.trim()) : undefined;
  const force = searchParams.get("refresh") === "1";

  try {
    const data = await getDashboardData(ids, force);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/markets] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 502 }
    );
  }
}