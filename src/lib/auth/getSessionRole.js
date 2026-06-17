// src/lib/auth/getSessionRole.js
import { cookies } from "next/headers";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession.js";
import { getUserByOidcSub } from "@/lib/db/repos/userRepo.js";

/**
 * Resolve the current request's role from the auth_token cookie.
 * - Password sessions have no oidcSub → treated as admin (single admin account).
 * - OIDC sessions carry oidcSub → DB user role is returned.
 * Returns null if there is no valid session or the OIDC user cannot be found.
 */
export async function getSessionRole() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  const session = await getDashboardAuthSession(token);
  if (!session) return null;
  if (session.oidc && session.oidcSub) {
    const user = await getUserByOidcSub(session.oidcSub);
    return user?.role ?? null;
  }
  // Password login = single admin user
  return "admin";
}
