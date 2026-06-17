// src/app/api/users/route.js
import { NextResponse } from "next/server";
import { getUsers, createUser } from "@/lib/db/index.js";
import { logAuditEvent } from "@/lib/db/repos/auditRepo.js";
import { getRoleNames } from "@/lib/rbac.js";

export const dynamic = "force-dynamic";

// GET /api/users - List all users
export async function GET() {
  try {
    const users = await getUsers();
    // Never expose sensitive fields
    const safe = users.map(({ id, email, name, role, avatarUrl, lastLoginAt, createdAt, isActive }) => ({
      id, email, name, role, avatarUrl, lastLoginAt, createdAt, isActive,
    }));
    return NextResponse.json(safe);
  } catch (err) {
    console.log("Error fetching users:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/users - Create a new user
export async function POST(request) {
  try {
    const { email, name, role } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const validRoles = getRoleNames();
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `role must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }
    const user = await createUser({ email, name, role: role || "member" });
    await logAuditEvent({
      action: "user.created",
      resource: "user",
      resourceId: user.id,
      details: { email, role: user.role },
    });
    const { oidcSub, ...safe } = user;
    return NextResponse.json(safe, { status: 201 });
  } catch (err) {
    console.log("Error creating user:", err);
    if (err.message?.includes("email already exists")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
