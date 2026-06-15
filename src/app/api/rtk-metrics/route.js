import { NextResponse } from "next/server";
import { getRtkSummary } from "../../../../open-sse/rtk/metricsStore.js";

export async function GET() {
  try {
    const summary = getRtkSummary();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
