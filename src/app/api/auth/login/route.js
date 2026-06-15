import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";

// Startup warning: production with default/unset password
const KNOWN_DEFAULT_PASSWORDS = ["123456", "change-me"];
if (process.env.NODE_ENV === "production") {
  const initialPwd = process.env.INITIAL_PASSWORD;
  if (!initialPwd || KNOWN_DEFAULT_PASSWORDS.includes(initialPwd)) {
    console.warn(
      "[SECURITY WARNING] NODE_ENV=production but INITIAL_PASSWORD is unset or matches a known default. " +
      "Please set a strong INITIAL_PASSWORD environment variable or set a password via the dashboard."
    );
  }
}

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "9router-default-secret-change-me"
);

function isTunnelRequest(request, settings) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const tunnelHost = settings.tunnelUrl ? new URL(settings.tunnelUrl).hostname.toLowerCase() : "";
  const tailscaleHost = settings.tailscaleUrl ? new URL(settings.tailscaleUrl).hostname.toLowerCase() : "";
  return (tunnelHost && host === tunnelHost) || (tailscaleHost && host === tailscaleHost);
}

export async function POST(request) {
  try {
    const { password } = await request.json();
    const settings = await getSettings();

    // Block login via tunnel/tailscale if dashboard access is disabled
    if (isTunnelRequest(request, settings) && settings.tunnelDashboardAccess !== true) {
      return NextResponse.json({ error: "Dashboard access via tunnel is disabled" }, { status: 403 });
    }

    // Default password is '123456' if not set
    const storedHash = settings.password;
    const isProduction = process.env.NODE_ENV === "production";

    let isValid = false;
    if (storedHash) {
      isValid = await bcrypt.compare(password, storedHash);
    } else {
      // Use env var or default
      const initialPassword = process.env.INITIAL_PASSWORD || "123456";

      // Block default passwords in production when no stored hash exists
      if (isProduction && KNOWN_DEFAULT_PASSWORDS.includes(initialPassword)) {
        return NextResponse.json(
          { success: false, error: "Default password is not allowed in production. Please set INITIAL_PASSWORD environment variable." },
          { status: 403 }
        );
      }

      isValid = password === initialPassword;
    }

    if (isValid) {
      const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true" || (isProduction && process.env.AUTH_COOKIE_SECURE !== "false");
      const forwardedProto = request.headers.get("x-forwarded-proto");
      const isHttpsRequest = forwardedProto === "https";
      const useSecureCookie = forceSecureCookie || isHttpsRequest;

      const token = await new SignJWT({ authenticated: true })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("24h")
        .sign(SECRET);

      const cookieStore = await cookies();
      cookieStore.set("auth_token", token, {
        httpOnly: true,
        secure: useSecureCookie,
        sameSite: "lax",
        path: "/",
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
