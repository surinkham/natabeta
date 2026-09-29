import { tell } from "./ui/ask";
import { renderer, resize } from "./render/scene";
import { buildWorld } from "./world/world";
import { startGame } from "./game";
import { runCreator } from "./ui/creator";
import { Host, LocalHost, NetHost, netCard } from "./net/host";

document.getElementById("game")!.appendChild(renderer.domElement);
addEventListener("resize", resize); resize();

// Server: ?server=ws://host:2567 · default = same host on 2567 (dev) · ?offline=1 or the single-file artifact → in-page sim.
const q = new URLSearchParams(location.search);
// ?server= wins, then a URL baked in at build time, then: the dev server talks to port 2567, anything else assumes
// the game server is mounted at /ws on the same origin (that is how it is deployed behind Apache or a tunnel).
const ws = location.protocol === "https:" ? "wss" : "ws";
const sameOrigin = `${ws}://${location.host}${import.meta.env.BASE_URL.replace(/\/$/, "")}/ws`.replace(/([^:])\/\/+/g, "$1/");
const serverUrl = q.get("server") ?? import.meta.env.VITE_SERVER_URL ?? (location.port === "5173" ? `${ws}://${location.hostname}:2567` : sameOrigin);
/** Online play never drops into offline mode by itself: offline saves nothing, and the fresh level-1 character there
 *  looks like a lost one. While the server does not answer (restarting for a deploy, a slow network, the old session
 *  still "already online") keep retrying; offline is only a button. */
async function pickHost(c: { name: string; color: number; race: string }): Promise<Host> {
  if (q.get("offline") || (window as any).__EMBED) return new LocalHost(c);
  let card: HTMLElement | undefined, offline = false;
  for (let attempt = 1; ; attempt++) {
    try { const h = await NetHost.connect(serverUrl, c); card?.remove(); return h; }
    catch (e: any) {
      console.warn("server unreachable:", e);
      if (String(e?.message).includes("Google")) { await tell(e.message, "กดปุ่ม Google ที่หน้าเริ่มเกม"); sessionStorage.removeItem("bk.auto"); location.reload(); return new Promise<never>(() => {}); }   // new characters need Google
      if (String(e?.message).includes("ใช้ชื่อนี้ไม่ได้")) { await tell(e.message, "เลือกชื่ออื่น"); sessionStorage.removeItem("bk.auto"); location.reload(); return new Promise<never>(() => {}); }   // a reserved name
      if (!card) { card = netCard(`<b>กำลังเชื่อมต่อ server…</b><small></small><button>เล่นออฟไลน์ (ไม่บันทึกตัวละคร)</button>`); card.querySelector("button")!.addEventListener("click", () => (offline = true)); }
      card.querySelector("small")!.textContent = `ลองใหม่ครั้งที่ ${attempt}`;
      for (let t = 0; t < 30 && !offline; t++) await new Promise(r => setTimeout(r, 100));
      if (offline) { card.remove(); return new LocalHost(c, String(e?.message ?? e)); }
    }
  }
}
Promise.all([buildWorld(), runCreator(serverUrl, !!q.get("offline") || !!(window as any).__EMBED)]).then(([, creation]) => pickHost(creation).then(host => startGame(creation, host))).then(api => { (window as any).__bk = api; });   // console handle for tests
if ("serviceWorker" in navigator && location.protocol === "https:" && !(window as any).__EMBED) navigator.serviceWorker.register("sw.js").catch(() => {});
