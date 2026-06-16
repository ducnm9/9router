import bcrypt from "bcryptjs";
import { getSettings } from "@/lib/localDb";

/**
 * Verify a plain-text password against the stored dashboard password hash.
 * Returns true if the password is valid, false otherwise.
 */
export async function verifyDashboardPassword(password) {
  if (!password) return false;

  const settings = await getSettings();
  const storedHash = settings.password;

  if (storedHash) {
    return bcrypt.compare(password, storedHash);
  }

  // Fallback: compare against initial/default password
  const initialPassword = process.env.INITIAL_PASSWORD || "123456";
  return password === initialPassword;
}
