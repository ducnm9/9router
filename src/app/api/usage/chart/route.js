import { NextResponse } from "next/server";
import { getChartData } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d"]);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    // "today" maps to "24h" in the DB layer
    if (period === "today") period = "24h";

    const data = await getChartData(period);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API] Failed to get chart data:", error);
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 });
  }
}
