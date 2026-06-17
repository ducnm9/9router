import { NextResponse } from "next/server";
import { getHealthTracker } from "@/lib/providerHealth.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function GET(request) {
  const tracker = getHealthTracker();
  const url = new URL(request.url);
  const providerId = url.searchParams.get("provider");
  const view = url.searchParams.get("view");

  if (providerId) {
    return NextResponse.json(tracker.getHealth(providerId), { headers: CORS_HEADERS });
  }

  if (view === "ranked") {
    return NextResponse.json(tracker.getRankedProviders(), { headers: CORS_HEADERS });
  }

  return NextResponse.json(tracker.getAllHealth(), { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
