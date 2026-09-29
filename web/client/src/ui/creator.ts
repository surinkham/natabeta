import { googleButton, googleEmail, googleConfigured, useGuest } from "../net/auth";
// Character creator overlay (S1): name + race + fur colour; remembered in localStorage. Resolves when the player enters.
import { onAssetProgress } from "../render/assets";
import { BREEDS, RACE_TRAITS } from "@shared/sim";
import { BREED_ALIAS } from "@shared/data";
import { characterPortrait, setPreviewColor, showBreed, startPreview, stopPreview } from "./preview";
import { loadCharacterSlots, type CharacterSummary } from "../net/host";
import "./character-select.css";
import { ask } from "./ask";
import { audioPrefs, playTitleMusic, setAudioPrefs, stopTitleMusic } from "../audio/audio";
/** "2 วัน 5 ชม." until a pending deletion comes due. */
const leftText = (at: number) => { const h = Math.max(0, Math.ceil((at - Date.now()) / 3600e3)); return h >= 24 ? `${Math.floor(h / 24)} วัน ${h % 24} ชม.` : `${h} ชม.`; };

const FUR = [0, 0xe8963a, 0xf2d9b0, 0x6b4a2b, 0x222222, 0xc9c9c9, 0xd94c4c];
export interface Creation { name: string; race: string; color: number; slot: number }
// The bar is driven by two things: the bytes downloaded so far (assets start loading the moment the page opens, while
// the player is still on this card), and the phases the game reports while it warms up after "enter".
// Downloads own the first 85%, the warm-up the rest, and the value never walks backwards.
let phase = 0, phaseText = "", shown = 0, stop: (() => void) | null = null;
function paint() {
  const fill = document.getElementById("load-fill"), pct = document.getElementById("load-pct"), what = document.getElementById("load-what");
  if (!fill || !pct) return;
  shown = Math.max(shown, Math.min(1, phase));
  fill.style.width = (shown * 100).toFixed(0) + "%";
  pct.textContent = Math.round(shown * 100) + "%";
  fill.parentElement?.setAttribute("aria-valuenow", String(Math.round(shown * 100)));
  if (what && phaseText) what.textContent = `${phaseText} ${Math.round(shown * 100)}%`;
}
stop = onAssetProgress((frac, file, done, count) => {
  phase = Math.max(phase, frac * 0.85);
  phaseText = done < count ? "กำลังเตรียมโลกและเพื่อนร่วมทาง…" : "พร้อมแล้ว — เริ่มการผจญภัยได้เลย";
  paint();
});
/** Phases the game reports while it warms up: `frac` is where the bar should sit (0..1). */
export function loadingPhase(text: string, frac: number) { if (text) phaseText = text; phase = Math.max(phase, frac); paint(); }

/** Called once the world is warmed up: drops the overlay and reveals the HUD. */
export function enterWorld() { performance.mark("bk-enter"); stopTitleMusic(); loadingPhase("เข้าเมือง", 1); stop?.(); stopPreview(); document.getElementById("creator")!.hidden = true; document.body.classList.remove("pre"); }

export function runCreator(serverUrl: string, offline = false): Promise<Creation> {
  // the title song: starts on the first tap or key (browsers block sound before one); 🔊 turns music on/off
  const music = document.getElementById("pt-music"), musicIc = document.getElementById("pt-music-ic");
  const showMusic = () => { const on = audioPrefs().music; music?.classList.toggle("off", !on); if (musicIc) musicIc.textContent = on ? "🔊" : "🔇"; };
  const kick = () => { if (!document.getElementById("creator")!.hidden) playTitleMusic(); };
  for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, kick, { capture: true, once: true });
  music?.addEventListener("click", e => { e.stopPropagation(); setAudioPrefs({ music: !audioPrefs().music }); if (audioPrefs().music) playTitleMusic(); else stopTitleMusic(0.3); showMusic(); });
  showMusic(); playTitleMusic();
  return new Promise(res => {
    const el = document.getElementById("creator")!, choice = document.getElementById("login-choice")!, characters = document.getElementById("character-choice")!, slotsEl = document.getElementById("character-slots")!, card = el.querySelector<HTMLElement>(".card.cc")!, name = document.getElementById("cname") as HTMLInputElement, colors = document.getElementById("ccolor")!;
    // Login is a deliberate first step. It opens the account's three server-owned character slots.
    const loginState = document.getElementById("login-state")!, showLogin = () => { const e = googleEmail(); if (e) loginState.textContent = `บัญชี Google: ${e} · เล่นต่อได้ทุกเครื่อง`; };
    let creatorShown = false, selectedSlot = 0;
    const showCreator = (slot: number) => { selectedSlot = slot; if (creatorShown) return; creatorShown = true; characters.hidden = true; choice.hidden = true; card.hidden = false; showLogin(); startPreview(document.getElementById("cc-canvas") as HTMLCanvasElement); shownRace = ""; showBreeds(); };   // the early showBreeds() ran before the preview existed: draw the breed now
    if(new URLSearchParams(location.search).has('offline'))loginState.textContent='โหมดทดลองออฟไลน์ · ความคืบหน้าในรอบนี้จะไม่ถูกบันทึก';
    let saved: Partial<Creation> = {}; try { saved = JSON.parse(localStorage.getItem("bk.char") ?? "{}"); } catch {}
    // race buttons pick the species, the breed row picks one of its three breeds (older saves hold a bare species)
    if (saved.race && BREED_ALIAS[saved.race]) saved.race = BREED_ALIAS[saved.race];   // retired breed → its replacement
    const legacy = !saved.race || !(saved.race in BREEDS) || saved.race === BREEDS[saved.race].species;
    name.value = ""; let race = legacy ? "golden" : saved.race!; let color = legacy ? 0 : saved.color ?? 0;
    const nameError=document.getElementById('name-error')!;
    const updateName=()=>{document.getElementById('name-count')!.textContent=`${name.value.length} / 16`;name.removeAttribute('aria-invalid');nameError.hidden=true;};name.addEventListener('input',updateName);updateName();
    const races = document.getElementById("crace")!, breeds = document.getElementById("cbreed")!;
    const showBreeds = () => {
      const sp = BREEDS[race].species;
      for (const b of races.querySelectorAll<HTMLElement>("[data-v]")) { b.classList.toggle("on", b.dataset.v === sp); b.setAttribute("aria-pressed",String(b.dataset.v===sp)); }
      breeds.innerHTML = Object.entries(BREEDS).filter(([id, b]) => b.species === sp && id !== sp).map(([id, b]) => `<button type="button" data-b="${id}" aria-pressed="${id===race}" class="${id === race ? "on" : ""}">${b.name}<small>สูง ${Math.round(b.size * 100)}%</small></button>`).join("");
      const t = RACE_TRAITS[sp];
      document.getElementById("cc-breed")!.textContent = BREEDS[race].name;
      document.getElementById("cc-trait")!.innerHTML = `ติดตัว: <b>${t.name}</b> — ${t.desc}`;
      (document.getElementById("cc-sizebar") as HTMLElement).style.width = `${Math.round((BREEDS[race].size - 0.55) / 0.6 * 100)}%`;
      if (shownRace !== race) { shownRace = race; void showBreed(race, color); }
    };
    let shownRace = "";
    races.addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-v]"); if (!b) return; race = Object.keys(BREEDS).find(id => BREEDS[id].species === b.dataset.v && id !== b.dataset.v)!; showBreeds(); });
    breeds.addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-b]"); if (!b) return; race = b.dataset.b!; showBreeds(); });
    showBreeds();
    const colorNames=["สีตามสายพันธุ์","สีทอง","สีครีม","สีน้ำตาล","สีดำ","สีเทา","สีแดง"];
    colors.innerHTML = FUR.map((c,i) => `<button type="button" aria-label="${colorNames[i]}" aria-pressed="${c===color}" class="sw ${c === color ? "on" : ""}" data-c="${c}" title="${colorNames[i]}" style="background:${c ? "#" + c.toString(16).padStart(6, "0") : "conic-gradient(#db9a47 0 33%, #757a8a 0 66%, #f2e6cc 0)"}"></button>`).join("");
    colors.addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-c]"); if (!b) return; color = +b.dataset.c!; for (const x of colors.children) {x.classList.toggle("on", x === b);x.setAttribute("aria-pressed",String(x===b));} setPreviewColor(color); });
    let entered = false;
    const finish = (c: Creation) => {
      if (entered) return;
      entered = true;
      const n = c.name;
      try { localStorage.setItem("bk.char", JSON.stringify(c)); sessionStorage.setItem("bk.auto", "1"); sessionStorage.setItem("bk.slot", String(c.slot)); } catch {}
      // picked from the character list: the creator card (stage + form) was never shown, so the loading card below was
      // drawn out of sight and the click looked dead — bring the card up with the chosen character on the stage
      if (!creatorShown) { creatorShown = true; characters.hidden = true; choice.hidden = true; card.hidden = false; startPreview(document.getElementById("cc-canvas") as HTMLCanvasElement); void showBreed(c.race, c.color); }
      // the stage keeps turning while the world warms up; only the form side becomes the loading card
      const form=el.querySelector('.cc-form')!;form.classList.add('loading','pt-loading');
      form.innerHTML = `<img class="pt-loading-mark" src="icons/pawtale-mark.svg" alt="Pawtale Kingdoms"><h2>การผจญภัยกำลังเริ่มต้น</h2><p class="sub">ยินดีต้อนรับ <b>${n.slice(0,16).replace(/[<>&]/g,'')}</b><br>เพื่อนร่วมทางของคุณพร้อมแล้ว</p><div class="loadbar" role="progressbar" aria-label="กำลังเข้าสู่โลก" aria-valuemin="0" aria-valuemax="100"><i id="load-fill"></i><span id="load-pct">0%</span></div><div id="load-what" role="status">กำลังเตรียมการเดินทาง…</div>`;
      paint(); res(c);
    };
    const enter = () => {
      if(!name.value.trim()){nameError.textContent='ตั้งชื่อนักผจญภัยก่อนออกเดินทาง';nameError.hidden=false;name.setAttribute('aria-invalid','true');name.focus();return;}
      finish({ name: name.value.trim().slice(0, 16), race, color, slot: selectedSlot });
    };
    document.getElementById("enter")!.addEventListener("click", enter); name.addEventListener("keydown", e => { if (e.code === "Enter") enter(); });

    const showCharacters = async (action?: { action: "delete" | "undelete"; slot: number }) => {
      choice.hidden = true; card.hidden = true; characters.hidden = false;
      const status = document.getElementById("character-choice-status")!; status.classList.remove("pt-character-error"); status.textContent = "กำลังโหลดตัวละคร…"; slotsEl.innerHTML = "";
      try {
        const slots = offline ? [null, null, null] : await loadCharacterSlots(serverUrl, action);
        status.textContent = slots.some(Boolean) ? "เลือกตัวละครเดิมเพื่อเล่นต่อ หรือสร้างตัวใหม่ในช่องว่าง" : "ยังไม่มีตัวละคร — เลือกช่องเพื่อสร้างนักผจญภัยคนแรก";
        slotsEl.innerHTML = slots.map((s: CharacterSummary | null, slot: number) => s
          ? `<div class="pt-slot-row"><button type="button" class="pt-character-slot${s.deleteAt ? " pending" : ""}" ${s.deleteAt ? "disabled" : `data-play="${slot}"`}><span class="slot-avatar profile" data-profile="${slot}"><span class="profile-loading">🐾</span></span><span class="slot-info"><b>${s.name.replace(/[<>&]/g,'')}</b><small>${s.deleteAt ? `🗑 จะถูกลบใน ${leftText(s.deleteAt)}` : `${BREEDS[s.race]?.name ?? s.race} · Lv. ${s.level} · ช่อง ${slot + 1}`}</small></span><span class="slot-arrow">${s.deleteAt ? "" : "→"}</span></button>${s.deleteAt ? `<button type="button" class="pt-slot-act undo" data-undelete="${slot}">ยกเลิกลบ</button>` : `<button type="button" class="pt-slot-act" data-delete="${slot}" title="ลบตัวละคร" aria-label="ลบตัวละคร">🗑</button>`}</div>`
          : `<button type="button" class="pt-character-slot empty" data-new="${slot}"><span class="slot-avatar">＋</span><span class="slot-info"><b>สร้างตัวละครใหม่</b><small>ช่อง ${slot + 1} · ยังว่าง</small></span><span class="slot-arrow">→</span></button>`).join("");
        slots.forEach((s, slot) => { if (!s) return; void characterPortrait(s.race, s.color).then(src => { const host = slotsEl.querySelector<HTMLElement>(`[data-profile="${slot}"]`); if (host && src) host.innerHTML = `<img src="${src}" alt="รูปโปรไฟล์ ${s.name.replace(/[<>&\"]/g, '')}">`; }); });
        slotsEl.querySelectorAll<HTMLElement>("[data-play]").forEach(b => b.addEventListener("click", () => { const s = slots[+b.dataset.play!]!; finish({ name: s.name, race: s.race, color: s.color, slot: s.slot }); }));
        slotsEl.querySelectorAll<HTMLElement>("[data-new]").forEach(b => b.addEventListener("click", () => showCreator(+b.dataset.new!)));
        slotsEl.querySelectorAll<HTMLElement>("[data-delete]").forEach(b => b.addEventListener("click", async () => { const slot = +b.dataset.delete!, s = slots[slot]!; if (await ask(`ลบ ${s.name} (Lv. ${s.level})?`, "ตัวละครจะถูกลบจริงหลัง 3 วัน — ระหว่างนี้เล่นไม่ได้ แต่กดยกเลิกลบได้ทุกเมื่อ", "ลบตัวละคร")) void showCharacters({ action: "delete", slot }); }));
        slotsEl.querySelectorAll<HTMLElement>("[data-undelete]").forEach(b => b.addEventListener("click", () => void showCharacters({ action: "undelete", slot: +b.dataset.undelete! })));
      } catch (e: any) {
        console.warn("Unable to load character slots:", e);
        status.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง";
        status.classList.add("pt-character-error");
        slotsEl.innerHTML = `<button type="button" class="pt-character-slot empty" id="retry-characters"><span class="slot-avatar">↻</span><span class="slot-info"><b>ลองเชื่อมต่ออีกครั้ง</b><small>ความคืบหน้าเดิมยังอยู่</small></span></button><button type="button" class="pt-character-slot empty" id="try-offline"><span class="slot-avatar">🐾</span><span class="slot-info"><b>ทดลองเล่นออฟไลน์</b><small>รอบนี้ไม่บันทึกความคืบหน้า</small></span></button>`;
        document.getElementById("retry-characters")!.addEventListener("click", () => void showCharacters());
        document.getElementById("try-offline")!.addEventListener("click", () => { const url = new URL(location.href); url.searchParams.set("offline", "1"); location.assign(url.href); });
      }
    };
    const googleHost = document.getElementById("login-google")!;
    if (googleConfigured()) googleButton(googleHost, () => showCharacters(), { prompt: false }).catch(() => { googleHost.textContent = "เชื่อมต่อ Google ไม่สำเร็จ ลองโหลดหน้าอีกครั้ง"; });
    else googleHost.textContent = "Google login ยังไม่ได้ตั้งค่า";
    document.getElementById("login-guest")!.addEventListener("click", () => { useGuest(); loginState.textContent = "เล่นแบบ Guest · ตัวละครผูกกับเบราว์เซอร์นี้"; void showCharacters(); });
    document.getElementById("character-back")!.addEventListener("click", () => { characters.hidden = true; choice.hidden = false; });

    // a refresh in the middle of play goes straight back in: the character and the spot it stood on come from the save
    // Returning from the world still visits the login choice, so account selection is never implicit.
  });
}
