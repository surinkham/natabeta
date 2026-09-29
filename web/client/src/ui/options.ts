import { ask } from "./ask";
import { openHotbarEditor } from "./hbedit";
import { openHotkeys } from "./hotkeys";
import { googleButton, googleEmail, signOut } from "../net/auth";
import { Q, QUALITY_LABEL, setQuality } from "../render/quality";
import { setupInstall } from "./install";
import { NetHost } from "../net/host";
import { body, createWindow } from "./windows";
import { timeString } from "../render/daynight";
import { gpuMs, renderScale, setOnShadowChange, setOnSlowShadows, setShadows, shadowsOn } from "../render/scene";
import { sys } from "./chat";
import { setShake, shakeEnabled } from "../fx/fx";
import { audioPrefs, setAudioPrefs } from "../audio/audio";
export function setupOptions() {
  createWindow("options", "Options", `<table><tr><td>โหมดภาพ</td><td class="v">${QUALITY_LABEL[Q.name]}</td><td><button id="opt-q">เปลี่ยนเป็น${QUALITY_LABEL[Q.name === "high" ? "low" : "high"]}</button></td></tr>
    <tr><td colspan="3"><small>สวย: เงา ความละเอียดเต็ม หญ้าและรายละเอียดครบ · ลื่น: ไม่มีเงา (เปิดเองได้) ลดความละเอียดและรายละเอียด สำหรับเครื่องที่กระตุก</small></td></tr>
    <tr><td>ชุมชน</td><td class="v"></td><td><a class="pt-discord" style="margin:0" href="https://discord.gg/XQZ62W9xS" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.3 5.3A16.6 16.6 0 0 0 15.2 4l-.5 1a15.3 15.3 0 0 0-5.4 0l-.5-1a16.6 16.6 0 0 0-4.1 1.3C2 9.2 1.3 13 1.6 16.7A16.7 16.7 0 0 0 6.7 19.3l1.1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.6 16.6 0 0 0 5.1-2.6c.4-4.3-.7-8-3.1-11.4ZM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg><span>เข้า Discord</span></a></td></tr>
    <tr><td>Hotbar</td><td class="v"></td><td><button id="opt-hb">🎛 จัด Hotbar</button></td></tr>
    <tr><td>ปุ่มลัด</td><td class="v"></td><td><button id="opt-keys">⌨ ตั้งปุ่มลัด</button></td></tr>
    <tr><td>ติดตั้งเกม</td><td class="v" id="opt-inst-v">—</td><td><button id="opt-inst">📥 ติดตั้งเกม</button></td></tr>
    <tr><td>FPS</td><td class="v" id="opt-fps">0</td><td><small id="opt-scale"></small></td></tr>
    <tr><td>เฟรม</td><td class="v" id="opt-frame">—</td><td><small id="opt-gpu"></small></td></tr>
    <tr><td>เวลาในเกม</td><td class="v" id="opt-clock">—</td><td><small>30 นาทีจริง = 1 วัน</small></td></tr><tr><td>สั่นกล้อง</td><td class="v" id="opt-shakev">เปิด</td><td><button id="opt-shake">ปิด</button></td></tr>
    <tr><td>เงา</td><td class="v" id="opt-shadowv"></td><td><button id="opt-shadow"></button></td></tr>
    <tr><td>เพลง</td><td class="v"><input type="checkbox" data-audio="music"></td><td></td></tr>
    <tr><td>เสียงเอฟเฟกต์</td><td class="v"><input type="checkbox" data-audio="sfx"></td><td></td></tr>
    <tr><td>เสียงพูด NPC</td><td class="v"><input type="checkbox" data-audio="voice"></td><td></td></tr>
    <tr><td>ความดัง</td><td class="v"><input id="opt-vol" type="range" min="0" max="1" step="0.05" style="width:110px"></td><td></td></tr></table>
    <div class="hint">ตำแหน่งหน้าต่าง / hotbar / ชื่อ จำไว้ในเบราว์เซอร์นี้</div>
    <div class="account"><b>บัญชี</b> <span id="opt-acc"></span><div id="opt-gbtn"></div></div>`);
  createWindow("players", "Players", `<div class="btns"><button data-social="friends">👥 เพื่อน</button><button data-social="ranking">🏆 แรงกิ้ง</button></div><div id="pl-list"></div>`);
  const opts = body("options"), p = audioPrefs();
  // account: a guest can link Google here — the game reloads and the server moves this guest's progress to it
  const acc = document.getElementById("opt-acc")!, email = googleEmail();
  if (email) { acc.innerHTML = `Google: ${email} <button id="opt-out">ออกจากระบบ</button>`; document.getElementById("opt-out")!.addEventListener("click", () => { signOut(); try { sessionStorage.removeItem("bk.rt"); } catch {} location.reload(); }); }
  else { acc.textContent = "Guest — เล่นได้เฉพาะเครื่อง/เบราว์เซอร์นี้ ผูกกับ Google เพื่อย้ายไปเล่นเครื่องอื่น:"; googleButton(document.getElementById("opt-gbtn")!, () => { try { sessionStorage.removeItem("bk.rt"); } catch {} location.reload(); }, { link: true }).catch(() => {}); }
  for (const cb of opts.querySelectorAll<HTMLInputElement>("[data-audio]")) { const k = cb.dataset.audio as "music" | "sfx" | "voice"; cb.checked = p[k]; cb.addEventListener("change", () => setAudioPrefs({ [k]: cb.checked })); }
  const vol = document.getElementById("opt-vol") as HTMLInputElement; vol.value = String(p.volume); vol.addEventListener("input", () => setAudioPrefs({ volume: +vol.value }));
  const shakeBtn = document.getElementById("opt-shake")!, shakeVal = document.getElementById("opt-shakev")!;
  const drawShake = () => { shakeVal.textContent = shakeEnabled() ? "เปิด" : "ปิด"; shakeBtn.textContent = shakeEnabled() ? "ปิด" : "เปิด"; };
  shakeBtn.addEventListener("click", () => { setShake(!shakeEnabled()); drawShake(); }); drawShake();
  // shadows: a weak GPU turns them off by itself (scene.ts); the player can take them back here
  const shBtn = document.getElementById("opt-shadow")!, shVal = document.getElementById("opt-shadowv")!;
  const drawShadow = () => { shVal.textContent = shadowsOn() ? "เปิด" : "ปิด"; shBtn.textContent = shadowsOn() ? "ปิด (ลื่นขึ้น)" : "เปิด"; };
  shBtn.addEventListener("click", () => setShadows(!shadowsOn())); drawShadow();
  setupInstall();   // install as an app + download every game file (ui/install.ts)
  document.getElementById("opt-q")!.addEventListener("click", () => setQuality(Q.name === "high" ? "low" : "high"));
  document.getElementById("logoutbtn")!.addEventListener("click", logout);
  document.getElementById("opt-keys")!.addEventListener("click", openHotkeys);
  document.getElementById("opt-hb")!.addEventListener("click", () => openHotbarEditor());
  setOnShadowChange(drawShadow);
  setOnSlowShadows(() => ask("เกมกระตุก ปิดเงาไหม?", "การ์ดจอทำงานไม่ทัน — ปิดเงาแล้วจะลื่นขึ้น (เปิดคืนได้ที่ Options)", "🌑 ปิดเงา", "☀ เปิดไว้").then(off => {
    if (off) setShadows(false); else sys("เปิดเงาไว้ตามเดิม — ปิดได้ที่ Options ถ้ากระตุก", "lvl");
  }));
  setInterval(() => { document.getElementById("opt-clock")!.textContent = timeString(); }, 1000);
  // frame-time health: the median is what it feels like, p95 and the hitch count are what "กระตุก" actually is
  let frames = 0, t0 = performance.now(); const times: number[] = []; let last = 0;
  setInterval(() => {
    const now = performance.now();
    document.getElementById("opt-fps")!.textContent = String(Math.round(frames / ((now - t0) / 1000)));
    document.getElementById("opt-scale")!.textContent = `res ${Math.round(renderScale() * 100)}%`;
    const s = times.slice().sort((a, b) => a - b), med = s[s.length >> 1] ?? 0, p95 = s[Math.floor(s.length * 0.95)] ?? 0;
    document.getElementById("opt-frame")!.textContent = `${med.toFixed(0)} / ${p95.toFixed(0)} ms`;
    document.getElementById("opt-gpu")!.textContent = `${gpuMs() ? "gpu " + gpuMs().toFixed(1) + "ms · " : ""}สะดุด ${times.filter(t => t > med * 2 && t > 30).length}`;
    times.length = 0; frames = 0; t0 = now;
  }, 1000);
  (window as any).__tick = () => { frames++; const now = performance.now(); if (last) times.push(now - last); last = now; };
}

/** A guest's character belongs to the key this browser keeps for this site address: another browser or device, cleared
 *  site data, or the game moving to a new address (IP → domain) would start a new character. Copying the key out and
 *  pasting it back in brings the same character anywhere. The key is the account's only credential — never share it. */

/** Back to the title screen. The server saves the character on the way out; a guest's character stays with this
 *  browser (it comes back on the next "เข้าเล่น"), a Google sign-in is signed out. */
async function logout() {
  const google = googleEmail();
  const ok = await ask(
    google ? "ออกจากระบบ Google?" : "ออกจากเกมตอนนี้?",
    "ตัวละครและความคืบหน้าถูกบันทึกไว้แล้ว คุณจะกลับไปหน้าเลือกวิธีเข้าสู่ระบบ",
    "ออกจากเกม",
    "เล่นต่อ",
  );
  if (!ok) return;
  if (google) signOut();
  try { sessionStorage.removeItem("bk.auto"); sessionStorage.removeItem("bk.rt"); } catch {}
  await NetHost.leaveAndReload();
}

