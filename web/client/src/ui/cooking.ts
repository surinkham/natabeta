// Cooking window (🔥 ทำอาหาร): the pantry on top, then every dish with what it needs; "ทำ" cooks one at a campfire.
import { INGREDIENTS, RECIPE_FOODS, buffText } from "@shared/cooking";
import { game } from "./api";
import { icon } from "./icons";
import { body, createWindow, isOpen, onWindowOpen, setHTML } from "./windows";

let nearFire = () => false;
export function setupCooking(near: () => boolean) {
  nearFire = near;
  createWindow("cook", "🔥 ทำอาหาร", `<div class="cook-pan" id="cook-pan"></div><div id="cook-list"></div>
    <div class="hint">วัตถุดิบได้จากการล่ามอนสเตอร์ (เก็บแยกจากกระเป๋า) · ทำอาหารได้เฉพาะตอนอยู่ใกล้กองไฟ — มีในทุกเมืองและทุกแผนที่ · หิว = เดิน/ตีช้า · หิวโหย = HP/MP ไม่ฟื้น</div>`);
  body("cook").addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-cook]"); if (b && !b.hasAttribute("disabled")) game().cook(b.dataset.cook!); });
  onWindowOpen("cook", refreshCooking);
}
export function refreshCooking() {
  if (!isOpen("cook")) return;
  const pan = game().P.pantry ?? {}, fire = nearFire();
  setHTML(body("cook").querySelector("#cook-pan")!, Object.entries(INGREDIENTS).map(([id, d]) => `<span title="${d.desc}">${d.icon} ${d.name} ${pan[id] ?? 0}</span>`).join("")
    + `<span style="background:${fire ? "#e3f4d6" : "#f6ddd6"}">${fire ? "🔥 อยู่ข้างกองไฟ" : "❄ ไม่มีกองไฟใกล้ ๆ"}</span>`);
  setHTML(body("cook").querySelector("#cook-list")!, RECIPE_FOODS.map(([id, f]) => {
    const need = Object.entries(f.needs).map(([k, n]) => `<span class="${(pan[k] ?? 0) < n ? "miss" : ""}">${INGREDIENTS[k].icon}${INGREDIENTS[k].name} ${pan[k] ?? 0}/${n}</span>`).join(" · ");
    const ok = fire && Object.entries(f.needs).every(([k, n]) => (pan[k] ?? 0) >= n);
    return `<div class="cook-row"><span class="ic">${icon(id, f.icon)}</span><div><b>${f.name}</b><small>อิ่ม +${f.hunger}${f.heal ? ` · HP +${f.heal}` : ""}${f.mana ? ` · MP +${f.mana}` : ""}</small>${f.buff ? `<small style="color:#8a4ac0">✨ ${buffText(f.buff)}</small>` : ""}<small>${need}</small></div><button data-cook="${id}" ${ok ? "" : "disabled"}>ทำ</button></div>`;
  }).join(""));
}
