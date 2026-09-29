// "Install the game" (Options): add Pawtale Kingdoms to the device as an app (Chrome/Edge/Android: the browser's own
// install prompt; iPhone/iPad: Share → Add to Home Screen) and download every game file into the service worker's cache
// (public/sw.js, list from dist/precache.json), so the whole game is on the device before a map or model is needed.
let deferred: any = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; draw(); });   // Chrome offers install: keep it for our button
addEventListener("appinstalled", () => { deferred = null; download(); });
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = () => matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || (navigator as any).standalone;
let state = ""; try { state = localStorage.getItem("bk.installed") ?? ""; } catch {}

function draw(text?: string) {
  const v = document.getElementById("opt-inst-v"), b = document.getElementById("opt-inst") as HTMLButtonElement | null; if (!v || !b) return;
  if (text) { v.textContent = text; return; }
  v.textContent = state === "done" ? (standalone() ? "ติดตั้งแล้ว ✓" : "ไฟล์เกมอยู่ในเครื่องแล้ว ✓") : standalone() ? "ติดตั้งแล้ว" : "ยังไม่ติดตั้ง";
  b.textContent = deferred ? "📥 ติดตั้งเกม" : state === "done" ? "อัปเดตไฟล์เกม" : "📥 ดาวน์โหลดไฟล์เกม";
  b.disabled = !("serviceWorker" in navigator) || !isSecureContext;
}
/** Ask the service worker to fetch every file, showing the progress in Options. */
async function download() {
  const reg = await navigator.serviceWorker?.ready; if (!reg?.active) return draw("ต้องเปิดผ่าน https");
  draw("กำลังดาวน์โหลด…"); reg.active.postMessage({ type: "precache" });
}
export function setupInstall() {
  navigator.serviceWorker?.addEventListener("message", e => {
    const m = e.data; if (m?.type !== "precache") return;
    if (m.error) return draw("ดาวน์โหลดไม่สำเร็จ — ลองอีกครั้ง");
    if (m.finished) { state = "done"; try { localStorage.setItem("bk.installed", "done"); } catch {} return draw(); }
    draw(`ดาวน์โหลด ${Math.round(m.done / m.total * 100)}% (${(m.bytes / 1048576).toFixed(0)} MB)`);
  });
  document.getElementById("opt-inst")?.addEventListener("click", async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; if (r?.outcome !== "accepted") return draw(); }
    else if (ios && !standalone()) draw("กด Share แล้ว “Add to Home Screen” — กำลังดาวน์โหลดไฟล์…");
    download();
  });
  draw();
}
