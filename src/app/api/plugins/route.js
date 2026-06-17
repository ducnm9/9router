import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/localDb";
import { verifyDashboardAuthToken } from "@/lib/auth/dashboardSession";
import { getLoadedPlugins, loadPlugins, unloadPlugins } from "@/lib/plugins/loader.js";
import { getRegisteredHooks } from "@/lib/plugins/hooks.js";

async function requireAuth() {
  const settings = await getSettings();
  if (settings.requireLogin !== false) {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!(await verifyDashboardAuthToken(token))) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  }
  return null;
}

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  return NextResponse.json({
    plugins: getLoadedPlugins(),
    hooks: getRegisteredHooks(),
  });
}

export async function POST(request) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { action } = await request.json();
    if (action === "reload") {
      await unloadPlugins();
      const results = await loadPlugins();
      return NextResponse.json({ success: true, results, plugins: getLoadedPlugins() });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
