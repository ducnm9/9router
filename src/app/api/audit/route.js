// src/app/api/audit/route.js
import { NextResponse } from "next/server";
import { getAuditLogs, getAuditStats } from "@/lib/db/repos/auditRepo.js";
import { getSessionRole } from "@/lib/auth/getSessionRole.js";

export const dynamic = "force-dynamic";

// GET /api/audit - Query audit logs
export async function GET(request) {
  try {
    const sessionRole = await getSessionRole();
    if (sessionRole !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || undefined;
    const resource = url.searchParams.get("resource") || undefined;
    const userId = url.searchParams.get("userId") || undefined;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const view = url.searchParams.get("view");

    if (view === "stats") {
      const stats = await getAuditStats({ from, to });
      return NextResponse.json(stats);
    }

    const logs = await getAuditLogs({ action, resource, userId, from, to, limit, offset });
    return NextResponse.json({ logs, limit, offset, count: logs.length });
  } catch (err) {
    console.log("Error fetching audit logs:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
