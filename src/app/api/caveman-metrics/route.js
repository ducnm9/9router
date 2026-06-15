import { NextResponse } from "next/server";
import { getCavemanSummary } from "../../../../open-sse/rtk/metricsStore.js";

export async function GET() {
  try {
    const summary = getCavemanSummary();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
