// Google sign-in. The client gets an ID token from Google Identity Services; the server asks Google's tokeninfo
// endpoint to check it (signature, expiry), then checks it was issued for our client id. The account id is derived
// from Google's stable user id (sub), never from the email. Off unless GOOGLE_CLIENT_ID is set.
import { createHash } from "node:crypto";

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
/** Once Google sign-in is on, new characters need it: a guest (this browser's token) may keep playing the character it
 *  already has, but not start one — a guest cannot move devices, a Google account can. Read at call time (tests). */
export const googleRequired = () => process.env.REQUIRE_GOOGLE_SIGNUP === "1";
export const NEW_NEEDS_GOOGLE = "ตัวละครใหม่ต้องเข้าสู่ระบบด้วย Google";
export async function googleAccount(idToken: string): Promise<{ acc: string; email: string } | null> {
  if (!GOOGLE_CLIENT_ID || !idToken) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken));
    if (!r.ok) return null;
    const t = await r.json() as Record<string, string | boolean>;
    if (t.aud !== GOOGLE_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(String(t.iss))) return null;
    if (t.email_verified !== true && t.email_verified !== "true") return null;
    return { acc: "g_" + createHash("sha256").update(String(t.sub)).digest("hex").slice(0, 24), email: String(t.email ?? "") };
  } catch { return null; }
}

/** Resolve the same account identity for both character listing and room admission. */
export async function loginAccount(token: string, idToken: string) {
  if (idToken) return (await googleAccount(idToken))?.acc;
  return token.length >= 8 ? createHash("sha256").update(token).digest("hex").slice(0, 24) : undefined;
}
