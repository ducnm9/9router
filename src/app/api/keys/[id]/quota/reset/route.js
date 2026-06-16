import { NextResponse } from "next/server";
import { getApiKeyById } from "@/lib/localDb";
import { resetCounter } from "@/lib/quotaDb";

export async function POST(request, { params }) {
  const { id } = await params;
  const keyConfig = await getApiKeyById(id);

  if (!keyConfig) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  await resetCounter(id);

  return NextResponse.json({ keyId: id, message: "Quota counter reset successfully" });
}
