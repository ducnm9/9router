// src/app/api/users/[id]/route.js
import { NextResponse } from "next/server";
import { getUserById, updateUser, deleteUser, getUsers } from "@/lib/db/index.js";
import { logAuditEvent } from "@/lib/db/repos/auditRepo.js";
import { getRoleNames } from "@/lib/rbac.js";
import { getSessionRole } from "@/lib/auth/getSessionRole.js";

// GET /api/users/[id] - Get single user
export async function GET(request, { params }) {
  try {
    const sessionRole = await getSessionRole();
    if (sessionRole !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { id } = await params;
    const user = await getUserById(id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const { oidcSub, ...safe } = user;
    return NextResponse.json(safe);
  } catch (err) {
    console.error("Error fetching user:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/users/[id] - Update user
export async function PUT(request, { params }) {
  try {
    const sessionRole = await getSessionRole();
    if (sessionRole !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { id } = await params;
    const user = await getUserById(id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const updates = await request.json();
    const allowedFields = ["name", "role", "isActive"];
    const filtered = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }

    if (filtered.role) {
      const validRoles = getRoleNames();
      if (!validRoles.includes(filtered.role)) {
        return NextResponse.json(
          { error: `role must be one of: ${validRoles.join(", ")}` },
          { status: 400 }
        );
      }
      // Prevent removing admin role from the last admin
      if (filtered.role !== "admin" && user.role === "admin") {
        const allUsers = await getUsers();
        const adminCount = allUsers.filter(u => u.role === "admin").length;
        if (adminCount <= 1) {
          return NextResponse.json(
            { error: "Cannot remove admin role from the last admin" },
            { status: 409 }
          );
        }
      }
    }

    const updated = await updateUser(id, filtered);
    await logAuditEvent({
      action: "user.updated",
      resource: "user",
      resourceId: id,
      details: filtered,
    });
    const { oidcSub, ...safe } = updated;
    return NextResponse.json(safe);
  } catch (err) {
    console.error("Error updating user:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/users/[id] - Delete user
export async function DELETE(request, { params }) {
  try {
    const sessionRole = await getSessionRole();
    if (sessionRole !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { id } = await params;
    const user = await getUserById(id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Prevent deleting the last admin
    if (user.role === "admin") {
      const allUsers = await getUsers();
      const adminCount = allUsers.filter(u => u.role === "admin").length;
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last admin user" },
          { status: 409 }
        );
      }
    }

    await deleteUser(id);
    await logAuditEvent({
      action: "user.deleted",
      resource: "user",
      resourceId: id,
      details: { email: user.email },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting user:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
