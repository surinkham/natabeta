// Sign-in: play as a guest (an id kept in this browser) or with Google (Google Identity Services; the server checks
// the ID token). A guest can link Google later from Options: the next join carries both, and the server moves the
// guest's progress onto the Google account. Needs VITE_GOOGLE_CLIENT_ID (and GOOGLE_CLIENT_ID on the server).
const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
export const googleConfigured = () => !!CLIENT_ID;
const get = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} };
/** The Google ID token for this tab's session (null = guest), and whether this join should link the guest to it. */
export const googleToken = () => get("bk.google");
export const linkPending = () => get("bk.link") === "1";
export const clearLink = () => set("bk.link", null);
export const takeLink = () => { const l = get("bk.link") === "1"; set("bk.link", null); return l; };
export const googleEmail = () => { const t = googleToken(); if (!t) return ""; try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? ""; } catch { return ""; } };
export function signOut() { set("bk.google", null); try { localStorage.removeItem("bk.login"); google()?.accounts.id.disableAutoSelect(); } catch {} }
/** Explicitly continue as a guest even if Google was used earlier in this tab. */
export function useGuest() { set("bk.google", null); set("bk.link", null); try { localStorage.setItem("bk.login", "guest"); google()?.accounts.id.disableAutoSelect(); } catch {} }
const google = () => (window as any).google;

let gsi: Promise<any> | null = null;
function loadGsi() {
  gsi ??= new Promise((res, rej) => { const s = Object.assign(document.createElement("script"), { src: "https://accounts.google.com/gsi/client", async: true }); s.onload = () => res((window as any).google); s.onerror = rej; document.head.append(s); });
  return gsi;
}
/** Draws Google's own sign-in button into `el`; `done` runs with the account's email once signed in. */
export async function googleButton(el: HTMLElement, done: (email: string) => void, opts: { link?: boolean; prompt?: boolean } = {}) {
  if (!CLIENT_ID) { el.innerHTML = `<small>Google login ยังไม่ได้ตั้งค่า (VITE_GOOGLE_CLIENT_ID)</small>`; return; }
  const google = await loadGsi();
  google.accounts.id.initialize({ client_id: CLIENT_ID, auto_select: true, callback: (r: { credential: string }) => {
    set("bk.google", r.credential); if (opts.link) set("bk.link", "1"); try { localStorage.setItem("bk.login", "google"); } catch {} done(googleEmail());
  } });
  google.accounts.id.renderButton(el, { theme: "outline", size: "large", text: opts.link ? "continue_with" : "signin_with", locale: "th" });
  // signed in with Google before on this browser: offer it again straight away (one tap), so it is not a guest by mistake
  try { if (opts.prompt !== false && !opts.link && localStorage.getItem("bk.login") === "google") google.accounts.id.prompt(); } catch {}
}
