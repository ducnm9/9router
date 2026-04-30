import { NextResponse } from "next/server";
import { getHiddenModels, setHiddenModels } from "@/models";

export const dynamic = "force-dynamic";

// GET /api/models/visibility - Get hidden models list
export async function GET() {
  try {
    const hiddenModels = await getHiddenModels();
    return NextResponse.json({ hiddenModels });
  } catch (error) {
    console.log("Error fetching hidden models:", error);
    return NextResponse.json({ error: "Failed to fetch hidden models" }, { status: 500 });
  }
}

// PUT /api/models/visibility - Update hidden models list
export async function PUT(request) {
  try {
    const { hiddenModels } = await request.json();
    if (!Array.isArray(hiddenModels)) {
      return NextResponse.json({ error: "hiddenModels must be an array" }, { status: 400 });
    }
    const updated = await setHiddenModels(hiddenModels);
    return NextResponse.json({ hiddenModels: updated });
  } catch (error) {
    console.log("Error updating hidden models:", error);
    return NextResponse.json({ error: "Failed to update hidden models" }, { status: 500 });
  }
}
