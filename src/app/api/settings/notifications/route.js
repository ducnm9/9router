// src/app/api/settings/notifications/route.js
import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { getNotifier, Notifier } from "@/lib/notifier.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      channels: settings.notificationChannels || [],
      enabled: settings.notificationsEnabled || false,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { channels, enabled } = await request.json();
    await updateSettings({
      notificationChannels: channels || [],
      notificationsEnabled: enabled ?? false,
    });

    // Update singleton with new channels
    const notifier = getNotifier();
    notifier.setChannels(channels || []);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    // Send a test notification to verify webhook works
    const { channel } = await request.json();
    if (!channel?.url) {
      return NextResponse.json({ error: "channel.url is required" }, { status: 400 });
    }

    const testNotifier = new Notifier({ cooldownMs: 0 });
    testNotifier.addChannel(channel);
    await testNotifier.send({
      event: "test",
      keyName: "test-key",
      usage: 42,
      limit: 100,
      unit: "tokens",
    });

    return NextResponse.json({ success: true, message: "Test notification sent" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
